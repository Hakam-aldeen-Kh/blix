/**
 * Network monitor (dev tool)
 *
 * An in-memory pub/sub store that buffers request/response pairs captured by
 * the Axios interceptors. Because the app encrypts request bodies and decrypts
 * responses, the browser Network tab only shows ciphertext. This store captures
 * the *plaintext* request (before encryption) and the *decrypted* response
 * (after decryption) so they can be inspected in the NetworkMonitor panel.
 *
 * Active only in development (see `MONITOR_ENABLED`); a no-op in production
 * builds, where the whole capture path is constant-folded away.
 *
 * This module is reachable from the host's HTTP-client module, so it must stay
 * free of React and DOM-UI concerns. Persistence attaches from the outside via
 * `setSink()` rather than being imported here, which keeps the dependency edge
 * one-way (persistence → store, never the reverse).
 */

import {
  LOAD_ID,
  MAX_ENTRIES,
  MONITOR_ENABLED,
  POOL_OF,
  POOL_QUOTA,
  TIME_ORIGIN,
  type MonitorPool,
} from "./monitorConfig";
import type { MonitorEntry, MonitorState, WsFrame } from "./monitorTypes";

/** Realtime connections keep at most this many frames; a busy channel would
 * otherwise grow without bound for the lifetime of the page. Query cache rows
 * share the same cap for their lifecycle-event frames. */
const MAX_FRAMES_PER_CONNECTION = 500;

/**
 * Trims the buffer, dropping the oldest entries first — but never a pinned
 * one, and never a realtime connection that is still open.
 *
 * Eviction is budgeted per pool (`net` for HTTP+realtime, `redux`, `query`)
 * rather than one shared count: Redux actions and query-cache events fire
 * orders of magnitude more often than HTTP requests, and a single budget
 * would let a burst of either evict every HTTP row within seconds.
 *
 * Pins are the whole point of the feature: a reference response has to stay put
 * while the developer reproduces an issue, however much traffic that generates.
 * A live WebSocket is excluded because evicting it would orphan every frame
 * that arrives afterwards.
 */
function evictOldest(
  entries: MonitorEntry[],
): { kept: MonitorEntry[]; evicted: string[] } {
  const totalQuota = POOL_QUOTA.net + POOL_QUOTA.redux + POOL_QUOTA.query;
  if (entries.length <= totalQuota) return { kept: entries, evicted: [] };

  const kept: MonitorEntry[] = [];
  const evicted: string[] = [];
  const budget: Record<MonitorPool, number> = { ...POOL_QUOTA };

  // Newest-first, so anything beyond a pool's budget is that pool's oldest.
  for (const entry of entries) {
    const pool = POOL_OF[entry.kind ?? "http"];
    const protectedEntry =
      entry.pinned || (entry.kind === "ws" && entry.state === "pending");
    if (budget[pool] > 0 || protectedEntry) {
      kept.push(entry);
      if (!protectedEntry) budget[pool] -= 1;
    } else {
      evicted.push(entry.id);
    }
  }

  return { kept, evicted };
}

export type {
  MonitorEntry,
  MonitorState,
  MonitorKind,
  InitiatorFrame,
  PersistedEntry,
  WsFrame,
  FrameDirection,
  TimingMarks,
  DiffOp,
  StateDiff,
  StateDiffEntry,
  ReduxActionMeta,
  QueryMeta,
} from "./monitorTypes";
// Re-exported so importers of this module keep working after these moved into
// their own module.
export { serializeBody, serializeHeaders, estimateBytes } from "./monitorSerialize";

type Listener = () => void;

const EMPTY: MonitorEntry[] = [];

/** What a capture source supplies; the store fills in the rest.
 *
 * `state` is optional: HTTP/realtime callers omit it and get `"pending"`
 * (the original behaviour), while Redux/Query capture — which already knows
 * the outcome by the time it calls `start()` — can pass a terminal state
 * directly instead of a spurious pending phase. */
export type MonitorStartInput = Omit<
  MonitorEntry,
  "state" | "seq" | "rev" | "timeOrigin" | "startAbs" | "loadId"
> & { state?: MonitorState };

/**
 * Optional persistence hook. Implemented by `monitorPersistence.ts` and
 * attached at panel boot, so nothing touches IndexedDB until the devtool is
 * actually opened.
 */
