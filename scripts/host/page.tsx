/**
 * The page `check-host.mjs` drives: a host app that does, without Next.js, the
 * two things that made Blix hold a Next.js page back.
 *
 * - A long, interruptible render: the page arrives in a `startTransition`, and
 *   a few hundred components that each take a moment to render make React
 *   slice it across many tasks — the shape of a Next.js hydration beside a
 *   hidden `<Activity>`.
 * - A query built during that render, under `gcTime: 0`: `useQuery` creates it
 *   in render, the QueryCache reports it, and when the render is thrown away
 *   the query is collected and created again by the next attempt.
 *
 * The panel used to re-render on every one of those cache events, and each
 * re-render discarded the host's render in progress — so the page's effects,
 * and the query's first fetch, never ran. `?blix=0` is the same page without
 * Blix, for the baseline.
 *
 * Reports to `window.__host`: when the page was asked for, when its effect ran,
 * when `queryFn` was called, and whether the panel mounted.
 */

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { startTransition, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Blix from "../../src/ui/Blix";
import { tapQueryClient } from "../../src/capture/queryCapture";
import { prefsStore } from "../../src/capture/monitorPersistence";

interface HostReport {
  askedAt?: number;
  effectAt?: number;
  queryFnAt?: number;
  panel: boolean;
  /** Row renders since the page was asked for: 400 for one pass, more when
   * React threw a render away and started it again. */
  rows: number;
  /** `rows` when `queryFn` was first called. */
  rowsAtQueryFn?: number;
  /** When the saved log finished loading, if after the page was asked for. */
  restoredAt?: number;
}
declare global {
  interface Window {
    __host: HostReport;
    __showPage: () => void;
  }
}
window.__host = { panel: false, rows: 0 };

const withBlix = new URLSearchParams(location.search).get("blix") !== "0";

// The settings from the report this page reproduces: no retries, nothing kept.
const client = new QueryClient({
  defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: 0, gcTime: 0 } },
});

/** A component that takes `ms` of main thread to render, so the page render
 * is long enough that React has to slice it. */
function Slow({ ms, i }: { ms: number; i: number }) {
  window.__host.rows += 1;
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* render cost */
  }
  return <li>row {i}</li>;
}

function List() {
  const query = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      window.__host.queryFnAt ??= performance.now();
      window.__host.rowsAtQueryFn ??= window.__host.rows;
      return [1, 2, 3];
    },
  });
  return <p id="status">{query.status}</p>;
}

function Page() {
  useEffect(() => {
    window.__host.effectAt ??= performance.now();
  }, []);
  return (
    <main>
      <List />
      <ul>
        {Array.from({ length: 400 }, (_, i) => (
          <Slow key={i} i={i} ms={1} />
        ))}
      </ul>
    </main>
  );
}

function App() {
  const [show, setShow] = useState(false);
  useEffect(() => tapQueryClient(client), []);
  useEffect(() => {
    window.__showPage = () => {
      window.__host.askedAt = performance.now();
      startTransition(() => setShow(true));
    };
  }, []);
  return (
    <QueryClientProvider client={client}>
      {show && <Page />}
      {withBlix && <Blix dbName="check-host" />}
    </QueryClientProvider>
  );
}

// Blix restores its saved log from IndexedDB as the panel mounts — in an app,
// that is while the app itself is hydrating. Asking for the page as the
// restore starts makes its end land inside the page's render every time,
// rather than when the timing happens to line up. `?onRestore=1` asks for it;
// it is read here, at load, so it is set before the panel can mount.
let showOnRestore = new URLSearchParams(location.search).get("onRestore") === "1";
prefsStore.subscribe(() => {
  const { hydration } = prefsStore.getSnapshot();
  if (hydration === "loading" && showOnRestore) {
    showOnRestore = false;
    window.__showPage();
  }
  if (hydration === "ready" && window.__host.askedAt !== undefined) {
    window.__host.restoredAt ??= performance.now();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

// The panel portals its launcher into <body>; once it is there, Blix is fully
// mounted and subscribed, which is the state the page has to arrive into.
new MutationObserver(() => {
  if (document.querySelector("[aria-label^='Blix']")) window.__host.panel = true;
}).observe(document.body, { childList: true, subtree: true });
