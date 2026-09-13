/**
 * Network monitor — the origin's Blix databases: enumerating them, sizing
 * them, and deleting them.
 *
 * IndexedDB is scoped to the origin, so a developer running several projects
 * on one `localhost` port accumulates one database per project (plus, from
 * before names were prefixed, one shared `nm-devtools` holding a mix of all of
 * them). Nothing else in the codebase looks outside the *active* database;
 * this module is the panel's only view of the rest, and it never touches a
 * database it did not itself name.
 *
 * Imports `monitorConfig` only. `monitorStorage.ts` depends on this file (for
 * `rememberDatabase` and `deleteDatabaseByName`), so the dependency runs one
 * way and there is no cycle.
 */

import { DB_PREFIX, getActiveDbName, LEGACY_DB_NAME } from "./monitorConfig";

/**
 * Names Blix has itself opened on this origin.
 *
 * The one key that is deliberately *not* scoped per project — it is the
 * origin-level index, and a per-project copy could only ever list the project
 * that wrote it, which is exactly the question this screen exists to answer.
 * It holds names and nothing else, so nothing captured leaks between projects
 * through it.
 */
const REGISTRY_KEY = `${DB_PREFIX}databases`;

/** How long to wait for a `deleteDatabase` that has gone quiet before calling
 * it blocked. Chrome fires `onblocked` promptly; this is the backstop for
 * engines that simply never settle the request. */
const DELETE_TIMEOUT_MS = 4000;

/**
 * Store names, duplicated from `monitorStorage.ts` rather than imported —
 * importing them would make this module depend on the one that depends on it.
 *
 * They are also not quite the same constants: those name the stores this
 * version *creates*, while these name the stores we hope to find in a database
 * some other version wrote. Every read below checks for their presence first
 * and degrades to an empty result, so a database that predates either store is
 * reported as empty rather than throwing.
 */
const ENTRY_STORE = "entries";
const META_STORE = "meta";

export interface BlixDatabase {
  name: string;
  /** Approximate bytes as last recorded by the writing panel, or `null` when
   * the database has no budget record (nothing was ever persisted to it) or
   * could not be probed. */
  bytes: number | null;
  /** Written before names were prefixed, and potentially a mix of several
   * projects' entries. */
  legacy: boolean;
  /** The database this panel instance is using. */
  active: boolean;
}

export interface DatabaseListing {
  databases: BlixDatabase[];
  /**
   * True when `indexedDB.databases()` was unavailable and the list came from
   * the registry instead, so databases written by a Blix old enough to predate
   * the registry — or by a project never opened in this browser — are missing
   * from it.
   */
  partial: boolean;
}

export type DeleteOutcome =
  | { ok: true }
  | { ok: false; reason: "blocked" | "error" | "unsupported"; message: string };

/* ─────────────────────────────── registry ─────────────────────────────── */

function readRegistry(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((n): n is string => typeof n === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRegistry(names: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(names));
  } catch {
    /* quota / privacy mode — the registry is a convenience, not a source of
       truth, and every engine that lacks it also has indexedDB.databases() */
  }
}

/** Records a name as belonging to Blix. Called from `openDb()`, so the
 * registry only ever grows by databases this origin actually opened. */
export function rememberDatabase(name: string): void {
  const known = readRegistry();
  if (known.includes(name)) return;
  writeRegistry([...known, name]);
}

function forgetDatabase(name: string): void {
  const known = readRegistry();
  if (!known.includes(name)) return;
  writeRegistry(known.filter((n) => n !== name));
}

/* ────────────────────────────── enumeration ───────────────────────────── */

/** Ours, and only ours: the prefix plus the one unprefixed name Blix is known
 * to have used. Anything else on the origin belongs to the host app. */
function isBlixDatabase(name: string): boolean {
  return name.startsWith(DB_PREFIX) || name === LEGACY_DB_NAME;
}

