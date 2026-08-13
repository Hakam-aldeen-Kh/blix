/**
 * Network monitor — Redux action capture.
 *
 * A structurally-typed middleware, following the same contract-restatement
 * pattern `realtimeCapture.ts` uses for the realtime adapter: this module
 * never imports `@reduxjs/toolkit`, so the capture layer — which the host's
 * HTTP-client module also depends on — stays free of a dependency on the
 * host's state-management choice. That is what lets `@reduxjs/toolkit` be an
 * optional peer rather than a hard one.
 *
 * Cost per dispatch, dev-only: a handful of reference compares, plus (only
 * when the action actually changed something) a bounded structural diff — see
 * `stateDiff.ts`. RTK's own `immutableCheck`/`serializableCheck` dev
 * middleware already deep-walk the *entire* state on every dispatch; this tap
 * does strictly less work than that, and is entirely absent in production —
 * see the pass-through returned below when `MONITOR_ENABLED` is false.
 */

import {
  MAX_REDUX_ACTIONS_PER_SEC,
  MAX_REDUX_PAYLOAD_BYTES,
  MONITOR_ENABLED,
  REDUX_COALESCE_MS,
  now,
} from "./monitorConfig";
import { networkMonitor } from "./networkMonitor";
import { diffState } from "./stateDiff";
import { truncateForPersist } from "./monitorTruncate";
import { estimateBytes } from "./monitorSerialize";

/** The subset of a Redux store/middleware API this tap needs, restated
 * structurally so this file never imports `redux` or `@reduxjs/toolkit`. */
export interface MiddlewareApiLike<S> {
  getState(): S;
}
export type NextLike = (action: unknown) => unknown;
export type MiddlewareLike<S> = (
  api: MiddlewareApiLike<S>,
) => (next: NextLike) => (action: unknown) => unknown;

export interface ReduxCaptureOptions {
  /** Action types (exact) or `"prefix/*"` globs never captured. Merged with
   * the built-in defaults (redux-toolkit's own init/replace actions). */
  ignore?: readonly string[];
  /** Consecutive dispatches of the same action type within this window fold
   * into the existing row (`redux.batchCount`) instead of flooding the log. */
  coalesceMs?: number;
  /** Above this dispatch rate, capture drops to type + timing only — no
   * diff — until the rate falls back under it. */
  maxActionsPerSecond?: number;
}

const DEFAULT_IGNORE = ["@@redux/INIT", "@@INIT"];

let ignoreExact = new Set<string>(DEFAULT_IGNORE);
let ignorePrefixes: string[] = [];

function setIgnoreList(types: readonly string[]): void {
  ignoreExact = new Set(types.filter((t) => !t.endsWith("/*")));
  ignorePrefixes = types.filter((t) => t.endsWith("/*")).map((t) => t.slice(0, -2));
}
setIgnoreList(DEFAULT_IGNORE);

/** Runtime-editable ignore list — the panel's "Ignore this action type"
 * context-menu action calls this directly. */
export function setReduxIgnoreList(types: readonly string[]): void {
  setIgnoreList([...DEFAULT_IGNORE, ...types]);
}

export function getReduxIgnoreList(): string[] {
  return [...ignoreExact].filter((t) => !DEFAULT_IGNORE.includes(t));
}

function isIgnored(type: string): boolean {
  if (ignoreExact.has(type)) return true;
  return ignorePrefixes.some((p) => type.startsWith(p));
}

// Rolling 1s window shared across all stores in the page — a dev tool has at
// most one Redux store, but this is cheap to keep correct regardless.
let windowStartedAt = 0;
let windowCount = 0;

