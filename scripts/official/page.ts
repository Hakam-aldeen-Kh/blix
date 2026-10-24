/**
 * The page `check-official.mjs` drives: Blix attached to everything, the way an
 * app attaches it, plus a ground-truth recorder next to each source that does
 * not depend on Blix at all.
 *
 * - Network: nothing here — the truth is the browser's own record, read over
 *   the DevTools protocol by the harness.
 * - Query: a cache subscriber installed before Blix's, counting what the cache
 *   itself reports, and the cache's own state at the end.
 * - Redux: a middleware ahead of Blix's that keeps every action with the state
 *   before and after it.
 *
 * Every request carries a unique `t` query parameter, so the harness pairs the
 * browser's record with Blix's by URL alone, never by timing.
 */

import { configureStore, createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { QueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  attachFetchMonitor,
  attachHttpMonitor,
  createReduxMonitorMiddleware,
  tapQueryClient,
  withInitiatorCapture,
} from "../../src/capture/index";
import { attachXhrMonitor } from "../../src/capture/attachXhr";
import { networkMonitor } from "../../src/capture/networkMonitor";

declare const ORIGIN_B: string;

attachFetchMonitor();
attachXhrMonitor();

/* ── axios, set up like a real app's ───────────────────────────────────── */

const api = withInitiatorCapture(axios.create({ timeout: 800 }));
api.interceptors.request.use((config) => {
  if (config.headers.get("x-refuse")) throw new Error("interceptor refused");
  config.headers.set("authorization", "Bearer header.payload.signature");
  return config;
});
attachHttpMonitor(api);

/* ── Query, with its own recorder first ────────────────────────────────── */

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
/** queryHash → how many `fetch` actions the cache itself reported. */
const queryFetches: Record<string, number> = {};
queryClient.getQueryCache().subscribe((event) => {
  const action = (event as { action?: { type?: string } }).action;
  if (event.type === "updated" && action?.type === "fetch") {
    queryFetches[event.query.queryHash] = (queryFetches[event.query.queryHash] ?? 0) + 1;
  }
});
tapQueryClient(queryClient as never);

/* ── Redux, with its own recorder first ────────────────────────────────── */

const reduxLog: { type: string; payload: unknown; meta: unknown; error: unknown; before: unknown; after: unknown }[] = [];
const recorder = (store: { getState(): unknown }) => (next: (a: unknown) => unknown) => (action: unknown) => {
  const before = store.getState();
  const result = next(action);
  const a = action as { type?: unknown; payload?: unknown; meta?: unknown; error?: unknown };
  if (typeof a?.type === "string") {
    reduxLog.push({ type: a.type, payload: a.payload, meta: a.meta, error: a.error, before, after: store.getState() });
  }
  return result;
};

const todos = createSlice({
  name: "todos",
  initialState: { items: [] as { id: number; text: string; done: boolean }[], filter: "all" },
  reducers: {
    added(state, action: { payload: { id: number; text: string } }) {
      state.items.push({ ...action.payload, done: false });
    },
    toggled(state, action: { payload: number }) {
      const item = state.items.find((i) => i.id === action.payload);
      if (item) item.done = !item.done;
    },
    removed(state, action: { payload: number }) {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },
    filtered(state, action: { payload: string }) {
      state.filter = action.payload;
    },
  },
});
const session = createSlice({
  name: "session",
  initialState: { user: null as null | { id: number; name: string; roles: string[] }, ticks: 0 },
  reducers: {
    signedIn(state, action: { payload: { id: number; name: string; roles: string[] } }) {
      state.user = action.payload;
    },
    ticked(state) {
      state.ticks += 1;
    },
    noop() {},
  },
});
const loadThing = createAsyncThunk("things/load", async (fail: boolean, { rejectWithValue }) => {
  await new Promise((r) => setTimeout(r, 10));
  if (fail) return rejectWithValue({ reason: "nope", code: 7 });
  return { id: 1, name: "thing" };
});

const store = configureStore({
  reducer: { todos: todos.reducer, session: session.reducer },
  middleware: (getDefault) =>
    getDefault().prepend(recorder as never).concat(createReduxMonitorMiddleware() as never),
});

/* ── scenarios ─────────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const swallow = (p: Promise<unknown>) => p.then(
  () => {},
  () => {},
);
const u = (path: string, t: string, origin = "") => `${origin}${path}${path.includes("?") ? "&" : "?"}t=${t}`;

function xhr(method: string, url: string, body?: string, setup?: (x: XMLHttpRequest) => void): Promise<void> {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    setup?.(x);
    x.onloadend = () => resolve();
    x.send(body ?? null);
  });
}

/** Each scenario's requests are tagged `<scenario>.<n>` through `t`. */
const scenarios: Record<string, () => Promise<unknown>> = {
  // fetch, the basics
  "fetch-get": () => fetch(u("/x/json?n=5", "fetch-get.1")).then((r) => r.json()),
  "fetch-post-json": () =>
    fetch(u("/x/echo", "fetch-post-json.1"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-custom": "one" },
      body: JSON.stringify({ a: 1, nested: { b: [1, 2, 3] }, s: "ünïcødé ✓" }),
    }).then((r) => r.json()),
  "fetch-post-text": () => fetch(u("/x/echo", "fetch-post-text.1"), { method: "POST", body: "plain text body" }).then((r) => r.text()),
  "fetch-post-form": () => {
    const form = new URLSearchParams({ q: "a b&c", page: "2" });
    return fetch(u("/x/echo", "fetch-post-form.1"), { method: "POST", body: form }).then((r) => r.text());
  },
  "fetch-multipart": () => {
    const fd = new FormData();
    fd.append("field", "value");
    fd.append("file", new Blob(["hello file"], { type: "text/plain" }), "a.txt");
    return fetch(u("/x/echo", "fetch-multipart.1"), { method: "POST", body: fd }).then((r) => r.text());
  },
  "fetch-put-delete-patch": () =>
    Promise.all([
      fetch(u("/x/json", "fetch-put-delete-patch.put"), { method: "PUT", body: "{}" }),
      fetch(u("/x/json", "fetch-put-delete-patch.delete"), { method: "DELETE" }),
      fetch(u("/x/json", "fetch-put-delete-patch.patch"), { method: "PATCH", body: "{}" }),
    ]),
  "fetch-head": () => fetch(u("/x/json", "fetch-head.1"), { method: "HEAD" }),
  "fetch-204": () => fetch(u("/x/empty", "fetch-204.1")),
  "fetch-404-500": () =>
    Promise.all([
      fetch(u("/x/json?status=404", "fetch-404-500.404")).then((r) => r.text()),
      fetch(u("/x/json?status=500", "fetch-404-500.500")).then((r) => r.text()),
      fetch(u("/x/json?status=418", "fetch-404-500.418")).then((r) => r.text()),
    ]),
  "fetch-text-html": () => fetch(u("/x/html", "fetch-text-html.1")).then((r) => r.text()),
  "fetch-binary": () => fetch(u("/x/binary", "fetch-binary.1")).then((r) => r.arrayBuffer()),
  "fetch-gzip": () => fetch(u("/x/gzip", "fetch-gzip.1")).then((r) => r.json()),
  "fetch-big": () => fetch(u("/x/big?mb=6", "fetch-big.1")).then((r) => r.text()),
  "fetch-redirect": () => fetch(u("/x/redirect?code=302", "fetch-redirect.1")).then((r) => r.json()),
  "fetch-redirect-307-post": () =>
    fetch(u("/x/redirect?code=307", "fetch-redirect-307-post.1"), { method: "POST", body: '{"k":1}' }).then((r) => r.text()),
  "fetch-cache-max-age": async () => {
    await fetch(u("/x/cached", "fetch-cache-max-age.1")).then((r) => r.text());
    await fetch(u("/x/cached", "fetch-cache-max-age.1")).then((r) => r.text());
  },
  "fetch-etag-304": async () => {
    await fetch(u("/x/etag", "fetch-etag-304.1")).then((r) => r.text());
    await fetch(u("/x/etag", "fetch-etag-304.1")).then((r) => r.text());
  },
  "fetch-set-cookie": async () => {
    await fetch(u("/x/cookie", "fetch-set-cookie.set")).then((r) => r.text());
    await fetch(u("/x/json", "fetch-set-cookie.send")).then((r) => r.text());
  },
  "fetch-server-timing": () => fetch(u("/x/json?st=1", "fetch-server-timing.1")).then((r) => r.text()),
  "fetch-unread-body": () => fetch(u("/x/json?n=3", "fetch-unread-body.1")),
  "fetch-abort": () => {
    const c = new AbortController();
    const p = swallow(fetch(u("/x/json?delay=1000", "fetch-abort.1"), { signal: c.signal }));
    setTimeout(() => c.abort(), 100);
    return p;
  },
  "fetch-timeout-signal": () => swallow(fetch(u("/x/json?delay=1000", "fetch-timeout-signal.1"), { signal: AbortSignal.timeout(150) })),
  "fetch-network-down": () => swallow(fetch(u("http://127.0.0.1:1/x/down", "fetch-network-down.1"))),
  "fetch-cors-blocked": () => swallow(fetch(u("/x/json?nocors=1", "fetch-cors-blocked.1", ORIGIN_B))),
  "fetch-cross-origin-tao": () => fetch(u("/x/json?tao=1&expose=1", "fetch-cross-origin-tao.1", ORIGIN_B)).then((r) => r.text()),
  "fetch-cross-origin-no-tao": () => fetch(u("/x/json", "fetch-cross-origin-no-tao.1", ORIGIN_B)).then((r) => r.text()),
  "fetch-cross-origin-preflight": () =>
    fetch(u("/x/echo?tao=1", "fetch-cross-origin-preflight.1", ORIGIN_B), {
      method: "PUT",
      headers: { "content-type": "application/json", "x-custom": "pf" },
      body: '{"pf":true}',
    }).then((r) => r.text()),
  "fetch-no-cors": () => fetch(u("/x/json", "fetch-no-cors.1", ORIGIN_B), { mode: "no-cors" }),
  "fetch-request-object": () =>
    fetch(new Request(u("/x/echo", "fetch-request-object.1"), { method: "POST", body: '{"req":1}', headers: { "x-from": "Request" } })).then((r) => r.text()),
  "fetch-sse": () =>
    new Promise<void>((resolve) => {
      fetch(u("/x/sse", "fetch-sse.1")).then(async (r) => {
        const reader = r.body!.getReader();
        while (!(await reader.read()).done) {}
        resolve();
      });
    }),
  "fetch-parallel-same-url": () =>
    Promise.all([0, 1, 2, 3, 4, 5].map((k) => fetch(`/x/json?n=2&same=1&t=fetch-parallel-same-url.${k}`, { headers: { "x-delay": String(300 - k * 50) } }).then((r) => r.text()))),

  // XHR
  "xhr-get": () => xhr("GET", u("/x/json?n=4", "xhr-get.1")),
  "xhr-post": () =>
    xhr("POST", u("/x/echo", "xhr-post.1"), '{"x":1}', (x) => x.setRequestHeader("content-type", "application/json")),
  "xhr-post-text": () => xhr("POST", u("/x/echo", "xhr-post-text.1"), "plain xhr body"),
  "xhr-500": () => xhr("GET", u("/x/json?status=500", "xhr-500.1")),
  "xhr-timeout": () => xhr("GET", u("/x/json?delay=1000", "xhr-timeout.1"), undefined, (x) => (x.timeout = 150)),
  "xhr-abort": () =>
    new Promise<void>((resolve) => {
      const x = new XMLHttpRequest();
      x.open("GET", u("/x/json?delay=1000", "xhr-abort.1"));
      x.onloadend = () => resolve();
      x.send();
      setTimeout(() => x.abort(), 100);
    }),
  "xhr-network-down": () => xhr("GET", u("http://127.0.0.1:1/x/down", "xhr-network-down.1")),

  // axios
  "axios-get": () => api.get(u("/x/json?n=6", "axios-get.1")),
  "axios-post": () => api.post(u("/x/echo", "axios-post.1"), { hello: "world", list: [1, 2] }),
  "axios-params": () => api.get("/x/json", { params: { n: 2, t: "axios-params.1", q: "a b" } }),
  "axios-500": () => swallow(api.get(u("/x/json?status=500", "axios-500.1"))),
  "axios-timeout": () => swallow(api.get(u("/x/json?delay=1500", "axios-timeout.1"))),
  "axios-network-down": () => swallow(api.get(u("http://127.0.0.1:1/x/down", "axios-network-down.1"))),
  "axios-refused-by-interceptor": () =>
    Promise.all([
      swallow(api.get(u("/x/json?delay=400", "axios-refused-by-interceptor.slow"))),
      swallow(api.get(u("/x/json", "axios-refused-by-interceptor.refused"), { headers: { "x-refuse": "1" } })),
    ]),
  "axios-cancel": () => {
    const c = new AbortController();
    const p = swallow(api.get(u("/x/json?delay=1000", "axios-cancel.1"), { signal: c.signal }));
    setTimeout(() => c.abort(), 100);
    return p;
  },

  // Query
  "query-success": () => queryClient.fetchQuery({ queryKey: ["q", "success"], queryFn: () => fetch(u("/x/json?n=3", "query-success.1")).then((r) => r.json()) }),
  "query-error": () =>
    swallow(
      queryClient.fetchQuery({
        queryKey: ["q", "error"],
        queryFn: async () => {
          const r = await fetch(u("/x/json?status=422", "query-error.1"));
          if (!r.ok) throw Object.assign(new Error("bad"), { status: r.status });
          return r.json();
        },
      }),
    ),
  "query-retry": () =>
    swallow(
      queryClient.fetchQuery({
        queryKey: ["q", "retry"],
        retry: 2,
        retryDelay: 20,
        queryFn: async ({ signal }) => {
          const r = await fetch(`/x/json?status=503&t=query-retry.${Math.random().toString(36).slice(2, 8)}`, { signal });
          if (!r.ok) throw Object.assign(new Error("unavailable"), { status: r.status });
          return r.json();
        },
      }),
    ),
  "query-axios": () => queryClient.fetchQuery({ queryKey: ["q", "axios"], queryFn: () => api.get(u("/x/json?n=1", "query-axios.1")).then((r) => r.data) }),
  "query-refetch": async () => {
    let n = 0;
    const options = { queryKey: ["q", "refetch"], queryFn: () => fetch(u("/x/json?n=1", `query-refetch.${++n}`)).then((r) => r.json()) };
    await queryClient.fetchQuery(options);
    await queryClient.invalidateQueries({ queryKey: ["q", "refetch"] });
    await queryClient.refetchQueries({ queryKey: ["q", "refetch"] });
    queryClient.setQueryData(["q", "refetch"], { manual: true });
  },
  "mutation-success": () =>
    queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: (v: { id: number }) => fetch(u("/x/echo", "mutation-success.1"), { method: "POST", body: JSON.stringify(v) }).then((r) => r.json()) })
      .execute({ id: 42 }),
  "mutation-error": () =>
    swallow(
      queryClient
        .getMutationCache()
        .build(queryClient, {
          onMutate: async () => {
            await sleep(5);
          },
          mutationFn: async (v: { id: number }) => {
            const r = await fetch(u("/x/json?status=409", "mutation-error.1"), { method: "POST", body: JSON.stringify(v) });
            if (!r.ok) throw Object.assign(new Error("conflict"), { status: r.status, response: r });
            return r.json();
          },
        })
        .execute({ id: 7 }),
    ),

  // Redux
  "redux-actions": async () => {
    store.dispatch(todos.actions.added({ id: 1, text: "one" }));
    store.dispatch(todos.actions.added({ id: 2, text: "two" }));
    store.dispatch(todos.actions.toggled(1));
    store.dispatch(session.actions.signedIn({ id: 9, name: "Ada", roles: ["admin", "dev"] }));
    store.dispatch(session.actions.noop());
    store.dispatch(todos.actions.filtered("done"));
    store.dispatch(todos.actions.removed(2));
    await sleep(200);
  },
  "redux-coalesced": async () => {
    for (let k = 0; k < 5; k++) store.dispatch(session.actions.ticked());
    await sleep(200);
  },
  "redux-thunks": async () => {
    await store.dispatch(loadThing(false));
    await store.dispatch(loadThing(true));
  },
};

