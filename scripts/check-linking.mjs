/**
 * Request-id linking check. Needs no build: it bundles `src/capture` in memory.
 *
 * Every captured request gets one entry id, and everything that points at a
 * request — a query or mutation's `ownerId` / `causedIds`, a failure's
 * `responseFrom`, axios's transport hand-off to the XHR monitor — must point
 * at the right one, or at none. A wrong link is worse than a missing one: the
 * panel shows it as a fact.
 *
 * Grouped by where an id can go wrong:
 *
 * - **XHR** — one `XMLHttpRequest` object carrying more than one request.
 * - **Mutations and queries** — a row id remembered after its row is gone
 *   (paused, cleared), and ids keyed by values two clients can share.
 * - **axios retries** — a 401 retried under the same config.
 * - **fetch** — one rejection value shared by several requests.
 *
 * Each group has a control that passes on correct code, so a failure says the
 * linking is wrong rather than the harness.
 *
 * Runs real axios with a stub adapter, a stub `fetch` and a fake
 * `XMLHttpRequest`, so nothing touches the network.
 *
 * `node scripts/check-linking.mjs [srcDir]` — the directory defaults to
 * `./src`, and is an argument so the check can be pointed at a scratch copy.
 */

import axios, { AxiosError } from "axios";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const from = (file) => JSON.stringify(posix(path.join(src, "capture", file)));

/* ───────────────────────────── fake browser ───────────────────────────── */

globalThis.location ??= { href: "http://localhost/" };

/** XHR answers by URL: `{ status, data, delay }`. */
const xhrRoutes = {};

/**
 * Just enough `XMLHttpRequest` for the monitor. Like the real one, `open()` on
 * a request still in flight drops it without firing any event for it.
 */
