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
  getActiveDbName,
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
import type { DeleteOutcome } from "./monitorDatabases";
import { safeGet, safeRemove, safeSet } from "./safeStorage";
import { truncateForPersist } from "./monitorTruncate";
import type {
  Corner,
  DockMode,
  MonitorPrefs,
  PersistedEntry,
  Pos,
  Size,
} from "./monitorTypes";

/**
 * The localStorage mirror's key, scoped to the active database.
 *
 * A function, not a constant: `configureDbName` may not have run when this
 * module is first evaluated — `attachHttpMonitor` calls it at module-init time
 * and `<Blix dbName>` during render, both of which can land after this import
 * is resolved. A module-level constant would capture `blix:default` and every
 * project would share one mirror again, which is the exact collision this is
 * meant to end. Every read and write resolves it at call time instead.
 *
 * The IndexedDB half of prefs (`meta.prefs`) needs no equivalent: it already
 * lives inside the per-project database, so prefixing the database name scoped
 * it too.
 */
function prefsKey(): string {
  return `${getActiveDbName()}:prefs`;
}

/**
 * Keys from before prefs were scoped per project. Removed on first read, never
 * migrated: their contents are whichever project on this origin wrote last,
 * so inheriting them would hand one project another's geometry. Each project
 * starts once from `DEFAULT_PREFS`.
 */
const LEGACY_KEYS = [
  "nm:prefs",
  "nm:size",
  "nm:pos",
  "nm:corner",
  "nm:listw",
] as const;

export const DEFAULT_PREFS: MonitorPrefs = {
  rev: 0,
  mode: "float",
  bottomH: 420,
  rightW: 520,
  topH: 420,
  leftW: 520,
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
  // On, and it stays the default: switching it off only reveals the value on
  // screen — exports, snippets and this database keep the masked one. See
  // `monitorAuth.ts`.
  maskAuthorization: true,
  selectedId: null,
  // Follow the host app, which is what the panel did before it had themes of
  // its own — a developer who never opens the picker sees no change.
  theme: "auto",
  // The tree is what the panel always opened with, and it is the right default
  // for "what is in here?" — the other formats answer narrower questions.
  dataFormat: "tree",
  section: "network",
  // The 26px step. The redesign is an argument for density — the mockups are
  // drawn at 26 and the extra rows are the reason anyone opens a devtool —
  // and the other two steps are one menu item away for anyone who disagrees.
  density: "compact",
  railCollapsed: false,
  // Every column on. What a narrow pane drops is a separate question, and
  // answered by the layout rather than stored here.
  hiddenColumns: "",
  // Matches every other control in the panel. The other two are there for a
  // host app whose own language is rounder than this one's.
  fabRadius: "sharp",
};

/** Every dock mode, for validating one that came out of storage. */
export const DOCK_MODES: readonly DockMode[] = ["bottom", "right", "top", "left", "float"];

const CORNERS: readonly Corner[] = ["bottom-left", "bottom-right", "top-left", "top-right"];
/** The panel's four sources and three row heights, restated: the capture layer
 * must not import from `ui/`, and these two reach the layout unchecked — a
 * section indexes the per-source tables, a density is looked up for its row
 * height. */
