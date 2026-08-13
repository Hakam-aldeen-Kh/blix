/**
 * Dev Tools — waterfall geometry.
 *
 * ## The `performance.now()` origin trap
 *
 * `MonitorEntry.startTime`/`endTime` are relative to `performance.timeOrigin`,
 * which is different for every page load. A restored entry's `startTime` is
 * therefore meaningless when compared against the current load's. Everything
 * here uses `startAbs`/`endAbs` — absolute epoch ms computed at capture — and
 * never touches `startTime`/`endTime`.
 */

import { PENDING_WINDOW_CAP_MS } from "../../capture/monitorConfig";
import type { MonitorEntry } from "../../capture/networkMonitor";
import type { Timeline } from "../types/monitorUi";

const MIN_SPAN_MS = 50;
const MIN_BAR_PCT = 0.6;
/** 2% of headroom on the right so a bar never touches the column edge. */
const PADDING = 1.02;

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
 * Builds one timeline window per page-load group.
 *
 * Deliberately per-`loadId` rather than one global window: with "Preserve log"
 * on, the gap between two page loads can be hours, and a single window would
 * compress an entire session's bars into a sub-pixel sliver at the right edge.
 * Chrome restarts its timeline at each navigation for the same reason.
 */
export function computeTimelines(
  entries: MonitorEntry[],
  nowAbs: number,
): Map<string, Timeline> {
  const bounds = new Map<string, { t0: number; t1: number }>();

  for (const entry of entries) {
    const start = startOf(entry);
    // A hung request stops widening the window after PENDING_WINDOW_CAP_MS,
    // so one stuck call can't squash every other bar.
    const end =
      endOf(entry) ?? Math.min(nowAbs, start + PENDING_WINDOW_CAP_MS);

    const current = bounds.get(entry.loadId);
    if (!current) {
      bounds.set(entry.loadId, { t0: start, t1: end });
    } else {
      if (start < current.t0) current.t0 = start;
      if (end > current.t1) current.t1 = end;
    }
  }

  const out = new Map<string, Timeline>();
  bounds.forEach((b, loadId) => {
    out.set(loadId, {
      t0: b.t0,
      span: Math.max(b.t1 - b.t0, MIN_SPAN_MS) * PADDING,
    });
  });
  return out;
}

export interface BarGeometry {
  left: number;
  width: number;
  /** True when the request is still running, so the bar renders open-ended. */
  live: boolean;
  /** True when a pending request has outrun the window cap. */
  overflowed: boolean;
}

export function barGeometry(
  entry: MonitorEntry,
  timeline: Timeline | undefined,
  nowAbs: number,
): BarGeometry {
  if (!timeline || timeline.span <= 0) {
    return { left: 0, width: MIN_BAR_PCT, live: false, overflowed: false };
  }

  const start = startOf(entry);
  const finish = endOf(entry);
  const live = finish === undefined && entry.state === "pending";
  const overflowed = live && nowAbs - start > PENDING_WINDOW_CAP_MS;
  const end = finish ?? nowAbs;

  let left = ((start - timeline.t0) / timeline.span) * 100;
  const width = Math.max(((end - start) / timeline.span) * 100, MIN_BAR_PCT);
  left = Math.max(0, Math.min(left, 100 - width));

  return { left, width: Math.min(width, 100), live, overflowed };
}
