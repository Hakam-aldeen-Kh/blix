/**
 * Dev Tools — entry timing bounds.
 *
 * ## The `performance.now()` origin trap
 *
 * `MonitorEntry.startTime`/`endTime` are relative to `performance.timeOrigin`,
 * which is different for every page load. A restored entry's `startTime` is
 * therefore meaningless when compared against the current load's. Everything
 * here uses `startAbs`/`endAbs` — absolute epoch ms computed at capture — and
 * never touches `startTime`/`endTime`.
 *
 * The per-page-load timeline windows and offset-plus-length bar geometry that
 * used to live here went with the waterfall column. The list's duration bar is
 * a comparison against the slowest entry in view, which needs no shared
 * window; what survives is the pair of accessors that get an entry's real
 * start and end, which the HAR export also depends on.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";

/** Falls back gracefully for records written before `startAbs` existed. */
export function startOf(entry: MonitorEntry): number {
  return entry.startAbs ?? entry.at;
}

export function endOf(entry: MonitorEntry): number | undefined {
  if (entry.endAbs != null) return entry.endAbs;
  if (entry.durationMs != null) return startOf(entry) + entry.durationMs;
  return undefined;
}