class FakeXHR {
  constructor() {
    this.listeners = {};
    this.generation = 0;
    this.readyState = 0;
    this.status = 0;
    this.statusText = "";
    this.responseType = "";
    this.responseText = "";
    this.timeout = 0;
    this.rawHeaders = "";
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  fire(type) {
    for (const fn of [...(this.listeners[type] ?? [])]) fn.call(this, { type });
  }
  open(method, url) {
    this.generation += 1;
    this.method = method;
    this.url = String(url);
    this.readyState = 1;
    this.status = 0;
    this.responseText = "";
    this.rawHeaders = "";
  }
  setRequestHeader() {}
  send() {
    const generation = this.generation;
    const route = xhrRoutes[this.url] ?? { status: 404, data: null };
    setTimeout(() => {
      if (generation !== this.generation) return; // superseded by open()
      this.readyState = 4;
      this.status = route.status;
      this.statusText = route.status === 200 ? "OK" : "Error";
      this.responseText = JSON.stringify(route.data);
      this.rawHeaders = "content-type: application/json\r\n";
      this.fire("load");
      this.fire("loadend");
    }, route.delay ?? 0);
  }
  getAllResponseHeaders() {
    return this.rawHeaders;
  }
  get response() {
    return this.responseText;
  }
}
globalThis.XMLHttpRequest = FakeXHR;

/** What the stub `fetch` does; each scenario sets its own. */
let fetchImpl = () => Promise.reject(new TypeError("no fetch stub for this scenario"));
globalThis.fetch = (input, init) => fetchImpl(input, init);

const xhrDone = (xhr) =>
  new Promise((resolve) => xhr.addEventListener("loadend", () => setTimeout(resolve, 0)));

/* ─────────────────────────────── capture ──────────────────────────────── */

async function loadCapture() {
  const result = await build({
    stdin: {
      contents: `
        export { attachHttpMonitor } from ${from("attachHttp.ts")};
        export { attachFetchMonitor } from ${from("attachFetch.ts")};
        export { attachXhrMonitor } from ${from("attachXhr.ts")};
        export { networkMonitor } from ${from("networkMonitor.ts")};
        export { tapQueryClient } from ${from("queryCapture.ts")};
      `,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
    external: ["axios"],
    define: { "process.env.NODE_ENV": '"development"' },
    banner: { js: "globalThis.window ??= globalThis;" },
  });
  const code = Buffer.from(result.outputFiles[0].text).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}

const { attachHttpMonitor, attachFetchMonitor, attachXhrMonitor, networkMonitor, tapQueryClient } =
  await loadCapture();

attachXhrMonitor();
attachFetchMonitor({ ignore: [] });

/* ─────────────────────────────── helpers ──────────────────────────────── */

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const entries = () => networkMonitor.getSnapshot();
const httpRows = (url) => entries().filter((e) => (e.kind ?? "http") === "http" && e.url === url);
const mutationRows = (hash) => entries().filter((e) => e.method === "MUTATE" && e.query?.hash === hash);
const queryRows = (url) => entries().filter((e) => e.method === "QUERY" && e.url === url);
const only = (rows, what) => {
  expect(rows.length === 1, `expected one row for ${what}, found ${rows.length}`);
  return rows[0];
};

/** A query client stub whose caches emit what the scenario tells them to. */
function fakeClient() {
  const listeners = { query: () => {}, mutation: () => {} };
  const cache = (kind) => ({ subscribe: (fn) => ((listeners[kind] = fn), () => {}), getAll: () => [] });
  const queryCache = cache("query");
  const mutationCache = cache("mutation");
  const client = { getQueryCache: () => queryCache, getMutationCache: () => mutationCache };
  return {
    client,
    tap: () => tapQueryClient(client),
    query: (event) => listeners.query(event),
    mutation: (event) => listeners.mutation(event),
  };
}

/** One mutation object across its life, as TanStack keeps it. `run` calls
 * `mutationFn` off `options`, the way TanStack does. */
function mutationObject(mutationId, mutationFn = () => {}) {
  const mutation = { mutationId, options: { mutationFn }, state: { status: "idle" } };
  return {
    mutation,
    at(status, extra = {}) {
      mutation.state = { status, ...extra };
      return { type: "updated", mutation };
    },
    added: () => ({ type: "added", mutation }),
    run: () => mutation.options.mutationFn(),
  };
}

const jsonResponse = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** An axios instance whose adapter answers per URL from `routes`, each a
 * list played in order — the last one repeats. Not XHR, so the transport
 * hand-off it announces is never claimed by the XHR monitor. */
function instanceWith(routes, defaults = {}) {
  const calls = {};
  return axios.create({
    ...defaults,
    adapter: async (config) => {
      const list = routes[config.url];
      const at = Math.min((calls[config.url] = (calls[config.url] ?? 0) + 1) - 1, list.length - 1);
      const route = list[at];
      if (route.delay) await wait(route.delay);
      const response = {
        data: route.data,
        status: route.status,
        statusText: route.status === 200 ? "OK" : "Error",
        headers: { "content-type": "application/json" },
        config,
      };
      if (route.status >= 400) {
        throw new AxiosError(
          `Request failed with status code ${route.status}`,
          AxiosError.ERR_BAD_RESPONSE,
          config,
          {},
          response,
        );
      }
      return response;
    },
  });
}

class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiError";
  }
}

/** The usual refresh-token interceptor: a 401 is retried once under the same
 * config; any other failure becomes the app's own error. */
function withRefreshRetry(api) {
  api.interceptors.response.use(undefined, (error) => {
    if (error.response?.status === 401 && !error.config._retried) {
      error.config._retried = true;
      return api(error.config);
    }
    return Promise.reject(new ApiError("normalised"));
  });
  attachHttpMonitor(api);
  return api;
}

/* ────────────────────────────── scenarios ─────────────────────────────── */

