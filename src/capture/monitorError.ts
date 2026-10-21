/**
 * Blix — what a failed request is recorded as.
 *
 * A failure used to be stored as one string, or as the response body and
 * nothing else: `error.response?.data ?? error.message`. That answers "what
 * did the server say" and drops everything a developer needs when the server
 * said nothing — *which* kind of failure it was, the code the client gave it,
 * how long the timeout was, what caused it. A timeout and a CORS rejection
 * both read `Network Error`, and a 500 with an empty body read as nothing.
 *
 * So a failure is a small object with a fixed shape, the same from axios and
 * from `fetch`, and safe to persist: plain data, no functions, no cycles, and
 * never the request config (which carries headers Blix masks elsewhere).
 */

import { isErrorLike } from "./errorLike";
import { serializeBody } from "./monitorSerialize";
import { truncateForPersist } from "./monitorTruncate";

/** How a request failed — the first thing to know, and what the list shows
 * in place of a status code when there is none. */
export type FailureKind =
  /** The server answered, with a status the client treats as an error. */
  | "http"
  /** No answer inside the configured time. */
  | "timeout"
  /** No answer at all: offline, DNS, refused, or blocked by CORS — the
   * browser does not tell scripts which. */
  | "network"
  /** Cancelled by the page: `AbortController`, a cancel token, navigation. */
  | "aborted"
  /** Thrown before the request left — by an interceptor, or while building it. */
  | "setup"
  | "unknown";

export interface CapturedError {
  kind: FailureKind;
  /** The error's class — `AxiosError`, `TypeError`, a host's own. */
  name?: string;
  /** The client's machine-readable code: `ECONNABORTED`, `ERR_NETWORK`, … */
  code?: string;
  message: string;
  status?: number;
  statusText?: string;
  /** The timeout the request ran under, when it is what ended it. */
  timeoutMs?: number;
  /** The response body, when there was a response. */
  response?: unknown;
  /** Query/mutation only: the id of the HTTP entry `response` was taken from,
   * when the error the app threw did not carry the body itself. */
  responseFrom?: string;
  /** How `responseFrom` was found: `"exact"` — the error is the one the app
   * handed back for that request — or `"guess"`, from its status and timing. */
  responseMatch?: "exact" | "guess";
  /** The error's own fields that none of the above covers — whatever a host's
   * error class carries: `result`, `errors`, a numeric `code`, the body under
   * `data`. Masked and bounded like any stored value. */
  details?: Record<string, unknown>;
  /** What the error says caused it, one level down. Context, not a second
   * failure: it has no `kind` of its own. */
  cause?: ErrorContext | string;
  /** The top of the stack, when the error carried one. */
  stack?: string[];
  /** Set when the app replaced the client's error with one of its own before
   * the caller saw it: what the caller actually received. */
  handledAs?: ErrorContext | string;
}

/**
 * An error recorded as context for a failure — its `cause`, or what the app
 * handed the caller in its place (`handledAs`). Everything a `CapturedError`
 * has except `kind`: how the *request* failed is said once, on the failure
 * itself.
 */
export type ErrorContext = Omit<CapturedError, "kind">;

/** `error` as context for another failure — see `ErrorContext`. */
export function asContext(error: CapturedError): ErrorContext {
  const { kind, ...context } = error;
  void kind;
  return context;
}

