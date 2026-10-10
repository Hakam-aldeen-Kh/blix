/**
 * Storage check. Needs no build: it bundles `src/capture` in memory and runs
 * it against a scripted IndexedDB.
 *
 * A database upgrade cannot start while another tab holds a connection to the
 * old version — and a tab still running the previous Blix holds one. What the
 * new tab does while it waits is the whole of this check:
 *
 * - the open must keep waiting, not give up, so that saving starts by itself
 *   when the other tab goes away;
 * - the panel must be able to say that nothing is being saved meanwhile;
 * - nothing may be counted as saved that was not written;
 * - and this build must not be that other tab for the next one: its connection
 *   closes when a later version asks.
 *
 * `node scripts/check-storage.mjs [srcDir]` — the directory defaults to
 * `./src`, and is an argument so the check can be pointed at a scratch copy.
 */

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const from = (file) => JSON.stringify(posix(path.join(src, "capture", file)));

const bundle = await build({
  stdin: {
    contents: `
      export * as storage from ${from("monitorStorage.ts")};
      export * as persistence from ${from("monitorPersistence.ts")};
      export { networkMonitor } from ${from("networkMonitor.ts")};
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "globalThis.window ??= globalThis;" },
});

/** A fresh copy of the capture layer: its database handle, its boot flag and
 * its buffer are module state, and every scenario starts from none of it. */
let copies = 0;
function fresh() {
  copies += 1;
  const code = Buffer.from(`${bundle.outputFiles[0].text}\n// copy ${copies}`).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** `"pending"` if `promise` has not settled within `ms`. */
const settled = (promise, ms = 40) =>
  Promise.race([promise.then((value) => ({ value })), wait(ms).then(() => "pending")]);

/* ─────────────────────────── a scripted IndexedDB ─────────────────────── */

/** An object store that keeps what is put in it and answers asynchronously. */
function fakeDb() {
  const stores = { entries: new Map(), meta: new Map() };
  const db = {
    closed: false,
    onversionchange: null,
    stores,
    objectStoreNames: { contains: () => true },
    close() {
      db.closed = true;
    },
    transaction(name) {
      if (db.closed) throw new Error("InvalidStateError: the connection is closed");
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
      const request = (result) => {
        const r = { result, onsuccess: null, onerror: null };
        setTimeout(() => r.onsuccess?.(), 0);
        return r;
      };
      const map = stores[name];
      tx.objectStore = () => ({
        put: (record) => void map.set(record.id ?? record.key, record),
        delete: (id) => void map.delete(id),
        clear: () => void map.clear(),
        get: (key) => request(map.get(key)),
        getAll: () => request([...map.values()]),
        index: () => ({ openCursor: () => request(null) }),
      });
      setTimeout(() => tx.oncomplete?.(), 2);
      return tx;
    },
  };
  return db;
}

/** Installs an `indexedDB` whose `open` requests the scenario settles by hand. */
function scriptedIndexedDb() {
  const requests = [];
  globalThis.indexedDB = {
    open(name, version) {
      const request = { name, version, result: null, error: null };
      requests.push(request);
      return request;
    },
    deleteDatabase() {
      const r = {};
      setTimeout(() => r.onsuccess?.(), 0);
      return r;
    },
  };
  return {
    requests,
    blocked: (i = requests.length - 1) => requests[i].onblocked?.(),
    succeed(i = requests.length - 1) {
      const db = fakeDb();
      requests[i].result = db;
      requests[i].onsuccess?.();
      return db;
    },
    fail(i = requests.length - 1) {
      requests[i].error = new Error("VersionError");
      requests[i].onerror?.();
    },
  };
}

const record = (id) => ({ id, seq: Number(id.slice(1)), url: `/api/${id}`, schema: 2, bytes: 600 });
const capture = (networkMonitor, id) =>
  networkMonitor.start({ id, method: "GET", url: `/api/${id}`, at: Date.now(), startTime: 0 });

const scenarios = [
  {
    name: "1. an open blocked by another tab keeps waiting, and says it is blocked",
    run: async () => {
      const idb = scriptedIndexedDb();
      const { storage } = await fresh();
      const opening = storage.openDb();
      idb.blocked();
      const state = await settled(opening);
      expect(
        state === "pending",
        `the open settled with ${JSON.stringify(state.value)} while the upgrade was only blocked`,
      );
      expect(storage.getStorageStatus?.() === "blocked", `status is ${storage.getStorageStatus?.()}`);
    },
  },
  {
    name: "2. …and completes by itself once the other tab lets go",
    run: async () => {
      const idb = scriptedIndexedDb();
      const { storage } = await fresh();
      const opening = storage.openDb();
      idb.blocked();
      await wait(10);
      const db = idb.succeed();
      const state = await settled(opening);
      expect(state !== "pending" && state.value === db, "the open did not resolve to the database");
      expect(storage.getStorageStatus?.() === "ready", `status is ${storage.getStorageStatus?.()}`);
      expect((await storage.bulkPut([record("e1")])) === true, "a write after the upgrade was not reported written");
      expect(db.stores.entries.size === 1, "the record is not in the store");
    },
  },
  {
    name: "3. an open connection closes when a later version asks, and the next call reopens",
    run: async () => {
      const idb = scriptedIndexedDb();
      const { storage } = await fresh();
      const opening = storage.openDb();
      const db = idb.succeed();
      await opening;
      expect(typeof db.onversionchange === "function", "no onversionchange handler: this tab would block every later upgrade");
      db.onversionchange();
      expect(db.closed === true, "the handler did not close the connection");
      void storage.openDb();
      expect(idb.requests.length === 2, "the closed connection was handed out again instead of reopening");
    },
  },
  {
    name: "4. a write that did not happen is reported as not written",
    run: async () => {
      const idb = scriptedIndexedDb();
      const { storage } = await fresh();
      const opening = storage.openDb();
      idb.fail();
      expect((await opening) === null, "a failed open did not resolve null");
      expect((await storage.bulkPut([record("e1")])) === false, "bulkPut reported a write with no database");
      expect(storage.getStorageStatus?.() === "unavailable", `status is ${storage.getStorageStatus?.()}`);
    },
  },
  {
    name: "5. with the database unavailable, Preserve log counts nothing as saved",
    run: async () => {
      const idb = scriptedIndexedDb();
      const { persistence, networkMonitor } = await fresh();
      const booting = persistence.bootPersistence();
      idb.fail();
      await booting;
      persistence.setPreserveLog(true);
      for (const id of ["e1", "e2", "e3"]) capture(networkMonitor, id);
      await wait(700);
      const stats = persistence.getPersistedStats();
      expect(stats.count === 0 && stats.bytes === 0, `reports ${stats.count} saved, ${stats.bytes} B, with nothing written`);
      expect(
        persistence.prefsStore.getSnapshot().storage === "unavailable",
        `the panel is told storage is ${persistence.prefsStore.getSnapshot().storage}`,
      );
    },
  },
  {
    name: "6. while blocked: nothing saved, nothing counted, the panel is told — then it all lands",
    run: async () => {
      const idb = scriptedIndexedDb();
      const { persistence, networkMonitor } = await fresh();
      void persistence.bootPersistence();
      await wait(5);
      idb.blocked();
      persistence.setPreserveLog(true);
      for (const id of ["e1", "e2", "e3"]) capture(networkMonitor, id);
      await wait(700);
      const during = persistence.getPersistedStats();
      const snapshot = persistence.prefsStore.getSnapshot();
      expect(during.count === 0, `reports ${during.count} saved while the database is blocked`);
      expect(snapshot.storage === "blocked", `the panel is told storage is ${snapshot.storage}`);

      const db = idb.succeed();
      await wait(900);
      const after = persistence.getPersistedStats();
      expect(db.stores.entries.size === 3, `${db.stores.entries.size} of 3 entries written after the upgrade`);
      expect(after.count === 3, `reports ${after.count} saved with 3 written`);
      expect(persistence.prefsStore.getSnapshot().storage === "ready", "the panel is not told storage came back");
    },
  },
  {
    name: "7. with a working database the saved count is what was written (control)",
    run: async () => {
      const idb = scriptedIndexedDb();
      const { persistence, networkMonitor } = await fresh();
      const booting = persistence.bootPersistence();
      await wait(5);
      const db = idb.succeed();
      await booting;
      persistence.setPreserveLog(true);
      for (const id of ["e1", "e2"]) capture(networkMonitor, id);
      await wait(700);
      const stats = persistence.getPersistedStats();
      expect(db.stores.entries.size === 2 && stats.count === 2, `${db.stores.entries.size} written, ${stats.count} reported`);
    },
  },
];

let failed = 0;
for (const scenario of scenarios) {
  try {
    await scenario.run();
    console.log(`✓ ${scenario.name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${scenario.name}\n    ${message.split("\n")[0].slice(0, 240)}`);
  }
}

console.log(
  `\n${failed === 0 ? "All" : `${failed} of`} ${scenarios.length} scenarios ${failed === 0 ? "passed" : "failed"} — ${posix(src)}`,
);
// Idle flush timers and the prefs write timer may still be pending.
process.exit(failed === 0 ? 0 : 1);
