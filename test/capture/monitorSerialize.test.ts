import { AxiosHeaders } from "axios";
import { describe, expect, test } from "vitest";
import {
  estimateBytes,
  flattenCapturedHeaders,
  flattenHeaders,
  impliedContentType,
  MASK_SUFFIX,
  serializeBody,
  serializeHeaders,
} from "../../src/capture/monitorSerialize";

describe("serializeBody", () => {
  test("JSON text is parsed; other text is kept", () => {
    expect(serializeBody('{"a":[1,2]}')).toEqual({ a: [1, 2] });
    expect(serializeBody("plain")).toBe("plain");
    expect(serializeBody("")).toBe("");
  });

  test("FormData lists its fields and summarizes files", () => {
    const fd = new FormData();
    fd.append("name", "Ada");
    fd.append("avatar", new File(["12345"], "a.png", { type: "image/png" }));
    expect(serializeBody(fd)).toEqual({ name: "Ada", avatar: "«File: a.png — 5 bytes»" });
  });

  test("objects and null pass through", () => {
    const obj = { x: 1 };
    expect(serializeBody(obj)).toBe(obj);
    expect(serializeBody(null)).toBeNull();
    expect(serializeBody(undefined)).toBeUndefined();
  });
});

describe("flattenHeaders", () => {
  test("a Headers object", () => {
    const h = new Headers({ "Content-Type": "application/json", "X-A": "1" });
    expect(flattenHeaders(h)).toEqual({ "content-type": "application/json", "x-a": "1" });
  });

  test("a list of pairs, repeated names joined like fetch does", () => {
    expect(flattenHeaders([["Accept", "a"], ["accept", "b"]])).toEqual({ Accept: "a, b" });
  });

  test("set-cookie repeats are joined by newlines, not commas", () => {
    expect(flattenHeaders([["set-cookie", "a=1; Expires=Wed, 21 Oct"], ["set-cookie", "b=2"]])).toEqual({
      "set-cookie": "a=1; Expires=Wed, 21 Oct\nb=2",
    });
  });

  test("a record skips axios's per-method buckets and null values", () => {
    expect(flattenHeaders({ common: { Accept: "x" }, get: {}, "X-Ok": "1", "X-Null": null })).toEqual({ "X-Ok": "1" });
  });

  test("array values become one header", () => {
    expect(flattenHeaders({ "x-list": ["a", "b"] })).toEqual({ "x-list": "a, b" });
  });

  test("anything else is empty, and a throwing iterator does not throw", () => {
    expect(flattenHeaders(null)).toEqual({});
    expect(flattenHeaders("x")).toEqual({});
    const hostile = { forEach() { throw new Error("no"); }, get() {} };
    expect(() => flattenHeaders(hostile)).not.toThrow();
  });
});

describe("serializeHeaders", () => {
  test("masks the four credential headers, keeping a prefix and suffix", () => {
    const out = serializeHeaders({
      Authorization: "Bearer abc.def.ghijklmnop",
      Cookie: "sid=0123456789abcdef",
      "X-Api-Key": "key-000000000000",
      "Set-Cookie": "token=zzzzzzzzzzzzzzzz",
      "X-Other": "visible",
    });
    expect(out.Authorization).toBe(`Bearer a…mnop${MASK_SUFFIX}`);
    expect(out.Cookie.endsWith(MASK_SUFFIX)).toBe(true);
    expect(out["X-Api-Key"].endsWith(MASK_SUFFIX)).toBe(true);
    expect(out["Set-Cookie"].endsWith(MASK_SUFFIX)).toBe(true);
    expect(out["X-Other"]).toBe("visible");
  });

  test("a short credential is fully hidden", () => {
    expect(serializeHeaders({ authorization: "short" }).authorization).toBe("••••");
  });

  test("AxiosHeaders are read through toJSON", () => {
    const h = new AxiosHeaders({ "Content-Type": "application/json", "x-a": "1" });
    expect(flattenCapturedHeaders(h)).toMatchObject({ "Content-Type": "application/json", "x-a": "1" });
  });
});

describe("estimateBytes", () => {
  test("primitives and containers", () => {
    expect(estimateBytes("abc")).toBe(5);
    expect(estimateBytes(1)).toBe(8);
    expect(estimateBytes(null)).toBe(4);
    expect(estimateBytes([])).toBe(2);
    expect(estimateBytes({})).toBe(2);
  });

  test("binary values count their bytes", () => {
    expect(estimateBytes(new Uint8Array(100))).toBe(100);
    expect(estimateBytes(new ArrayBuffer(64))).toBe(64);
    expect(estimateBytes(new Blob(["12345"]))).toBe(5);
    expect(estimateBytes(new URLSearchParams({ a: "b c" }))).toBe("a=b+c".length);
  });

  test("a shared object counts each time it is serialized", () => {
    const item = { label: "x".repeat(100) };
    expect(estimateBytes({ a: item, b: item })).toBeGreaterThan(2 * estimateBytes(item));
  });

  test("a cycle is counted once and stops", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(estimateBytes(a)).toBeLessThan(100);
  });

  test("never more than the ceiling", () => {
    expect(estimateBytes("x".repeat(9 * 1024 * 1024))).toBe(8 * 1024 * 1024);
  });
});

describe("impliedContentType", () => {
  test("follows the Fetch standard's defaults", () => {
    expect(impliedContentType("x")).toBe("text/plain;charset=UTF-8");
    expect(impliedContentType(new URLSearchParams())).toBe("application/x-www-form-urlencoded;charset=UTF-8");
    expect(impliedContentType(new FormData())).toBe("multipart/form-data; boundary=(chosen by the browser)");
    expect(impliedContentType(new Blob([""], { type: "image/png" }))).toBe("image/png");
  });

  test("no type for untyped blobs, buffers, streams and no body", () => {
    expect(impliedContentType(new Blob([""]))).toBeUndefined();
    expect(impliedContentType(new ArrayBuffer(1))).toBeUndefined();
    expect(impliedContentType(undefined)).toBeUndefined();
    expect(impliedContentType(null)).toBeUndefined();
  });
});