/**
 * Approximate size, read from the database's own `meta.budget` record — the
 * running total the writing panel keeps so the persistence budget never needs
 * a full recompute.
 *
 * Opens **without a version**, which is what makes this cheap and safe: no
 * `upgradeneeded`, no schema rewrite, no blocking another tab's connection,
 * and exactly one record read rather than a scan of the store. A database that
 * has never persisted anything simply has no budget record and reports `null`.
 */
function probeSize(name: string): Promise<number | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name);
    } catch {
      resolve(null);
      return;
    }

    // Only reachable if the database vanished between enumeration and here.
    // Aborting keeps this probe from being the thing that creates it.
    request.onupgradeneeded = () => {
      try {
        request.transaction?.abort();
      } catch {
        /* noop */
      }
      resolve(null);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      try {
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction(META_STORE, "readonly");
        const get = tx.objectStore(META_STORE).get("budget") as IDBRequest<
          { key: string; value?: { bytes?: number } } | undefined
        >;
        get.onsuccess = () => {
          const bytes = get.result?.value?.bytes;
          db.close();
          resolve(typeof bytes === "number" ? bytes : null);
        };
        get.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        try {
          db.close();
        } catch {
          /* noop */
        }
        resolve(null);
      }
    };
  });
}

/**
 * Every Blix database on this origin.
 *
 * `indexedDB.databases()` is not implemented in Firefox, and there is no other
 * way to enumerate an origin's databases. The fallback is the registry — names
 * Blix wrote down as it opened them — plus the two names we can name without
 * being told: the active database and the legacy one. That list can only
 * under-report, never over-report a project's data, so `partial` is surfaced
 * to the user rather than being silently papered over.
 */
export async function listDatabases(): Promise<DatabaseListing> {
  const active = getActiveDbName();
  if (typeof indexedDB === "undefined") {
    return { databases: [], partial: true };
  }

  let names: string[];
  let partial: boolean;

  const enumerate = (
    indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> }
  ).databases;

  if (typeof enumerate === "function") {
    try {
      const infos = await enumerate.call(indexedDB);
      names = infos
        .map((info) => info.name)
        .filter((name): name is string => typeof name === "string");
      partial = false;
    } catch {
      names = readRegistry();
      partial = true;
    }
  } else {
    names = readRegistry();
    partial = true;
  }

  if (partial) {
    // The legacy database is the whole point of this screen on the first run
    // after upgrading, and it predates the registry by definition. Deleting a
    // database that does not exist is a no-op, so offering the row costs
    // nothing where it is already gone.
    names = [...names, active, LEGACY_DB_NAME];
  }

  const unique = Array.from(new Set(names.filter(isBlixDatabase)));
  const sizes = await Promise.all(unique.map((name) => probeSize(name)));

  const databases = unique.map((name, i) => ({
    name,
    bytes: sizes[i] ?? null,
    legacy: name === LEGACY_DB_NAME,
    active: name === active,
  }));

  // Active first, then legacy, then alphabetical — the two rows a developer
  // came here for are the two that should not need looking for.
  databases.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.legacy !== b.legacy) return a.legacy ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { databases, partial };
}

/* ──────────────────────────────── peeking ─────────────────────────────── */

/** How many entries a peek reads. Bounded because the cursor deserializes each
 * record in full — bodies included — and a persisted entry can be 512 KB. One
 * record is live at a time, so the cap bounds the walk, not peak memory. */
const PEEK_LIMIT = 50;

/** The columns a peek shows. Deliberately the identifying ones only: a peek
 * answers "whose log is this?", and the panel proper answers everything else. */
export interface PeekEntry {
  id: string;
  kind: string;
  method: string;
  url: string;
  status?: number;
  state: string;
  /** Wall-clock epoch ms, so entries from a previous page load stay comparable
   * — `startTime` is relative to a per-load origin and would not be. */
  at: number;
}