export interface MonitorSink {
  /** An entry was created or patched and should be (re)written. */
  onDirty(id: string): void;
  /** Entries fell out of the buffer and can be dropped from storage. */
  onEvict(ids: string[]): void;
  /** The log was cleared. */
  onClear(): void;
}

class NetworkMonitor {
  private entries: MonitorEntry[] = [];
  /** id → index into `entries`. Avoids an O(n) `map()` with a closure per
   * element on every patch; each request produces 2–4 patches. */
  private index = new Map<string, number>();
  private listeners = new Set<Listener>();
  private counter = 0;
  private paused = false;
  private sink: MonitorSink | null = null;
  /** Set while an emit is already queued, so a burst of parallel requests
   * produces one re-render rather than one per request. */
  private emitQueued = false;

  /** Whether capturing + the panel are active. Development only. */
  get enabled(): boolean {
    return MONITOR_ENABLED;
  }

  /** When paused, new requests are dropped (existing entries still update). */
  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(value: boolean): void {
    if (this.paused === value) return;
    this.paused = value;
    this.emit();
  }

  setSink(sink: MonitorSink | null): void {
    this.sink = sink;
  }

  nextId(): string {
    this.counter += 1;
    return `${Date.now()}-${this.counter}`;
  }

  start(input: MonitorStartInput): void {
    if (!this.enabled || this.paused) return;

    const next: MonitorEntry = {
      ...input,
      state: input.state ?? "pending",
      seq: this.counter,
      rev: 0,
      timeOrigin: TIME_ORIGIN,
      startAbs: TIME_ORIGIN + input.startTime,
      loadId: LOAD_ID,
    };

    const combined = [next, ...this.entries];
    const { kept, evicted } = evictOldest(combined);

    this.entries = kept;
    this.reindex();

    if (next.replayOf) this.bumpReplayCount(next.replayOf);

    this.sink?.onDirty(next.id);
    if (evicted.length) this.sink?.onEvict(evicted);
    this.emit();
  }

  update(id: string, patch: Partial<MonitorEntry>): void {
    if (!this.enabled) return;

    const at = this.index.get(id);
    if (at === undefined) return;

    const prev = this.entries[at];
    const merged: MonitorEntry = { ...prev, ...patch, rev: prev.rev + 1 };

    // Timing marks arrive in separate patches (encrypt on the way out, decrypt
    // on the way back), so they merge rather than replace.
    if (patch.marks) merged.marks = { ...prev.marks, ...patch.marks };

    if (patch.endTime != null && merged.startTime != null) {
      merged.durationMs = Math.round(patch.endTime - merged.startTime);
      merged.endAbs = merged.timeOrigin + patch.endTime;
    }

    // `useSyncExternalStore` compares snapshots by reference, so the array copy
    // is required — but the scan and per-element closure are not.
    const next = this.entries.slice();
    next[at] = merged;
    this.entries = next;

    this.sink?.onDirty(id);
    this.emit();
  }

  /** Increments the parent's replay counter, in the same mutation as the child
   * being added. Silently ignores an unknown parent (it may have been evicted). */
  private bumpReplayCount(parentId: string): void {
    const at = this.index.get(parentId);
    if (at === undefined) return;
    const prev = this.entries[at];
    const next = this.entries.slice();
    next[at] = {
      ...prev,
      rev: prev.rev + 1,
      replayCount: (prev.replayCount ?? 0) + 1,
    };
    this.entries = next;
    this.sink?.onDirty(parentId);
  }

  /** Clears the log, keeping pinned entries — that is what pinning is for. */
  clear(): void {
    const survivors = this.entries.filter((e) => e.pinned);
    const removed = this.entries
      .filter((e) => !e.pinned)
      .map((e) => e.id);

    this.entries = survivors;
    this.reindex();

    if (survivors.length === 0) {
      this.sink?.onClear();
    } else if (removed.length) {
      this.sink?.onEvict(removed);
    }
    this.emit();
  }

  togglePin(id: string): void {
    const at = this.index.get(id);
    if (at === undefined) return;
    const prev = this.entries[at];
    const next = this.entries.slice();
    next[at] = { ...prev, rev: prev.rev + 1, pinned: !prev.pinned };
    this.entries = next;
    this.sink?.onDirty(id);
    this.emit();
  }

  /** O(1) lookup by id. Used by capture sources (Redux/Query) that need to
   * read an entry's current fields before patching it — e.g. to fold a
   * repeated action into its existing row's `batchCount`. */
  getById(id: string): MonitorEntry | undefined {
    const at = this.index.get(id);
    return at === undefined ? undefined : this.entries[at];
  }

