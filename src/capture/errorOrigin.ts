/**
 * Network monitor — which request an error came from.
 *
 * An app that replaces axios's error with its own (`Promise.reject(new
 * ApiError(…))`) hands its callers an object with nothing that points back at
 * the request: no config, often no status, no body. The wire tap sees both
 * sides of that swap — the error it was given and the one the app's handler
 * produced — so it records the second against the request here. A failed
 * query or mutation holding that same object can then name its request
 * exactly, instead of guessing from a status and a time window.
 *
 * Weak, so a recorded error is never kept alive by Blix. No imports, so the
 * capture modules on both sides can use it without importing each other.
 */

const origins = new WeakMap<object, string>();

/** How far down a chain of `cause`s an error is followed. */
const CAUSE_DEPTH = 4;

/** Records that `error` came from the request entry `id`. Primitives — a
 * thrown string — have no identity and are skipped. */
export function linkErrorToRequest(error: unknown, id: string): void {
  if (error !== null && typeof error === "object") origins.set(error, id);
}

/**
 * The request entry `error` came from, if it is one Blix linked — or one that
 * carries a linked error as its `cause`, for an app that wraps its own error
 * again before the caller sees it.
 */
export function requestOfError(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth <= CAUSE_DEPTH; depth += 1) {
    if (current === null || typeof current !== "object") return undefined;
    const id = origins.get(current);
    if (id) return id;
    try {
      current = (current as { cause?: unknown }).cause;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
