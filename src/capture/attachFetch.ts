/**
 * Blix — HTTP capture for native `fetch`.
 *
 * `attachHttpMonitor` only sees requests made through an axios instance, so an
 * app that calls `fetch` directly — the default in a Next.js App Router project
 * — got an empty Network tab and a reasonable conclusion that Blix was broken.
 * This wraps `globalThis.fetch` and feeds the same store with the same
 * `MonitorEntry` shape, marked `client: "fetch"`.
 *
 * ## The rules this file is built around
 *
 * - **The caller's bodies are never consumed.** `Request` and `Response` bodies
 *   are one-shot streams. Everything Blix reads it reads from a `clone()`, taken
 *   before the body can be touched: the request's before `fetch` is called, the
 *   response's before the caller is handed it.
 * - **Nothing is buffered without bound.** Bodies are read through a byte
 *   counter on every read and abandoned past `maxBodyBytes`, whatever
 *   `Content-Length` claimed. That header is the *encoded* length; the clone
 *   yields decoded bytes, so a small gzip can inflate far past it.
 * - **Nothing the caller passed is mutated, and no error is swallowed or
 *   replaced.** A failure anywhere in capture degrades to "not captured", never
 *   to a broken request.
 * - **Browser only.** Next.js patches `fetch` on the server for its data cache;
 *   Blix never touches that one.
 *
 * `captureEncrypted` does not apply here. It correlates by an object the host
 * holds inside its own interceptor, and `fetch` has no interceptor stage.
 */

import { configureDbName, MONITOR_ENABLED, now } from "./monitorConfig";
import { getOwner } from "./monitorContext";
import { captureFrames } from "./monitorInitiator";
import {
  estimateBytes,
  flattenHeaders,
  serializeBody,
  serializeHeaders,
} from "./monitorSerialize";
import { isAxiosCapturedFetch } from "./monitorStamp";
import type { InitiatorFrame, MonitorEntry } from "./monitorTypes";
import { networkMonitor } from "./networkMonitor";

/**
 * A rule that keeps a request out of the log. A string matches as a substring,
 * and a regular expression is tested, against the URL's path and query
 * (`/api/items?page=2`); a function receives the resolved `URL`.
 */
export type FetchIgnoreRule = string | RegExp | ((url: URL) => boolean);

export interface FetchMonitorOptions {
  /** IndexedDB database name — see `attachHttpMonitor`. */
  dbName?: string;
  /**
   * Largest body Blix will read, request or response, in bytes. Default
   * 5 MB. A larger body is still logged — status, headers, timing — with the
   * body marked as not captured, and why. `0` captures no bodies at all.
   */
  maxBodyBytes?: number;
  /**
   * Requests to leave out of the log entirely. An array **replaces** the
   * defaults; a function receives the defaults and returns the list to use,
   * which is how to extend them. `[]` captures everything.
   *
   * The defaults drop framework dev traffic that would otherwise bury the app's
   * own requests: Next.js assets, HMR and data requests (`/_next/`), the
   * Next.js dev overlay (`/__nextjs`), App Router navigation and prefetch
   * payloads (`?_rsc=`), and webpack HMR (`.hot-update.`, `/__webpack_hmr`).
   */
  ignore?:
    | readonly FetchIgnoreRule[]
    | ((defaults: readonly FetchIgnoreRule[]) => readonly FetchIgnoreRule[]);
}

const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;

const DEFAULT_IGNORE: readonly FetchIgnoreRule[] = Object.freeze([
  "/_next/",
  "/__nextjs",
  /[?&]_rsc=/,
  ".hot-update.",
  "/__webpack_hmr",
]);

/**
 * Stamp on Blix's wrapper. **Enumerable on purpose**: a library that wraps
 * `fetch` by copying its properties onto a new function (`Object.assign`,
 * object spread) keeps an enumerable symbol and silently drops a
 * non-enumerable one — and an `attachFetchMonitor` that could no longer see
 * the wrapper underneath would wrap again and log every request twice.
 * Registry-global, so two copies of this package in one tree see each other.
 */
