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
