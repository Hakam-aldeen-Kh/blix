/**
 * Network monitor — shared types.
 *
 * `MonitorEntry` is both the in-memory shape and (minus a few live-only fields)
 * the persisted shape. Anything added here that should survive a reload must
 * also be JSON-serializable.
 */

export type MonitorState = "pending" | "success" | "error" | "aborted";

/**
 * HTTP requests, realtime connections, Redux actions and TanStack Query
 * activity all share one table.
 *
 * A WebSocket connection is modelled as a single long-lived entry that
 * accumulates frames — the same shape Chrome uses, where the connection is a
 * row and its traffic lives in a Messages tab. Modelling each frame as its own
 * row would drown the HTTP requests. A Query cache entry reuses that exact
 * model: one row per `queryHash`/`mutationId`, accumulating lifecycle frames
 * (fetch → success/error → invalidate → removed) — because under an aggressive
 * `gcTime` the same key is added to and removed from the cache repeatedly, and
 * hashing by key lets one row carry that whole session's history instead of
 * flickering in and out of the log.
 *
 * A Redux action, by contrast, gets its own row per dispatch: the detail pane,
 * selection, pinning and search are all entry-keyed, and a per-action diff
 * needs a first-class row rather than a frame buried inside one.
 */
export type MonitorKind = "http" | "ws" | "redux" | "query";

export type FrameDirection = "in" | "out" | "system";

export interface WsFrame {
  id: string;
  at: number;
  direction: FrameDirection;
  /** Event/channel name where the transport provides one. */
  event: string;
  data: unknown;
  /** Approximate size, estimated once at capture. */
  sizeBytes: number;
}

/**
 * Where a request's wall-clock time actually went.
 *
 * Worth breaking out when the host transforms bodies in its interceptors —
 * encryption, compression, heavy serialization — because "slow request" then
 * means a slow backend *or* a slow client-side pipeline, and the two need
 * telling apart.
 */
export interface TimingMarks {
  encryptMs?: number;
  networkMs?: number;
  decryptMs?: number;
}

/** One frame of a captured call stack, already trimmed and made repo-relative. */
export interface InitiatorFrame {
  /** Function or component name, when V8 gave us one. */
  fn?: string;
  /** Repo-relative path, e.g. `src/hooks/useCheckoutForm.ts`. */
  file: string;
  line?: number;
  col?: number;
}

/* ── Redux ────────────────────────────────────────────────────────────── */

export type DiffOp = "add" | "change" | "remove";

/** One changed path from a bounded structural diff — see `stateDiff.ts`. */
export interface StateDiffEntry {
  /** Dotted/bracketed path, e.g. `conversations.allConversations[3].unreadCount`. */
  path: string;
  op: DiffOp;
  /** Bounded, truncated *copies* — never a reference into live state. */
  before?: unknown;
  after?: unknown;
}

export interface StateDiff {
  changes: StateDiffEntry[];
  /** Hit a depth/node/change ceiling — the diff is a partial picture. */
  truncated: boolean;
  /** Top-level slices touched by this action. */
  slices: string[];
}

/** Redux only: the dispatched action and what it changed. */
export interface ReduxActionMeta {
  /** `action.type`, mirrored into `entry.url` so free-text search works free. */
  type: string;
  /** Bounded copy of `action.payload` + `action.meta`. */
  payload?: unknown;
  /** RTK rejected-thunk marker (`action.error === true`). */
  isError?: boolean;
  diff?: StateDiff;
  /** Wall time spent inside `next(action)`. */
  reducerMs: number;
  /** >1 when identical consecutive actions were coalesced into this row. */
  batchCount?: number;
  /** False when the captured payload was truncated — re-dispatching it would
   * not faithfully reproduce the original action, so the panel's Re-dispatch
   * action is disabled. */
  replayable?: boolean;
}

/* ── TanStack Query ───────────────────────────────────────────────────── */

/** Query/mutation only: the cache row's current lifecycle state. Deliberately
 * not folded into `MonitorState` — `MonitorState` drives the shared state
 * filter and waterfall colour, and pending/success/error covers this fine;
 * the richer status (fresh/stale/fetching/removed) lives here instead. */
export interface QueryMeta {
  sub: "query" | "mutation";
  /** `query.queryHash` / `String(mutation.mutationId)` — the entry's stable
   * identity, and the correlation handle from an HTTP entry's `ownerId`. */
  hash: string;
  key: unknown[];
  status: "pending" | "success" | "error";
  fetchStatus?: "fetching" | "paused" | "idle";
  observers: number;
  isInvalidated?: boolean;
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
  failureCount?: number;
  /** The query left the cache — routine under an aggressive `gcTime`, and
   * exactly the fact this panel exists to make visible. */
  gcRemoved?: boolean;
  /** How many times this key has been fetched this session. */
  fetchCount?: number;
  /** Ids of the HTTP entries this query/mutation caused — best-effort, see
   * `monitorContext.ts`. */
  causedIds?: string[];
}

export interface MonitorEntry {
  id: string;
  /** HTTP request or realtime connection. Defaults to `"http"` when absent, so
   * entries persisted before realtime capture existed still load. */
  kind?: MonitorKind;
  /** Monotonic capture order. `id` embeds `Date.now()` and is unique but not
   * order-comparable; `seq` is what sorting and oldest-first eviction use. */
  seq: number;
  /** Bumped on every `update()`. Lets the deep-search index cache tell whether
   * an entry actually changed without stringifying it. */
  rev: number;

