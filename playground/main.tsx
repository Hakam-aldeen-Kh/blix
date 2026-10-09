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
import Blix from "../src/ui/Blix";

attachFetchMonitor();

const MODULES = ["tickets", "agents", "macros", "presence", "orders", "invoices"];
const ACTIONS = ["getAll", "getById", "search", "update"];

/* ── Redux: enough slices that the State tab's slice strip overflows ────── */

const SLICES = [
  "auth", "cart", "tickets", "agents", "macros", "presence", "orders",
  "invoices", "settings", "notifications", "cifCorporateSlice", "featureFlags",
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
      <p>Tickets query: {tickets.status}</p>
    </main>
  );
}

const queryClient = new QueryClient();

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
