/**
 * Network monitor — IndexedDB wrapper.
 *
 * ## Why IndexedDB and not localStorage
 *
 * Two independent reasons, either of which is disqualifying:
 *
 * 1. Apps commonly clear web storage on sign-out or a failed token refresh —
 *    a `localStorage.clear()` + `sessionStorage.clear()` from the 401 path is
 *    the usual shape. Any log kept in web storage is destroyed at exactly the
 *    moment a developer most wants to read it. IndexedDB is not touched by
 *    those calls.
 *
 * 2. This app's attachments module returns base64 file content, so a single
 *    response payload can exceed localStorage's entire ~5 MB origin quota — and
 *    `setItem` would serialize it synchronously on the main thread.
 *
 * Please don't "simplify" this back to localStorage.
 *
 * The API is a thin promise wrapper; no dependency is warranted for this much.
 */

import { getActiveDbName, markDbOpened, NM_DB_VERSION } from "./monitorConfig";
import {
  deleteDatabaseByName,
  rememberDatabase,
  type DeleteOutcome,
} from "./monitorDatabases";
import type { PersistedEntry } from "./monitorTypes";

export const ENTRY_STORE = "entries";
export const META_STORE = "meta";

/** Running totals kept alongside the entries so the budget never needs a full
 * recompute. */
export interface BudgetMeta {
  count: number;
  bytes: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Where the database stands, for the panel to say so.
 *
 * - `"idle"` — not asked for yet.
 * - `"ready"` — open; writes land.
 * - `"blocked"` — the open is waiting on another tab. A version upgrade cannot
 *   start while any connection to the old version is open, and a tab still
 *   running a Blix from before the upgrade holds one. Nothing is read or
 *   written until that tab closes or reloads; then the open completes by
 *   itself and everything waiting on it proceeds.
 * - `"unavailable"` — no IndexedDB here, or the open failed (a newer Blix on
 *   this origin has already upgraded the database past this build's version).
 *
 * The last two used to be indistinguishable from "ready" — every call simply
 * did nothing — which is how the panel came to report entries as saved that
 * had never been written.
 */
export type StorageStatus = "idle" | "ready" | "blocked" | "unavailable";

let status: StorageStatus = "idle";
const statusListeners = new Set<() => void>();

function setStatus(next: StorageStatus): void {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* a listener's failure is not storage's */
    }
  });
}

export const getStorageStatus = (): StorageStatus => status;

export function onStorageStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Opens (and if necessary creates) the database. Resolves to `null` when IDB is
 * unavailable — private browsing modes and some embedded webviews block it —
 * so every caller degrades to "no persistence" rather than throwing.
 *
 * While the open is blocked by another tab the promise stays pending: see
 * `StorageStatus`. Resolving `null` there gave up on a request that was still
 * going to succeed — the upgrade ran the moment the other tab closed, into a
 * connection nothing held a reference to and nothing would ever close.
 */
export function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  const opening = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      setStatus("unavailable");
      resolve(null);
      return;
    }
    // Reading the name here is what makes it final: `dbPromise` is memoized,
    // so this runs once per page load and every later `configureDbName` is a
    // no-op it can warn about.
    const name = getActiveDbName();
    markDbOpened();
    rememberDatabase(name);

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, NM_DB_VERSION);
    } catch {
      setStatus("unavailable");
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      // Recreate from scratch on a version bump — see NM_SCHEMA_VERSION: this
      // is a devtool and migrations aren't worth maintaining.
      if (db.objectStoreNames.contains(ENTRY_STORE)) {
        db.deleteObjectStore(ENTRY_STORE);
      }
      if (db.objectStoreNames.contains(META_STORE)) {
        db.deleteObjectStore(META_STORE);
      }
      const entries = db.createObjectStore(ENTRY_STORE, { keyPath: "id" });
      entries.createIndex("by_seq", "seq", { unique: false });
      db.createObjectStore(META_STORE, { keyPath: "key" });
    };

    request.onsuccess = () => {
      const db = request.result;
      // The other half of the same bargain: when a later Blix in another tab
      // wants to upgrade (or the database is being deleted), get out of its
      // way instead of being the tab that blocks it. The next call reopens.
      db.onversionchange = () => {
        db.close();
        if (dbPromise === opening) dbPromise = null;
        setStatus("idle");
      };
      setStatus("ready");
      resolve(db);
    };
    request.onerror = () => {
      setStatus("unavailable");
      resolve(null);
    };
    // Not an outcome — the request is still pending and will fire `success`
    // (or `error`) once the tab holding the old version lets go.
    request.onblocked = () => setStatus("blocked");
  });

  dbPromise = opening;
  return dbPromise;
}