  method: string;
  url: string;
  baseURL?: string;

  /** Wall-clock epoch ms when the request started (for display). */
  at: number;
  /** `performance.now()` at start, used to compute duration. */
  startTime: number;
  endTime?: number;
  durationMs?: number;

  /** `performance.timeOrigin` of the page load that captured this entry. */
  timeOrigin: number;
  /**
   * Start/end as absolute epoch ms (`timeOrigin + startTime`).
   *
   * The waterfall must use these, never `startTime`/`endTime`: those are
   * relative to a per-page-load origin, so a persisted entry's `startTime` is
   * meaningless against the current load's.
   */
  startAbs: number;
  endAbs?: number;

  /** Which page load captured this. Drives the divider rows and the per-load
   * waterfall timeline. */
  loadId: string;

  status?: number;
  state: MonitorState;

  /** Plaintext request body, before encryption. */
  requestPayload?: unknown;
  /** What is actually sent over the wire (encData / aesKey). */
  encryptedRequest?: unknown;
  /** Decrypted response body. */
  responsePayload?: unknown;
  /** Raw encrypted response body from the server. */
  encryptedResponse?: unknown;
  /** Decrypted/raw error payload, when the request failed. */
  error?: unknown;

  /** Outgoing request headers (sanitized to a flat string map). */
  requestHeaders?: Record<string, string>;
  /** Response headers returned by the server. */
  responseHeaders?: Record<string, string>;

  /** Approximate payload size in bytes, estimated once at capture. Computing
   * this lazily in the detail pane meant a full `JSON.stringify` per render. */
  sizeBytes?: number;

  /** Whether the request opted out of the encryption pipeline. Needed to replay
   * a request faithfully — it's a config flag, not a header, so it isn't
   * recoverable from `requestHeaders`. */
  skipEncryption?: boolean;
  /** Whether the body was `FormData`. Such requests can't be replayed: file
   * contents are summarized, not captured. */
  hadFormData?: boolean;

  /** Set when this entry is a replay of another; holds the parent's id. */
  replayOf?: string;
  /** How many replays this entry has spawned. */
  replayCount?: number;

  /** Trimmed call stack captured at the call site. */
  initiator?: InitiatorFrame[];

  /** Where the time went — encryption vs. network vs. decryption. */
  marks?: TimingMarks;

  /**
   * Pinned entries survive Clear and buffer eviction, so a reference response
   * can be held on screen while reproducing an issue.
   */
  pinned?: boolean;

  /** Realtime/Query only: frames/lifecycle events on this connection or key. */
  frames?: WsFrame[];
  /** Realtime only: transport name, shown in the Method column. */
  transport?: string;

  /** Redux only: the dispatched action and its bounded diff. */
  redux?: ReduxActionMeta;
  /** Query only: the cache row's key, status and observer count. */
  query?: QueryMeta;
  /** HTTP only: id of the query/mutation entry that caused this request,
   * when it could be determined — see `monitorContext.ts`. Absence means
   * "unknown", never "not caused by a query". */
  ownerId?: string;
  /** HTTP only: whether the raw call stack (before NOISE-filtering) passed
   * through `@tanstack/query`, independent of whether `ownerId` resolved. */
  initiatorKind?: "query" | "mutation" | "direct";
}

/** Shape written to IndexedDB. Payloads may be truncated relative to the live
 * entry; `bytes` is what the storage budget accounts against. */
export interface PersistedEntry extends MonitorEntry {
  schema: number;
  bytes: number;
}

export type DockMode = "bottom" | "right" | "float";
export type Corner = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export interface Size {
  w: number;
  h: number;
}
export interface Pos {
  x: number;
  y: number;
}

/**
 * Everything the panel remembers between sessions.
 *
 * Stored in IndexedDB (`meta.prefs`) as the source of truth, mirrored into
 * `localStorage["nm:prefs"]` purely as a synchronous read cache so the panel
 * can restore its geometry without a frame of flash. The mirror is expendable —
 * any host that clears web storage wipes it, and the IndexedDB copy silently
 * restores it on next boot.
 */
export interface MonitorPrefs {
  /** Bumped on every write; used to reconcile the two copies. */
  rev: number;

  mode: DockMode;
  /** Dock sizes, per axis. Sharing one value across docks yields absurd
   * geometry when switching. */
  bottomH: number;
  rightW: number;
  float: { pos: Pos | null; size: Size; maximized: boolean };
  /** List/detail splitter, one per split axis. */
  splitW: number;
  splitH: number;
  corner: Corner;

  preserveLog: boolean;
  deepSearch: boolean;
  followLatest: boolean;
  /** Opt out of call-stack capture when profiling a large burst of requests. */
  captureInitiator: boolean;
  /** Last pinned request; restored only if the id still resolves. */
  selectedId: string | null;

  /** Active top-level section — `"network"` (HTTP) or `"realtime"` (sockets). */
  section: string;
  /** Row height preset: compact | normal | comfy. */
  density: string;
  /** User-resized column widths, in px, keyed by column id. */
  columnWidths: Record<string, number>;
}
