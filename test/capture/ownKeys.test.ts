import { afterEach, describe, expect, test } from "vitest";
import { parseResponseHeaders } from "../../src/capture/attachXhr";
import { captureError } from "../../src/capture/monitorError";
import { serializeBody, serializeHeaders } from "../../src/capture/monitorSerialize";
import { truncateForPersist } from "../../src/capture/monitorTruncate";

/**
 * A key named `__proto__` is an ordinary key in JSON, in a header and in a
 * form. Copied with `out[key] = value` it is not: the assignment replaces the
 * copy's prototype, so the key vanished from what Blix showed and the copy
 * inherited its value instead. An API being tested against prototype
 * pollution sends exactly this, and that is when its body has to be shown as
 * it arrived.
 */

/** JSON as a server would send it, with `__proto__` as a plain key. */
const hostile = () =>
  JSON.parse('{"name":"ali","__proto__":{"isAdmin":true},"constructor":"c","prototype":"p"}') as Record<string, unknown>;

const ownKeys = (value: unknown) => Object.keys(value as object);

afterEach(() => {
  // Nothing here may reach the shared prototype.
  expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
});

describe("a key named __proto__ survives every copy", () => {
  test("a stored body keeps it as an own key, and inherits nothing from it", () => {
    const { value } = truncateForPersist(hostile(), 100_000);
    expect(ownKeys(value)).toEqual(["name", "__proto__", "constructor", "prototype"]);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(value, "__proto__")?.value).toEqual({ isAdmin: true });
    expect(JSON.stringify(value)).toBe('{"name":"ali","__proto__":{"isAdmin":true},"constructor":"c","prototype":"p"}');
  });

  test("so does one nested deep inside it", () => {
    const { value } = truncateForPersist({ user: hostile() }, 100_000);
    expect(ownKeys((value as { user: unknown }).user)).toContain("__proto__");
  });

  test("captured headers keep it", () => {
    // An object literal's `__proto__:` sets the prototype, so the input is
    // built the way a header map from the wire is: with the key defined.
    const wire: Record<string, string> = { "x-a": "1" };
    Object.defineProperty(wire, "__proto__", { value: "x", enumerable: true, writable: true, configurable: true });
    expect(serializeHeaders(wire)).toEqual(JSON.parse('{"x-a":"1","__proto__":"x"}'));
    expect(ownKeys(serializeHeaders(wire))).toContain("__proto__");
  });

  test("an XHR response's headers keep it, and a header named constructor is not merged", () => {
    const out = parseResponseHeaders("__proto__: x\r\nconstructor: c\r\nx-a: 1\r\nx-a: 2");
    expect(ownKeys(out)).toEqual(["__proto__", "constructor", "x-a"]);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toBe("x");
    expect(out.constructor).toBe("c");
    expect(out["x-a"]).toBe("1, 2");
  });

  test("a form field keeps it", () => {
    const form = new FormData();
    form.append("__proto__", "x");
    form.append("q", "1");
    const out = serializeBody(form);
    expect(ownKeys(out)).toEqual(["__proto__", "q"]);
  });

  test("an error's own fields keep it in details", () => {
    const error = new Error("boom");
    Object.defineProperty(error, "__proto__", { value: { isAdmin: true }, enumerable: true, configurable: true });
    const details = captureError(error).details;
    expect(details && Object.getOwnPropertyDescriptor(details, "__proto__")?.value).toEqual({ isAdmin: true });
  });
});
