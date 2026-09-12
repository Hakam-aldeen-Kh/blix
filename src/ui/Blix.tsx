"use client";

import { lazy, Suspense, useEffect, useRef } from "react";
import { BlixContext } from "./BlixContext";
import type { StoreLike, HttpClientLike } from "./BlixContext";
import { configureDbName } from "../capture/monitorConfig";

export interface BlixProps {
  store?: StoreLike<unknown>;
  apiClient?: HttpClientLike;
  /** IndexedDB database name, prefixed to `blix:<dbName>`. Defaults to
   * `blix:default`. Useful when running multiple apps on the same origin that
   * would otherwise share a log. */
  dbName?: string;
}

export default function Blix({ store, apiClient, dbName }: BlixProps) {
  // Must be called before any conditional return (Rules of Hooks).
  const panelRef = useRef<ReturnType<typeof lazy> | null>(null);

  // Without a name, every app on this origin shares `blix:default` — which is
  // a confusing thing to discover from the log rather than from a warning.
  //
  // In an effect and not in render: warning during render would fire twice
  // under StrictMode's double invocation and again on every re-render, and
  // render is not where side effects belong. The empty dep array makes it once
  // per mount regardless of how often the panel re-renders. The literal
  // NODE_ENV check keeps it out of production builds the same way the panel
  // itself is kept out.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (dbName) return;
    console.warn(
      "[blix] No dbName prop — using the shared database \"blix:default\".\n" +
        "IndexedDB is scoped to the origin, not to your app, so every app " +
        "served from this origin writes to that one database and entries " +
        "from other projects will appear in this panel.\n" +
        'Fix: <Blix dbName="my-app" />\n' +
        "Existing databases on this origin are listed under “Databases on " +
        "this origin” in the command palette (Ctrl/⌘ K).",
    );
    // Named deliberately: the warning is about the value at mount, and the
    // resolved name cannot change for the life of the component anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    // The import() is inside a literal NODE_ENV check so webpack/Turbopack
    // constant-fold the condition to false in production and eliminate the
    // chunk reference entirely.
    // Do NOT replace this check with an imported boolean (e.g. MONITOR_ENABLED)
    // — cross-file constant propagation is not guaranteed by every bundler.
    if (!panelRef.current) {
      panelRef.current = lazy(() => import("./DevToolsPanel"));
    }
    const Panel = panelRef.current;

    if (dbName) configureDbName(dbName);

    return (
      <BlixContext.Provider value={{ store, apiClient }}>
        <Suspense fallback={null}>
          <Panel />
        </Suspense>
      </BlixContext.Provider>
    );
  }
  return null;
}
