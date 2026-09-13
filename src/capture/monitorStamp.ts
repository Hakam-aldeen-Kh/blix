/**
 * Network monitor — correlating a host-supplied payload back to its entry.
 *
 * `attachHttpMonitor` stamps every axios config it sees with the id of the
 * entry it created. `captureEncrypted` reads that stamp back off the *same
 * config object* the host is holding inside its own interceptor, which is what
 * makes correlation exact: it is object identity, not a URL/timing heuristic
 * that would mis-attribute two concurrent requests to the same endpoint.
 *
 * **A non-enumerable `Symbol` property is the stamp.** It is invisible to
 * `Object.keys`, `JSON.stringify`, `Object.entries`, devtools object
 * inspection, and anything else that walks own enumerable string keys on its
 * way to the wire — which matters, because the object being stamped is the
 * request config itself. A `WeakMap` would be equally invisible, but it costs
 * a lookup indirection on a hot path and cannot be used at all on a value that
 * isn't an object. It is kept only for the one case the symbol cannot handle:
 * a frozen or otherwise non-extensible config, where `defineProperty` throws.
 *
 * The symbol key is registry-global (`Symbol.for`) so that two copies of this
 * package in one tree — a linked workspace next to a published one, the usual
 * pnpm accident — still correlate instead of silently capturing nothing.
 *
 * **Why the reader also consults `__monitorId`.** Being non-enumerable has one
 * real cost: `{ ...config }` does not copy it. And returning a fresh object is
 * how a great many encryption interceptors are written
 * (`return { ...config, data: ciphertext }`), so the object a host holds when
 * it calls `captureEncrypted` is often a *copy* of the one Blix stamped.
 * `__monitorId` — the plain enumerable property `attachHttpMonitor` has always
 * set, and which axios' own response interceptor already relies on for exactly
 * this reason — does survive a spread, so it is consulted second. It leaks
 * nothing that 0.2.1 didn't already leak.
 *
 * Nothing here may throw: it runs inside axios interceptors.
 */

/** Registry-global so duplicate package instances share one stamp key. */
const MONITOR_ID = /* @__PURE__ */ Symbol.for("blix.monitorId");

/** Only ever populated for configs that reject `defineProperty`. */
const stampFallback: WeakMap<object, string> = /* @__PURE__ */ new WeakMap();

type Stamped = { [MONITOR_ID]?: string; __monitorId?: unknown };

/** Records `id` on `config` invisibly. Silent on failure — a missed stamp
 * degrades to "no encrypted capture for this request", never to a broken one. */
export function stampMonitorId(config: object, id: string): void {
  try {
    Object.defineProperty(config, MONITOR_ID, {
      value: id,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  } catch {
    // Frozen / sealed / exotic config — keep the association off-object.
    stampFallback.set(config, id);
  }
}

/**
 * Reads a stamp back, from any value — `undefined` for anything unstamped,
 * including non-objects. Order: the symbol, then the spread-surviving
 * `__monitorId`, then the frozen-config WeakMap.
 */
export function readMonitorId(config: unknown): string | undefined {
  if (config === null || typeof config !== "object") return undefined;

  const stamped = config as Stamped;
  const direct = stamped[MONITOR_ID];
  if (typeof direct === "string") return direct;

  // A `{ ...config }` copy made by the host's own interceptor.
  if (typeof stamped.__monitorId === "string") return stamped.__monitorId;

  return stampFallback.get(config as object);
}

/* ───────────────────── axios ↔ fetch deduplication ───────────────────── */

/**
 * Marks a `fetch` call that `attachHttpMonitor` already captured.
 *
 * axios ≥1.7 can run on a fetch adapter, and then one request passes through
 * both monitors: the axios interceptor first, then `globalThis.fetch` — Blix's
 * wrapper, when `attachFetchMonitor` is installed. **The axios entry wins.** It
 * was taken on the plaintext side of the host's interceptors, it carries
 * `captureEncrypted` correlation and the `withInitiatorCapture` stack, and it
 * is the one replay can re-fire. The fetch wrapper sees the same request after
 * encryption with none of that, so it steps aside.
 *
 * **Carried on `config.fetchOptions`, because nothing else reaches `fetch`.**
 * A `Request` has no arbitrary property surface, and axios builds its own. But
 * the fetch adapter hands `fetchOptions` to `fetch` as its `init` argument —
 * `_fetch(request, fetchOptions)` — and that object is reachable from a request
 * interceptor.
 *
 * **Enumerable, unlike `MONITOR_ID`, and it has to be.** axios copies
 * `fetchOptions` into a fresh object twice per request (`mergeConfig` in
 * `Axios.request`, again in the adapter's `resolveConfig`), and its merge keeps
 * a symbol key only if it is enumerable. A non-enumerable stamp is gone before
 * `fetch` is ever called — verified against axios 1.19. The stamp still never
 * reaches the wire: `new Request(url, init)` and `fetch` itself ignore keys
 * they don't define, symbols included.
 *
 * Registry-global for the same reason as `MONITOR_ID`: two copies of this
 * package in one tree must still recognize each other's stamp.
 */
const AXIOS_FETCH = /* @__PURE__ */ Symbol.for("blix.axiosFetch");

/**
 * Stamps `config.fetchOptions` with the entry id. Replaces it with a copy
 * rather than writing into the existing object, which the host may share
 * across requests. Silent on failure — a missed stamp degrades to a duplicate
 * row, never to a broken request.
 */
export function stampAxiosFetchOptions(
  config: { fetchOptions?: unknown },
  id: string,
): void {
  try {
    const current = config.fetchOptions;
    if (current != null && typeof current !== "object") return;
    config.fetchOptions = { ...(current as object | undefined), [AXIOS_FETCH]: id };
  } catch {
    /* frozen config — accept the duplicate */
  }
}

/** Whether a `fetch` call's `init` carries the axios stamp. Read-only: never
 * touches the caller's object beyond the one property lookup. */
export function isAxiosCapturedFetch(init: unknown): boolean {
  if (init === null || typeof init !== "object") return false;
  try {
    return (init as { [AXIOS_FETCH]?: unknown })[AXIOS_FETCH] !== undefined;
  } catch {
    return false;
  }
}
