import { describe, expect, test } from "vitest";
import { linkToRequest, requestOfError } from "../../src/capture/errorOrigin";
import { getOwner, ownCallsOf, type CaptureOwner } from "../../src/capture/monitorContext";
import { transportTarget, expectAxiosTransport, claimAxiosTransport, releaseAxiosTransport } from "../../src/capture/monitorTransport";
import { parseServerTiming, serverTimingOf } from "../../src/capture/resourceTiming";
import type { MonitorEntry } from "../../src/capture/monitorTypes";

describe("errorOrigin", () => {
  test("an error, its response, or its cause chain leads to the request", () => {
    const response = {};
    const own = new Error("own");
    linkToRequest(response, "r1");
    linkToRequest(own, "r2");
    expect(requestOfError(Object.assign(new Error("x"), { response }))).toBe("r1");
    expect(requestOfError(own)).toBe("r2");
    expect(requestOfError(new Error("a", { cause: new Error("b", { cause: own }) }))).toBe("r2");
  });

  test("the cause chain is followed four levels and no further", () => {
    const root = new Error("root");
    linkToRequest(root, "deep");
    let e: Error = root;
    for (let i = 0; i < 4; i++) e = new Error(`w${i}`, { cause: e });
    expect(requestOfError(e)).toBe("deep");
    expect(requestOfError(new Error("too deep", { cause: e }))).toBeUndefined();
  });

  test("an object from two requests leads to neither", () => {
    const shared = new DOMException("aborted", "AbortError");
    linkToRequest(shared, "a");
    linkToRequest(shared, "b");
    expect(requestOfError(shared)).toBeUndefined();
    expect(requestOfError(new Error("wrapped", { cause: shared }))).toBeUndefined();
  });

  test("linking the same request twice is still that request", () => {
    const e = new Error("e");
    linkToRequest(e, "same");
    linkToRequest(e, "same");
    expect(requestOfError(e)).toBe("same");
  });

  test("primitives and unlinked objects lead nowhere", () => {
    linkToRequest("string", "x");
    expect(requestOfError("string")).toBeUndefined();
    expect(requestOfError(new Error("never linked"))).toBeUndefined();
    expect(requestOfError(null)).toBeUndefined();
  });
});

describe("monitorContext.ownCallsOf", () => {
  const owner = (id: string): CaptureOwner => ({ id, kind: "query", label: id });

  test("the owner is set during the call only, and restored after a throw", () => {
    const seen: (string | undefined)[] = [];
    const target = { options: { queryFn: () => seen.push(getOwner()?.id) } };
    ownCallsOf(target, "queryFn", owner("q1"));
    target.options.queryFn();
    expect(seen).toEqual(["q1"]);
    expect(getOwner()).toBeNull();

    const throwing = { options: { queryFn: () => { throw new Error("x"); } } };
    ownCallsOf(throwing, "queryFn", owner("q2"));
    expect(() => throwing.options.queryFn()).toThrow();
    expect(getOwner()).toBeNull();
  });

  test("nested calls restore the outer owner", () => {
    const seen: (string | undefined)[] = [];
    const inner = { options: { queryFn: () => seen.push(getOwner()?.id) } };
    const outer = {
      options: {
        queryFn: () => {
          seen.push(getOwner()?.id);
          inner.options.queryFn();
          seen.push(getOwner()?.id);
        },
      },
    };
    ownCallsOf(inner, "queryFn", owner("inner"));
    ownCallsOf(outer, "queryFn", owner("outer"));
    outer.options.queryFn();
    expect(seen).toEqual(["outer", "inner", "outer"]);
  });

  test("new options handed over later are wrapped too, and the caller's object is untouched", () => {
    const fn = () => getOwner()?.id;
    const original = { queryFn: fn };
    const target: { options: { queryFn: () => unknown } } = { options: original };
    ownCallsOf(target, "queryFn", owner("q"));
    expect(original.queryFn).toBe(fn);
    target.options = { queryFn: fn };
    expect(target.options.queryFn()).toBe("q");
  });

  test("hooking twice updates the owner, never wraps twice", () => {
    const target = { options: { queryFn: () => getOwner()?.id } };
    ownCallsOf(target, "queryFn", owner("first"));
    const wrapped = target.options.queryFn;
    ownCallsOf(target, "queryFn", owner("second"));
    expect(target.options.queryFn).toBe(wrapped);
    expect(target.options.queryFn()).toBe("second");
  });

  test("a non-function (skipToken) is left alone", () => {
    const skip = Symbol("skip");
    const target = { options: { queryFn: skip } };
    ownCallsOf(target, "queryFn", owner("q"));
    expect(target.options.queryFn).toBe(skip);
  });
});

describe("monitorTransport", () => {
  test("transportTarget resolves like axios: baseURL for relative, ignored for absolute", () => {
    expect(transportTarget("users?x=1", "https://api.test/v1/")).toBe("https://api.test/v1/users");
    expect(transportTarget("/users", "https://api.test/v1")).toBe("https://api.test/v1/users");
    expect(transportTarget("https://other.test/a", "https://api.test")).toBe("https://other.test/a");
  });

  test("a hand-off is claimed once, by method and path", () => {
    expectAxiosTransport("t1", "get", "https://api.test/a?x=1");
    expect(claimAxiosTransport("POST", "https://api.test/a")).toBeUndefined();
    expect(claimAxiosTransport("GET", "https://api.test/a?other=2")).toBe("t1");
    expect(claimAxiosTransport("GET", "https://api.test/a")).toBeUndefined();
  });

  test("a released hand-off is not claimed", () => {
    expectAxiosTransport("t2", "get", "https://api.test/b");
    releaseAxiosTransport("t2");
    expect(claimAxiosTransport("GET", "https://api.test/b")).toBeUndefined();
  });
});

describe("Server-Timing", () => {
  test("metrics, durations and descriptions, a comma inside quotes included", () => {
    expect(parseServerTiming('db;dur=53.2;desc="orders, by id", cache;desc=HIT, app')).toEqual([
      { name: "db", durationMs: 53.2, description: "orders, by id" },
      { name: "cache", description: "HIT" },
      { name: "app" },
    ]);
  });

  test("a bad duration is dropped; empty input is empty", () => {
    expect(parseServerTiming("x;dur=abc")).toEqual([{ name: "x" }]);
    expect(parseServerTiming("")).toEqual([]);
    expect(parseServerTiming(null)).toEqual([]);
  });

  test("the browser's metrics win over the header's", () => {
    const entry = {
      wire: { totalMs: 1, serverTiming: [{ name: "browser" }] },
      responseHeaders: { "Server-Timing": "header" },
    } as unknown as MonitorEntry;
    expect(serverTimingOf(entry)).toEqual([{ name: "browser" }]);
    expect(serverTimingOf({ responseHeaders: { "Server-Timing": "header" } } as unknown as MonitorEntry)).toEqual([{ name: "header" }]);
  });
});
