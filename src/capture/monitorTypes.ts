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
 * filter and row colour, and pending/success/error covers this fine;
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
   * Anything comparing two entries in time must use these, never
   * `startTime`/`endTime`: those are relative to a per-page-load origin, so a
   * persisted entry's `startTime` is meaningless against the current load's.
   */
  startAbs: number;
  endAbs?: number;

  /** Which page load captured this. Drives the divider rows in the list. */
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
  /**
   * HTTP only: which capture path recorded this request — `attachHttpMonitor`
   * (`"axios"`) or `attachFetchMonitor` (`"fetch"`). Deliberately not
   * `transport`, which is realtime-only and is rendered in place of the method.
   *
   * Absent on entries captured before this field existed. Absent means
   * unknown — never read it as "axios".
   */
  client?: "axios" | "fetch";
  /** HTTP only: id of the query/mutation entry that caused this request,
   * when it could be determined — see `monitorContext.ts`. Absence means
   * "unknown", never "not caused by a query". */
  ownerId?: string;
  /** HTTP only: whether the raw call stack (before NOISE-filtering) passed
   * through `@tanstack/query`, independent of whether `ownerId` resolved. */
  initiatorKind?: "query" | "mutation" | "direct";
  /** HTTP only: the claims of a JWT in the request's `Authorization` header,
   * decoded when a `fetch` call is made or when an axios request settles —
   * `authClaims.source` says which. The token itself is never stored — see
   * `monitorAuth.ts`. */
  authClaims?: JwtClaims;
}

/**
 * Which capture path decoded a token's claims — what the inspector's note line
 * reports:
 *
 * - `"fetch"`: `attachFetchMonitor`, when the call was made. Those headers are
 *   final.
 * - `"axios-settle"`: `attachHttpMonitor`, from the headers axios settled the
 *   request with.
 * - `"axios-request"`: `attachHttpMonitor`, from the snapshot taken when the
 *   request started — kept when the request never settled, settled without a
 *   config, or was sent with axios's `auth` option.
 */
export type JwtClaimsSource = "fetch" | "axios-settle" | "axios-request";

/**
 * What a JWT claims about itself — decoded, not verified. Only these are kept:
 * enough to answer "whose token, from where, signed how, and has it expired",
 * nothing that could be replayed.
 */
export interface JwtClaims {
  /**
   * From the JOSE header, verbatim — never mapped or normalised here. Absent
   * when the header had no `alg` or an empty one. Display-only: no value of it
   * withholds the other claims.
   */
  alg?: string;
  /** The header carried an `alg` that was not a string. The value itself is
   * not kept: an object or array there is a malformed token, not something to
   * show. */
  algNotString?: true;
  sub?: string;
  iss?: string;
  /** Epoch seconds, as in the token. */
  iat?: number;
  /** Epoch seconds, as in the token. */
  exp?: number;
  /** Which capture path decoded these. Absent only on entries captured before
   * the field existed. */
  source?: JwtClaimsSource;
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
 * `localStorage["<dbName>:prefs"]` — `blix:checkout:prefs` for
 * `dbName="checkout"` — purely as a synchronous read cache so the panel can
 * restore its geometry without a frame of flash. The mirror is expendable —
 * any host that clears web storage wipes it, and the IndexedDB copy silently
 * restores it on next boot.
 *
 * Both halves are scoped to the database name: web storage, like IndexedDB, is
 * origin-scoped, so an unscoped key meant every app on one origin shared one
 * set of preferences.
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
  /** Mask `Authorization` in the panel. Off shows the full value of requests
   * captured from then on — on screen only: exports, snippets and IndexedDB
   * keep the masked value. See `monitorAuth.ts`. */
  maskAuthorization: boolean;
  /** Last pinned request; restored only if the id still resolves. */
  selectedId: string | null;

  /**
   * Panel theme — `"auto"` (follow the host app's light/dark choice) or a
   * theme id from `ui/themes/themes.ts`.
   *
   * Typed as a plain string like the two settings below it, so this module
   * stays free of any dependency on the UI layer — the panel normalizes it on
   * read, and an id that no longer exists falls back to `"auto"`.
   */
  theme: string;

  /** How payloads are rendered in the detail pane — tree | table | json |
   * yaml | text. A plain string for the same reason as `theme`: this module
   * stays free of any dependency on the UI layer. */
  dataFormat: string;

  /** Active top-level section — `"network"` (HTTP) or `"realtime"` (sockets). */
  section: string;
  /** Sources rail shown as icons only. A deliberate choice, kept separate from
   * the automatic collapse a narrow panel applies — re-widening the panel
   * restores the rail unless the developer collapsed it themselves. */
  railCollapsed: boolean;
  /** Row height preset: compact | normal | comfy. */
  density: string;
}
