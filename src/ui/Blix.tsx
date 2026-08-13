"use client";

import { lazy, Suspense, useRef } from "react";
import { BlixContext } from "./BlixContext";
import type { StoreLike, HttpClientLike } from "./BlixContext";
import { configureDbName } from "../capture/monitorConfig";

export interface BlixProps {
  store?: StoreLike<unknown>;
  apiClient?: HttpClientLike;
  /** IndexedDB database name. Defaults to "nm-devtools". Useful when running
   * multiple apps on the same origin that would otherwise share a log. */
  dbName?: string;
}

export default function Blix({ store, apiClient, dbName }: BlixProps) {
  // Must be called before any conditional return (Rules of Hooks).
  const panelRef = useRef<ReturnType<typeof lazy> | null>(null);

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
