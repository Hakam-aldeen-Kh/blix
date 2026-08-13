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

import { getActiveDbName, NM_DB_VERSION } from "./monitorConfig";
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
 */
export function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(getActiveDbName(), NM_DB_VERSION);
    } catch {
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

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

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

export async function bulkPut(records: PersistedEntry[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    const store = tx.objectStore(ENTRY_STORE);
    for (const record of records) store.put(record);
    await txDone(tx);
  } catch {
    /* quota exceeded or DB closed — the log is best-effort */
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

/** Nuclear option exposed in the panel's overflow menu. */
export async function destroyDb(): Promise<void> {
  try {
    const db = await openDb();
    db?.close();
  } catch {
    /* noop */
  }
  dbPromise = null;
  try {
    indexedDB.deleteDatabase(getActiveDbName());
  } catch {
    /* noop */
  }
}
