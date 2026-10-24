/**
 * The page `check-adversarial.mjs` drives: hard cases built to break Blix's
 * links, ownership, timing and diffs, each checked against what is known for
 * certain — every request carries a unique tag `t`, and the server's delay and
 * status are set by the scenario, so which answer belongs to which request is
 * never in doubt.
 *
 * A scenario is `run` (do the hard thing) then `verify` (read Blix's log and
 * say, check by check, whether it is right). A wrong answer fails; so does a
 * missing one where the truth was knowable.
 */

import { configureStore, createSlice } from "@reduxjs/toolkit";
import { QueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  attachFetchMonitor,
  attachHttpMonitor,
  createReduxMonitorMiddleware,
  tapQueryClient,
} from "../../src/capture/index";
import { attachXhrMonitor } from "../../src/capture/attachXhr";
import { getOwner } from "../../src/capture/monitorContext";
import { networkMonitor } from "../../src/capture/networkMonitor";
import type { MonitorEntry } from "../../src/capture/monitorTypes";

attachFetchMonitor();
attachXhrMonitor();

/* ── clients ───────────────────────────────────────────────────────────── */

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const api = axios.create({ timeout: 2000 });
api.interceptors.request.use(async (config) => {
  if (config.headers.get("x-refuse-async")) return Promise.reject(new Error("refused later"));
  return config;
});
// The usual refresh-token interceptor: a 401 is retried under the same config,
// up to twice; anything else becomes the app's own error.
api.interceptors.response.use(undefined, (error) => {
  const config = error.config;
  if (error.response?.status === 401 && (config._tries ?? 0) < 2) {
    config._tries = (config._tries ?? 0) + 1;
    return api(config);
  }
  return Promise.reject(new ApiError("normalised"));
});
attachHttpMonitor(api);

// An interceptor registered after Blix: axios runs it before Blix's.
const late = axios.create({ timeout: 2000 });
attachHttpMonitor(late);
late.interceptors.request.use((config) => {
  if (config.headers.get("x-refuse")) throw new Error("late interceptor refused");
  return config;
});

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
tapQueryClient(qc as never);
const getJ = (t: string, extra = "") => fetch(`/x/json?t=${t}${extra}`).then((r) => r.json());
// A second client whose queries share one default queryFn.
const qc2 = new QueryClient({
  defaultOptions: { queries: { retry: false, queryFn: ({ queryKey }) => getJ(String(queryKey[1])) } },
});
tapQueryClient(qc2 as never);

/* ── Redux ─────────────────────────────────────────────────────────────── */

const log: { type: string; before: unknown; after: unknown }[] = [];
const recorder = (store: { getState(): unknown }) => (next: (a: unknown) => unknown) => (action: unknown) => {
  const before = store.getState();
  const result = next(action);
  log.push({ type: (action as { type: string }).type, before, after: store.getState() });
  return result;
};
const counter = createSlice({
  name: "counter",
  initialState: { n: 0, tag: "" },
  reducers: {
    tick(state) {
      state.n += 1;
    },
    tagged(state, action: { payload: string }) {
      state.tag = action.payload;
    },
  },
});
const noise = createSlice({
  name: "noise",
  initialState: { hits: 0 },
  reducers: {
    hit(state) {
      state.hits += 1;
    },
  },
});
const big = createSlice({
  name: "big",
  initialState: { list: [] as number[] },
  reducers: {
    fill(state, action: { payload: number }) {
      for (let i = 0; i < action.payload; i += 1) state.list.push(i);
    },
  },
});
const store = configureStore({
  reducer: { counter: counter.reducer, noise: noise.reducer, big: big.reducer },
  middleware: (d) =>
    d({ serializableCheck: false, immutableCheck: false })
      .prepend(recorder as never)
      .concat(createReduxMonitorMiddleware({ ignore: ["noise/*"] }) as never),
});