const WRAPPER_MARK = /* @__PURE__ */ Symbol.for("blix.fetchMonitor");

const noop = (): void => {};

/* ─────────────────────────────── helpers ──────────────────────────────── */

function describeBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/**
 * Stored in place of a body Blix deliberately did not read, so the Response
 * tab says why instead of showing an empty body that looks like an empty
 * response. Same «…» convention as the file summaries in `serializeBody`.
 */
function notCaptured(reason: string): string {
  return `«body not captured: ${reason}»`;
}

function binarySummary(contentType: string | null, bytes: number): string {
  return `«binary body: ${contentType || "unknown type"} — ${bytes} bytes»`;
}

function errorName(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function describeError(error: unknown): string {
  try {
    if (error !== null && typeof error === "object") {
      const message = (error as { message?: unknown }).message;
      const name = errorName(error);
      if (typeof message === "string") return name ? `${name}: ${message}` : message;
    }
    return String(error);
  } catch {
    return "unknown error";
  }
}

function headerValue(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return null;
}

function settle(id: string, patch: Partial<MonitorEntry>): void {
  try {
    networkMonitor.update(id, patch);
  } catch {
    /* capture must never break a request */
  }
}

/** Content types decoded as text and run through `serializeBody`. Anything
 * else is counted, never retained, and summarized as binary. */
const TEXTUAL =
  /^\s*(?:text\/|application\/(?:json|javascript|ecmascript|xml|x-www-form-urlencoded|graphql|x-ndjson)\b|[^;\s]+\+(?:json|xml)\b)/i;

const EVENT_STREAM = /^\s*text\/event-stream/i;

function isTextual(contentType: string | null): boolean {
  // No declared type: read it, and let a strict decode decide below.
  return !contentType || TEXTUAL.test(contentType);
}

function decodeBody(bytes: Uint8Array, contentType: string | null): unknown {
  try {
    // Strict only when nothing declared the body to be text — a failed decode
    // then means "binary", not "text with replacement characters".
    const text = new TextDecoder("utf-8", { fatal: !contentType }).decode(bytes);
    return serializeBody(text);
  } catch {
    return binarySummary(contentType, bytes.byteLength);
  }
}

/* ──────────────────────────── bounded reading ─────────────────────────── */

type ReadResult =
  /** `bytes` is `null` when the body was only counted, not retained. */
  | { kind: "complete"; bytes: Uint8Array | null; length: number }
  | { kind: "over-cap"; length: number }
  | { kind: "failed"; error: unknown };

/**
 * Reads a cloned body through a byte counter, retaining chunks only if asked.
 *
 * The counter runs on every read, and past `cap` the read is abandoned —
 * regardless of any `Content-Length`, which describes the encoded body while
 * this stream yields decoded bytes. Cancelling here cancels only Blix's branch
 * of the tee `clone()` made; the caller's branch carries on untouched.
 */
async function readCapped(
  body: ReadableStream<Uint8Array>,
  cap: number,
  retain: boolean,
): Promise<ReadResult> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > cap) {
        reader.cancel().catch(noop);
        return { kind: "over-cap", length };
      }
      if (retain) chunks.push(value);
    }
  } catch (error) {
    return { kind: "failed", error };
  }

  if (!retain) return { kind: "complete", bytes: null, length };
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: "complete", bytes, length };
}

/* ─────────────────────────────── request ──────────────────────────────── */

interface Outgoing {
  /** As the caller wrote it — a relative URL stays relative, like axios's. */
  url: string;
  /** Resolved against the page, for the ignore rules. `null` when unparseable:
   * `fetch` will reject it, and that rejection is still worth logging. */
  resolved: URL | null;
  method: string;
  /** Flattened, not yet masked — masking happens once, in `serializeHeaders`. */
  headers: Record<string, string>;
  signal: AbortSignal | null;
  request: Request | null;
  init: RequestInit | undefined;
}

