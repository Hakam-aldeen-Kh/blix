/**
 * Network monitor — synchronous "who's fetching right now" handle.
 *
 * Blix wraps a query's `queryFn` and a mutation's `mutationFn`, and holds the
 * owner open for exactly the duration of that function's synchronous call. A
 * request started inside it — `fetch`, XHR, or an axios call, whose owner is
 * read when axios builds the call, not in its asynchronous interceptor — is
 * attributed to that query or mutation. Nothing else is: not other code that
 * happens to run in the same tick, and not the code after an `await`.
 *
 * So a function that awaits something before its request simply gets no
 * owner. The panel renders a miss as "unknown", never as "not caused by a
 * query" — and an owner it does show is a fact.
 */

export interface CaptureOwner {
  id: string;
  kind: "query" | "mutation";
  label: string;
}

let owner: CaptureOwner | null = null;

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

type Slot = { owner: CaptureOwner };

/** The wrappers Blix made — never wrapped again. */
const wrappers = new WeakSet<AnyFunction>();
/** Each query or mutation already hooked, with the owner it runs as. */
const hooked = new WeakMap<object, Slot>();

function wrap(fn: AnyFunction, slot: Slot): AnyFunction {
  const wrapped: AnyFunction = function (this: unknown, ...args: unknown[]) {
    const previous = owner;
    owner = slot.owner;
    try {
      return fn.apply(this, args);
    } finally {
      owner = previous;
    }
  };
  wrappers.add(wrapped);
  return wrapped;
}

/** `options` with `options[key]` wrapped — a copy, so the object the app or
 * an observer holds is not touched. Anything that is not a function
 * (TanStack's `skipToken`, nothing at all) is left as it is. */
function withOwned(options: unknown, key: string, slot: Slot): unknown {
  if (options === null || typeof options !== "object") return options;
  const fn = (options as Record<string, unknown>)[key];
  if (typeof fn !== "function" || wrappers.has(fn as AnyFunction)) return options;
  return { ...options, [key]: wrap(fn as AnyFunction, slot) };
}

/**
 * Makes `target.options[key]` — a query's `queryFn`, a mutation's
 * `mutationFn` — run as `next`, for every options object `target` is given.
 *
 * Hooking `options` itself, not the function on the object it holds now, is
 * what makes this hold: an observer re-rendering hands the query or mutation a
 * fresh options object — `useMutation` does on `pending`, before `mutationFn`
 * has run — and a function wrapped on the old one was lost with it. TanStack
 * reads `options[key]` when it calls it, so the wrapper is what it calls,
 * retries included.
 *
 * Hooked once per target; later calls only update the owner.
 */
export function ownCallsOf(target: unknown, key: string, next: CaptureOwner): void {
  if (target === null || typeof target !== "object") return;
  const existing = hooked.get(target);
  if (existing) {
    existing.owner = next;
    return;
  }
  const slot: Slot = { owner: next };
  try {
    let current = withOwned((target as { options?: unknown }).options, key, slot);
    Object.defineProperty(target, "options", {
      configurable: true,
      enumerable: true,
      get: () => current,
      set: (value: unknown) => {
        current = withOwned(value, key, slot);
      },
    });
    hooked.set(target, slot);
  } catch {
    /* a sealed target: its requests go without an owner */
  }
}

export function getOwner(): CaptureOwner | null {
  return owner;
}
