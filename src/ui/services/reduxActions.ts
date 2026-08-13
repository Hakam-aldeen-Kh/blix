/**
 * Dev Tools — Redux panel actions.
 *
 * Store is received as a parameter (sourced from BlixContext at the call site)
 * rather than imported directly, keeping this module free of any app-specific
 * singleton dependency.
 */

import {
  getReduxIgnoreList,
  markReplaying,
  setReduxIgnoreList,
} from "../../capture/reduxCapture";
import type { MonitorEntry } from "../../capture/networkMonitor";
import type { StoreLike } from "../BlixContext";

export interface RedispatchCheck {
  can: boolean;
  reason?: string;
}

export function canRedispatch(
  entry: MonitorEntry,
  store?: StoreLike<unknown>,
): RedispatchCheck {
  if (!store) return { can: false, reason: "Redux store not provided" };
  if ((entry.kind ?? "http") !== "redux") return { can: false, reason: "Not a Redux action" };
  if (entry.redux?.replayable === false) {
    return { can: false, reason: "Payload was truncated — can't be replayed faithfully" };
  }
  return { can: true };
}

/**
 * Re-dispatches the captured action into the live store. The resulting entry
 * is tagged via `markReplaying` so it gets `replayOf` — the table's existing
 * `↻` chip and the parent's replay-count badge then work with no further
 * wiring, exactly as they do for a replayed HTTP request.
 */
export function redispatchAction(entry: MonitorEntry, store: StoreLike<unknown>): void {
  const check = canRedispatch(entry, store);
  if (!check.can) throw new Error(check.reason ?? "Can't re-dispatch");

  const type = entry.redux?.type ?? entry.url;
  const body = entry.redux?.payload as { payload?: unknown; meta?: unknown } | undefined;
  markReplaying(entry.id, () => {
    store.dispatch({ type, payload: body?.payload, meta: body?.meta });
  });
}

/** Appends to the session-only ignore list — "Ignore this action type" in the
 * context menu. Not persisted across a reload; a devtool convenience, not a
 * setting worth the complexity of storing. */
export function ignoreActionType(type: string): void {
  if (!getReduxIgnoreList().includes(type)) {
    setReduxIgnoreList([...getReduxIgnoreList(), type]);
  }
}

/** The live store state, for "Copy state as JSON". */
export function getCurrentState(store?: StoreLike<unknown>): unknown {
  return store?.getState() ?? {};
}