function isRequest(value: unknown): value is Request {
  return typeof Request !== "undefined" && value instanceof Request;
}

/**
 * Normalises every calling form — `fetch(string)`, `fetch(URL)`,
 * `fetch(Request)`, each with or without `init` — without constructing a new
 * `Request` from the caller's arguments. Doing that would take ownership of a
 * `Request`'s body and lock an `init.body` stream, breaking the real call.
 *
 * Follows `fetch`'s own precedence: each member present on `init` replaces the
 * request's — `headers` wholesale, not merged.
 */
function describe(input: unknown, rawInit: unknown): Outgoing {
  const request = isRequest(input) ? input : null;
  const init =
    rawInit !== null && typeof rawInit === "object" ? (rawInit as RequestInit) : undefined;
  const url = request ? request.url : String(input);

  let resolved: URL | null = null;
  try {
    resolved = new URL(url, typeof location !== "undefined" ? location.href : undefined);
  } catch {
    resolved = null;
  }

  return {
    url,
    resolved,
    method: String(init?.method ?? request?.method ?? "GET").toUpperCase(),
    headers: flattenHeaders(init?.headers !== undefined ? init.headers : request?.headers),
    signal: (init?.signal !== undefined ? init.signal : request?.signal) ?? null,
    request,
    init,
  };
}

function isIgnored(url: URL | null, rules: readonly FetchIgnoreRule[]): boolean {
  if (!url) return false;
  const target = url.pathname + url.search;
  for (const rule of rules) {
    try {
      if (typeof rule === "string") {
        if (target.includes(rule)) return true;
      } else if (rule instanceof RegExp) {
        rule.lastIndex = 0; // a /g rule is stateful between calls
        if (rule.test(target)) return true;
      } else if (typeof rule === "function" && rule(url)) {
        return true;
      }
    } catch {
      /* a throwing rule ignores nothing */
    }
  }
  return false;
}

interface RequestBody {
  payload: unknown;
  /**
   * `undefined` when the body lives in a `Request`'s stream: its size is not
   * known until `readRequestClone` has read it, and the field staying unset on
   * the entry is how that read knows no response has recorded a size since.
   */
  bytes: number | undefined;
  hadFormData: boolean;
  /** Set when the body lives in a `Request`'s stream and is read later. */
  clone: Request | null;
}

/** A body passed on `init` is already a value in memory: nothing to read. */
function describeBodyValue(body: unknown): RequestBody {
  const plain = (payload: unknown, hadFormData = false): RequestBody => ({
    payload,
    bytes: estimateBytes(body),
    hadFormData,
    clone: null,
  });

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return plain(serializeBody(body), true);
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return plain(body.toString());
  }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return {
      payload: notCaptured("streaming request body — reading it would consume the upload"),
      bytes: 0,
      hadFormData: false,
      clone: null,
    };
  }
  if (typeof File !== "undefined" && body instanceof File) {
    return plain(`«File: ${body.name} — ${body.size} bytes»`);
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return plain(`«Blob: ${body.type || "untyped"} — ${body.size} bytes»`);
  }
  if (
    typeof ArrayBuffer !== "undefined" &&
    (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
  ) {
    const label = (body as { constructor?: { name?: string } }).constructor?.name;
    return plain(`«${label || "ArrayBuffer"} — ${estimateBytes(body)} bytes»`);
  }
  return plain(serializeBody(body));
}

function planRequestBody(outgoing: Outgoing): RequestBody {
  const none: RequestBody = { payload: undefined, bytes: 0, hadFormData: false, clone: null };

  // `body: null` on `init` does not clear a `Request`'s body — `fetch` only
  // lets a non-null `init.body` replace it — so null falls through.
  const initBody = outgoing.init?.body;
  if (initBody != null) return describeBodyValue(initBody);

  const request = outgoing.request;
  if (!request || request.body === null) return none;
  if (request.bodyUsed) {
    return { ...none, payload: notCaptured("the request body was already read before fetch was called") };
  }
  try {
    // Now, before `fetch` takes the body: afterwards the request is disturbed
    // and `clone()` throws.
    // Size left unset until the clone is read — see `RequestBody.bytes`.
    return { ...none, bytes: undefined, clone: request.clone() };
  } catch {
    return { ...none, payload: notCaptured("the request body is locked and could not be cloned") };
  }
}

