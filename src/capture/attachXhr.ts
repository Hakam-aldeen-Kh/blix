/**
 * Blix — `XMLHttpRequest` capture.
 *
 * For requests that reach the network through neither `fetch` nor an axios
 * instance Blix was attached to: a hand-written XHR, an upload library, an
 * SDK, or axios instances the app never passed to `attachHttpMonitor`.
 *
 * Three prototype methods are wrapped — `open`, `setRequestHeader`, `send` —
 * and nothing is replaced: no subclass, no proxy constructor. The object the
 * app holds is the browser's own, `instanceof` and every property behave as
 * before, and a library that stores the original methods early still works.
 *
 * **It steps aside for axios.** axios's default adapter *is* XHR, so a request
 * the interceptor already logged — with its plaintext body and config — would
 * be logged again here, without them. See `monitorTransport.ts`.
 *
 * No-op when `process.env.NODE_ENV !== "development"`.
 */

import {
  DEFAULT_MAX_BODY_BYTES,
  isIgnored,
  notCaptured,
  resolveIgnore,
  type FetchMonitorOptions,
} from "./attachFetch";
import { readAuthorization } from "./monitorAuth";
import { configureDbName, MONITOR_ENABLED, now } from "./monitorConfig";
import { getOwner } from "./monitorContext";
import { captureError, captureHttpFailure, type FailureKind } from "./monitorError";
import { impliedContentType } from "./monitorSerialize";
import { claimAxiosTransport } from "./monitorTransport";
import type { MonitorEntry } from "./monitorTypes";
import { estimateBytes, networkMonitor, serializeBody, serializeHeaders } from "./networkMonitor";
import { startResourceTiming } from "./resourceTiming";

/** Same options as the fetch monitor: one body cap and one ignore list mean
 * the same thing whichever API a request went through. */
export type XhrMonitorOptions = FetchMonitorOptions;

/**
 * The `client` this monitor stamps on its entries.
 *
 * Internal: `attachXhrMonitor` is not exported yet, so the public
 * `MonitorEntry["client"]` union does not promise a value no released code
 * path can produce. Widen the public type when this monitor ships.
 */
export type XhrClient = NonNullable<MonitorEntry["client"]> | "xhr";
const XHR_CLIENT = "xhr" as XhrClient as NonNullable<MonitorEntry["client"]>;

interface Pending {
  method: string;
  url: string;
  resolved: URL | null;
  headers: Record<string, string>;
  /** Set at `send()`; absent for a request Blix decided not to log. */
  id?: string;
}

const WRAPPED = /* @__PURE__ */ Symbol.for("blix.xhrMonitor");

const meta = new WeakMap<XMLHttpRequest, Pending>();

/**
 * The entry each XHR object is carrying right now.
 *
 * One object can carry several requests: reused once it has finished, or
 * `open()`ed again mid-flight. The listeners `begin` adds stay on the object,
 * so without this a later request's `loadend` also ran an earlier one's — and
 * wrote the later answer onto the earlier row.
 */
const active = new WeakMap<XMLHttpRequest, { id: string; finish(): void }>();

/**
 * `open()` was called on `xhr`: whatever it was carrying ends here.
 *
 * Finished already (`DONE`) — the app reuses the object from its own `load` or
 * `loadend` handler, which runs before Blix's — it is recorded now, while its
 * status and body can still be read; `open()` resets them. Still in flight, it
 * is dropped, and the standard has the browser fire no event for that: it ends
 * aborted.
 */
function dropActive(xhr: XMLHttpRequest): void {
  const current = active.get(xhr);
  if (current === undefined) return;
  active.delete(xhr);
  const { id } = current;
  if (networkMonitor.getById(id)?.state !== "pending") return;
  if (xhr.readyState === 4) {
    current.finish();
    return;
  }
  settle(id, {
    state: "aborted",
    endTime: now(),
    error: captureError(
      { name: "XMLHttpRequest", message: "open() was called again before this request finished" },
      { kind: "aborted" },
    ),
  });
}

function resolve(url: string): URL | null {
  try {
    return new URL(url, location.href);
  } catch {
    return null;
  }
}

