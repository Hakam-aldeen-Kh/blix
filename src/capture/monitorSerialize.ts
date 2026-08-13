/**
 * Network monitor — turning axios request/response objects into something the
 * panel can render, safely and cheaply.
 *
 * Nothing in this file may throw: it runs inside the axios interceptors, and
 * monitoring must never be able to break a request.
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
 * bearer token / session secret in plaintext. */
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

function maskHeaderValue(key: string, value: string): string {
  if (!SENSITIVE_HEADERS.has(key.toLowerCase())) return value;
  if (value.length <= 12) return "••••";
  return `${value.slice(0, 8)}…${value.slice(-4)} (masked)`;
}

/**
 * Flattens Axios header objects (AxiosHeaders | plain map | nested method maps)
 * into a flat `Record<string,string>` for display, masking secrets. Never
 * throws — header capture must not be able to break a request.
 */
export function serializeHeaders(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers || typeof headers !== "object") return out;

  // AxiosHeaders exposes a `.toJSON()`; fall back to own enumerable keys.
  const source =
    typeof (headers as { toJSON?: () => unknown }).toJSON === "function"
      ? (headers as { toJSON: () => unknown }).toJSON()
      : headers;

  if (!source || typeof source !== "object") return out;

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (value == null) continue;
    // Skip axios' per-method header buckets (common, get, post, …).
    if (typeof value === "object" && !Array.isArray(value)) continue;
    const str = Array.isArray(value) ? value.join(", ") : String(value);
    out[key] = maskHeaderValue(key, str);
  }
  return out;
}

/** Above this, `estimateBytes` stops walking and reports the cap. Callers only
 * need an order of magnitude, and large responses (file attachments, base64
 * blobs) are big enough that an exact count is not worth the traversal. */
const ESTIMATE_CEILING = 8 * 1024 * 1024;

/**
 * Approximate JSON byte size without serializing.
 *
 * `JSON.stringify(value).length` on a multi-megabyte base64 attachment payload
 * is the single most expensive thing the panel used to do — and it did it twice
 * per render. This walks the structure with a running total instead, bails out
 * at `ESTIMATE_CEILING`, and is cycle-safe.
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