function isFlooding(maxPerSecond: number): boolean {
  const t = Date.now();
  if (t - windowStartedAt > 1000) {
    windowStartedAt = t;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount > maxPerSecond;
}

function toEntryState(isError: boolean): "success" | "error" {
  return isError ? "error" : "success";
}

let replayOfId: string | null = null;

/**
 * Marks every action dispatched synchronously inside `fn` as a replay of
 * `entryId`. Used by the panel's "Re-dispatch" action — mirrors how HTTP
 * replay tags `replayOf` on the captured entry, and reuses the same store
 * mechanics: `networkMonitor.start()` already bumps the parent's
 * `replayCount` whenever `replayOf` is set, so the existing ↻ chip and count
 * badge in the table work here with no further wiring.
 */
export function markReplaying<T>(entryId: string, fn: () => T): T {
  const prev = replayOfId;
  replayOfId = entryId;
  try {
    return fn();
  } finally {
    replayOfId = prev;
  }
}

/**
 * Builds the Redux-capture middleware. Returns a pure pass-through when the
 * monitor is disabled (production, or SSR), so the `.concat()` call at the
 * host's store setup costs nothing at runtime outside development.
 */
export function createReduxMonitorMiddleware<S>(
  options: ReduxCaptureOptions = {},
): MiddlewareLike<S> {
  if (options.ignore) setReduxIgnoreList(options.ignore);
  const coalesceMs = options.coalesceMs ?? REDUX_COALESCE_MS;
  const maxPerSecond = options.maxActionsPerSecond ?? MAX_REDUX_ACTIONS_PER_SEC;

  if (!MONITOR_ENABLED) {
    return () => (next) => (action) => next(action);
  }

  let lastEntryId: string | null = null;
  let lastType: string | null = null;
  let lastAt = 0;

  return (api) => (next) => (action) => {
    const type = (action as { type?: unknown } | null)?.type;
    if (typeof type !== "string" || networkMonitor.isPaused || isIgnored(type)) {
      return next(action);
    }

    const prevState = api.getState();
    const t0 = now();
    const result = next(action); // never inside try/catch: a throwing reducer must throw normally
    const reducerMs = now() - t0;

    try {
      const nextState = api.getState();
      const changed = prevState !== nextState;
      const flooding = isFlooding(maxPerSecond);
      const isError = (action as { error?: unknown }).error === true;
      const at = Date.now();

      const truncatedPayload = truncateForPersist(
        {
          payload: (action as { payload?: unknown }).payload,
          meta: (action as { meta?: unknown }).meta,
        },
        MAX_REDUX_PAYLOAD_BYTES,
      );
      const payload = truncatedPayload.value;
      const replayable = !truncatedPayload.truncated;

      const diff = changed && !flooding ? diffState(prevState, nextState) : undefined;
      const slice = type.includes("/") ? type.slice(0, type.indexOf("/")) : type;

      // A manual replay always gets its own visible row — folding it into a
      // recent natural dispatch of the same type would hide the fact that it
      // was replayed at all.
      const canCoalesce =
        !replayOfId &&
        lastEntryId != null &&
        lastType === type &&
        at - lastAt < coalesceMs;

      if (canCoalesce && lastEntryId) {
        const prevEntry = networkMonitor.getById(lastEntryId);
        if (prevEntry) {
          networkMonitor.update(lastEntryId, {
            state: toEntryState(isError),
            endTime: t0 + reducerMs,
            sizeBytes: estimateBytes(payload),
            // Reused generically by the detail pane's "Action" tab (same
            // field HTTP entries use for their request body).
            requestPayload: payload,
            redux: {
              type,
              payload,
              isError,
              diff,
              reducerMs,
              replayable,
              batchCount: (prevEntry.redux?.batchCount ?? 1) + 1,
            },
          });
          lastAt = at;
          return result;
        }
      }

      const id = networkMonitor.nextId();
      networkMonitor.start({
        id,
        kind: "redux",
        method: slice,
        url: type,
        at,
        startTime: t0,
        state: toEntryState(isError),
        sizeBytes: estimateBytes(payload),
        requestPayload: payload,
        replayOf: replayOfId ?? undefined,
        redux: { type, payload, isError, diff, reducerMs, replayable },
      });
      networkMonitor.update(id, { endTime: t0 + reducerMs });

      lastEntryId = id;
      lastType = type;
      lastAt = at;
    } catch {
      /* capture must never affect the app */
    }

    return result;
  };
}
