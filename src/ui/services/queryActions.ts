/**
 * Dev Tools — Query panel actions.
 *
 * Reaches the live `QueryClient` through `getTappedQueryClient()` — a module
 * handle exposed by `queryCapture.ts` — rather than a React context, since
 * these actions are invoked from a context menu that isn't inside the host
 * app's component tree. The capture layer still never imports
 * `@tanstack/react-query`; the client is only ever handled structurally.
 */

import {
  getTappedQueryClient,
  type QueryFilterLike,
} from "../../capture/queryCapture";
import type { MonitorEntry } from "../../capture/networkMonitor";

export interface QueryActionCheck {
  can: boolean;
  reason?: string;
}

function filterFor(entry: MonitorEntry): QueryFilterLike | null {
  const key = entry.query?.key;
  if (!key || key.length === 0) return null;
  return { queryKey: key, exact: true };
}

/** Shared guard for invalidate/refetch/reset: on a key with no active
 * observers any of them is a silent no-op — nothing is mounted to refetch,
 * and under an aggressive `gcTime` whatever *is* fetched is garbage-collected
 * immediately. Disabling the action (with this reason surfaced as a tooltip)
 * is what keeps the panel honest rather than looking like it did something. */
export function canActOnQuery(entry: MonitorEntry): QueryActionCheck {
  if ((entry.kind ?? "http") !== "query" || entry.query?.sub !== "query") {
    return { can: false, reason: "Not a query" };
  }
  if (!getTappedQueryClient()) return { can: false, reason: "Query client not available" };
  if ((entry.query.observers ?? 0) === 0) {
    return { can: false, reason: "No active observers — nothing is mounted to refetch" };
  }
  return { can: true };
}

export function invalidateQuery(entry: MonitorEntry): void {
  const client = getTappedQueryClient();
  const filter = filterFor(entry);
  if (client && filter) void client.invalidateQueries(filter);
}

export function refetchQuery(entry: MonitorEntry): void {
  const client = getTappedQueryClient();
  const filter = filterFor(entry);
  if (client && filter) void client.refetchQueries(filter);
}

export function resetQuery(entry: MonitorEntry): void {
  const client = getTappedQueryClient();
  const filter = filterFor(entry);
  if (client && filter) void client.resetQueries(filter);
}

/** Remove has no observer guard — with `gcTime: 0` the entry is usually
 * already gone from the real cache; this just clears it early / explicitly. */
export function removeQuery(entry: MonitorEntry): void {
  const client = getTappedQueryClient();
  const filter = filterFor(entry);
  if (client && filter) client.removeQueries(filter);
}