/* ── helpers ───────────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const swallow = (p: Promise<unknown>) => p.then(() => {}, () => {});
const block = (ms: number) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    /* the main thread is busy */
  }
};
const entries = (): MonitorEntry[] => networkMonitor.getSnapshot();
const tagOf = (e: MonitorEntry) => {
  try {
    return new URL(`${e.baseURL ?? ""}${e.url}`, location.href).searchParams.get("t");
  } catch {
    return null;
  }
};
const rows = (t: string) => entries().filter((e) => (e.kind ?? "http") === "http" && tagOf(e) === t);
const row = (t: string) => rows(t)[0];
const queryRow = (key: unknown[]) =>
  entries().find((e) => e.kind === "query" && e.query?.sub === "query" && JSON.stringify(e.query.key) === JSON.stringify(key));
/** Redux rows of `type`, oldest first (the log keeps the newest first). */
const reduxRows = (type: string) => entries().filter((e) => e.kind === "redux" && e.url === type).sort((a, b) => a.seq - b.seq);
const mutationRowOf = (m: { mutationId: number }) =>
  entries().filter((e) => e.kind === "query" && e.query?.sub === "mutation" && e.query.hash === String(m.mutationId)).pop();
const errorOf = (e: MonitorEntry | undefined) => (e?.error ?? {}) as { responseFrom?: string; responseMatch?: string; kind?: string; response?: unknown };

type Check = [string, boolean, string?];
interface Scenario {
  run(): Promise<unknown>;
  verify(): Check[];
}

function mutate(fn: (v: unknown) => Promise<unknown>, options: Record<string, unknown> = {}) {
  const m = qc.getMutationCache().build(qc, { mutationFn: fn, ...options });
  return { m, done: swallow(m.execute({})) };
}

/** Same URL for every request in a burst — told apart by delay alone. */
const wireDelays: Record<string, number> = {};

/* ── scenarios ─────────────────────────────────────────────────────────── */

const ctx: Record<string, unknown> = {};