function readRequestClone(
  id: string,
  clone: Request,
  cap: number,
  headers: Record<string, string>,
): void {
  const body = clone.body;
  if (!body) return;
  const contentType = headerValue(headers, "content-type");
  const retain = isTextual(contentType);

  void readCapped(body, cap, retain).then((result) => {
    let requestPayload: unknown;
    let sizeBytes: number | undefined;
    if (result.kind === "complete") {
      requestPayload = result.bytes
        ? decodeBody(result.bytes, contentType)
        : binarySummary(contentType, result.length);
      sizeBytes = result.length;
    } else if (result.kind === "over-cap") {
      requestPayload = notCaptured(
        `the request body passed the ${describeBytes(cap)} capture limit`,
      );
      // A floor, not the body's size: counting stopped at the chunk that
      // crossed the cap.
      sizeBytes = result.length;
    } else {
      requestPayload = notCaptured(
        `the request body could not be read (${describeError(result.error)})`,
      );
    }

    // `sizeBytes` holds the request size until the response replaces it with
    // its own, as on axios entries. This read settles asynchronously and can
    // land after the response, so it writes only while the field is unset:
    // `begin` leaves it unset on this path, and every response path that
    // records a size writes a number, 0 included. Read back from the store
    // rather than tracked here, so a response that settled first always wins.
    const unsized = networkMonitor.getById(id)?.sizeBytes === undefined;
    settle(
      id,
      sizeBytes !== undefined && unsized ? { requestPayload, sizeBytes } : { requestPayload },
    );
  });
}

function begin(
  outgoing: Outgoing,
  initiator: InitiatorFrame[] | undefined,
  cap: number,
): string {
  const id = networkMonitor.nextId();
  const body = planRequestBody(outgoing);
  const owner = getOwner();

  networkMonitor.start({
    id,
    client: "fetch",
    method: outgoing.method,
    url: outgoing.url,
    at: Date.now(),
    startTime: now(),
    requestPayload: body.payload,
    requestHeaders: serializeHeaders(outgoing.headers),
    sizeBytes: body.bytes,
    hadFormData: body.hadFormData,
    initiator,
    ownerId: owner?.id,
    initiatorKind: owner?.kind,
  });
  if (owner) networkMonitor.linkChild(owner.id, id);
  if (body.clone) readRequestClone(id, body.clone, cap, outgoing.headers);
  return id;
}

/* ─────────────────────────────── response ─────────────────────────────── */

/**
 * Records a response that arrived. Runs synchronously inside the wrapper's
 * `then`, before the caller is handed `response` — which is what guarantees the
 * `clone()` below happens while the body is still untouched.
 *
 * Timing: the row gets its status and headers the moment they arrive and stays
 * pending while the body downloads. Its duration runs to the end of the body
 * when Blix read the body, and to the headers when it did not (skipped,
 * over the cap, unreadable) — Blix cannot see a download it is not reading.
 */
