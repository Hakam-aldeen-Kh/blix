/**
 * Playground host app — a page that does just enough of everything for the
 * panel to have something in each source: fetches against the mock API in
 * `serve.mjs`, a wide Redux store, a few queries and one fake socket.
 */

import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  attachFetchMonitor,
  createReduxMonitorMiddleware,
  tapQueryClient,
  tapRealtimeAdapter,
} from "../src/capture/index";
import axios from "axios";
import { attachHttpMonitor } from "../src/capture/index";
// Not public yet, so not on the entry point — the playground still exercises it.
import { attachXhrMonitor } from "../src/capture/attachXhr";
import { networkMonitor } from "../src/capture/networkMonitor";
import Blix from "../src/ui/Blix";

attachFetchMonitor();
attachXhrMonitor();

/* ── axios: a client set up the way real apps set theirs up ──────────────
   A short timeout, a response interceptor that unwraps `r.data`, and one that
   replaces every failure with the app's own error class. Neither hands Blix's
   tail anything it can tie back to a request, which is exactly the case the
   capture has to survive. */

class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

const api = axios.create({ timeout: 1500 });
api.interceptors.request.use((config) => {
  if (config.headers.get("x-throw")) throw new Error("request interceptor refused to sign this request");
  config.headers.set("authorization", "Bearer demo.token.value");
  return config;
});
api.interceptors.response.use(
  (response) => response.data,
  (error) =>
    Promise.reject(
      new ApiError(
        error.response ? `The server said ${error.response.status}` : "Could not reach the server",
        error.response?.status,
      ),
    ),
);
attachHttpMonitor(api);
// For poking at captured entries from the console.
(window as unknown as { blix: unknown }).blix = networkMonitor;

const swallow = (p: Promise<unknown>) => void p.catch(() => {});

const MODULES = ["tickets", "agents", "macros", "presence", "orders", "invoices"];
const ACTIONS = ["getAll", "getById", "search", "update"];

/* ── Redux: enough slices that the State tab's slice strip overflows ────── */

const SLICES = [
  "auth", "cart", "tickets", "agents", "macros", "presence", "orders",
  "invoices", "settings", "notifications", "customerProfileSlice", "featureFlags",
  "uiLayout", "search",
];

const slices = SLICES.map((name) =>
  createSlice({
    name,
    initialState: { items: [] as { id: number; label: string }[], touched: 0 },
    reducers: {
      added(state, action: PayloadAction<string>) {
        state.items.push({ id: state.items.length, label: action.payload });
        state.touched += 1;
      },
      cleared(state) {
        state.items = [];
        state.touched += 1;
      },
    },
  }),
);

const store = configureStore({
  reducer: Object.fromEntries(slices.map((s) => [s.name, s.reducer])),
  middleware: (getDefault) => getDefault().concat(createReduxMonitorMiddleware() as never),
});

/* ── Realtime: an adapter that talks to itself ─────────────────────────── */

type Listener = (payload: { event: string; data: unknown }) => void;

class FakeSocket {
  private listener: Listener | null = null;
  private timer = 0;
  connect(_token: string, _url: string) {
    let n = 0;
    this.timer = window.setInterval(() => {
      n += 1;
      this.listener?.({
        event: n % 3 === 0 ? "presence.update" : "ticket.updated",
        data: { seq: n, ticketId: 1000 + n, status: n % 2 ? "open" : "pending" },
      });
    }, 1500);
  }
  disconnect() {
    window.clearInterval(this.timer);
  }
  subscribe(_channel: string) {}
  onMessage(callback: Listener) {
    this.listener = callback;
  }
  onPresenceUpdate(_callback: (status: string) => void) {}
}

const socket = tapRealtimeAdapter(new FakeSocket(), "actioncable");

/* ── The page ───────────────────────────────────────────────────────────── */

let counter = 0;
function fire(count: number) {
  for (let n = 0; n < count; n += 1) {
    counter += 1;
    const i = counter;
    const url = `/api/${MODULES[i % MODULES.length]}/${ACTIONS[i % ACTIONS.length]}?i=${i}`;
    void fetch(
      url,
      i % 4 === 3
        ? {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer demo.token.value" },
            body: JSON.stringify({ id: i, note: "from the playground" }),
          }
        : undefined,
    ).catch(() => {});
  }
}

