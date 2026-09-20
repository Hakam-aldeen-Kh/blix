/**
 * Dev Tools — how a JWT's `alg` reads in the inspector.
 *
 * Display only. The entry keeps `alg` exactly as the token had it, and so do
 * IndexedDB and the exports; everything here decides only what a person reads.
 *
 * .NET's `JsonWebTokenHandler` writes `SigningCredentials.Algorithm` into the
 * header verbatim, so an app signing with
 * `SecurityAlgorithms.HmacSha256Signature` sends
 * `http://www.w3.org/2001/04/xmldsig-more#hmac-sha256` where the JWS spec
 * expects `HS256`. The twelve signature URIs below are copied from
 * `SecurityAlgorithms.cs` (Microsoft.IdentityModel.Tokens) and matched
 * case-sensitively: they are constants, not input. RSA-PSS lives under a
 * different namespace (`2007/05`) with a different form — that is not a typo.
 *
 * The key-wrap URIs from the same class are deliberately absent. They only
 * ever appear in a JWE header, and the decoder reads three-part tokens alone;
 * mapping them would suggest JWE support that does not exist.
 */

import type { JwtClaims } from "../../capture/monitorTypes";

/** URI → [readable name, JWS name]. A `Map`, so a header `alg` such as
 * `"constructor"` cannot find something on a prototype. */
const XMLDSIG_SIGNATURES: ReadonlyMap<string, readonly [name: string, jws: string]> = new Map([
  ["http://www.w3.org/2001/04/xmldsig-more#hmac-sha256", ["HMAC-SHA256", "HS256"]],
  ["http://www.w3.org/2001/04/xmldsig-more#hmac-sha384", ["HMAC-SHA384", "HS384"]],
  ["http://www.w3.org/2001/04/xmldsig-more#hmac-sha512", ["HMAC-SHA512", "HS512"]],
  ["http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", ["RSA-SHA256", "RS256"]],
  ["http://www.w3.org/2001/04/xmldsig-more#rsa-sha384", ["RSA-SHA384", "RS384"]],
  ["http://www.w3.org/2001/04/xmldsig-more#rsa-sha512", ["RSA-SHA512", "RS512"]],
  ["http://www.w3.org/2007/05/xmldsig-more#sha256-rsa-MGF1", ["RSA-PSS-SHA256", "PS256"]],
  ["http://www.w3.org/2007/05/xmldsig-more#sha384-rsa-MGF1", ["RSA-PSS-SHA384", "PS384"]],
  ["http://www.w3.org/2007/05/xmldsig-more#sha512-rsa-MGF1", ["RSA-PSS-SHA512", "PS512"]],
  ["http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256", ["ECDSA-SHA256", "ES256"]],
  ["http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384", ["ECDSA-SHA384", "ES384"]],
  ["http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512", ["ECDSA-SHA512", "ES512"]],
] as const);

/**
 * Characters an unmapped `alg` shows before it is cut with an ellipsis. Sized
 * so the value and its Copy chip stay on one line of the claims block at the
 * panel's narrowest — a 380px right dock — where a 300-character value used to
 * grow the Authorization row to 301px. The full value stays in the tooltip and
 * on the Copy chip.
 */
export const ALG_LABEL_MAX = 24;

export interface AlgView {
  /** What the inspector prints. */
  label: string;
  /** The value as the token had it, when there was a string — for the tooltip
   * and Copy. */
  raw?: string;
  /** "no alg" / "not a string": a statement about the header, not a value. */
  absent: boolean;
  /** `none`, in any case. */
  unsigned: boolean;
}

export function describeAlg(claims: Pick<JwtClaims, "alg" | "algNotString">): AlgView {
  if (claims.algNotString) {
    return { label: "present, not a string", absent: true, unsigned: false };
  }
  const raw = claims.alg;
  if (raw === undefined || raw === "") {
    return { label: "no alg", absent: true, unsigned: false };
  }
  const mapped = XMLDSIG_SIGNATURES.get(raw);
  if (mapped) {
    return { label: `${mapped[0]} (${mapped[1]})`, raw, absent: false, unsigned: false };
  }
  // By code point, so the cut never splits a surrogate pair.
  const chars = Array.from(raw);
  return {
    label: chars.length > ALG_LABEL_MAX ? `${chars.slice(0, ALG_LABEL_MAX).join("")}…` : raw,
    raw,
    absent: false,
    // Case-insensitive on purpose: `None` and `NONE` are how an unsigned token
    // gets past a server that only rejects the lower-case spelling.
    unsigned: raw.toLowerCase() === "none",
  };
}