/**
 * The newest entries in a database this panel is not using.
 *
 * Opens without a version, walks the `by_seq` index newest-first, projects each
 * record down to the identifying columns, and closes. Read-only in the strong
 * sense: a `readonly` transaction cannot write, and the connection is closed
 * before the promise resolves, so it never holds a database open against that
 * project's own tab or against `deleteDatabase`.
 *
 * The entries are a snapshot, not a subscription — there is no live view of
 * another database, by design.
 */
export function peekDatabase(name: string): Promise<PeekEntry[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve([]);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name);
    } catch {
      resolve([]);
      return;
    }

    request.onupgradeneeded = () => {
      // The database vanished between listing and here. Abort rather than let
      // the probe be the thing that creates it.
      try {
        request.transaction?.abort();
      } catch {
        /* noop */
      }
      resolve([]);
    };
    request.onerror = () => resolve([]);
    request.onblocked = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      const finish = (rows: PeekEntry[]) => {
        try {
          db.close();
        } catch {
          /* noop */
        }
        resolve(rows);
      };

      try {
        if (!db.objectStoreNames.contains(ENTRY_STORE)) {
          finish([]);
          return;
        }
        const tx = db.transaction(ENTRY_STORE, "readonly");
        const store = tx.objectStore(ENTRY_STORE);
        if (!store.indexNames.contains("by_seq")) {
          finish([]);
          return;
        }

        const rows: PeekEntry[] = [];
        const cursorReq = store.index("by_seq").openCursor(null, "prev");
        cursorReq.onerror = () => finish(rows);
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || rows.length >= PEEK_LIMIT) {
            finish(rows);
            return;
          }
          const record = cursor.value as Record<string, unknown>;
          rows.push({
            id: String(record.id ?? ""),
            kind: typeof record.kind === "string" ? record.kind : "http",
            method: typeof record.method === "string" ? record.method : "",
            url: typeof record.url === "string" ? record.url : "",
            status: typeof record.status === "number" ? record.status : undefined,
            state: typeof record.state === "string" ? record.state : "",
            at: typeof record.at === "number" ? record.at : 0,
          });
          cursor.continue();
        };
      } catch {
        finish([]);
      }
    };
  });
}

/* ─────────────────────────────── deletion ─────────────────────────────── */

/**
 * Deletes a database, observing the request instead of firing and forgetting.
 *
 * `deleteDatabase` has three ways to not succeed and the fire-and-forget form
 * reports none of them. `blocked` is the common one and is not an error: an
 * open connection in another tab (or in this one) holds the database, and the
 * delete stays pending until that connection closes — potentially forever, so
 * it must be surfaced rather than awaited indefinitely.
 */
export function deleteDatabaseByName(name: string): Promise<DeleteOutcome> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve({
      ok: false,
      reason: "unsupported",
      message: "IndexedDB is not available in this browser context.",
    });
  }

  return new Promise<DeleteOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: DeleteOutcome) => {
      if (settled) return;
      settled = true;
      if (outcome.ok) forgetDatabase(name);
      resolve(outcome);
    };

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.deleteDatabase(name);
    } catch (error) {
      settle({
        ok: false,
        reason: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const blocked = () =>
      settle({
        ok: false,
        reason: "blocked",
        message:
          `"${name}" is held open by another tab on this origin. Close the ` +
          `other tabs running this app and try again.`,
      });

    const timer = setTimeout(blocked, DELETE_TIMEOUT_MS);
    const done = (outcome: DeleteOutcome) => {
      clearTimeout(timer);
      settle(outcome);
    };

    request.onsuccess = () => done({ ok: true });
    request.onerror = () =>
      done({
        ok: false,
        reason: "error",
        message: request.error?.message ?? `Could not delete "${name}".`,
      });
    // Fires while the delete stays pending. Reported immediately — if the
    // blocking connection does close later the delete still completes, and the
    // next listing will simply not show the row.
    request.onblocked = () => {
      clearTimeout(timer);
      blocked();
    };
  });
}
