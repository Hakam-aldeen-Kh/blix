/**
 * Network monitor — build-time gate, identity of the current page load, and the
 * capacity/budget constants shared by the store, the persistence layer and the
 * panel.
 *
 * Everything here is a module const rather than a getter so the bundler can
 * constant-fold `MONITOR_ENABLED` and eliminate the entire capture path from
 * production builds.
 */

/**
 * Whether capturing is active.
 *
 * Gated on `NODE_ENV` alone, deliberately. Production builds hardcode
 * `NODE_ENV=production`, so this cannot be subverted — whereas gating on a
 * custom public env var could be, since a build script is free to pass an
 * arbitrary env file and a development-flavoured one would then ship the
 * monitor to users.
 *
 * The `typeof window` half keeps the server-side module singleton empty: this
 * file is reachable from the host's HTTP-client module, which typically also
 * runs during SSR, and a module-level array on the Node server would
 * accumulate every user's payloads for the lifetime of the process.
 */
export const MONITOR_ENABLED =
  process.env.NODE_ENV === "development" && typeof window !== "undefined";

/** Bumped when `MonitorEntry`'s persisted shape changes. Records written under
 * a different version are dropped on read rather than migrated — this is a
 * devtool, and migration code is not worth maintaining. */
export const NM_SCHEMA_VERSION = 1;

/** IndexedDB database name + version. See `monitorStorage.ts` for why IDB and
 * not localStorage. */
export const NM_DB_NAME = "nm-devtools";
export const NM_DB_VERSION = 1;

let _activeDbName = NM_DB_NAME;
/** Override the IndexedDB database name. Must be called before the first
 * `openDb()` call (i.e. before the panel mounts). Defaults to "nm-devtools". */
export function configureDbName(name: string): void {
  _activeDbName = name;
}
export function getActiveDbName(): string {
  return _activeDbName;
}

/**
 * Live buffer capacity, per kind of traffic.
 *
 * Redux actions and query-cache events fire orders of magnitude more often
 * than HTTP requests. A single shared budget would let a chat session's
 * action churn evict every HTTP row within seconds — so eviction is budgeted
 * per pool instead: HTTP+realtime share `net` (unchanged from the original
 * single-budget behaviour), Redux and Query get their own.
 */
export type MonitorPool = "net" | "redux" | "query";

/** Which pool a `MonitorKind` draws its eviction budget from. */
export const POOL_OF: Record<
  import("./monitorTypes").MonitorKind,
  MonitorPool
> = {
  http: "net",
  ws: "net",
  redux: "redux",
  query: "query",
};

export const POOL_QUOTA: Record<MonitorPool, number> = {
  // Raised from the original 100 because the list is virtualized.
  net: 200,
  redux: 300,
  query: 150,
};

/** How many entries the live in-memory buffer keeps for HTTP + realtime
 * traffic. Kept as a named alias — `monitorPersistence.ts`'s hydration slice
 * only ever restores http/ws entries (Redux/Query are never persisted), so
 * this is still the right bound for that use. */
export const MAX_ENTRIES = POOL_QUOTA.net;

/** Bounds for Redux action-payload and diff-value capture. Small: a devtool
 * only needs enough of a value to recognize it, not the whole thing — the
 * live state is always readable in the State tab. */
export const MAX_REDUX_PAYLOAD_BYTES = 4 * 1024;
export const MAX_REDUX_DIFF_VALUE_BYTES = 2 * 1024;
/** Above this dispatch rate, capture drops to type + timing only — no diff —
 * until the rate falls back under it. */
export const MAX_REDUX_ACTIONS_PER_SEC = 300;
/** Same type of action fired again within this window folds into the
 * existing row (`redux.batchCount`) instead of flooding the log. */
export const REDUX_COALESCE_MS = 120;

/** Bound for captured query/mutation data and error payloads. */
export const MAX_QUERY_DATA_BYTES = 32 * 1024;

/** Persistence budget. Entries are evicted oldest-first once either bound is
 * exceeded. */
export const PERSIST_MAX_ENTRIES = 200;
export const PERSIST_MAX_BYTES = 24 * 1024 * 1024;

/** Per-entry cap applied when writing to IndexedDB. The *live* entry is never
 * truncated — only the copy that survives a reload. */
export const PERSIST_MAX_ENTRY_BYTES = 512 * 1024;
export const STRING_CAP = 32 * 1024;
export const ARRAY_CAP = 200;

/** Cap on the text indexed for deep search, per entry. A 4 MB base64 response
 * contributes 64 KB and search stays instant. */
export const SEARCH_INDEX_CAP = 64 * 1024;

/** A pending request stops widening the waterfall window after this long, so a
 * single hung request can't compress every other bar into a sliver. */
export const PENDING_WINDOW_CAP_MS = 30_000;

/** `performance.timeOrigin` for this page load. Persisted entries record their
 * own origin so timings from a previous load stay comparable — see
 * `startAbs`/`endAbs` on `MonitorEntry`. */
export const TIME_ORIGIN =
  typeof performance !== "undefined" && typeof performance.timeOrigin === "number"
    ? performance.timeOrigin
    : Date.now();

/** Wall-clock time this page load started. */
export const PAGE_LOAD_AT = Date.now();

function makeLoadId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* insecure context — fall through */
  }
  return `${PAGE_LOAD_AT}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Identifies this page load. Entries restored from IndexedDB carry the id of
 * the load that captured them, which is what lets the table draw "page load"
 * divider rows and give each load its own waterfall timeline.
 */
export const LOAD_ID = makeLoadId();

/** Monotonic clock, with a wall-clock fallback for non-browser contexts. */
export const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();
