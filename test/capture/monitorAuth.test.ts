import { describe, expect, test } from "vitest";
import { decodeJwtClaims, readAuthorization, setAuthorizationMasking } from "../../src/capture/monitorAuth";

const b64url = (value: unknown) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const jwt = (header: unknown, payload: unknown, signature = "sig") => `${b64url(header)}.${b64url(payload)}.${signature}`;

describe("decodeJwtClaims", () => {
  test("reads alg, sub, iss, iat and exp, with or without Bearer", () => {
    const token = jwt({ alg: "HS256" }, { sub: "u1", iss: "auth", iat: 1, exp: 2, extra: "ignored" });
    const claims = { alg: "HS256", sub: "u1", iss: "auth", iat: 1, exp: 2 };
    expect(decodeJwtClaims(token)).toEqual(claims);
    expect(decodeJwtClaims(`Bearer ${token}`)).toEqual(claims);
    expect(decodeJwtClaims(`bearer   ${token}`)).toEqual(claims);
  });

  test("an unsecured token (empty signature) is still a JWT", () => {
    expect(decodeJwtClaims(jwt({ alg: "none" }, { sub: "x" }, ""))).toEqual({ alg: "none", sub: "x" });
  });

  test("a non-ASCII claim decodes as UTF-8", () => {
    expect(decodeJwtClaims(jwt({ alg: "HS256" }, { sub: "حكم" }))?.sub).toBe("حكم");
  });

  test("an alg that is not a string is flagged, not stored", () => {
    expect(decodeJwtClaims(jwt({ alg: 5 }, {}))).toEqual({ algNotString: true });
  });

  test.each([
    ["two parts", "a.b"],
    ["four parts", "a.b.c.d"],
    ["not base64url", "a$.b.c"],
    ["a 4n+1 segment", `${"A".repeat(5)}.${b64url({})}.s`],
    ["a payload that is not JSON", `${b64url({ alg: "x" })}.${b64url("not json")}.s`],
    ["a payload that is an array", jwt({ alg: "x" }, [1, 2])],
    ["a sub that is not a string", jwt({ alg: "x" }, { sub: 5 })],
    ["an exp that is not a number", jwt({ alg: "x" }, { exp: "soon" })],
    ["an opaque token", "Bearer 0123456789abcdef"],
    ["a token over 16 KB", jwt({ alg: "x" }, { pad: "x".repeat(17_000) })],
  ])("rejects %s", (_label, value) => {
    expect(decodeJwtClaims(value)).toBeUndefined();
  });

  test("a payload that is not UTF-8 is rejected, not garbled", () => {
    const bad = Buffer.from([0xff, 0xfe, 0x7b, 0x7d]).toString("base64url");
    expect(decodeJwtClaims(`${b64url({ alg: "x" })}.${bad}.s`)).toBeUndefined();
  });
});

describe("readAuthorization", () => {
  const token = jwt({ alg: "RS256" }, { sub: "u9" });

  test("finds the header case-insensitively and tags the claims with their source", () => {
    expect(readAuthorization({ AUTHORIZATION: `Bearer ${token}` }, "fetch")).toEqual({
      claims: { alg: "RS256", sub: "u9", source: "fetch" },
    });
  });

  test("hands over the raw value only while masking is off", () => {
    setAuthorizationMasking(false);
    try {
      expect(readAuthorization({ authorization: "Basic abc" }, "fetch")).toEqual({ raw: "Basic abc" });
    } finally {
      setAuthorizationMasking(true);
    }
    expect(readAuthorization({ authorization: "Basic abc" }, "fetch")).toEqual({});
  });

  test("no header, nothing", () => {
    expect(readAuthorization({ accept: "*/*" }, "fetch")).toEqual({});
  });
});