function dispatchSome(count: number) {
  for (let n = 0; n < count; n += 1) {
    const slice = slices[(counter + n) % slices.length];
    store.dispatch(slice.actions.added(`item ${counter + n}`));
  }
  counter += count;
}

const getJson = (url: string) => fetch(url).then((r) => r.json());

/* ── Error lab: every failure shape in `serve.mjs`, through every path ───── */

const ERROR_SHAPES = [
  "envelope-409",
  "problem-400",
  "validation-422",
  "nested-403",
  "auth-401",
  "rate-429",
  "array-400",
  "string-json-400",
  "html-500",
  "text-503",
  "empty-500",
  "bad-json-500",
  "big-500",
  "soft-200",
] as const;

/** What a mutation's error is, the ways apps build theirs. */
const THROWERS = {
  // The playground client's own replacement: message and status, no body.
  "ApiError (no body)": (shape: string) => api.delete(`/errors/${shape}`),
  // An ApiError that keeps the body on a field of its own.
  "ApiError + data": (shape: string) =>
    axios.delete(`/errors/${shape}`).catch((error) => {
      throw Object.assign(new ApiError(error.message, error.response?.status), {
        data: error.response?.data,
        code: error.response?.data?.result,
      });
    }),
  // No status anywhere: wraps the app's error, which Blix linked to its request.
  "Error (no status)": (shape: string) =>
    api.delete(`/errors/${shape}`).catch((error) => {
      throw new Error("Could not complete the request", { cause: error });
    }),
  "plain object": (shape: string) =>
    axios.delete(`/errors/${shape}`).catch((error) => {
      throw { status: error.response?.status, body: error.response?.data };
    }),
  string: (shape: string) =>
    axios.delete(`/errors/${shape}`).catch((error) => {
      throw `failed: ${error.response?.status}`;
    }),
  "raw AxiosError": (shape: string) => axios.delete(`/errors/${shape}`),
} as const;
type Thrower = keyof typeof THROWERS;

/** A 200 whose envelope says it failed is a failure to the app. */
const unlessSoftFailure = (body: unknown) => {
  const envelope = body as { succeeded?: boolean; message?: string } | undefined;
  if (envelope?.succeeded === false) throw new ApiError(envelope.message ?? "failed", 200);
  return body;
};

