/**
 * Hydration check. Needs no build: it bundles `src/capture` in memory.
 *
 * When the panel boots with "Preserve log" on, the saved entries are merged
 * into whatever has been captured since the page loaded. That merge used to
 * end with a flat cut to the newest 200 entries of *everything* — the network
 * pool's quota applied across all three pools — so a busy Redux session cost
 * the HTTP log its older rows, and a pinned row or an open socket was dropped
 * like any other if it was old enough. It now trims with the same policy live
 * capture uses; this asserts that policy holds on the way in.
 *
 * `node scripts/check-hydration.mjs [srcDir]` — the directory defaults to
 * `./src`. Nothing is written to disk.
 */

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const from = (file) => JSON.stringify(posix(path.join(src, "capture", file)));

const bundled = await build({
  stdin: {
    contents: `
      export { networkMonitor } from ${from("networkMonitor.ts")};
      export { LOAD_ID, NM_SCHEMA_VERSION, POOL_OF, POOL_QUOTA } from ${from("monitorConfig.ts")};
      export { bootPersistence } from ${from("monitorPersistence.ts")};
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
  // Capture is on only in development and only in a browser.
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "globalThis.window ??= globalThis;" },
});
const code = Buffer.from(bundled.outputFiles[0].text).toString("base64");

/** A fresh store per scenario: the monitor is a module singleton, and a
 * distinct URL is a distinct module instance. */
let instance = 0;
const freshStore = () => import(`data:text/javascript;base64,${code}#${(instance += 1)}`);

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const T0 = 1_700_000_000_000;
/** A stored record. `age` orders it: larger is older. */
const record = (id, kind, age, extra = {}) => ({
  id,
  kind,
  method: kind === "ws" ? "WS" : "GET",
  url: `/${kind}/${id}`,
  at: T0 - age,
  startTime: 0,
  startAbs: T0 - age,
  timeOrigin: T0 - age,
  seq: 100_000 - age,
  rev: 0,
  state: "success",
  loadId: "an-earlier-load",
  sizeBytes: 0,
  ...extra,
});

/** `count` records of `kind`, ages `from`… — so `from` sets how old the batch is. */
const batch = (kind, count, from) =>
  Array.from({ length: count }, (_, i) => record(`${kind}-${i}`, kind, from + i));

function hydrate(store, records) {
  const evicted = [];
  let cleared = 0;
  store.networkMonitor.setSink({
    onDirty() {},
    onEvict: (ids) => evicted.push(...ids),
    onClear: () => (cleared += 1),
  });
  store.networkMonitor.mergeHydrated(records);
  const entries = store.networkMonitor.getSnapshot();
  const perPool = { net: 0, redux: 0, query: 0 };
  for (const entry of entries) perPool[store.POOL_OF[entry.kind ?? "http"]] += 1;
  return { entries, ids: new Set(entries.map((e) => e.id)), evicted, perPool, cleared };
}

/**
 * Just enough IndexedDB for `bootPersistence` to read a stored log: one
 * database, the two stores Blix uses, requests that settle on a later tick as
 * real ones do. Seeded with the entries and the prefs a previous session left.
 */
function fakeIndexedDB(entries, prefs) {
  const stores = {
    entries: new Map(entries.map((r) => [r.id, r])),
    meta: new Map([["prefs", { key: "prefs", value: prefs }]]),
  };
  const request = (compute) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    setTimeout(() => {
      req.result = compute();
      req.onsuccess?.();
    }, 0);
    return req;
  };
  const objectStore = (name) => ({
    getAll: () => request(() => [...stores[name].values()]),
    get: (key) => request(() => stores[name].get(key)),
    put: (value) => request(() => void stores[name].set(value.id ?? value.key, value)),
    delete: (key) => request(() => void stores[name].delete(key)),
    clear: () => request(() => stores[name].clear()),
    index: () => ({ openCursor: () => request(() => null) }),
  });
  const db = {
    objectStoreNames: { contains: (name) => name in stores },
    close() {},
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null, objectStore };
      setTimeout(() => tx.oncomplete?.(), 5);
      return tx;
    },
  };
  return {
    open() {
      const req = { result: db, onsuccess: null, onerror: null, onblocked: null };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
  };
}

const scenarios = [
  {
    name: "5. boot: a pinned record with the lowest seq, behind 300 newer ones, is restored",
    run: async () => {
      const store = await freshStore();
      const stored = (id, seq, extra = {}) => ({
        ...record(id, "http", 100_000 - seq, extra),
        seq,
        schema: store.NM_SCHEMA_VERSION,
        bytes: 600,
      });
      const records = [
        stored("pinned-old", 1, { pinned: true }),
        ...Array.from({ length: 300 }, (_, i) => stored(`stored-${i}`, 1000 + i)),
      ];
      globalThis.indexedDB = fakeIndexedDB(records, { rev: 1, preserveLog: true });

      // What boot hands to the store, as well as what the store then keeps:
      // the pin used to be cut before `mergeHydrated` could protect it.
      const handed = [];
      const merge = store.networkMonitor.mergeHydrated.bind(store.networkMonitor);
      store.networkMonitor.mergeHydrated = (list) => {
        handed.push(...list.map((r) => r.id));
        return merge(list);
      };
      try {
        await store.bootPersistence();
      } finally {
        delete globalThis.indexedDB;
      }

      expect(handed.length > 0, "bootPersistence restored nothing — the fake database was not read");
      expect(handed.includes("pinned-old"), "the pinned record never reached mergeHydrated");
      const ids = new Set(store.networkMonitor.getSnapshot().map((e) => e.id));
      expect(ids.has("pinned-old"), "the pinned record is not in the restored log");
      expect(ids.has("stored-299") && !ids.has("stored-0"), "the unpinned cut kept the wrong end");
      expect(ids.size === store.POOL_QUOTA.net + 1, `${ids.size} entries restored, expected 201`);
    },
  },
  {
    name: "1. 250 redux + 50 net (1 pinned, 1 open ws): nothing is dropped, pools within quota",
    run: async () => {
      const store = await freshStore();
      const records = [
        ...batch("redux", 250, 0),
        ...batch("http", 48, 1000),
        // The two oldest things in the log: only their protection keeps them.
        record("pinned-net", "http", 9000, { pinned: true }),
        record("open-ws", "ws", 9001, { state: "pending", loadId: store.LOAD_ID, frames: [] }),
      ];
      const out = hydrate(store, records);
      expect(out.entries.length === 300, `${out.entries.length} of 300 entries survived`);
      expect(out.ids.has("pinned-net"), "the pinned entry was dropped");
      expect(out.ids.has("open-ws"), "the open realtime connection was dropped");
      for (const pool of Object.keys(out.perPool)) {
        expect(
          out.perPool[pool] <= store.POOL_QUOTA[pool],
          `${pool} holds ${out.perPool[pool]}, over its quota of ${store.POOL_QUOTA[pool]}`,
        );
      }
      expect(out.evicted.length === 0, `${out.evicted.length} ids reported evicted, expected none`);
    },
  },
  {
    name: "2. over capacity: each pool is cut to its own quota, pins and open sockets are kept",
    run: async () => {
      const store = await freshStore();
      const records = [
        ...batch("redux", 450, 0),
        ...batch("http", 260, 1000),
        record("pinned-net", "http", 9000, { pinned: true }),
        record("open-ws", "ws", 9001, { state: "pending", loadId: store.LOAD_ID, frames: [] }),
      ];
      const out = hydrate(store, records);
      expect(out.ids.has("pinned-net"), "the pinned entry was dropped");
      expect(out.ids.has("open-ws"), "the open realtime connection was dropped");
      expect(
        out.perPool.redux === store.POOL_QUOTA.redux,
        `redux holds ${out.perPool.redux}, expected its quota of ${store.POOL_QUOTA.redux}`,
      );
      // The two protected entries sit outside the budget, on top of the quota.
      expect(
        out.perPool.net === store.POOL_QUOTA.net + 2,
        `net holds ${out.perPool.net}, expected ${store.POOL_QUOTA.net} + the 2 protected`,
      );
      // Oldest out, newest kept.
      expect(out.ids.has("http-0") && !out.ids.has("http-259"), "the wrong end of net was cut");
      expect(out.ids.has("redux-0") && !out.ids.has("redux-449"), "the wrong end of redux was cut");
    },
  },
  {
    name: "3. …and exactly the dropped ids were reported to the persistence sink",
    run: async () => {
      const store = await freshStore();
      const records = [...batch("redux", 450, 0), ...batch("http", 260, 1000)];
      const out = hydrate(store, records);
      const dropped = records.map((r) => r.id).filter((id) => !out.ids.has(id));
      expect(dropped.length === 150 + 60, `${dropped.length} entries dropped, expected 210`);
      expect(
        out.evicted.length === dropped.length && dropped.every((id) => out.evicted.includes(id)),
        `the sink was told about ${out.evicted.length} evictions, expected ${dropped.length}`,
      );
      expect(out.cleared === 0, "the sink was told the log was cleared");
    },
  },
  {
    name: "4. live entries captured before hydration are not displaced by restored ones",
    run: async () => {
      const store = await freshStore();
      for (let i = 0; i < 300; i += 1) {
        store.networkMonitor.start({
          id: `live-redux-${i}`,
          kind: "redux",
          method: "slice",
          url: "slice/action",
          at: Date.now(),
          startTime: i,
          state: "success",
        });
      }
      const out = hydrate(store, batch("http", 150, 1000));
      expect(out.perPool.net === 150, `${out.perPool.net} of 150 restored HTTP rows survived`);
      expect(out.perPool.redux === 300, `${out.perPool.redux} of 300 live Redux rows survived`);
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
    console.log(`✗ ${scenario.name}\n    ${message.split("\n")[0]}`);
  }
}

console.log(
  `\n${failed === 0 ? "All" : `${failed} of`} ${scenarios.length} scenarios ${failed === 0 ? "passed" : "failed"} — ${posix(src)}`,
);
process.exit(failed === 0 ? 0 : 1);