  /**
   * Records that `childId` (an HTTP entry) was caused by the query/mutation
   * entry `ownerId`. A no-op if the owner isn't a query/mutation row, or has
   * been evicted — this is a best-effort correlation, never load-bearing.
   */
  linkChild(ownerId: string, childId: string): void {
    const at = this.index.get(ownerId);
    if (at === undefined) return;
    const prev = this.entries[at];
    if (!prev.query) return;

    const causedIds = [...(prev.query.causedIds ?? []), childId].slice(-20);
    const next = this.entries.slice();
    next[at] = { ...prev, rev: prev.rev + 1, query: { ...prev.query, causedIds } };
    this.entries = next;

    this.sink?.onDirty(ownerId);
    this.emit();
  }

  /**
   * Appends a frame to a realtime connection.
   *
   * Frames mutate a long-lived entry rather than creating rows of their own, so
   * the buffer stays dominated by HTTP requests. The per-connection cap keeps a
   * chatty channel from growing without bound.
   */
  appendFrame(id: string, frame: WsFrame): void {
    if (!this.enabled || this.paused) return;

    const at = this.index.get(id);
    if (at === undefined) return;

    const prev = this.entries[at];
    const frames = [...(prev.frames ?? []), frame].slice(
      -MAX_FRAMES_PER_CONNECTION,
    );

    const next = this.entries.slice();
    next[at] = {
      ...prev,
      rev: prev.rev + 1,
      frames,
      sizeBytes: (prev.sizeBytes ?? 0) + frame.sizeBytes,
    };
    this.entries = next;

    this.sink?.onDirty(id);
    this.emit();
  }

  /**
   * Folds entries restored from IndexedDB into the live buffer. Called once,
   * from the panel's boot sequence, after any requests that fired while the DB
   * was opening — hence the merge rather than a plain assignment.
   */
  mergeHydrated(records: MonitorEntry[]): void {
    if (!this.enabled || records.length === 0) return;

    const live = new Set(this.entries.map((e) => e.id));
    const restored = records
      .filter((r) => !live.has(r.id))
      .map((r) =>
        // A request left pending by a previous page load can never complete.
        // Leaving it `pending` would spin a forever-spinner, inflate the
        // pending count, and keep the waterfall ticker running indefinitely.
        r.state === "pending" && r.loadId !== LOAD_ID
          ? { ...r, state: "aborted" as MonitorState }
          : r,
      );

    // `startAbs` is anchored to `performance.timeOrigin`, an absolute epoch
    // timestamp — comparable across page loads. `seq` is only a per-load
    // counter that restarts at 0 on every reload, so it cannot order entries
    // restored from *different* past loads relative to each other; using it
    // as the primary key interleaved unrelated loads' entries (e.g. two
    // reloads' requests alternating seq 0,0,1,1,2,2,...), which showed up as
    // a "page load" divider before nearly every row. `seq` remains the
    // tiebreak for same-load entries sharing a timestamp.
    const combined = [...this.entries, ...restored].sort((a, b) => {
      if (b.startAbs !== a.startAbs) return b.startAbs - a.startAbs;
      return b.seq - a.seq;
    });

    this.entries = combined.slice(0, MAX_ENTRIES);
    this.reindex();

    // Critical: without reseeding, entries captured after hydration get a lower
    // `seq` than the restored ones and sort below them — the list comes out
    // scrambled with new requests buried in the middle.
    const maxSeq = this.entries.reduce((m, e) => Math.max(m, e.seq), 0);
    this.counter = Math.max(this.counter, maxSeq + 1);

    this.emit();
  }

  private reindex(): void {
    this.index.clear();
    for (let i = 0; i < this.entries.length; i += 1) {
      this.index.set(this.entries[i].id, i);
    }
  }

  /** Stable reference between mutations so useSyncExternalStore is happy. */
  getSnapshot = (): MonitorEntry[] => this.entries;

  getServerSnapshot = (): MonitorEntry[] => EMPTY;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Coalesced notification. Twenty parallel requests would otherwise fire
   * twenty synchronous emits, each forcing `useSyncExternalStore` into a
   * separate re-render; batching to a microtask makes that one render.
   */
  private emit() {
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      this.listeners.forEach((listener) => listener());
    });
  }
}

export const networkMonitor = new NetworkMonitor();
