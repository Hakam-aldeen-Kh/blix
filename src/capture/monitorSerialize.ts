/**
 * Network monitor — turning captured request/response objects into something
 * the panel can render, safely and cheaply.
 *
 * Shared by both HTTP transports: `attachHttpMonitor` hands it axios's objects,
 * `attachFetchMonitor` hands it values straight off a `fetch` call.
 *
 * Nothing in this file may throw: it runs inside the axios interceptors and the
 * fetch wrapper, and monitoring must never be able to break a request.
 */

/**
 * Normalizes an Axios request/response body into something JSON-renderable.
 * - FormData -> plain object (files summarized, never read into memory)
 * - JSON string -> parsed object
 * - everything else -> returned as-is
 */
export function serializeBody(data: unknown): unknown {
  if (data == null) return data;

  if (typeof FormData !== "undefined" && data instanceof FormData) {
    const obj: Record<string, unknown> = {};
    data.forEach((value, key) => {
      if (typeof File !== "undefined" && value instanceof File) {
        obj[key] = `«File: ${value.name} — ${value.size} bytes»`;
      } else {
        obj[key] = value;
      }
    });
    return obj;
  }

  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  return data;
}

/** Sensitive header values are masked so the dev panel never displays a full
 * bearer token / session secret in plaintext.
 *
 * Exported because the panel labels these rows rather than making the reader
 * infer it from an ellipsis — see the MASKED tag in the Headers tab. Matching
 * on the name is what lets the tag be right for a short value too, which is
 * masked to bullets and carries no suffix to detect.
 */
export const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

/** Appended to a masked value so every *other* consumer — HAR, JSON, NDJSON,
 * a pasted cURL — carries the fact with it. The panel strips it for display
 * and shows a tag instead. */
export const MASK_SUFFIX = " (masked)";

function maskHeaderValue(key: string, value: string): string {
  if (!SENSITIVE_HEADERS.has(key.toLowerCase())) return value;
  if (value.length <= 12) return "••••";
  return `${value.slice(0, 8)}…${value.slice(-4)}${MASK_SUFFIX}`;
}

type HeadersLike = { forEach(callback: (value: unknown, name: unknown) => void): void };

/**
 * A `Headers` instance — or one from another realm, or a polyfill, which fails
 * `instanceof`. Recognized by the pair of methods every implementation has.
 * `AxiosHeaders` is excluded by its `toJSON`, which `serializeHeaders` uses
 * instead. (A `Map` also passes, and is iterated correctly: its `forEach`
 * callback takes `(value, key)` in the same order.)
 */
function isHeadersLike(value: object): value is HeadersLike {
  if (typeof Headers !== "undefined" && value instanceof Headers) return true;
  const candidate = value as { forEach?: unknown; get?: unknown; toJSON?: unknown };
  return (
    typeof candidate.forEach === "function" &&
    typeof candidate.get === "function" &&
    typeof candidate.toJSON !== "function"
  );
}

/**
 * Flattens any header container a caller can legally hand to `fetch` — a
 * `Headers` instance, `[name, value][]` pairs, or a plain record — into one
 * plain `name → value` object. **Unmasked**: masking happens in exactly one
 * place, `serializeHeaders`, and this output is only ever meant for it.
 *
 * **Duplicate names are joined, never dropped.** Names match
 * case-insensitively, the first spelling seen is kept, and values are joined
 * with `", "` — the Fetch spec's own combining rule, and what `Headers.get`
 * returns. The one exception is `set-cookie`, joined with a newline: cookie
 * attributes such as `Expires` contain commas, so a comma join would make the
 * values impossible to split back apart.
 */
export function flattenHeaders(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers || typeof headers !== "object") return out;

  /** lower-cased name → the spelling stored in `out` */
  const spelling = new Map<string, string>();

  const add = (rawName: unknown, rawValue: unknown) => {
    if (rawValue == null) return;
    const name = String(rawName);
    const lower = name.toLowerCase();
    const separator = lower === "set-cookie" ? "\n" : ", ";
    const value = Array.isArray(rawValue)
      ? rawValue.map(String).join(separator)
      : String(rawValue);

    const existing = spelling.get(lower);
    if (existing === undefined) {
      spelling.set(lower, name);
      out[name] = value;
    } else {
      out[existing] = `${out[existing]}${separator}${value}`;
    }
  };

  try {
    if (Array.isArray(headers)) {
      for (const pair of headers) {
        if (Array.isArray(pair) && pair.length >= 2) add(pair[0], pair[1]);
      }
      return out;
    }

    if (isHeadersLike(headers)) {
      headers.forEach((value, name) => add(name, value));
      return out;
    }

    for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
      // Skip axios' per-method header buckets (common, get, post, …).
      if (typeof value === "object" && value !== null && !Array.isArray(value)) continue;
      add(name, value);
    }
  } catch {
    /* a throwing iterator or getter must not break capture */
  }
  return out;
}

