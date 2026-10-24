/**
 * Network monitor — which request an error came from.
 *
 * Two kinds of object are linked here. The app's own error, replacing the
 * client's (below). And a `fetch` `Response`: with `fetch` there is no client
 * error at all — the app reads `r.ok` and throws something of its own, often
 * before Blix has even finished reading the body — so the one thing that can
 * lead back to the request is the `Response`, when the app keeps it on its
 * error (`{ response: r }`) or throws it as is.
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

/** Records that `value` — an error, or a `fetch` `Response` — came from the
 * request entry `id`. Primitives — a thrown string — have no identity and are
 * skipped. */
export function linkToRequest(value: unknown, id: string): void {
  if (value !== null && typeof value === "object") origins.set(value, id);
}

/** The id linked to `value`, or to the `response` it carries. */
function linkedId(value: object): string | undefined {
  const id = origins.get(value);
  if (id) return id;
  let response: unknown;
  try {
    response = (value as { response?: unknown }).response;
  } catch {
    return undefined;
  }
  return response !== null && typeof response === "object" ? origins.get(response) : undefined;
}

/**
 * The request entry `error` came from, if it is one Blix linked or carries one
 * as its `response` — or one that carries such an error as its `cause`, for an
 * app that wraps its own error again before the caller sees it.
 *
 * Only ever an object Blix itself saw come out of a request: never a match by
 * status or time, so never a wrong one.
 */
export function requestOfError(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth <= CAUSE_DEPTH; depth += 1) {
    if (current === null || typeof current !== "object") return undefined;
    const id = linkedId(current);
    if (id) return id;
    try {
      current = (current as { cause?: unknown }).cause;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