function ErrorLab() {
  const [shape, setShape] = useState<string>(ERROR_SHAPES[0]);
  const mutation = useMutation({
    // Awaited first, the way real `onMutate`s are: the request then starts
    // after the ownership window has closed, and the mutation cannot be tied
    // to it by that link.
    onMutate: async () => {
      await new Promise((r) => setTimeout(r, 0));
    },
    mutationFn: async ({ shape, thrower }: { shape: string; thrower: Thrower }) =>
      unlessSoftFailure(await THROWERS[thrower](shape)),
  });
  // The stress tests' mutation: fetch, so nothing links its error to its
  // request — Blix can only match it by status and time. The error keeps the
  // status and nothing else, and the tag says which request was really its.
  const fetchMutation = useMutation({
    mutationFn: async ({ i, delay, tag }: { i: number; delay: number; tag: string }) => {
      const r = await fetch(`/api/stress/update?i=${i}&status=409`, {
        method: "POST",
        headers: { "x-delay": String(delay), "x-tag": tag },
      });
      if (!r.ok) throw Object.assign(new Error("Request failed"), { status: r.status });
      return r.json();
    },
  });
  useEffect(() => {
    (window as unknown as { guessLab: unknown }).guessLab = (i: number, delay: number, tag: string) =>
      fetchMutation.mutate({ i, delay, tag });
  }, [fetchMutation.mutate]);

  // For driving the lab from the console: `errorLab("soft-200", "string")`.
  useEffect(() => {
    (window as unknown as { errorLab: unknown }).errorLab = (shape: string, thrower: Thrower) =>
      mutation.mutate({ shape, thrower });
  }, [mutation.mutate]);
  return (
    <section>
      <h2>Error lab</h2>
      <p>
        <select value={shape} onChange={(e) => setShape(e.target.value)}>
          {ERROR_SHAPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>{" "}
        <button onClick={() => swallow(api.delete(`/errors/${shape}`))}>axios</button>
        <button onClick={() => swallow(fetch(`/errors/${shape}`, { method: "DELETE" }))}>fetch</button>
      </p>
      <p>
        mutation, error thrown as:{" "}
        {(Object.keys(THROWERS) as Thrower[]).map((thrower) => (
          <button key={thrower} onClick={() => mutation.mutate({ shape, thrower })}>
            {thrower}
          </button>
        ))}
      </p>
      <p>
        <button
          onClick={() => {
            for (const s of ERROR_SHAPES) mutation.mutate({ shape: s, thrower: "ApiError (no body)" });
          }}
        >
          every shape as a mutation
        </button>
      </p>
    </section>
  );
}

function Page() {
  const [tick, setTick] = useState(0);
  const tickets = useQuery({ queryKey: ["tickets", "list"], queryFn: () => getJson("/api/tickets/getAll?i=2") });
  useQuery({ queryKey: ["agents", "list", { online: true }], queryFn: () => getJson("/api/agents/getAll?i=3") });
  useQuery({ queryKey: ["macros", tick], queryFn: () => getJson(`/api/macros/getAll?i=${4 + tick}`) });
  const save = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/tickets/update?i=${id}`, { method: "POST", body: JSON.stringify({ id }) }).then((r) => r.json()),
  });

  useEffect(() => {
    fire(60);
    dispatchSome(30);
    socket.connect("demo", "wss://playground.local/cable");
    socket.subscribe("tickets");
    // A listener, as an app would register: without one the fake socket has
    // nobody to deliver to, and the Messages tab never sees an incoming frame.
    socket.onMessage(() => {});
    return () => socket.disconnect();
  }, []);

  return (
    <main>
      <h1>Blix playground</h1>
      <p>Open the panel from the launcher in the corner. These fill each source:</p>
      <p>
        <button onClick={() => fire(1)}>1 request</button>
        <button onClick={() => fire(40)}>40 requests</button>
        <button onClick={() => dispatchSome(10)}>10 Redux actions</button>
        <button onClick={() => setTick((t) => t + 1)}>New query key</button>
        <button onClick={() => save.mutate(counter + 1)}>Run a mutation</button>
      </p>
      <p>
        axios (1.5s timeout, errors replaced by the app):{" "}
        <button onClick={() => swallow(api.get("/api/tickets/getAll?i=2"))}>ok</button>
        <button onClick={() => swallow(api.post("/api/tickets/update?i=1&status=500", { id: 1 }))}>500</button>
        <button onClick={() => swallow(api.get("/api/tickets/getAll?delay=4000"))}>timeout</button>
        <button onClick={() => swallow(api.get("http://localhost:1/api/down"))}>network down</button>
        <button onClick={() => swallow(api.get("/api/tickets/getAll", { headers: { "x-throw": "1" } }))}>
          interceptor throws
        </button>
        <button
          onClick={() => {
            const controller = new AbortController();
            swallow(api.get("/api/tickets/getAll?delay=3000", { signal: controller.signal }));
            setTimeout(() => controller.abort(), 300);
          }}
        >
          abort
        </button>
      </p>
      <p>
        raw XHR:{" "}
        <button
          onClick={() => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "/api/orders/search?i=14");
            xhr.setRequestHeader("x-demo", "raw-xhr");
            xhr.send();
          }}
        >
          ok
        </button>
        <button
          onClick={() => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/orders/update?status=503");
            xhr.setRequestHeader("content-type", "application/json");
            xhr.send(JSON.stringify({ id: 9 }));
          }}
        >
          503
        </button>
        <button
          onClick={() => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "/api/orders/search?delay=4000");
            xhr.timeout = 800;
            xhr.send();
          }}
        >
          timeout
        </button>
      </p>
      <p>
        fetch:{" "}
        <button onClick={() => swallow(fetch("/api/tickets/update?status=500", { method: "POST" }))}>500</button>
        <button onClick={() => swallow(fetch("/api/x?delay=4000", { signal: AbortSignal.timeout(1000) }))}>
          timeout
        </button>
        <button onClick={() => swallow(fetch("http://localhost:1/api/down"))}>network down</button>
      </p>
      <p>Tickets query: {tickets.status}</p>
      <ErrorLab />
    </main>
  );
}

const queryClient = new QueryClient();

// Handles for the stress tests in the console. Development playground only.
(window as unknown as { pg: unknown }).pg = { queryClient, axios, api };

function App() {
  useEffect(() => tapQueryClient(queryClient as never), []);
  return (
    <QueryClientProvider client={queryClient}>
      <Page />
      <Blix store={store} dbName="playground" />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
