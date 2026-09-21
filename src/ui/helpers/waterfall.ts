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

/**
 * The list's shared timing scale, rounded up to two significant figures.
 *
 * The bars are only worth drawing if they are comparable, which means one
 * scale for the whole list rather than each row against itself. Rounding it
 * gives the axis a number a reader can hold — 1.6s rather than 1.52s — and
 * keeps the scale still while rows arrive, instead of every bar in the list
 * rescaling because one request finished 40ms slower than the last worst.
 */
export function niceScale(maxMs: number): number {
  if (!(maxMs > 0)) return 1000;
  const magnitude = 10 ** (Math.floor(Math.log10(maxMs)) - 1);
  return Math.ceil(maxMs / magnitude) * magnitude;
}

/** How one row's bar sits on that scale, as percentages of it. */
export interface RowTiming {
  offsetPct: number;
  waitPct: number;
  transferPct: number;
}

/**
 * A row's bar geometry.
 *
 * The three segments are `offset · wait · transfer`, and only the third is
 * filled today: the capture layer records when a request started and when it
 * ended, and nothing in between. There is no time-to-first-byte, so there is
 * no honest place to put the boundary between waiting and transferring, and
 * an invented one would be worse than an absent one — a two-tone bar is read
 * as a measurement.
 *
 * The other two segments are computed and kept at zero rather than deleted,
 * so that the day TTFB is captured this is where it goes and nothing above it
 * has to change.
 */
export function rowTiming(
  entry: MonitorEntry,
  scaleMs: number,
  nowAbs: number,
): RowTiming {
  // An in-flight request grows against the same scale as the finished ones,
  // so one that is *becoming* the slowest of the session says so while it is
  // still running.
  const ms =
    entry.durationMs ??
    (entry.state === "pending" ? Math.max(0, nowAbs - startOf(entry)) : 0);
  const pct = scaleMs > 0 ? Math.min(100, (ms / scaleMs) * 100) : 0;
  return { offsetPct: 0, waitPct: 0, transferPct: pct };
}
