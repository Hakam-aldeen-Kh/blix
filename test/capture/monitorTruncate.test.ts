import { describe, expect, test } from "vitest";
import { ARRAY_CAP, STRING_CAP } from "../../src/capture/monitorConfig";
import { isTruncationMarker, truncateForPersist } from "../../src/capture/monitorTruncate";

describe("truncateForPersist", () => {
  test("a small value is copied unchanged and not marked", () => {
    const value = { a: 1, b: "two", c: [true, null], d: { e: 3.5 } };
    const result = truncateForPersist(value, 10_000);
    expect(result.value).toEqual(value);
    expect(result.value).not.toBe(value);
    expect(result.truncated).toBe(false);
  });

  test("a string over the cap keeps its head and its length", () => {
    const long = "x".repeat(STRING_CAP + 10);
    const result = truncateForPersist({ s: long }, 10 * STRING_CAP);
    const marker = (result.value as { s: unknown }).s;
    expect(isTruncationMarker(marker)).toBe(true);
    expect(marker).toMatchObject({ __nmTruncated: "string", bytes: long.length });
    expect((marker as { head: string }).head).toHaveLength(STRING_CAP);
    expect(result.truncated).toBe(true);
  });

  test("an array over the element cap keeps the first ones and counts the rest", () => {
    const list = Array.from({ length: ARRAY_CAP + 5 }, (_, i) => i);
    const out = truncateForPersist(list, 1e9).value as unknown[];
    expect(out).toHaveLength(ARRAY_CAP + 1);
    expect(out[ARRAY_CAP]).toEqual({ __nmTruncated: "array", total: ARRAY_CAP + 5, omitted: 5 });
  });

  test("the byte budget stops an object and says how many keys were left", () => {
    const value = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`key${i}`, "v".repeat(20)]));
    const result = truncateForPersist(value, 200);
    const out = result.value as Record<string, unknown>;
    expect(result.truncated).toBe(true);
    expect(out.__nmTruncated).toBe("object");
    expect((out.omitted as number) + Object.keys(out).length - 2).toBe(50);
  });

  test("a cycle is cut, not followed", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const result = truncateForPersist(a, 10_000);
    expect((result.value as { self: unknown }).self).toEqual({ __nmTruncated: "object", omitted: 0 });
    expect(result.truncated).toBe(true);
  });

  test("the same object reached twice without a cycle is copied both times", () => {
    // Redux shares references all the time: a selected item is also in the list.
    const item = { id: 7, label: "seven" };
    const state = { selected: item, items: [item] };
    const result = truncateForPersist(state, 10_000);
    expect(result.value).toEqual({ selected: item, items: [item] });
    expect(result.truncated).toBe(false);
  });

  test("an error is reduced to name, message and code at any depth", () => {
    const error = Object.assign(new Error("boom"), {
      code: "E_X",
      config: { headers: { Authorization: "Bearer secret.token.value" } },
    });
    const out = truncateForPersist({ nested: { error } }, 10_000);
    expect(out.value).toEqual({ nested: { error: { name: "Error", message: "boom", code: "E_X" } } });
    expect(JSON.stringify(out.value)).not.toContain("secret");
  });

  test("a credential string under a credential-named key is masked, at depth and in a list", () => {
    const token = "Bearer abcdefghijklmnopqrstuvwxyz";
    const out = truncateForPersist(
      { req: { headers: { authorization: token } }, cookies: { "set-cookie": ["sid=very-long-secret-value", "x=1"] } },
      10_000,
    ).value as { req: { headers: { authorization: string } }; cookies: { "set-cookie": string[] } };
    expect(out.req.headers.authorization).not.toContain("qrstuvwx");
    expect(out.req.headers.authorization.endsWith(" (masked)")).toBe(true);
    expect(out.cookies["set-cookie"][0]).not.toContain("very-long-secret");
  });

  test("non-string values under credential-named keys are data, kept as they are", () => {
    const value = { cookie: { accepted: true }, authorization: { role: "admin" } };
    const result = truncateForPersist(value, 10_000);
    expect(result.value).toEqual(value);
    expect(result.truncated).toBe(false);
  });

  test("functions, symbols and bigints become strings", () => {
    const out = truncateForPersist({ f: () => 1, b: 10n }, 1000).value as Record<string, unknown>;
    expect(typeof out.f).toBe("string");
    expect(out.b).toBe("10");
  });

  test("a getter that throws yields a stub, never an exception", () => {
    const value = {};
    Object.defineProperty(value, "x", { enumerable: true, get: () => { throw new Error("no"); } });
    const result = truncateForPersist(value, 1000);
    expect(result.truncated).toBe(true);
    expect(isTruncationMarker(result.value)).toBe(true);
  });

  test("null and undefined pass through", () => {
    expect(truncateForPersist(null, 10).value).toBeNull();
    expect(truncateForPersist(undefined, 10).value).toBeUndefined();
  });
});