/** `getAllResponseHeaders()` — CRLF-separated `name: value` lines — as a map. */
function parseResponseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    // A repeated header arrives as repeated lines; joined the way fetch does.
    out[name] = name in out ? `${out[name]}, ${value}` : value;
  }
  return out;
}

/** The response body as the Response tab should show it. */
function readBody(xhr: XMLHttpRequest, contentType: string, cap: number): { payload: unknown; bytes?: number } {
  if (cap === 0) return { payload: notCaptured("body capture is switched off (maxBodyBytes: 0)") };
  try {
    const type = xhr.responseType;
    if (type === "" || type === "text") {
      const text = xhr.responseText;
      if (text.length > cap) {
        return { payload: notCaptured(`the body is over the capture limit (${text.length} characters)`), bytes: text.length };
      }
      if (text === "") return { payload: undefined, bytes: 0 };
      if (/json/i.test(contentType)) {
        try {
          return { payload: JSON.parse(text), bytes: text.length };
        } catch {
          /* mislabelled — shown as the text it is */
        }
      }
      return { payload: text, bytes: text.length };
    }
    if (type === "json") return { payload: xhr.response, bytes: estimateBytes(xhr.response) };
    if (type === "arraybuffer") {
      const bytes = (xhr.response as ArrayBuffer | null)?.byteLength ?? 0;
      return { payload: `«binary body: ${contentType || "unknown type"} — ${bytes} bytes»`, bytes };
    }
    if (type === "blob") {
      const bytes = (xhr.response as Blob | null)?.size ?? 0;
      return { payload: `«binary body: ${contentType || "unknown type"} — ${bytes} bytes»`, bytes };
    }
    return { payload: notCaptured(`responseType "${type}" is not a body Blix can show`) };
  } catch {
    return { payload: notCaptured("the response body could not be read") };
  }
}

function settle(id: string, patch: Partial<MonitorEntry>): void {
  try {
    networkMonitor.update(id, patch);
  } catch {
    /* capture must never break a request */
  }
}

/**
 * Wraps `XMLHttpRequest` so requests made with it are captured, and returns a
 * disposer that restores the three methods it replaced.
 *
 * Call once, before the first request you want to see. A no-op in production,
 * on the server, and when already installed.
 */
export function attachXhrMonitor(options: XhrMonitorOptions = {}): () => void {
  if (!MONITOR_ENABLED || typeof XMLHttpRequest === "undefined") return () => {};

  const proto = XMLHttpRequest.prototype as XMLHttpRequest & { [WRAPPED]?: boolean };
  if (proto[WRAPPED]) return () => {};

  if (options.dbName) configureDbName(options.dbName);
  startResourceTiming();

  const cap =
    typeof options.maxBodyBytes === "number" && options.maxBodyBytes >= 0
      ? options.maxBodyBytes
      : DEFAULT_MAX_BODY_BYTES;
  const ignore = resolveIgnore(options.ignore);

  const { open, send, setRequestHeader } = proto;

  proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    try {
      dropActive(this);
      const href = String(url);
      meta.set(this,{ method: String(method).toUpperCase(), url: href, resolved: resolve(href), headers: {} });
    } catch {
      /* capture must never break a request */
    }
    return (open as (...args: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof proto.open;

  proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
    try {
      const pending = meta.get(this);
      if (pending) {
        // The browser combines repeated calls for one name; so does this.
        pending.headers[name] = name in pending.headers ? `${pending.headers[name]}, ${value}` : value;
      }
    } catch {
      /* capture must never break a request */
    }
    return setRequestHeader.call(this, name, value);
  };

  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    try {
      const pending = meta.get(this);
      if (
        pending &&
        !networkMonitor.isPaused &&
        !isIgnored(pending.resolved, ignore) &&
        // An axios request the interceptor already logged.
        !claimAxiosTransport(pending.method, pending.resolved?.href ?? pending.url)
      ) {
        begin(this, pending, body, cap);
      }
    } catch {
      /* capture must never break a request */
    }
    return send.call(this, body);
  };

  proto[WRAPPED] = true;

  return () => {
    // Only what is still Blix's: something that wrapped over these since is
    // left in place rather than silently removed along with it.
    if (proto[WRAPPED]) {
      proto.open = open;
      proto.send = send;
      proto.setRequestHeader = setRequestHeader;
      delete proto[WRAPPED];
    }
  };
}