const scenarios = [
  /* ── XHR ── */
  {
    name: "X1. control: two XHR objects in flight at once each keep their own response",
    run: async () => {
      xhrRoutes["/x1-a"] = { status: 200, data: { from: "a" }, delay: 20 };
      xhrRoutes["/x1-b"] = { status: 200, data: { from: "b" }, delay: 5 };
      const a = new XMLHttpRequest();
      const b = new XMLHttpRequest();
      a.open("GET", "/x1-a");
      b.open("GET", "/x1-b");
      a.send();
      b.send();
      await Promise.all([xhrDone(a), xhrDone(b)]);
      expect(only(httpRows("/x1-a"), "/x1-a").responsePayload?.from === "a", "/x1-a holds another response");
      expect(only(httpRows("/x1-b"), "/x1-b").responsePayload?.from === "b", "/x1-b holds another response");
    },
  },
  {
    name: "X2. one XHR object reused after it finished: the first row keeps the first response",
    run: async () => {
      xhrRoutes["/x2-first"] = { status: 200, data: { from: "first" } };
      xhrRoutes["/x2-second"] = { status: 500, data: { from: "second" } };
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "/x2-first");
      xhr.send();
      await xhrDone(xhr);
      xhr.open("GET", "/x2-second");
      xhr.send();
      await xhrDone(xhr);
      const first = only(httpRows("/x2-first"), "/x2-first");
      expect(
        first.state === "success" && first.status === 200 && first.responsePayload?.from === "first",
        `the first row now reads ${first.state} ${first.status} ${JSON.stringify(first.responsePayload ?? first.error?.response)}`,
      );
      const second = only(httpRows("/x2-second"), "/x2-second");
      expect(second.status === 500, `the second row reads ${second.status}`);
    },
  },
  {
    name: "X3. open() again while a request is in flight: the dropped one ends aborted, not with the next one's answer",
    run: async () => {
      xhrRoutes["/x3-dropped"] = { status: 200, data: { from: "dropped" }, delay: 30 };
      xhrRoutes["/x3-next"] = { status: 200, data: { from: "next" } };
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "/x3-dropped");
      xhr.send();
      xhr.open("GET", "/x3-next");
      xhr.send();
      await xhrDone(xhr);
      await wait(40);
      const dropped = only(httpRows("/x3-dropped"), "/x3-dropped");
      expect(
        dropped.state === "aborted",
        `the dropped row reads ${dropped.state} with ${JSON.stringify(dropped.responsePayload)}`,
      );
      expect(only(httpRows("/x3-next"), "/x3-next").responsePayload?.from === "next", "/x3-next lost its response");
    },
  },

  /* ── mutations and queries ── */
  {
    name: "M1. control: a request made inside mutationFn names the mutation's row as its owner",
    run: async () => {
      fetchImpl = () => Promise.resolve(jsonResponse(200, { ok: true }));
      const c = fakeClient();
      c.tap();
      const m = mutationObject(9101, () => fetch("/m1-save", { method: "POST" }));
      c.mutation(m.added());
      c.mutation(m.at("pending"));
      await m.run();
      await wait(10);
      const row = only(mutationRows("9101"), "mutation 9101");
      const request = only(httpRows("/m1-save"), "/m1-save");
      expect(request.ownerId === row.id, `ownerId is ${request.ownerId}, the row is ${row.id}`);
      expect(row.query?.causedIds?.includes(request.id), "the row does not list the request it caused");
    },
  },
  {
    name: "M2. a mutation added while capture was paused is captured once capture resumes",
    run: async () => {
      fetchImpl = () => Promise.resolve(jsonResponse(200, { ok: true }));
      const c = fakeClient();
      c.tap();
      const m = mutationObject(9102, () => fetch("/m2-save", { method: "POST" }));
      networkMonitor.setPaused(true);
      c.mutation(m.added());
      networkMonitor.setPaused(false);
      c.mutation(m.at("pending"));
      await m.run();
      await wait(10);
      c.mutation(m.at("success", { data: { saved: true } }));
      const rows = mutationRows("9102");
      expect(rows.length === 1, `found ${rows.length} rows for the mutation after resuming`);
      expect(rows[0].state === "success", `the row reads ${rows[0].state}`);
      const request = only(httpRows("/m2-save"), "/m2-save");
      expect(request.ownerId === rows[0].id, `ownerId ${request.ownerId} names no row on screen`);
    },
  },
  {
    name: "M3. a mutation whose row was cleared mid-flight gets a row again at its next status",
    run: async () => {
      const c = fakeClient();
      c.tap();
      const m = mutationObject(9103);
      c.mutation(m.added());
      c.mutation(m.at("pending"));
      only(mutationRows("9103"), "mutation 9103 before the clear");
      networkMonitor.clear((e) => e.kind === "query");
      c.mutation(m.at("error", { error: new ApiError("rejected") }));
      const rows = mutationRows("9103");
      expect(rows.length === 1, `found ${rows.length} rows after it failed`);
      expect(rows[0].state === "error", `the row reads ${rows[0].state}`);
    },
  },
  {
    name: "M4. two query clients with the same mutationId get two rows",
    run: async () => {
      const a = fakeClient();
      const b = fakeClient();
      a.tap();
      b.tap();
      const ma = mutationObject(9104);
      const mb = mutationObject(9104);
      a.mutation(ma.added());
      a.mutation(ma.at("success", { variables: { from: "a" }, data: { from: "a" } }));
      b.mutation(mb.added());
      b.mutation(mb.at("pending", { variables: { from: "b" } }));
      const rows = mutationRows("9104");
      expect(rows.length === 2, `found ${rows.length} row(s) for two different mutations`);
      const fromA = rows.find((r) => r.requestPayload?.from === "a");
      expect(fromA?.state === "success", `client A's mutation now reads ${fromA?.state}`);
    },
  },
  {
    name: "M5. a new query client after dispose (HMR) does not write into the old client's mutation row",
    run: async () => {
      const old = fakeClient();
      const dispose = old.tap();
      const before = mutationObject(9105);
      old.mutation(before.added());
      old.mutation(before.at("success", { data: { from: "old" } }));
      dispose();

      const fresh = fakeClient();
      fresh.tap();
      // A new MutationCache counts from the start again.
      const after = mutationObject(9105);
      fresh.mutation(after.added());
      fresh.mutation(after.at("error", { error: new ApiError("new client") }));

      const rows = mutationRows("9105");
      expect(rows.length === 2, `found ${rows.length} row(s): the new mutation was merged or lost`);
      expect(
        rows.some((r) => r.state === "success" && r.responsePayload?.from === "old"),
        "the old mutation's row was overwritten",
      );
    },
  },
  {
    name: "M6. two query clients with the same query key get two rows",
    run: async () => {
      const a = fakeClient();
      const b = fakeClient();
      a.tap();
      b.tap();
      const query = (data) => ({
        queryHash: '["m6-user"]',
        queryKey: ["m6-user"],
        state: { status: "success", data, fetchStatus: "idle" },
      });
      a.query({ type: "added", query: query({ name: "A" }) });
      a.query({ type: "updated", query: query({ name: "A" }), action: { type: "success" } });
      b.query({ type: "added", query: query({ name: "B" }) });
      b.query({ type: "updated", query: query({ name: "B" }), action: { type: "success" } });
      const rows = queryRows('["m6-user"]');
      expect(rows.length === 2, `found ${rows.length} row(s) for two clients' caches`);
    },
  },

  /* ── axios retries ── */
  {
    name: "R1. control: a 401 retried under the same config — the 401 row and the retry row stay apart",
    run: async () => {
      const api = withRefreshRetry(
        instanceWith({ "/r1-me": [{ status: 401, data: { e: "expired" } }, { status: 200, data: { name: "me" } }] }),
      );
      const response = await api.get("/r1-me");
      expect(response.data?.name === "me", "the caller did not get the retry's response");
      const rows = httpRows("/r1-me");
      expect(rows.length === 2, `found ${rows.length} rows for a request and its retry`);
      const original = rows.find((r) => r.status === 401);
      const retry = rows.find((r) => r.status === 200);
      expect(original?.state === "error", `the 401 row reads ${original?.state}`);
      expect(retry?.state === "success" && retry.responsePayload?.name === "me", `the retry row reads ${retry?.state}`);
    },
  },
  {
    name: "R2. a retry that fails too: the failed mutation names the retry's request, not the 401",
    run: async () => {
      const api = withRefreshRetry(
        instanceWith({
          "/r2-me": [
            { status: 401, data: { e: "expired" } },
            { status: 500, data: { message: "server down" } },
          ],
        }),
      );
      const c = fakeClient();
      c.tap();
      let thrown;
      const m = mutationObject(9201, () => api.get("/r2-me").catch((e) => (thrown = e)));
      c.mutation(m.added());
      c.mutation(m.at("pending"));
      await m.run();
      expect(thrown instanceof ApiError, "the caller did not get the app's error");
      c.mutation(m.at("error", { error: thrown }));

      const rows = httpRows("/r2-me");
      const retry = rows.find((r) => r.status === 500);
      expect(retry, "the retry has no row");
      const row = only(mutationRows("9201"), "mutation 9201");
      const named = entries().find((e) => e.id === row.error?.responseFrom);
      expect(
        row.error?.responseFrom === retry.id,
        `responseFrom names ${named ? `the ${named.status} row` : JSON.stringify(row.error?.responseFrom)} (${row.error?.responseMatch})`,
      );
      expect(row.error?.response?.message === "server down", `borrowed ${JSON.stringify(row.error?.response)}`);
    },
  },
  {
    name: "R3. control: after an ordinary axios request, a plain XHR to the same path is still captured",
    run: async () => {
      const api = instanceWith({ "/r3-me": [{ status: 200, data: {} }] }, { baseURL: "http://localhost" });
      attachHttpMonitor(api);
      await api.get("/r3-me");
      xhrRoutes["http://localhost/r3-me"] = { status: 200, data: { from: "xhr" } };
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "http://localhost/r3-me");
      xhr.send();
      await xhrDone(xhr);
      expect(httpRows("http://localhost/r3-me").length === 1, "the plain XHR was taken for the axios request");
    },
  },
  {
    name: "R4. after a 401 retried by a non-XHR adapter, a plain XHR to the same path is still captured",
    run: async () => {
      const api = withRefreshRetry(
        instanceWith(
          { "/r4-me": [{ status: 401, data: {} }, { status: 200, data: { name: "me" } }] },
          { baseURL: "http://localhost" },
        ),
      );
      await api.get("/r4-me");
      xhrRoutes["http://localhost/r4-me"] = { status: 200, data: { from: "xhr" } };
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "http://localhost/r4-me");
      xhr.send();
      await xhrDone(xhr);
      expect(
        httpRows("http://localhost/r4-me").length === 1,
        "the plain XHR was silently dropped: the 401's transport hand-off was never released",
      );
    },
  },

  /* ── fetch ── */
  {
    name: "F1. control: an error carrying the fetch Response leads its mutation to that request exactly",
    run: async () => {
      fetchImpl = (input) => Promise.resolve(jsonResponse(409, { from: String(input) }));
      const c = fakeClient();
      c.tap();
      let thrown;
      const m = mutationObject(9301, () =>
        fetch("/f1-mine").then((r) => {
          if (!r.ok) throw (thrown = Object.assign(new Error(`HTTP ${r.status}`), { response: r }));
        }),
      );
      c.mutation(m.added());
      c.mutation(m.at("pending"));
      // Fails alike at the same moment: a guess by status could take either.
      await Promise.allSettled([m.run(), fetch("/f1-other")]);
      await wait(10);
      c.mutation(m.at("error", { error: thrown }));
      const row = only(mutationRows("9301"), "mutation 9301");
      const mine = only(httpRows("/f1-mine"), "/f1-mine");
      expect(row.error?.responseMatch === "exact", `matched by ${row.error?.responseMatch}`);
      expect(row.error?.responseFrom === mine.id, "responseFrom does not name /f1-mine");
    },
  },
  {
    name: "F2. one abort shared by two fetches never links a mutation to the other request",
    run: async () => {
      fetchImpl = (_input, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(init.signal.reason)),
        );
      const controller = new AbortController();
      const c = fakeClient();
      c.tap();
      const m = mutationObject(9302, () => fetch("/f2-mine", { signal: controller.signal }));
      c.mutation(m.added());
      c.mutation(m.at("pending"));
      const mine = m.run().catch((e) => e);
      const other = fetch("/f2-other", { signal: controller.signal }).catch(() => {});
      // No reason given: the signal's one AbortError rejects both fetches.
      controller.abort();
      const thrown = await mine;
      await other;
      await wait(10);
      expect(thrown === controller.signal.reason, "the caller did not get the signal's reason");
      c.mutation(m.at("error", { error: thrown }));
      const row = only(mutationRows("9302"), "mutation 9302");
      const otherRow = only(httpRows("/f2-other"), "/f2-other");
      expect(
        row.error?.responseFrom !== otherRow.id,
        `the mutation is linked to /f2-other (${row.error?.responseMatch}) — a request it never made`,
      );
    },
  },
  {
    name: "F3. a fetch Response thrown as it is leads its mutation to that request exactly",
    run: async () => {
      fetchImpl = (input) => Promise.resolve(jsonResponse(409, { from: String(input) }));
      const c = fakeClient();
      c.tap();
      let thrown;
      const m = mutationObject(9303, () =>
        fetch("/f3-mine").then((r) => {
          if (!r.ok) throw (thrown = r);
        }),
      );
      c.mutation(m.added());
      c.mutation(m.at("pending"));
      await Promise.allSettled([m.run(), fetch("/f3-other")]);
      await wait(10);
      c.mutation(m.at("error", { error: thrown }));
      const row = only(mutationRows("9303"), "mutation 9303");
      const mine = only(httpRows("/f3-mine"), "/f3-mine");
      expect(
        row.error?.responseFrom === mine.id,
        `responseFrom is ${JSON.stringify(row.error?.responseFrom)} (${row.error?.responseMatch}), not /f3-mine`,
      );
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
process.exit(failed === 0 ? 0 : 1);
