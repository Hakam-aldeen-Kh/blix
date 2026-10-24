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

/** Stands for "came out of more than one request". */
const AMBIGUOUS = Symbol("ambiguous");

const origins = new WeakMap<object, string | typeof AMBIGUOUS>();

/** How far down a chain of `cause`s an error is followed. */
const CAUSE_DEPTH = 4;

/**
 * Records that `value` — an error, or a `fetch` `Response` — came from the
 * request entry `id`. Primitives — a thrown string — have no identity and are
 * skipped.
 *
 * One object can come out of several requests: `controller.abort()` rejects
 * every fetch on that signal with the signal's one `AbortError`, and a host may
 * reject with a shared error instance. Such an object leads nowhere from then
 * on — recording the last request it came from linked a failure, "exactly", to
 * a request it never made.
 */
export function linkToRequest(value: unknown, id: string): void {
  if (value === null || typeof value !== "object") return;
  const known = origins.get(value);
  origins.set(value, known === undefined || known === id ? id : AMBIGUOUS);
}

/** The id linked to `value`, or to the `response` it carries; `AMBIGUOUS`
 * when the object came out of more than one request. */
function linkedId(value: object): string | typeof AMBIGUOUS | undefined {
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
    // Shared by several requests: unknown, not whichever came last.
    if (id === AMBIGUOUS) return undefined;
    if (id) return id;
    try {
      current = (current as { cause?: unknown }).cause;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