function begin(
  xhr: XMLHttpRequest,
  pending: Pending,
  body: Document | XMLHttpRequestBodyInit | null | undefined,
  cap: number,
): void {
  const id = networkMonitor.nextId();
  pending.id = id;

  const hadFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const isDocument = typeof Document !== "undefined" && body instanceof Document;
  const requestPayload = isDocument ? "«document body»" : serializeBody(body ?? undefined);
  const owner = getOwner();
  const auth = readAuthorization(pending.headers, "fetch");
  // What `send()` adds when the page set no type — the same rules as fetch.
  const implied = isDocument ? undefined : impliedContentType(body);
  const typed = Object.keys(pending.headers).some((name) => name.toLowerCase() === "content-type");
  const headers = implied && !typed ? { ...pending.headers, "content-type": implied } : pending.headers;

  networkMonitor.start(
    {
      id,
      // Not in the public `MonitorEntry["client"]` union while this monitor is
      // unreleased — see `XhrClient` above.
      client: XHR_CLIENT,
      method: pending.method,
      url: pending.url,
      at: Date.now(),
      startTime: now(),
      requestPayload,
      requestHeaders: serializeHeaders(headers),
      sizeBytes: estimateBytes(requestPayload),
      hadFormData,
      ownerId: owner?.id,
      initiatorKind: owner?.kind,
      ...(auth.claims ? { authClaims: auth.claims } : {}),
    },
    { authorization: auth.raw },
  );
  if (owner) networkMonitor.linkChild(owner.id, id);

  // Which of the three failure events fired. `loadend` follows every one of
  // them and a success alike, so it is where the entry settles — once.
  //
  // Each listener answers only while this request is the one the object is
  // carrying (see `active`), and all four are removed once it has settled.
  const listening = new AbortController();
  const options = { signal: listening.signal };
  let failure: FailureKind | undefined;
  let finished = false;

  /** Records the outcome, once — from `loadend`, or from `open()` reusing the
   * object before Blix's `loadend` listener ran (see `dropActive`). */
  const finish = () => {
    if (finished) return;
    finished = true;
    listening.abort();
    try {
      const endTime = now();

      if (failure || xhr.status === 0) {
        const kind = failure ?? "network";
        settle(id, {
          state: kind === "aborted" ? "aborted" : "error",
          endTime,
          error: captureError(
            {
              name: "XMLHttpRequest",
              message:
                kind === "timeout"
                  ? `timeout of ${xhr.timeout}ms exceeded`
                  : kind === "aborted"
                    ? "The request was aborted"
                    : "Network Error",
            },
            { kind, timeoutMs: xhr.timeout || undefined },
          ),
        });
        return;
      }

      const headers = parseResponseHeaders(xhr.getAllResponseHeaders());
      const { payload, bytes } = readBody(xhr, headers["content-type"] ?? "", cap);
      // The same split as axios and fetch: anything outside 2xx and 304 is
      // filed as a failure, with the body inside it.
      const ok = (xhr.status >= 200 && xhr.status < 300) || xhr.status === 304;
      settle(id, {
        state: ok ? "success" : "error",
        status: xhr.status,
        endTime,
        responseHeaders: serializeHeaders(headers),
        ...(ok
          ? { responsePayload: payload }
          : { error: captureHttpFailure(xhr.status, xhr.statusText, payload) }),
        ...(bytes !== undefined ? { sizeBytes: bytes } : {}),
      });
    } catch {
      /* capture must never break a request */
    }
  };

  active.set(xhr, { id, finish });
  const mine = () => active.get(xhr)?.id === id;
  xhr.addEventListener("timeout", () => mine() && (failure = "timeout"), options);
  xhr.addEventListener("abort", () => mine() && (failure = "aborted"), options);
  xhr.addEventListener("error", () => mine() && (failure = "network"), options);
  xhr.addEventListener(
    "loadend",
    () => {
      if (!mine()) {
        listening.abort();
        return;
      }
      active.delete(xhr);
      finish();
    },
    options,
  );
}