const STACK_FRAMES = 8;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A getter on a host's error object may throw; nothing here is allowed to. */
function read(source: unknown, key: string): unknown {
  try {
    return source !== null && typeof source === "object"
      ? (source as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
}

function stackOf(error: unknown): string[] | undefined {
  const stack = str(read(error, "stack"));
  if (!stack) return undefined;
  const frames = stack
    .split("\n")
    .map((line) => line.trim())
    // The first line repeats `name: message`, which is already recorded.
    .filter((line) => line.startsWith("at ") || /@.+:\d+/.test(line))
    .slice(0, STACK_FRAMES);
  return frames.length ? frames : undefined;
}

/** Fields `captureError` reads by name, or must never copy: an axios error's
 * `config`, `request` and `response` carry the unmasked request headers. */
const NOT_DETAILS = new Set([
  "name",
  "message",
  "stack",
  "cause",
  "status",
  "config",
  "request",
  "response",
  "isAxiosError",
  "toJSON",
  "__CANCEL__",
]);
const DETAILS_MAX_BYTES = 16384;

/**
 * A host error's own fields, beyond the ones read by name.
 *
 * Not for axios's errors: everything of theirs worth keeping is read by name,
 * and the rest is config. A host's error is another matter — an `ApiError`
 * built from the response body keeps that body in fields only its author
 * knows the names of, and dropping them left `{ message, status }` of a
 * response that said much more.
 */
function detailsOf(error: unknown): Record<string, unknown> | undefined {
  if (error === null || typeof error !== "object" || read(error, "isAxiosError") === true) {
    return undefined;
  }
  let keys: string[];
  try {
    keys = Object.keys(error);
  } catch {
    return undefined;
  }
  const own: Record<string, unknown> = {};
  let any = false;
  for (const key of keys) {
    if (NOT_DETAILS.has(key)) continue;
    // A string `code` is recorded as `code`; any other is a detail.
    if (key === "code" && typeof read(error, key) === "string") continue;
    const value = read(error, key);
    if (value === undefined || typeof value === "function") continue;
    own[key] = value;
    any = true;
  }
  if (!any) return undefined;
  const { value } = truncateForPersist(own, DETAILS_MAX_BYTES);
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

const TIMEOUT_CODES =new Set(["ECONNABORTED", "ETIMEDOUT", "ERR_TIMEOUT"]);

function classify(error: unknown, hasResponse: boolean): FailureKind {
  const name = str(read(error, "name"));
  const code = str(read(error, "code"));
  const message = str(read(error, "message")) ?? "";

  if (name === "TimeoutError" || code === "ETIMEDOUT" || code === "ERR_TIMEOUT") return "timeout";
  // axios reports a client-side timeout as ECONNABORTED — the same code it
  // uses for a request the browser aborted — and tells them apart only in
  // the message.
  if (code && TIMEOUT_CODES.has(code) && /timeout/i.test(message)) return "timeout";
  if (read(error, "__CANCEL__") || code === "ERR_CANCELED" || name === "AbortError" || name === "CanceledError") {
    return "aborted";
  }
  if (hasResponse) return "http";
  if (code === "ERR_NETWORK" || /network error|failed to fetch|load failed|networkerror/i.test(message)) {
    return "network";
  }
  if (code === "ECONNABORTED") return "aborted";
  return "unknown";
}

export interface FailureContext {
  /** Overrides the classification when the caller knows better. */
  kind?: FailureKind;
  status?: number;
  statusText?: string;
  /** The response body, already serialized for storage. */
  response?: unknown;
  hasResponse?: boolean;
  timeoutMs?: number;
}

/**
 * Anything that can be thrown, as a `CapturedError`.
 *
 * Reads only named fields — never enumerates the error. An axios error holds
 * its whole config, request and response, and a host's error can hold
 * anything; copying "everything" would persist tokens and megabytes.
 */
export function captureError(error: unknown, context: FailureContext = {}, depth = 0): CapturedError {
  const hasResponse = context.hasResponse ?? context.response !== undefined;
  const isObject = error !== null && typeof error === "object";

  const out: CapturedError = {
    kind: context.kind ?? classify(error, hasResponse),
    message: isObject
      ? (str(read(error, "message")) ?? "The request failed without a message")
      : error === undefined
        ? "The request failed without an error"
        : String(error),
  };

  const name = str(read(error, "name"));
  if (name) out.name = name;
  const code = str(read(error, "code"));
  if (code) out.code = code;

  const status = context.status ?? num(read(error, "status"));
  if (status !== undefined) out.status = status;
  if (context.statusText) out.statusText = context.statusText;
  if (out.kind === "timeout" && context.timeoutMs) out.timeoutMs = context.timeoutMs;
  if (context.response !== undefined) out.response = context.response;
  const details = detailsOf(error);
  if (details) out.details = details;

  const cause = read(error, "cause");
  if (cause !== undefined && cause !== null && depth < 2) {
    // A cause is context, not a second failure with a kind of its own.
    out.cause =
      typeof cause === "object"
        ? asContext(captureError(cause, { kind: "unknown" }, depth + 1))
        : String(cause);
  }

  const stack = stackOf(error);
  if (stack) out.stack = stack;

  return out;
}

// True for thrown errors, as opposed to plain objects a host chose to throw.
// Defined in `errorLike.ts`; re-exported because describing an error and
// recognizing one are asked for together.
export { isErrorLike };

/**
 * Any stored error value.
 *
 * Real errors go through `captureError` — named fields only, never the axios
 * config, request or headers. That is the whole point: an `AxiosError` carries
 * its request config as an enumerable property, and the config's headers are
 * the unmasked `Authorization` and `Cookie` that were sent. Copying the error
 * structurally, as the query and mutation paths used to, put both on the entry.
 *
 * Plain objects — a host that rejects with `{ message, errors: […] }` — keep
 * their own fields via `truncateForPersist`, which masks sensitive keys at any
 * depth.
 */
export function describeError(value: unknown, maxBytes: number): unknown {
  if (!isErrorLike(value)) return truncateForPersist(value, maxBytes).value;

  // The response is read for its status and body alone. Not `config`, not
  // `request`, and not the response's headers either (`set-cookie`).
  const res = read(value, "response");
  const data = read(res, "data");
  return captureError(value, {
    status: num(read(res, "status")),
    statusText: str(read(res, "statusText")),
    // Explicit, so a 500 with an empty body is still an HTTP failure rather
    // than falling through to "unknown" for want of a body.
    hasResponse: res !== undefined && res !== null,
    response:
      data === undefined ? undefined : truncateForPersist(serializeBody(data), maxBytes).value,
  });
}

/** A response the client treats as a failure, with no thrown error behind it
 * — `fetch` resolves on a 500, and Blix files it as an error all the same. */
export function captureHttpFailure(
  status: number,
  statusText: string | undefined,
  response: unknown,
): CapturedError {
  const out: CapturedError = {
    kind: "http",
    message: `Request failed with status ${status}${statusText ? ` ${statusText}` : ""}`,
    status,
  };
  if (statusText) out.statusText = statusText;
  if (response !== undefined) out.response = response;
  return out;
}

export function isCapturedError(value: unknown): value is CapturedError {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as CapturedError).kind === "string" &&
    typeof (value as CapturedError).message === "string"
  );
}

/** The response body behind a stored error — for exports that want the body
 * the server sent rather than Blix's description of the failure. Entries
 * captured before errors had a shape stored the body itself. */
export function errorBody(error: unknown): unknown {
  return isCapturedError(error) ? error.response : error;
}

/** The failure kind of a stored error, or `undefined` for a legacy value. */
export function failureKindOf(error: unknown): FailureKind | undefined {
  return isCapturedError(error) ? error.kind : undefined;
}