function respond(id: string, response: Response, cap: number, signal: AbortSignal | null): void {
  const headersAt = now();

  // `no-cors` and `redirect: "manual"`: status 0, no readable headers, a null
  // body. Settled as its own case — an empty success would look like a
  // response that genuinely had nothing in it.
  if (response.type === "opaque" || response.type === "opaqueredirect") {
    settle(id, {
      state: "success",
      status: response.status,
      endTime: headersAt,
      responseHeaders: {},
      responsePayload: notCaptured(
        response.type === "opaque"
          ? "opaque response — a no-cors request hides its status, headers and body from JavaScript"
          : 'opaque redirect — redirect: "manual" hides the redirect\'s status, headers and body from JavaScript',
      ),
    });
    return;
  }

  // axios rejects a non-2xx, and Blix files that body under `error`. Keeping
  // the same split means the Response and Error tabs mean the same thing
  // whichever client a request came through.
  const ok = response.ok;
  const finish = (
    payload: unknown,
    extra: Partial<MonitorEntry> = {},
    endTime: number = headersAt,
  ) =>
    settle(id, {
      state: ok ? "success" : "error",
      endTime,
      ...(ok ? { responsePayload: payload } : { error: payload }),
      ...extra,
    });

  settle(id, {
    status: response.status,
    responseHeaders: serializeHeaders(flattenHeaders(response.headers)),
  });

  if (response.body === null) {
    finish(undefined, { sizeBytes: 0 });
    return;
  }

  const contentType = response.headers.get("content-type");
  if (contentType && EVENT_STREAM.test(contentType)) {
    finish(notCaptured("event stream — it does not end, so reading it would buffer for the life of the connection"));
    return;
  }

  // An early skip only. A declared length over the cap means the decoded body
  // is at least that large, so there is no point starting. A declared length
  // *under* the cap proves nothing — the counter in `readCapped` decides.
  const declared = Number(response.headers.get("content-length"));
  const hasDeclared = response.headers.has("content-length") && Number.isFinite(declared);
  if (hasDeclared && declared > cap) {
    finish(
      notCaptured(
        `Content-Length (${describeBytes(declared)}) is over the ${describeBytes(cap)} capture limit`,
      ),
      { sizeBytes: declared },
    );
    return;
  }

  let clone: Response;
  try {
    clone = response.clone();
  } catch {
    finish(notCaptured("the response body was locked or already read before Blix could clone it"));
    return;
  }
  const body = clone.body;
  if (!body) {
    finish(undefined, { sizeBytes: 0 });
    return;
  }

  void readCapped(body, cap, isTextual(contentType)).then((result) => {
    if (result.kind === "complete") {
      finish(
        result.bytes
          ? decodeBody(result.bytes, contentType)
          : binarySummary(contentType, result.length),
        { sizeBytes: result.length },
        now(),
      );
    } else if (result.kind === "over-cap") {
      finish(
        notCaptured(
          `the decoded body passed the ${describeBytes(cap)} capture limit while downloading` +
            (hasDeclared
              ? ` (Content-Length said ${describeBytes(declared)} — the compressed size)`
              : ""),
        ),
        { sizeBytes: result.length },
      );
    } else if (signal?.aborted) {
      settle(id, {
        state: "aborted",
        endTime: now(),
        ...(ok
          ? { responsePayload: notCaptured("the request was aborted while the body was downloading") }
          : { error: notCaptured("the request was aborted while the body was downloading") }),
      });
    } else {
      finish(notCaptured(`the body stream failed while downloading (${describeError(result.error)})`));
    }
  });
}

/**
 * Records a rejected `fetch`. A network failure rejects with `TypeError` and
 * settles as `"error"`; an abort settles as `"aborted"`, which the panel
 * renders and filters separately.
 *
 * `AbortSignal.timeout()` also aborts its signal, but a timeout is a failure,
 * not a cancellation — axios files its own timeouts as errors, and so does
 * this. An abort with a custom reason rejects with that reason rather than an
 * `AbortError`, which is why the signal is checked first.
 */
function fail(id: string, error: unknown, signal: AbortSignal | null): void {
  const name = errorName(error);
  const aborted =
    name !== "TimeoutError" && (signal?.aborted === true || name === "AbortError");
  settle(id, {
    state: aborted ? "aborted" : "error",
    endTime: now(),
    error: describeError(error),
  });
}

/* ─────────────────────────────── install ──────────────────────────────── */

function isBlixWrapper(fn: unknown): boolean {
  return (
    typeof fn === "function" &&
    (fn as unknown as { [WRAPPER_MARK]?: unknown })[WRAPPER_MARK] === true
  );
}