/**
 * Flattens any header container into a flat `Record<string,string>` for
 * display, masking secrets. Never throws — header capture must not be able to
 * break a request.
 *
 * Accepts everything either transport produces: `AxiosHeaders` (via its
 * `.toJSON()`), plain maps including axios' per-method buckets, and — through
 * `flattenHeaders` — a `Headers` instance or `[name, value][]` pairs.
 *
 * **The last two used to leak credentials.** A `Headers` instance has no own
 * enumerable keys, so it came out as `{}`; a pair array was walked by index, so
 * the name masked on was `"0"` and `authorization, Bearer …` went through in
 * the clear. A `fetch` caller can legally pass either as `init.headers`.
 * `attachFetchMonitor` normalises at its own boundary too — handling them here
 * as well is what stops the leak coming back through the next call site that
 * forgets to.
 */
export function serializeHeaders(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers || typeof headers !== "object") return out;

  try {
    // AxiosHeaders exposes a `.toJSON()`; everything else is flattened as-is.
    const source =
      typeof (headers as { toJSON?: () => unknown }).toJSON === "function"
        ? (headers as { toJSON: () => unknown }).toJSON()
        : headers;

    for (const [key, value] of Object.entries(flattenHeaders(source))) {
      out[key] = maskHeaderValue(key, value);
    }
  } catch {
    /* noop — see above */
  }
  return out;
}

/** Above this, `estimateBytes` stops walking and reports the cap. Callers only
 * need an order of magnitude, and large responses (file attachments, base64
 * blobs) are big enough that an exact count is not worth the traversal. */
const ESTIMATE_CEILING = 8 * 1024 * 1024;

/**
 * The exact size of a binary or form-encoded value, read from its own length
 * property — never by reading the bytes. `null` for anything else.
 *
 * Without this the structural walk below got every one of these wrong, and
 * silently: a `Blob`, an `ArrayBuffer` and a `URLSearchParams` have no own
 * enumerable keys and all measured 2 bytes, while a typed array was walked
 * index by index — a 1 MB `Uint8Array` took ~340 ms to report the ceiling.
 */
function knownByteLength(node: object): number | null {
  // `File` extends `Blob`.
  if (typeof Blob !== "undefined" && node instanceof Blob) return node.size;
  if (typeof ArrayBuffer !== "undefined") {
    if (node instanceof ArrayBuffer) return node.byteLength;
    // Every TypedArray, and DataView.
    if (ArrayBuffer.isView(node)) return node.byteLength;
  }
  if (typeof SharedArrayBuffer !== "undefined" && node instanceof SharedArrayBuffer) {
    return node.byteLength;
  }
  if (typeof URLSearchParams !== "undefined" && node instanceof URLSearchParams) {
    // Exact as a byte count, not just a character count: the
    // x-www-form-urlencoded serializer percent-encodes everything outside
    // ASCII, so every character of the result is one byte.
    return node.toString().length;
  }
  return null;
}

/**
 * Approximate JSON byte size without serializing.
 *
 * `JSON.stringify(value).length` on a multi-megabyte base64 attachment payload
 * is the single most expensive thing the panel used to do — and it did it twice
 * per render. This walks the structure with a running total instead, bails out
 * at `ESTIMATE_CEILING`, and is cycle-safe. Binary and form-encoded values —
 * at the top level or nested — are measured by their own length instead.
 */
export function estimateBytes(value: unknown): number {
  let total = 0;
  const seen = new WeakSet<object>();

  const walk = (node: unknown): void => {
    if (total >= ESTIMATE_CEILING) return;

    if (node === null || node === undefined) {
      total += 4;
      return;
    }

    switch (typeof node) {
      case "string":
        total += node.length + 2; // quotes
        return;
      case "number":
      case "boolean":
        total += 8;
        return;
      case "bigint":
      case "symbol":
      case "function":
        total += 8;
        return;
    }

    if (typeof node !== "object") return;

    const known = knownByteLength(node as object);
    if (known !== null) {
      total += known;
      return;
    }

    // Cycles are possible in axios configs; count a repeat as a small stub.
    if (seen.has(node as object)) {
      total += 8;
      return;
    }
    seen.add(node as object);

    if (Array.isArray(node)) {
      total += 2 + node.length; // brackets + commas
      for (const item of node) {
        if (total >= ESTIMATE_CEILING) return;
        walk(item);
      }
      return;
    }

    const entries = Object.entries(node as Record<string, unknown>);
    total += 2 + entries.length * 2; // braces + `:` and `,`
    for (const [key, val] of entries) {
      if (total >= ESTIMATE_CEILING) return;
      total += key.length + 2;
      walk(val);
    }
  };

  try {
    walk(value);
  } catch {
    /* never let size estimation break capture */
  }
  return Math.min(total, ESTIMATE_CEILING);
}