const scenarios: Record<string, Scenario> = {
  /* Query ownership */
  "Q1 query inside a query": {
    run: () =>
      qc.fetchQuery({
        queryKey: ["q1", "outer"],
        queryFn: () => {
          const inner = qc.fetchQuery({ queryKey: ["q1", "inner"], queryFn: () => getJ("q1-inner") });
          return Promise.all([inner, getJ("q1-outer")]);
        },
      }),
    verify: () => [
      ["the inner query's request is the inner query's", row("q1-inner")?.ownerId === queryRow(["q1", "inner"])?.id, `owner ${row("q1-inner")?.ownerId}`],
      ["the outer query's own request, made after the inner one returned, is the outer's", row("q1-outer")?.ownerId === queryRow(["q1", "outer"])?.id, `owner ${row("q1-outer")?.ownerId}`],
    ],
  },
  "Q2 queryFn throws synchronously": {
    run: async () => {
      await swallow(qc.fetchQuery({ queryKey: ["q2"], queryFn: () => { throw new Error("sync boom"); } }));
      ctx.q2Owner = getOwner();
      await getJ("q2-after");
    },
    verify: () => [
      ["no owner is left behind after the throw", ctx.q2Owner === null, String(ctx.q2Owner)],
      ["a later unrelated request has no owner", row("q2-after")?.ownerId === undefined, `owner ${row("q2-after")?.ownerId}`],
      ["the query row failed with the thrown error", queryRow(["q2"])?.state === "error", queryRow(["q2"])?.state],
    ],
  },
  "Q3 one default queryFn for many queries, second client": {
    run: () => Promise.all([qc2.fetchQuery({ queryKey: ["q3", "q3-a"] }), qc2.fetchQuery({ queryKey: ["q3", "q3-b"] })]),
    verify: () => [
      ["a's request is a's", row("q3-a")?.ownerId === queryRow(["q3", "q3-a"])?.id],
      ["b's request is b's", row("q3-b")?.ownerId === queryRow(["q3", "q3-b"])?.id],
    ],
  },
  "Q4 infinite query, three pages": {
    run: () =>
      qc.fetchInfiniteQuery({
        queryKey: ["q4"],
        queryFn: ({ pageParam }) => getJ(`q4-p${pageParam}`),
        initialPageParam: 0,
        getNextPageParam: (_last: unknown, all: unknown[]) => (all.length < 3 ? all.length : undefined),
        pages: 3,
      }),
    verify: () => [0, 1, 2].map((p): Check => [`page ${p} is the infinite query's`, row(`q4-p${p}`)?.ownerId === queryRow(["q4"])?.id, `owner ${row(`q4-p${p}`)?.ownerId}`]),
  },
  "Q5 query retried twice, all 503": {
    run: () => {
      let n = 0;
      return swallow(
        qc.fetchQuery({
          queryKey: ["q5"],
          retry: 2,
          retryDelay: 15,
          queryFn: async () => {
            const r = await fetch(`/x/json?status=503&t=q5-${n++}`);
            if (!r.ok) throw Object.assign(new Error("unavailable"), { status: r.status });
            return r.json();
          },
        }),
      );
    },
    verify: () => {
      const q = queryRow(["q5"]);
      return [
        ...[0, 1, 2].map((k): Check => [`attempt ${k} is the query's`, row(`q5-${k}`)?.ownerId === q?.id]),
        ["the failure names the last attempt", errorOf(q).responseFrom === row("q5-2")?.id, `${errorOf(q).responseMatch} → ${tagOf(entries().find((e) => e.id === errorOf(q).responseFrom)!) }`],
      ];
    },
  },
  "Q6 query cancelled mid-flight": {
    run: async () => {
      const p = swallow(qc.fetchQuery({ queryKey: ["q6"], queryFn: ({ signal }) => fetch("/x/json?delay=600&t=q6", { signal }).then((r) => r.json()) }));
      await sleep(60);
      await qc.cancelQueries({ queryKey: ["q6"] });
      await p;
    },
    verify: () => [
      ["the request ends aborted", row("q6")?.state === "aborted", row("q6")?.state],
      ["and is the query's", row("q6")?.ownerId === queryRow(["q6"])?.id],
      ["nothing about it is pending", !rows("q6").some((e) => e.state === "pending")],
    ],
  },

  /* Mutations */
  "M1 two requests at once, both 409": {
    run: () => {
      const { m, done } = mutate(async () => {
        const [a, b] = await Promise.all([fetch("/x/json?status=409&delay=40&t=m1-a"), fetch("/x/json?status=409&delay=60&t=m1-b")]);
        if (!a.ok || !b.ok) throw Object.assign(new Error("conflict"), { status: 409 });
      });
      ctx.m1 = m;
      return done;
    },
    verify: () => {
      const e = errorOf(mutationRowOf(ctx.m1 as { mutationId: number }));
      return [["two overlapping candidates: no request is named, rather than one at random", e.responseFrom === undefined, `${e.responseMatch} ${e.responseFrom}`]];
    },
  },
  "M2 failure, then a cleanup request with another status": {
    run: () => {
      const { m, done } = mutate(async () => {
        const r = await fetch("/x/json?status=409&t=m2-main");
        if (!r.ok) {
          await fetch("/x/json?status=500&t=m2-cleanup");
          throw Object.assign(new Error("conflict"), { status: r.status });
        }
      });
      ctx.m2 = m;
      return done;
    },
    verify: () => {
      const e = errorOf(mutationRowOf(ctx.m2 as { mutationId: number }));
      return [["the 409 is named, not the 500 cleanup", e.responseFrom === row("m2-main")?.id, `${e.responseMatch} → ${e.responseFrom}`]];
    },
  },
  "M3 await before the request, a decoy 409 outside": {
    run: async () => {
      const { m, done } = mutate(async () => {
        await sleep(5);
        const r = await fetch("/x/json?status=409&delay=30&t=m3-mine");
        if (!r.ok) throw Object.assign(new Error("conflict"), { status: r.status });
      });
      ctx.m3 = m;
      await swallow(fetch("/x/json?status=409&t=m3-decoy"));
      await done;
    },
    verify: () => {
      const e = errorOf(mutationRowOf(ctx.m3 as { mutationId: number }));
      return [
        ["the decoy is never named", e.responseFrom !== row("m3-decoy")?.id],
        ["nothing is named without a link", e.responseFrom === undefined, `${e.responseMatch} ${e.responseFrom}`],
      ];
    },
  },
  "M4 the error keeps the Response of its request, among many": {
    run: () => {
      const { m, done } = mutate(async () => {
        const all = await Promise.all([0, 1, 2, 3].map((k) => fetch(`/x/json?status=${k === 2 ? 422 : 200}&t=m4-${k}`)));
        const bad = all.find((r) => !r.ok)!;
        throw Object.assign(new Error("one failed"), { response: bad });
      });
      ctx.m4 = m;
      return done;
    },
    verify: () => {
      const e = errorOf(mutationRowOf(ctx.m4 as { mutationId: number }));
      return [
        ["the failed one of four is named, exactly", e.responseFrom === row("m4-2")?.id && e.responseMatch === "exact", `${e.responseMatch} → ${e.responseFrom}`],
        ["with its body", JSON.stringify(e.response ?? null).includes("m4-2")],
      ];
    },
  },

  /* Timing */
  "T1 ten requests to one URL, main thread blocked": {
    run: async () => {
      const delays = [37, 290, 115, 64, 230, 180, 15, 145, 260, 90];
      const ps = delays.map((d, k) => {
        wireDelays[`t1-${k}`] = d;
        return k % 3 === 2
          ? new Promise<void>((resolve) => {
              const x = new XMLHttpRequest();
              x.open("GET", `/x/json?n=3`);
              x.setRequestHeader("x-delay", String(d));
              x.setRequestHeader("x-tag", `t1-${k}`);
              x.onloadend = () => resolve();
              x.send();
            })
          : fetch(`/x/json?n=3`, { headers: { "x-delay": String(d), "x-tag": `t1-${k}` } }).then((r) => r.text());
      });
      setTimeout(() => block(45), 40);
      setTimeout(() => block(45), 150);
      await Promise.all(ps);
      await sleep(300);
    },
    verify: () =>
      Object.entries(wireDelays)
        .filter(([t]) => t.startsWith("t1-"))
        .map(([t, d]): Check => {
          const e = entries().find((x) => x.requestHeaders?.["x-tag"] === t);
          // The server names the request in Server-Timing, which the browser
          // keeps on the timing entry itself: exact, no tolerance.
          const carried = e?.wire?.serverTiming?.find((m) => m.name === "tag")?.description;
          return [`${t} (${d} ms) has its own timing`, carried === t, `timing of ${carried}, wait ${e?.wire?.waitMs}`];
        }),
  },

  /* XHR */
  "X1 one XHR reused three times from its own onload": {
    run: () =>
      new Promise<void>((resolve) => {
        const x = new XMLHttpRequest();
        let k = 0;
        const go = () => {
          x.open("GET", `/x/json?status=${[200, 404, 201][k]}&t=x1-${k}`);
          x.send();
        };
        x.onloadend = () => {
          k += 1;
          if (k < 3) go();
          else resolve();
        };
        go();
      }),
    verify: () => [0, 1, 2].map((k): Check => [`x1-${k} keeps its own status`, row(`x1-${k}`)?.status === [200, 404, 201][k], String(row(`x1-${k}`)?.status)]),
  },
  "X2 abort, then reuse the same XHR": {
    run: () =>
      new Promise<void>((resolve) => {
        const x = new XMLHttpRequest();
        x.open("GET", "/x/json?delay=400&t=x2-a");
        x.send();
        setTimeout(() => {
          x.abort();
          x.open("GET", "/x/json?t=x2-b");
          x.onloadend = () => resolve();
          x.send();
        }, 50);
      }),
    verify: () => [
      ["the aborted one is aborted", row("x2-a")?.state === "aborted", row("x2-a")?.state],
      ["the reuse succeeds with its own body", row("x2-b")?.state === "success" && JSON.stringify(row("x2-b")?.responsePayload).includes("x2-b")],
    ],
  },

  /* axios */
  "A1 401, 401, then 200 — inside a mutation": {
    run: () => {
      const { m, done } = mutate(() => api.get("/x/auth?fail=2&t=a1"));
      ctx.a1 = m;
      return done;
    },
    verify: () => {
      const all = rows("a1").sort((a, b) => a.startAbs - b.startAbs);
      const owner = mutationRowOf(ctx.a1 as { mutationId: number });
      return [
        ["three rows: 401, 401, 200", JSON.stringify(all.map((e) => e.status)) === "[401,401,200]", JSON.stringify(all.map((e) => e.status))],
        ["every attempt is the mutation's", all.every((e) => e.ownerId === owner?.id)],
        ["the mutation succeeded", owner?.state === "success", owner?.state],
        ["nothing is left pending", !all.some((e) => e.state === "pending")],
      ];
    },
  },
  "A2 401, then the retry fails 500": {
    run: () => {
      const { m, done } = mutate(() => api.get("/x/auth?fail=1&then=500&t=a2"));
      ctx.a2 = m;
      return done;
    },
    verify: () => {
      const e = errorOf(mutationRowOf(ctx.a2 as { mutationId: number }));
      const retry = rows("a2").find((r) => r.status === 500);
      return [["the failure names the retry's 500", !!retry && e.responseFrom === retry.id, `${e.responseMatch} → ${entries().find((x) => x.id === e.responseFrom)?.status}`]];
    },
  },
  "A3 async interceptor refusal with three in flight": {
    run: () =>
      Promise.all([
        swallow(api.get("/x/json?delay=300&t=a3-slow1")),
        swallow(api.get("/x/json?t=a3-refused", { headers: { "x-refuse-async": "1" } })),
        swallow(api.get("/x/json?delay=200&t=a3-slow2")),
      ]),
    verify: () => [
      ["the refused one is setup", errorOf(row("a3-refused")).kind === "setup", errorOf(row("a3-refused")).kind],
      ["it settled at once", (row("a3-refused")?.durationMs ?? 9999) < 100, `${row("a3-refused")?.durationMs} ms`],
      ["the others succeed", row("a3-slow1")?.state === "success" && row("a3-slow2")?.state === "success"],
    ],
  },
  "A4 interceptor registered after Blix refuses": {
    run: () => Promise.all([swallow(late.get("/x/json?delay=200&t=a4-ok")), swallow(late.get("/x/json?t=a4-refused", { headers: { "x-refuse": "1" } }))]),
    verify: () => [
      ["the refused request leaves nothing pending", !rows("a4-refused").some((e) => e.state === "pending"), rows("a4-refused").map((e) => e.state).join()],
      ["the other succeeds", row("a4-ok")?.state === "success"],
    ],
  },
  "A5 params with a custom serializer and baseURL": {
    run: () =>
      api.get("json", {
        baseURL: "/x/",
        params: { t: "a5", list: [1, 2], q: "a b" },
        paramsSerializer: { serialize: (p: Record<string, unknown>) => Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(Array.isArray(v) ? v.join("|") : String(v))}`).join("&") },
      }),
    verify: () => {
      const e = row("a5");
      const sent = performance.getEntriesByType("resource").find((r) => r.name.includes("t=a5"))?.name;
      const shown = e ? new URL(`${e.baseURL ?? ""}${e.url}`, location.href).href : undefined;
      return [
        ["the URL shown is the URL sent", !!sent && shown === sent, `${shown} vs ${sent}`],
        ["the browser's timing is attached", !!e?.wire],
      ];
    },
  },
  "A6 signal already aborted": {
    run: () => {
      const c = new AbortController();
      c.abort();
      return swallow(api.get("/x/json?t=a6", { signal: c.signal }));
    },
    verify: () => [["aborted, not pending", rows("a6").every((e) => e.state === "aborted") && rows("a6").length <= 1, rows("a6").map((e) => e.state).join() || "no row"]],
  },

  /* Redux */
  "R1 an ignored action between two identical ones": {
    run: async () => {
      store.dispatch(counter.actions.tick());
      store.dispatch(noise.actions.hit());
      store.dispatch(counter.actions.tick());
      await sleep(10);
    },
    verify: () => {
      const ticks = reduxRows("counter/tick").slice(-2);
      return [["not folded: the state changed in between", ticks.length === 2 && ticks.every((e) => (e.redux?.batchCount ?? 1) === 1), `${ticks.length} rows, ${ticks.map((e) => e.redux?.batchCount ?? 1)}`]];
    },
  },
  "R2 three identical actions fold, diff covers all": {
    run: async () => {
      await sleep(200);
      for (let k = 0; k < 3; k++) store.dispatch(counter.actions.tagged("same"));
      for (let k = 0; k < 3; k++) store.dispatch(counter.actions.tick());
      await sleep(10);
    },
    verify: () => {
      const tickRow = reduxRows("counter/tick").pop();
      const ticks = log.filter((l) => l.type === "counter/tick").slice(-3);
      const before = (ticks[0].before as { counter: { n: number } }).counter.n;
      const after = (ticks[2].after as { counter: { n: number } }).counter.n;
      const change = tickRow?.redux?.diff?.changes.find((c) => c.path === "counter.n");
      return [
        ["one row for three ticks", tickRow?.redux?.batchCount === 3, String(tickRow?.redux?.batchCount)],
        ["its diff runs from before the first to after the last", change?.before === before && change?.after === after, `${change?.before}→${change?.after}, truth ${before}→${after}`],
      ];
    },
  },
  "R3 a large array change is marked partial": {
    run: async () => {
      store.dispatch(big.actions.fill(500));
      await sleep(10);
    },
    verify: () => {
      const e = reduxRows("big/fill").pop();
      return [["the summary says it is one", e?.redux?.diff?.truncated === true, JSON.stringify(e?.redux?.diff).slice(0, 120)]];
    },
  },
  "R4 a dispatch from inside a subscriber": {
    run: async () => {
      await sleep(200);
      let once = true;
      const unsub = store.subscribe(() => {
        if (once) {
          once = false;
          store.dispatch(counter.actions.tagged("from-subscriber"));
        }
      });
      store.dispatch(counter.actions.tagged("outer"));
      unsub();
      await sleep(10);
    },
    verify: () => {
      const tagged = reduxRows("counter/tagged").slice(-2);
      const outer = tagged.find((e) => JSON.stringify(e.redux?.payload).includes('"outer"'));
      const inner = tagged.find((e) => JSON.stringify(e.redux?.payload).includes("from-subscriber"));
      const outerTag = outer?.redux?.diff?.changes.find((c) => c.path === "counter.tag");
      return [
        ["the outer action's diff is its own: tag → outer", outerTag?.after === "outer", JSON.stringify(outerTag)],
        // The list is ordered by start: the outer action started first.
        ["the outer row is listed first", !!outer && !!inner && outer.startAbs < inner.startAbs, `outer ${outer?.startAbs}, inner ${inner?.startAbs}`],
      ];
    },
  },
};

(window as unknown as { H: unknown }).H = {
  names: Object.keys(scenarios),
  run: async (name: string) => {
    try {
      await scenarios[name].run();
      return "ok";
    } catch (error) {
      return `threw: ${error}`;
    }
  },
  verify: (name: string) => {
    try {
      return scenarios[name].verify();
    } catch (error) {
      return [["verify itself threw", false, String(error)]];
    }
  },
};
