/**
 * Network monitor — persistence: preferences and the captured log.
 *
 * Two independent concerns share this module because they share a database:
 *
 * - **Prefs** are tiny and needed synchronously at first paint, so IndexedDB is
 *   the source of truth and `localStorage` is a read cache (see `MonitorPrefs`).
 * - **Entries** are large and written in bursts, so they go through a dirty-set
 *   plus an idle flusher rather than being written per mutation.
 *
 * Nothing here runs until the panel mounts and calls `bootPersistence()`, so a
 * developer who never opens the devtool pays no IndexedDB cost at all.
 */

import {
  MAX_ENTRIES,
  MONITOR_ENABLED,
  NM_SCHEMA_VERSION,
  PERSIST_MAX_BYTES,
  PERSIST_MAX_ENTRIES,
  PERSIST_MAX_ENTRY_BYTES,
} from "./monitorConfig";
import { networkMonitor, type MonitorSink } from "./networkMonitor";
import {
  bulkPut,
  clearEntries,
  deleteMany,
  destroyDb,
  evictToFit,
  getAllEntries,
  getMeta,
  putMeta,
  type BudgetMeta,
} from "./monitorStorage";
import { truncateForPersist } from "./monitorTruncate";
import type { MonitorPrefs, PersistedEntry } from "./monitorTypes";

const PREFS_LS_KEY = "nm:prefs";
/** The four keys this replaced; folded in once, then removed. */
const LEGACY_KEYS = ["nm:size", "nm:pos", "nm:corner", "nm:listw"] as const;

export const DEFAULT_PREFS: MonitorPrefs = {
  rev: 0,
  mode: "bottom",
  bottomH: 420,
  rightW: 520,
  float: { pos: null, size: { w: 920, h: 600 }, maximized: false },
  // Wide enough for the full column set in a bottom dock. The old 320px
  // default could not fit the fixed columns at all, which is what made the
  // flexible ones collapse to zero.
  splitW: 580,
  splitH: 260,
  corner: "bottom-left",
  // Chrome's default is off, and so is ours: a reload starts clean unless the
  // developer explicitly asked to keep the log.
  preserveLog: false,
  deepSearch: false,
  followLatest: false,
  captureInitiator: true,
  selectedId: null,
  section: "network",
  density: "normal",
  columnWidths: {},
};

export type HydrationState = "idle" | "loading" | "ready";

/* ────────────────────────────── prefs store ───────────────────────────── */

/**
 * Prefs and hydration status travel together in one immutable snapshot object.
 * `useSyncExternalStore` compares snapshots by reference, so a status change
 * has to produce a new object or the panel would never learn that the restore
 * finished.
 */
export interface PrefsSnapshot {
  prefs: MonitorPrefs;
  hydration: HydrationState;
}

let prefs: MonitorPrefs = DEFAULT_PREFS;
let hydration: HydrationState = "idle";
let snapshot: PrefsSnapshot = { prefs, hydration };
const SERVER_SNAPSHOT: PrefsSnapshot = {
  prefs: DEFAULT_PREFS,
  hydration: "idle",
};
const prefsListeners = new Set<() => void>();

function emitPrefs() {
  snapshot = { prefs, hydration };
  prefsListeners.forEach((l) => l());
}

function setHydration(next: HydrationState) {
  hydration = next;
  emitPrefs();
}

let prefsInitialized = false;

/** Populates `prefs` from the localStorage mirror the first time the client
 * reads it, so the very first render already has the persisted geometry and
 * the panel never opens at the default size and then jumps. */
function ensurePrefs(): PrefsSnapshot {
  if (!prefsInitialized && typeof window !== "undefined") {
    prefsInitialized = true;
    prefs = readPrefsSync();
    snapshot = { prefs, hydration };
  }
  return snapshot;
}

