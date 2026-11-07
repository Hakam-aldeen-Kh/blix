/**
 * Blix — copying a key that came from outside.
 *
 * Captured data is copied key by key: bodies into storage, headers into a map,
 * an error's own fields into `details`. The key comes from the server or the
 * app, and `__proto__` is an ordinary key in JSON, in a header and in a form.
 * Assigned with `out[key] = value`, though, it is not a key at all: it
 * replaces `out`'s prototype. The key vanished from what Blix showed, and the
 * copy inherited its value — an API being tested against prototype pollution
 * sends exactly this, which is when its body most has to be shown as it was.
 *
 * Only `__proto__` behaves this way on a plain object; `constructor` and
 * `prototype` assign as own keys already. So only it takes the slower
 * `defineProperty`, and every other key keeps the plain assignment.
 */

/** Sets `key` on `target` as an own, enumerable, writable key — `__proto__` too. */
export function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  } else {
    target[key] = value;
  }
}

/** Whether `target` has `key` itself, not by inheritance: `"constructor" in {}`
 * is true. */
export function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}
