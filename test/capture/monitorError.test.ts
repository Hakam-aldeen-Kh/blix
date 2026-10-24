import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, test } from "vitest";
import {
  asContext,
  captureError,
  captureHttpFailure,
  describeError,
  errorBody,
  failureKindOf,
  isCapturedError,
} from "../../src/capture/monitorError";

const config = { url: "/x", method: "get", headers: new AxiosHeaders({ Authorization: "Bearer SECRET.TOKEN.VALUE" }) };
const axiosError = (status: number | undefined, code?: string, message = "Request failed") =>
  new AxiosError(
    message,
    code,
    config as never,
    {},
    status === undefined
      ? undefined
      : ({ status, statusText: "Err", data: { why: "nope" }, headers: {}, config } as never),
  );

describe("captureError: what kind of failure", () => {
  test.each([
    ["axios's timeout", axiosError(undefined, "ECONNABORTED", "timeout of 1000ms exceeded"), "timeout"],
    ["ETIMEDOUT", axiosError(undefined, "ETIMEDOUT"), "timeout"],
    ["an aborted axios request", axiosError(undefined, "ECONNABORTED", "Request aborted"), "aborted"],
    ["a cancel", axiosError(undefined, "ERR_CANCELED", "canceled"), "aborted"],
    ["no network", axiosError(undefined, "ERR_NETWORK", "Network Error"), "network"],
    ["fetch's TypeError", new TypeError("Failed to fetch"), "network"],
    ["Safari's TypeError", new TypeError("Load failed"), "network"],
    ["an AbortError", new DOMException("The user aborted a request.", "AbortError"), "aborted"],
    ["a TimeoutError", new DOMException("signal timed out", "TimeoutError"), "timeout"],
    ["something else", new Error("weird"), "unknown"],
  ])("%s → %s", (_label, error, kind) => {
    expect(captureError(error).kind).toBe(kind);
  });

  test("a server answer is http when the caller says there was a response", () => {
    expect(captureError(axiosError(500), { hasResponse: true }).kind).toBe("http");
    expect(captureError(axiosError(500), { response: { e: 1 } }).kind).toBe("http");
  });

  test("the caller's kind wins", () => {
    expect(captureError(new Error("x"), { kind: "setup" }).kind).toBe("setup");
  });
});

describe("captureError: what is kept", () => {
  test("name, message, string code, status and stack frames", () => {
    const e = Object.assign(new Error("boom"), { code: "E_BOOM", status: 418 });
    const out = captureError(e);
    expect(out).toMatchObject({ kind: "unknown", name: "Error", message: "boom", code: "E_BOOM", status: 418 });
    expect(out.stack?.every((line) => line.startsWith("at "))).toBe(true);
    expect(out.stack!.length).toBeLessThanOrEqual(8);
  });

  test("a host error's own fields become details; a numeric code is a detail", () => {
    class ApiError extends Error {
      result = 1042;
      code = 7;
      errors = { email: ["required"] };
    }
    expect(captureError(new ApiError("bad")).details).toEqual({ result: 1042, code: 7, errors: { email: ["required"] } });
  });

  test("an axios error's config and headers are never copied", () => {
    const out = captureError(axiosError(500));
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(out.details).toBeUndefined();
  });

  test("the cause is kept one level down, as context without a kind", () => {
    const out = captureError(new Error("outer", { cause: new TypeError("inner") }));
    expect(out.cause).toMatchObject({ name: "TypeError", message: "inner" });
    expect((out.cause as Record<string, unknown>).kind).toBeUndefined();
  });

  test("a non-object cause is its string", () => {
    expect(captureError(new Error("x", { cause: 42 })).cause).toBe("42");
  });

  test("a thrown string or nothing at all still has a message", () => {
    expect(captureError("just text").message).toBe("just text");
    expect(captureError(undefined).message).toBe("The request failed without an error");
    expect(captureError({}).message).toBe("The request failed without a message");
  });

  test("getters that throw are survived", () => {
    const hostile = {};
    for (const key of ["name", "message", "code", "stack", "cause"]) {
      Object.defineProperty(hostile, key, { get: () => { throw new Error("no"); }, enumerable: true });
    }
    expect(() => captureError(hostile)).not.toThrow();
  });

  test("timeoutMs is recorded for a timeout only", () => {
    expect(captureError(axiosError(undefined, "ETIMEDOUT"), { timeoutMs: 500 }).timeoutMs).toBe(500);
    expect(captureError(new Error("x"), { timeoutMs: 500 }).timeoutMs).toBeUndefined();
  });
});

describe("describeError", () => {
  test("an axios error with a response: http, status, body", () => {
    expect(describeError(axiosError(422), 10_000)).toMatchObject({ kind: "http", status: 422, response: { why: "nope" } });
  });

  test("a plain value is copied as data, not described", () => {
    expect(describeError({ ok: false, reason: "x" }, 10_000)).toEqual({ ok: false, reason: "x" });
  });
});

describe("helpers", () => {
  test("captureHttpFailure", () => {
    expect(captureHttpFailure(404, "Not Found", { e: 1 })).toEqual({
      kind: "http",
      message: "Request failed with status 404 Not Found",
      status: 404,
      statusText: "Not Found",
      response: { e: 1 },
    });
  });

  test("isCapturedError / errorBody / failureKindOf / asContext", () => {
    const captured = captureHttpFailure(500, "", "body");
    expect(isCapturedError(captured)).toBe(true);
    expect(isCapturedError({ message: "no kind" })).toBe(false);
    expect(errorBody(captured)).toBe("body");
    expect(errorBody("legacy body")).toBe("legacy body");
    expect(failureKindOf(captured)).toBe("http");
    expect(failureKindOf("legacy")).toBeUndefined();
    expect(asContext(captured)).not.toHaveProperty("kind");
  });
});
