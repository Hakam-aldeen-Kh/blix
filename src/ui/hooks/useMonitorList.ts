"use client";

/**
 * Dev Tools — filtering, sorting, and flattening into renderable rows.
 */

import type { MonitorEntry, MonitorState } from "../../capture/networkMonitor";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { evaluateFilter, parseFilter } from "../services/filterQuery";
import { pruneSearchIndex } from "../services/searchIndex";
import { requestName } from "../helpers/format";
import type { ListRow, Sort, StateFilter } from "../types/monitorUi";

export interface Counts {
  all: number;
  success: number;
  error: number;
  pending: number;
  aborted: number;
}

/** Trailing debounce, used only for the payload-scanning half of deep search.
 * `useDeferredValue` alone keeps typing responsive, but still re-runs on every
 * settled keystroke; this avoids scanning payloads mid-word. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}

function compare(a: MonitorEntry, b: MonitorEntry, sort: Sort): number {
  const dir = sort.dir === "asc" ? 1 : -1;
  switch (sort.key) {
    case "name":
      return requestName(a.url).localeCompare(requestName(b.url)) * dir;
    case "status":
      return ((a.status ?? 0) - (b.status ?? 0)) * dir;
    case "size":
      return ((a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)) * dir;
    case "duration":
      return ((a.durationMs ?? 0) - (b.durationMs ?? 0)) * dir;
    case "time":
    default:
      return (a.seq - b.seq) * dir;
  }
}

export function useMonitorList(
  entries: MonitorEntry[],
  query: string,
  deepSearch: boolean,
  stateFilter: StateFilter,
  sort: Sort,
) {
  const deferredQuery = useDeferredValue(query);
  const debouncedQuery = useDebounced(deferredQuery, 150);
  // Metadata matching is cheap enough to run on the deferred value; only the
  // payload scan waits for the debounce.
  const effectiveQuery = deepSearch ? debouncedQuery : deferredQuery;
  const normalizedQuery = effectiveQuery.trim().toLowerCase();

  // Keep the haystack cache bounded to what's still in the buffer.
  useEffect(() => {
    pruneSearchIndex(new Set(entries.map((e) => e.id)));
  }, [entries]);

  // Parsed once per settled query rather than per entry.
  const parsed = useMemo(() => parseFilter(effectiveQuery), [effectiveQuery]);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (stateFilter !== "all" && e.state !== stateFilter) return false;
        return parsed.empty || evaluateFilter(e, parsed, deepSearch);
      }),
    [entries, parsed, stateFilter, deepSearch],
  );

  const sorted = useMemo(() => {
    // The store already yields newest-first, which is the default view; only
    // pay for a sort when the user asked for something else.
    if (sort.key === "time" && sort.dir === "desc") return filtered;
    return filtered.slice().sort((a, b) => compare(a, b, sort));
  }, [filtered, sort]);

  const visibleIds = useMemo(
    () => new Set(sorted.map((e) => e.id)),
    [sorted],
  );

  /**
   * Flattened rows, with a divider wherever the page load changes.
   *
   * Only meaningful while sorted by time — under any other sort the entries are
   * interleaved and a "page load" boundary would be noise, so it is skipped.
   */
  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [];
    const byTime = sort.key === "time";
    for (let i = 0; i < sorted.length; i += 1) {
      const entry = sorted[i];
      if (byTime && i > 0 && sorted[i - 1].loadId !== entry.loadId) {
        out.push({ kind: "divider", loadId: entry.loadId, at: entry.at });
      }
      out.push({ kind: "row", entry });
    }
    return out;
  }, [sorted, sort.key]);

  const counts = useMemo<Counts>(() => {
    const acc: Counts = { all: entries.length, success: 0, error: 0, pending: 0, aborted: 0 };
    for (const e of entries) acc[e.state as keyof Counts] += 1;
    return acc;
  }, [entries]);

  const totalBytes = useMemo(
    () => entries.reduce((sum, e) => sum + (e.sizeBytes ?? 0), 0),
    [entries],
  );

  return {
    filtered: sorted,
    visibleIds,
    rows,
    counts,
    totalBytes,
    normalizedQuery,
    parsed,
    /** True while the deferred/debounced query is still catching up. */
    searching: query !== effectiveQuery,
  };
}

/** Which filter is hiding a given entry, so "Show it" clears only what's
 * responsible instead of resetting everything. */
export function hidingReasons(
  entry: MonitorEntry,
  stateFilter: StateFilter,
  normalizedQuery: string,
  deepSearch: boolean,
): ("state" | "query")[] {
  const out: ("state" | "query")[] = [];
  if (stateFilter !== "all" && entry.state !== (stateFilter as MonitorState)) {
    out.push("state");
  }
  const parsed = parseFilter(normalizedQuery);
  if (!parsed.empty && !evaluateFilter(entry, parsed, deepSearch)) {
    out.push("query");
  }
  return out;
}