export const prefsStore = {
  subscribe(listener: () => void) {
    prefsListeners.add(listener);
    return () => {
      prefsListeners.delete(listener);
    };
  },
  // Returns a stable reference until something actually changes, as
  // `useSyncExternalStore` requires.
  getSnapshot: (): PrefsSnapshot => ensurePrefs(),
  getServerSnapshot: (): PrefsSnapshot => SERVER_SNAPSHOT,
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Reads the localStorage mirror, folding in the four legacy geometry keys the
 * first time it runs. Synchronous by design — it feeds a `useState` initializer
 * so the panel never renders at the wrong size and then jumps. */
export function readPrefsSync(): MonitorPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;

  const stored = safeParse<Partial<MonitorPrefs> | null>(
    window.localStorage.getItem(PREFS_LS_KEY),
    null,
  );
  if (stored) return { ...DEFAULT_PREFS, ...stored };

  // One-time migration from the pre-v2 keys.
  const legacy: Partial<MonitorPrefs> = {};
  try {
    const size = safeParse(window.localStorage.getItem("nm:size"), null);
    const pos = safeParse(window.localStorage.getItem("nm:pos"), null);
    const corner = safeParse(window.localStorage.getItem("nm:corner"), null);
    const listW = safeParse(window.localStorage.getItem("nm:listw"), null);
    if (size || pos) {
      legacy.float = {
        ...DEFAULT_PREFS.float,
        ...(size ? { size: size as MonitorPrefs["float"]["size"] } : {}),
        ...(pos ? { pos: pos as MonitorPrefs["float"]["pos"] } : {}),
      };
      // Someone who had a floating panel keeps it rather than being moved to
      // the new bottom dock behind their back.
      legacy.mode = "float";
    }
    if (corner) legacy.corner = corner as MonitorPrefs["corner"];
    if (typeof listW === "number") legacy.splitW = listW;
    LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* privacy mode — defaults are fine */
  }

  return { ...DEFAULT_PREFS, ...legacy };
}

let prefsWriteTimer: ReturnType<typeof setTimeout> | null = null;

/** Merges a patch, writes the localStorage mirror synchronously, and throttles
 * the IndexedDB write — a resize drag must not produce a transaction per frame. */
export function savePrefs(patch: Partial<MonitorPrefs>): void {
  prefs = { ...prefs, ...patch, rev: prefs.rev + 1 };
  emitPrefs();

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / privacy mode */
  }

  if (prefsWriteTimer) clearTimeout(prefsWriteTimer);
  prefsWriteTimer = setTimeout(() => {
    prefsWriteTimer = null;
    void putMeta("prefs", prefs);
  }, 300);
}

/* ─────────────────────────── entry persistence ────────────────────────── */

const dirty = new Set<string>();
const pendingDeletes = new Set<string>();
/** id → bytes as last written, so deletes and rewrites adjust the running
 * budget accurately without re-reading the store. */
const writtenBytes = new Map<string, number>();
let budget: BudgetMeta = { count: 0, bytes: 0 };
let preserve = false;
let flushScheduled = false;

type IdleHandle = number;
const scheduleIdle = (fn: () => void): IdleHandle => {
  if (typeof requestIdleCallback === "function") {
    return requestIdleCallback(fn, { timeout: 500 }) as unknown as IdleHandle;
  }
  return setTimeout(fn, 250) as unknown as IdleHandle;
};

function schedule() {
  if (flushScheduled) return;
  flushScheduled = true;
  scheduleIdle(() => void flush());
}

function toPersisted(id: string): PersistedEntry | null {
  const entry = networkMonitor.getSnapshot().find((e) => e.id === id);
  if (!entry) return null;

  const request = truncateForPersist(
    entry.requestPayload,
    PERSIST_MAX_ENTRY_BYTES,
  );
  const response = truncateForPersist(
    entry.responsePayload,
    PERSIST_MAX_ENTRY_BYTES,
  );
  const error = truncateForPersist(entry.error, PERSIST_MAX_ENTRY_BYTES / 4);

  return {
    ...entry,
    // The encrypted wire forms are the least useful thing to keep across a
    // reload and among the largest, so they are dropped rather than truncated.
    encryptedRequest: undefined,
    encryptedResponse: undefined,
    requestPayload: request.value,
    responsePayload: response.value,
    error: error.value,
    schema: NM_SCHEMA_VERSION,
    bytes: request.bytes + response.bytes + error.bytes + 512,
  };
}

async function flush(): Promise<void> {
  flushScheduled = false;
  if (!preserve) {
    dirty.clear();
    pendingDeletes.clear();
    return;
  }

  const ids = Array.from(dirty);
  dirty.clear();
  const removals = Array.from(pendingDeletes);
  pendingDeletes.clear();

  if (removals.length) {
    for (const id of removals) {
      const bytes = writtenBytes.get(id);
      if (bytes !== undefined) {
        budget.bytes -= bytes;
        budget.count -= 1;
        writtenBytes.delete(id);
      }
    }
    await deleteMany(removals);
  }

  // Writing the *current* value of each dirty id (rather than replaying queued
  // patches) means a request that starts and completes inside one idle window
  // costs a single put instead of four.
  const records: PersistedEntry[] = [];
  for (const id of ids) {
    const record = toPersisted(id);
    if (!record) continue;
    const previous = writtenBytes.get(id);
    budget.bytes += record.bytes - (previous ?? 0);
    if (previous === undefined) budget.count += 1;
    writtenBytes.set(id, record.bytes);
    records.push(record);
  }

  if (records.length) await bulkPut(records);

  const result = await evictToFit(
    budget,
    PERSIST_MAX_ENTRIES,
    PERSIST_MAX_BYTES,
  );
  budget = result.budget;
  result.deleted.forEach((id) => writtenBytes.delete(id));

  await putMeta("budget", budget);
}