export async function getAllEntries(): Promise<PersistedEntry[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(ENTRY_STORE, "readonly");
    const rows = await req(
      tx.objectStore(ENTRY_STORE).getAll() as IDBRequest<PersistedEntry[]>,
    );
    return rows ?? [];
  } catch {
    return [];
  }
}

/**
 * Whether the records were written. The log is best-effort, so a failure is
 * not an error — but it is not a success either, and the caller keeps count of
 * what is on disk.
 */
export async function bulkPut(records: PersistedEntry[]): Promise<boolean> {
  if (records.length === 0) return true;
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    const store = tx.objectStore(ENTRY_STORE);
    for (const record of records) store.put(record);
    await txDone(tx);
    return true;
  } catch {
    /* quota exceeded or DB closed — the log is best-effort */
    return false;
  }
}

export async function deleteMany(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    const store = tx.objectStore(ENTRY_STORE);
    for (const id of ids) store.delete(id);
    await txDone(tx);
  } catch {
    /* noop */
  }
}

/**
 * Evicts oldest-first until both bounds are satisfied, walking the `by_seq`
 * index with a cursor so nothing is loaded into memory beyond the records being
 * removed. Returns the new totals plus the ids dropped, so the caller can keep
 * its own byte bookkeeping in sync.
 */
export async function evictToFit(
  budget: BudgetMeta,
  maxEntries: number,
  maxBytes: number,
): Promise<{ budget: BudgetMeta; deleted: string[] }> {
  if (budget.count <= maxEntries && budget.bytes <= maxBytes) {
    return { budget, deleted: [] };
  }

  const db = await openDb();
  if (!db) return { budget, deleted: [] };

  let { count, bytes } = budget;
  const deleted: string[] = [];
  try {
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    const index = tx.objectStore(ENTRY_STORE).index("by_seq");
    const cursorReq = index.openCursor(null, "next"); // oldest seq first

    await new Promise<void>((resolve, reject) => {
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || (count <= maxEntries && bytes <= maxBytes)) {
          resolve();
          return;
        }
        const record = cursor.value as PersistedEntry;
        bytes -= record.bytes ?? 0;
        count -= 1;
        deleted.push(record.id);
        cursor.delete();
        cursor.continue();
      };
    });

    await txDone(tx);
  } catch {
    return { budget, deleted: [] };
  }

  return {
    budget: { count: Math.max(0, count), bytes: Math.max(0, bytes) },
    deleted,
  };
}

export async function clearEntries(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    tx.objectStore(ENTRY_STORE).clear();
    await txDone(tx);
  } catch {
    /* noop */
  }
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(META_STORE, "readonly");
    const row = await req(
      tx.objectStore(META_STORE).get(key) as IDBRequest<
        { key: string; value: T } | undefined
      >,
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function putMeta<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({ key, value });
    await txDone(tx);
  } catch {
    /* noop */
  }
}

/**
 * Nuclear option exposed in the panel's overflow menu.
 *
 * Returns the delete's outcome rather than discarding it. The request used to
 * be fired and never observed, so a delete blocked by another tab holding the
 * database open looked identical to a successful one — the panel reported the
 * log purged while it was still on disk.
 */
export async function destroyDb(): Promise<DeleteOutcome> {
  const name = getActiveDbName();
  try {
    const db = await openDb();
    db?.close();
  } catch {
    /* noop */
  }
  // Cleared before the delete, not after: the next `openDb()` must reconnect
  // rather than hand out the closed connection, whether or not the delete
  // itself succeeded.
  dbPromise = null;
  setStatus("idle");
  return deleteDatabaseByName(name);
}