const SECTIONS: readonly string[] = ["network", "realtime", "redux", "query"];
const DENSITIES: readonly string[] = ["compact", "normal", "comfy"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
/** A size, a split or a revision: finite and not negative. */
const isExtent = (value: unknown): value is number => isFiniteNumber(value) && value >= 0;

function toPos(value: unknown): Pos | null {
  // A position may be negative: the floating panel can hang off the left edge.
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
    ? { x: value.x, y: value.y }
    : null;
}

function toSize(value: unknown): Size | null {
  return isRecord(value) && isExtent(value.w) && isExtent(value.h)
    ? { w: value.w, h: value.h }
    : null;
}

/**
 * What is usable in a stored prefs value — and nothing else.
 *
 * What is in storage was written by *some* version of Blix — an older one that
 * had no top or left dock, or a newer one with a mode this build has never
 * heard of — or by hand, or by something else entirely that happened to use
 * the key. It used to be spread over the defaults as it came, and the panel
 * then read `prefs.float.size.w` off whatever `float` turned out to be.
 *
 * Each field is kept only if it has the type, and where there is a closed set
 * the value, this build expects. A field that fails is simply absent from the
 * result, so it takes its default while every valid field beside it survives:
 * one bad value costs one preference, not all of them, and never a crash.
 * Keys that are not preferences are dropped.
 *
 * `theme`, `dataFormat` and `fabRadius` are checked for type only. Their
 * allowed values live in the panel, which already normalizes each one where
 * it is read; a second list here would only be a second place to forget when
 * a theme is added — and forgetting it would reset that theme on every reload.
 */
export function sanitizePrefs(raw: unknown): Partial<MonitorPrefs> {
  if (!isRecord(raw)) return {};
  const out: Partial<MonitorPrefs> = {};

  if (isExtent(raw.rev)) out.rev = raw.rev;

  if (DOCK_MODES.includes(raw.mode as DockMode)) out.mode = raw.mode as DockMode;
  if (CORNERS.includes(raw.corner as Corner)) out.corner = raw.corner as Corner;

  for (const key of ["bottomH", "rightW", "topH", "leftW", "splitW", "splitH"] as const) {
    const value = raw[key];
    if (isExtent(value)) out[key] = value;
  }

  // The floating geometry is one preference with three parts. Without a
  // usable size there is nothing to restore; with one, a bad position is
  // "not placed yet" and a bad flag is "not maximized".
  if (isRecord(raw.float)) {
    const size = toSize(raw.float.size);
    if (size) {
      out.float = {
        size,
        pos: toPos(raw.float.pos),
        maximized: raw.float.maximized === true,
      };
    }
  }

  for (const key of [
    "preserveLog",
    "deepSearch",
    "followLatest",
    "captureInitiator",
    "maskAuthorization",
    "railCollapsed",
  ] as const) {
    const value = raw[key];
    if (typeof value === "boolean") out[key] = value;
  }

  if (typeof raw.selectedId === "string" || raw.selectedId === null) {
    out.selectedId = raw.selectedId;
  }

  if (typeof raw.section === "string" && SECTIONS.includes(raw.section)) out.section = raw.section;
  if (typeof raw.density === "string" && DENSITIES.includes(raw.density)) out.density = raw.density;

  for (const key of ["theme", "dataFormat", "fabRadius", "hiddenColumns"] as const) {
    const value = raw[key];
    if (typeof value === "string") out[key] = value;
  }

  return out;
}

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

/** Stored JSON as a value, or `null` for nothing, or for something that is
 * not JSON. What it *is* is `sanitizePrefs`'s question, not this one's. */
function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Reads the localStorage mirror, clearing the pre-scoping keys the first time
 * it runs. Synchronous by design — it feeds a `useState` initializer so the
 * panel never renders at the wrong size and then jumps. */
export function readPrefsSync(): MonitorPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;

  const stored = safeParse(safeGet(prefsKey()));
  // Anything that parsed counts as "this project has prefs", even if nothing
  // in it survives — the legacy keys below are only swept on a first run.
  if (stored) return { ...DEFAULT_PREFS, ...sanitizePrefs(stored) };

  // Nothing under this project's key yet. The unscoped keys that may still be
  // sitting on the origin are *not* read: whatever is in them belongs to
  // whichever project on this origin wrote last, and adopting it would hand
  // this project another app's geometry. They are dropped instead, so the
  // origin ends up with one key per project rather than those plus a pile of
  // shared ones nothing will ever read again.
  LEGACY_KEYS.forEach(safeRemove);

  return DEFAULT_PREFS;
}

let prefsWriteTimer: ReturnType<typeof setTimeout> | null = null;

/** Merges a patch, writes the localStorage mirror synchronously, and throttles
 * the IndexedDB write — a resize drag must not produce a transaction per frame. */
export function savePrefs(patch: Partial<MonitorPrefs>): void {
  prefs = { ...prefs, ...patch, rev: prefs.rev + 1 };
  emitPrefs();

  if (typeof window === "undefined") return;
  safeSet(prefsKey(), JSON.stringify(prefs));

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
  // The encrypted wire forms used to be dropped outright — a size guard, since
  // ciphertext is among the largest things an entry can hold. They are now kept
  // under the same per-entry cap as the plaintext bodies (and already bounded a
  // second time, at capture, by `captureEncrypted`), so the guard survives
  // without the tab coming back empty after a reload. Only entries a host
  // explicitly pushed ciphertext for pay anything for this.
  // Skipped entirely when absent, so an app that never calls `captureEncrypted`
  // writes byte-for-byte what 0.2.1 wrote, budget accounting included.
  const encRequest =
    entry.encryptedRequest === undefined
      ? null
      : truncateForPersist(entry.encryptedRequest, PERSIST_MAX_ENTRY_BYTES);
  const encResponse =
    entry.encryptedResponse === undefined
      ? null
      : truncateForPersist(entry.encryptedResponse, PERSIST_MAX_ENTRY_BYTES);

  return {
    ...entry,
    requestPayload: request.value,
    responsePayload: response.value,
    encryptedRequest: encRequest?.value,
    encryptedResponse: encResponse?.value,
    error: error.value,
    schema: NM_SCHEMA_VERSION,
    bytes:
      request.bytes +
      response.bytes +
      (encRequest?.bytes ?? 0) +
      (encResponse?.bytes ?? 0) +
      error.bytes +
      512,
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

/** Returns the delete's outcome so a purge blocked by another tab can be shown
 * to the developer rather than reported as done. */
export async function purgeStorage(): Promise<DeleteOutcome> {
  dirty.clear();
  pendingDeletes.clear();
  writtenBytes.clear();
  budget = { count: 0, bytes: 0 };
  return destroyDb();
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

  const stored = await getMeta<Partial<MonitorPrefs>>("prefs");
  // The localStorage mirror is wiped whenever the host clears web storage
  // (sign-out, failed token refresh); when that happens the IndexedDB copy
  // wins and the mirror is reseeded, so geometry survives a logout.
  // `rev` is read off the raw record, so it is checked like everything else:
  // a copy with no usable revision never wins over the one already loaded.
  if (stored && typeof stored.rev === "number" && stored.rev >= prefs.rev) {
    prefs = { ...DEFAULT_PREFS, ...sanitizePrefs(stored) };
    safeSet(prefsKey(), JSON.stringify(prefs));
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