function resolveIgnore(option: FetchMonitorOptions["ignore"]): readonly FetchIgnoreRule[] {
  if (option === undefined) return DEFAULT_IGNORE;
  if (typeof option !== "function") return option;
  try {
    const rules = option(DEFAULT_IGNORE);
    if (Array.isArray(rules)) return rules;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[blix] attachFetchMonitor: the ignore function threw; using the defaults.", error);
    }
  }
  return DEFAULT_IGNORE;
}

/**
 * Wraps `globalThis.fetch` so every request the page makes is captured, and
 * returns a disposer that unwraps it.
 *
 * Call once, as early as possible — before the first `fetch` you want to see.
 * A no-op in production, on the server, and when Blix's wrapper is already
 * installed (the returned disposer is then a no-op too).
 *
 * The disposer restores the exact original `fetch`, but only while Blix's
 * wrapper is still what `globalThis.fetch` points at. If something else has
 * patched over it since, restoring would silently remove that patch as well,
 * so it is left alone and a development warning explains why.
 */
export function attachFetchMonitor(options: FetchMonitorOptions = {}): () => void {
  // `MONITOR_ENABLED` already includes `typeof window !== "undefined"`; the
  // explicit check keeps this function's browser-only guarantee visible here.
  if (!MONITOR_ENABLED || typeof window === "undefined") return noop;

  const original = globalThis.fetch;
  if (typeof original !== "function") return noop;
  if (isBlixWrapper(original)) return noop;

  if (options.dbName) configureDbName(options.dbName);

  const cap =
    typeof options.maxBodyBytes === "number" &&
    Number.isFinite(options.maxBodyBytes) &&
    options.maxBodyBytes >= 0
      ? options.maxBodyBytes
      : DEFAULT_MAX_BODY_BYTES;
  const ignore = resolveIgnore(options.ignore);

  const wrapper = function blixFetch(
    this: unknown,
    ...args: Parameters<typeof fetch>
  ): Promise<Response> {
    const [input, init] = args;

    let outgoing: Outgoing | null = null;
    try {
      if (!networkMonitor.isPaused && !isAxiosCapturedFetch(init)) {
        const described = describe(input, init);
        if (!isIgnored(described.resolved, ignore)) outgoing = described;
      }
    } catch {
      outgoing = null;
    }
    // `this` is passed through untouched: native `fetch` accepts the global or
    // `undefined`, and a wrapper installed underneath this one may care which.
    if (!outgoing) return Reflect.apply(original, this, args);

    // Taken here, in this frame and nowhere else: `skip: 1` drops exactly this
    // wrapper, so the first frame left is the caller's own call site.
    const initiator = captureFrames(1);

    let id: string | null = null;
    try {
      id = begin(outgoing, initiator, cap);
    } catch {
      id = null;
    }
    if (id === null) return Reflect.apply(original, this, args);

    const entryId = id;
    const signal = outgoing.signal;
    let pending: Promise<Response>;
    try {
      pending = Promise.resolve(Reflect.apply(original, this, args) as Promise<Response>);
    } catch (error) {
      fail(entryId, error, signal);
      throw error;
    }

    return pending.then(
      (response) => {
        try {
          respond(entryId, response, cap, signal);
        } catch {
          /* capture must never break a request */
        }
        return response;
      },
      (error: unknown) => {
        try {
          fail(entryId, error, signal);
        } catch {
          /* noop */
        }
        // The original rejection value, untouched.
        throw error;
      },
    );
  };

  Object.defineProperty(wrapper, WRAPPER_MARK, {
    value: true,
    enumerable: true,
    writable: false,
    configurable: false,
  });

  globalThis.fetch = wrapper as typeof fetch;

  let restored = false;
  return () => {
    if (restored) return;
    if (globalThis.fetch === wrapper) {
      globalThis.fetch = original;
      restored = true;
      return;
    }
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[blix] attachFetchMonitor's disposer left globalThis.fetch alone: " +
          "something else has replaced it since Blix installed its wrapper, and " +
          "restoring the original now would silently remove that patch too. " +
          "Blix's wrapper is still underneath it and keeps capturing.",
      );
    }
  };
}