(window as unknown as { H: unknown }).H = {
  scenarios: Object.keys(scenarios),
  run: async (name: string) => {
    try {
      await scenarios[name]();
    } catch (error) {
      return String(error);
    }
    return "ok";
  },
  /** Blix's log, as data. */
  blix: () => JSON.parse(JSON.stringify(networkMonitor.getSnapshot())),
  /** The cache's own view of every query and mutation. */
  queries: () => ({
    fetches: queryFetches,
    queries: queryClient.getQueryCache().getAll().map((q) => ({
      hash: q.queryHash,
      key: q.queryKey,
      status: q.state.status,
      fetchStatus: q.state.fetchStatus,
      data: q.state.data,
      dataUpdatedAt: q.state.dataUpdatedAt,
      errorUpdatedAt: q.state.errorUpdatedAt,
      failureCount: q.state.fetchFailureCount,
      isInvalidated: q.state.isInvalidated,
      observers: q.getObserversCount(),
      errorMessage: (q.state.error as Error | null)?.message,
    })),
    mutations: queryClient.getMutationCache().getAll().map((m) => ({
      id: m.mutationId,
      status: m.state.status,
      variables: m.state.variables,
      data: m.state.data,
      errorMessage: (m.state.error as Error | null)?.message,
    })),
  }),
  redux: () => JSON.parse(JSON.stringify(reduxLog)),
};