/** Redux/Query entries are session-scoped debugging aids, not artifacts worth
 * a reload — persisting them would let a chat session's action churn burn
 * through the 24 MB budget that HTTP payloads actually need. Unpinned ones are
 * simply never written; pinning one is the (rare) way to keep it. */
function isPersistable(entry: { kind?: string; pinned?: boolean }): boolean {
  if (entry.kind !== "redux" && entry.kind !== "query") return true;
  return entry.pinned === true;
}

const sink: MonitorSink = {
  onDirty(id) {
    if (!preserve) return;
    const entry = networkMonitor.getById(id);
    if (entry && !isPersistable(entry)) return;
    dirty.add(id);
    schedule();
  },
  onEvict(ids) {
    if (!preserve) return;
    ids.forEach((id) => {
      dirty.delete(id);
      pendingDeletes.add(id);
    });
    schedule();
  },
  onClear() {
    // Runs regardless of `preserve` so "Clear" is never followed by the log
    // reappearing after a reload.
    dirty.clear();
    pendingDeletes.clear();
    writtenBytes.clear();
    budget = { count: 0, bytes: 0 };
    void clearEntries().then(() => putMeta("budget", budget));
  },
};

/** Marks every buffered entry for writing — used when preserve-log is switched
 * on mid-session so the current session is captured retroactively. */
function enqueueAll() {
  networkMonitor
    .getSnapshot()
    .filter(isPersistable)
    .forEach((e) => dirty.add(e.id));
  schedule();
}

export function setPreserveLog(next: boolean): void {
  if (preserve === next) return;
  preserve = next;
  savePrefs({ preserveLog: next });

  if (next) {
    enqueueAll();
  } else {
    dirty.clear();
    pendingDeletes.clear();
    writtenBytes.clear();
    budget = { count: 0, bytes: 0 };
    void clearEntries().then(() => putMeta("budget", budget));
  }
}

export function getPersistedStats(): BudgetMeta {
  return budget;
}

export async function purgeStorage(): Promise<void> {
  dirty.clear();
  pendingDeletes.clear();
  writtenBytes.clear();
  budget = { count: 0, bytes: 0 };
  await destroyDb();
}

let booted = false;

/**
 * Reads prefs, then either restores the log or clears it, then attaches the
 * sink. All async work happens outside React and the store's synchronous
 * snapshot changes exactly once, via `mergeHydrated`.
 */
export async function bootPersistence(): Promise<void> {
  if (!MONITOR_ENABLED || booted) return;
  booted = true;
  ensurePrefs();
  setHydration("loading");

  const stored = await getMeta<MonitorPrefs>("prefs");
  // The localStorage mirror is wiped whenever the host clears web storage
  // (sign-out, failed token refresh); when that happens the IndexedDB copy
  // wins and the mirror is reseeded, so geometry survives a logout.
  if (stored && stored.rev >= prefs.rev) {
    prefs = { ...DEFAULT_PREFS, ...stored };
    try {
      window.localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs));
    } catch {
      /* noop */
    }
    emitPrefs();
  } else {
    await putMeta("prefs", prefs);
  }

  preserve = prefs.preserveLog;
  networkMonitor.setSink(sink);

  if (!preserve) {
    // Preserve-log off means a reload genuinely starts clean, matching Chrome.
    await clearEntries();
    budget = { count: 0, bytes: 0 };
    await putMeta("budget", budget);
    setHydration("ready");
    return;
  }

  const records = await getAllEntries();
  const valid = records
    .filter((r) => r.schema === NM_SCHEMA_VERSION)
    .sort((a, b) => b.seq - a.seq)
    .slice(0, MAX_ENTRIES);

  budget = valid.reduce<BudgetMeta>(
    (acc, r) => {
      writtenBytes.set(r.id, r.bytes ?? 0);
      return { count: acc.count + 1, bytes: acc.bytes + (r.bytes ?? 0) };
    },
    { count: 0, bytes: 0 },
  );

  networkMonitor.mergeHydrated(valid);

  // Anything captured while the database was opening predates the sink.
  enqueueAll();

  hydration = "ready";
  emitPrefs();
}

/** Best-effort flush when the tab goes away. An unload-time IDB transaction may
 * not commit, which is acceptable given the ≤250 ms idle cadence. */
export function installFlushOnHide(): () => void {
  if (typeof document === "undefined") return () => {};
  const onHide = () => {
    if (document.visibilityState === "hidden") void flush();
  };
  const onPageHide = () => void flush();
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
  };
}
