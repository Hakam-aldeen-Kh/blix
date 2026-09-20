/**
 * Network monitor — the `Authorization` header: what a JWT in it claims, and
 * whether the panel may show the value itself.
 *
 * ## Claims, never the credential
 *
 * The header is masked at capture (`serializeHeaders`), so nothing downstream
 * ever holds a token to decode. Rather than keep one around to make an
 * inspector possible, the claims are read here — at the only moment the value
 * exists — and only they are stored: `exp`, `iat`, `sub`, `iss` and the
 * header's `alg`. The signature is never kept, and neither is the payload as
 * base64, so nothing stored can be pasted back into a request.
 *
 * Decoding is all-or-nothing. Anything that is not a well-formed compact JWS —
 * an opaque bearer token, a JWE, a segment that is not base64url JSON, a claim
 * of the wrong type — yields no claims at all, never a partial parse that would
 * present a guess as a fact. The signature is not verified: Blix has no key,
 * and a devtool that said "valid" would be claiming something it cannot know.
 *
 * ## Unmasking
 *
 * With masking switched off, capture also keeps the raw value — in
 * `networkMonitor`'s side table, never on the entry. Persistence writes
 * entries and every export reads them, so the raw value cannot reach
 * IndexedDB, a downloaded file or a copied snippet. Only `authorization` is
 * affected: cookies, `x-api-key` and realtime tokens stay masked regardless.
 *
 * Nothing here may throw: it runs inside the axios interceptors and the fetch
 * wrapper.
 */

import type { JwtClaims } from "./monitorTypes";
import { networkMonitor } from "./networkMonitor";

/** Far longer than any real token. Past it, decoding is not attempted. */
const MAX_TOKEN_CHARS = 16 * 1024;

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** A base64url segment as JSON. Throws on anything malformed; the one caller
 * turns that into "no claims". */
function decodeSegment(segment: string): unknown {
  // A length of 4n+1 cannot come from any byte sequence.
  if (!segment || !BASE64URL.test(segment) || segment.length % 4 === 1) {
    throw new Error("not base64url");
  }
  const base64 = segment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  // Fatal, so a payload that is not UTF-8 is rejected rather than rendered
  // with replacement characters.
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The claims of a JWT, from a raw header value — `Bearer <token>` or a bare
 * token. `undefined` for anything that is not one, and for any JWT whose
 * `sub`/`iss` is not a string or whose `iat`/`exp` is not a finite number.
 */
export function decodeJwtClaims(value: string): JwtClaims | undefined {
  try {
    if (typeof value !== "string" || value.length > MAX_TOKEN_CHARS) return undefined;
    const parts = value.trim().replace(/^bearer\s+/i, "").split(".");
    if (parts.length !== 3) return undefined;

    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    // The signature is not read, but it still has to be shaped like one. Empty
    // is legal: an unsecured JWT (`alg: "none"`) carries no signature.
    if (!isRecord(header) || !isRecord(payload) || !BASE64URL.test(parts[2])) {
      return undefined;
    }
    if (typeof header.alg !== "string" || header.alg === "") return undefined;

    const claims: JwtClaims = { alg: header.alg };
    for (const key of ["sub", "iss"] as const) {
      const claim = payload[key];
      if (claim === undefined) continue;
      if (typeof claim !== "string") return undefined;
      claims[key] = claim;
    }
    for (const key of ["iat", "exp"] as const) {
      const claim = payload[key];
      if (claim === undefined) continue;
      if (typeof claim !== "number" || !Number.isFinite(claim)) return undefined;
      claims[key] = claim;
    }
    return claims;
  } catch {
    return undefined;
  }
}

/** Runtime switch, flipped from the panel's prefs — the same arrangement as
 * `setInitiatorCapture`. Starts on, so anything captured before the panel has
 * mounted and read the pref is masked. */
let masking = true;

export function setAuthorizationMasking(on: boolean): void {
  if (masking === on) return;
  masking = on;
  // Values kept while masking was off go the moment it is back on, rather than
  // lingering in memory behind a panel that no longer shows them.
  if (on) networkMonitor.forgetAuthorizations();
}

/** What capture records about a request's `Authorization` header. */
export interface CapturedAuthorization {
  /** Present only when the value is a JWT. Stored on the entry. */
  claims?: JwtClaims;
  /** Present only while masking is off. Handed to `networkMonitor.start`'s
   * side table — never put on the entry. */
  raw?: string;
}

/**
 * Reads `Authorization` from a flattened, still-unmasked header map (see
 * `flattenCapturedHeaders`). Header names are unique case-insensitively there,
 * so the first match is the only one.
 */
export function readAuthorization(headers: Record<string, string>): CapturedAuthorization {
  try {
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() !== "authorization") continue;
      const value = headers[name];
      const claims = decodeJwtClaims(value);
      return {
        ...(claims ? { claims } : {}),
        ...(masking ? {} : { raw: value }),
      };
    }
  } catch {
    /* capture must never break a request */
  }
  return {};
}
