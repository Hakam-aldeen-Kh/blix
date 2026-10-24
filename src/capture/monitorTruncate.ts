/**
 * Network monitor — bounded payload truncation for the persisted copy.
 *
 * Truncation applies **only** to what goes into IndexedDB. The live in-memory
 * entry always keeps the full payload, so inspecting a 4 MB attachment response
 * during the session is unaffected; only the copy that survives a reload is
 * trimmed. That also means the cost is paid on the idle flusher, never inside
 * the axios interceptor.
 *
 * The walker must never `JSON.stringify` the whole value to decide whether it
 * is too big — that is precisely the expensive operation we're avoiding.
 */

import { isErrorLike } from "./errorLike";
import { ARRAY_CAP, STRING_CAP } from "./monitorConfig";
import { SENSITIVE_HEADERS, serializeHeaders } from "./monitorSerialize";

/**
 * What a credential string under a credential-named key is stored as: the
 * same mask the Headers tab shows, from the one place that masks.
 */
function maskedValue(key: string, value: string): string {
  return serializeHeaders({ [key]: value })[key] ?? "••••";
}

/** Marker left in place of content that was dropped. The panel renders these
 * as an inline chip rather than as literal object data. */
export interface TruncationMarker {
  __nmTruncated: "string" | "object" | "array";
  /** Original size, where known. */
  bytes?: number;
  /** Leading slice of a truncated string. */
  head?: string;
  /** How many keys/elements were dropped. */
  omitted?: number;
  total?: number;
}

export interface TruncateResult {
  value: unknown;
  /** Approximate serialized size of the *truncated* value. */
  bytes: number;
  truncated: boolean;
}

/**
 * Depth-first copy with a running byte budget. Aborts subtrees as soon as the
 * accumulator exceeds `maxBytes`, replacing them with a `TruncationMarker`.
 */
export function truncateForPersist(
  value: unknown,
  maxBytes: number,
): TruncateResult {
  let used = 0;
  let truncated = false;
  /** The objects on the path from the root to the node being copied. */
  const ancestors = new WeakSet<object>();

  const walk = (node: unknown): unknown => {
    if (node === null || node === undefined) {
      used += 4;
      return node;
    }

    if (typeof node === "string") {
      if (node.length > STRING_CAP) {
        truncated = true;
        used += STRING_CAP + 64;
        const marker: TruncationMarker = {
          __nmTruncated: "string",
          bytes: node.length,
          head: node.slice(0, STRING_CAP),
        };
        return marker;
      }
      used += node.length + 2;
      return node;
    }

    if (typeof node === "number" || typeof node === "boolean") {
      used += 8;
      return node;
    }

    // Functions, symbols and bigints aren't JSON-representable.
    if (typeof node !== "object") {
      used += 8;
      return String(node);
    }

    // A cycle is an object reached again *inside itself*. One reached twice
    // side by side — a selected item that is also in the list, which Redux's
    // structural sharing produces all the time — is copied both times: cut as
    // a cycle, its second place in the state read as truncated.
    if (ancestors.has(node as object)) {
      truncated = true;
      return { __nmTruncated: "object", omitted: 0 } satisfies TruncationMarker;
    }
    ancestors.add(node as object);
    try {
      return copyObject(node as object);
    } finally {
      ancestors.delete(node as object);
    }
  };

  const copyObject = (node: object): unknown => {
    // An error is never copied structurally, at any depth. An AxiosError's
    // enumerable properties are its request config — headers and body
    // included — and its response; walking them is how a bearer token ended
    // up in a stored query error. The safety net for paths that hand an error
    // over without going through `describeError` first. Recognized by what
    // it is, not by its keys — see `errorLike.ts`: a plain object that happens
    // to have a `config` or a `stack` is data, and is copied like any other.
    const thrown: boolean = isErrorLike(node);
    if (thrown) {
      truncated = true;
      const out: Record<string, string> = {};
      used += 2;
      for (const field of ["name", "message", "code"] as const) {
        const value = (node as Record<string, unknown>)[field];
        if (typeof value !== "string" || value === "") continue;
        out[field] = value.length > STRING_CAP ? value.slice(0, STRING_CAP) : value;
        used += field.length + out[field].length + 5;
      }
      return out;
    }

    if (Array.isArray(node)) {
      const limit = Math.min(node.length, ARRAY_CAP);
      const out: unknown[] = [];
      used += 2;
      for (let i = 0; i < limit; i += 1) {
        if (used >= maxBytes) {
          truncated = true;
          out.push({
            __nmTruncated: "array",
            total: node.length,
            omitted: node.length - i,
          } satisfies TruncationMarker);
          return out;
        }
        out.push(walk(node[i]));
        used += 1;
      }
      if (node.length > limit) {
        truncated = true;
        out.push({
          __nmTruncated: "array",
          total: node.length,
          omitted: node.length - limit,
        } satisfies TruncationMarker);
      }
      return out;
    }

    const entries = Object.entries(node as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    used += 2;
    for (let i = 0; i < entries.length; i += 1) {
      if (used >= maxBytes) {
        truncated = true;
        out.__nmTruncated = "object";
        out.omitted = entries.length - i;
        return out;
      }
      const [key, val] = entries[i];
      used += key.length + 3;
      // Credentials are masked by name wherever they sit, not only in a
      // header map: a payload, a diffed slice or a response body that carries
      // an `authorization` or `cookie` key is stored the way a header is.
      //
      // Strings only. A credential is a string; `cookie: { accepted: true }`
      // is a consent record and `authorization: { role: "admin" }` a
      // permissions object, and both used to be stored as "••••" — data
      // destroyed on the strength of what its key was called, and a Redux
      // action made unreplayable with it. Anything that is not a string is
      // walked like any other value, so a credential nested inside it is still
      // caught by its own key. A list is the one other shape a header takes
      // (`set-cookie`), so the strings in one are masked in place.
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
        const mask = (secret: string): string => {
          truncated = true;
          const masked = maskedValue(key, secret);
          used += masked.length + 2;
          return masked;
        };
        if (typeof val === "string" && val !== "") {
          out[key] = mask(val);
          continue;
        }
        if (Array.isArray(val) && val.some((item) => typeof item === "string" && item !== "")) {
          out[key] = val
            .slice(0, ARRAY_CAP)
            .map((item) => (typeof item === "string" && item !== "" ? mask(item) : walk(item)));
          if (val.length > ARRAY_CAP) truncated = true;
          continue;
        }
      }
      out[key] = walk(val);
    }
    return out;
  };

  let out: unknown;
  try {
    out = walk(value);
  } catch {
    // Getters that throw, exotic proxies — persist a stub rather than nothing.
    return {
      value: { __nmTruncated: "object", omitted: 0 } satisfies TruncationMarker,
      bytes: 32,
      truncated: true,
    };
  }

  return { value: out, bytes: used, truncated };
}

/** Type guard used by the panel to render markers as a chip. */
export function isTruncationMarker(value: unknown): value is TruncationMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    "__nmTruncated" in (value as Record<string, unknown>)
  );
}
