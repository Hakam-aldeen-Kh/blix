"use client";

/**
 * Dev Tools — the launcher, plus its drag ghost and corner drop zones.
 *
 * The panel collapsed to one line: same height as the header, same wordmark,
 * same capture dot. A launcher that looks like a different product from the
 * thing it launches is a thing you have to learn twice.
 *
 * **The dot is capture state, not buffer state.** It used to carry the worst
 * status in the log — which is the failing count, two segments along, said
 * again in a different shape. Whether capture is *running* is the one fact
 * nothing else on the badge carries.
 */

import type { Corner, MonitorState, Pos } from "../../capture/monitorTypes";
import { MARGIN } from "../constants/ui";
import { nearestCorner } from "../hooks/useFabDrag";
import type { Section } from "../types/monitorUi";
import { Icon } from "./Icon";
import { SECTION_DEFS } from "./SourcesRail";

/**
 * One segment per source that has captured anything, with the rail's icon and
 * the source's colour — the badge answers "what is in there" without opening
 * the panel. Empty sources are left out rather than shown as a row of zeros.
 */
function SourceCounts({
  counts,
  errors,
}: {
  counts: Record<Section, number>;
  /** Failing entries per source, shown in red beside that source's count so
   * the badge says *where* something failed, not only that it did. */
  errors?: Record<Section, number>;
}) {
  const present = SECTION_DEFS.filter((s) => counts[s.id] > 0);
  if (present.length === 0) return <span className="nm-fab-count">0</span>;
  return (
    <>
      {present.map((s) => {
        const failed = errors?.[s.id] ?? 0;
        return (
          <span
            key={s.id}
            className="nm-fab-src"
            data-src={s.id}
            title={`${counts[s.id]} ${s.label}${failed > 0 ? `, ${failed} failing` : ""}`}
          >
            <Icon name={s.icon} size={11} />
            {counts[s.id]}
            {failed > 0 && <span className="nm-fab-err">{failed}</span>}
          </span>
        );
      })}
    </>
  );
}

/** Fixed-position inline style that docks the badge to a viewport corner. */
export const CORNER_STYLE: Record<Corner, React.CSSProperties> = {
  "bottom-left": { bottom: MARGIN, left: MARGIN },
  "bottom-right": { bottom: MARGIN, right: MARGIN },
  "top-left": { top: MARGIN, left: MARGIN },
  "top-right": { top: MARGIN, right: MARGIN },
};

/** The four places the badge can live, and what each one is called — a drop
 * zone with no label is an empty rectangle that appears from nowhere. */
const CORNERS: { id: Corner; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

/** One constant for the badge and its ghost — they are the same object to the
 * reader, and had drifted apart into two different words. Lower case, to
 * match the wordmark in the header. */
const BADGE_LABEL = "blix";

export function MonitorFab({
  paused,
  total,
  counts,
  sourceErrors,
  errors,
  pending,
  onPointerDown,
}: {
  /** Failing entries per source, shown beside each source's count. */
  sourceErrors: Record<Section, number>;
  /** Capture is stopped. Colours the dot amber rather than green. */
  paused: boolean;
  total: number;
  /** Entries per source, for the per-source segments. */
  counts: Record<Section, number>;
  errors: number;
  pending: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      className="nm-fab"
      data-paused={paused || undefined}
      data-live={pending > 0 || undefined}
      onPointerDown={onPointerDown}
      aria-label={`Blix — ${total} captured${errors > 0 ? `, ${errors} failing` : ""}`}
      title="Blix — click to open, drag to a corner"
    >
      <span className="nm-fab-brand">
        <span className="nm-fab-dot" />
        <span className="nm-fab-label">{BADGE_LABEL}</span>
      </span>
      <span className="nm-fab-sep" />
      <span className="nm-fab-stats">
        <SourceCounts counts={counts} errors={sourceErrors} />
      </span>
      <span className="nm-fab-grip" aria-hidden>
        <Icon name="grip" size={12} />
      </span>
    </button>
  );
}

export function FabDragPreview({
  pos,
  paused,
  counts,
}: {
  pos: Pos;
  paused: boolean;
  counts: Record<Section, number>;
}) {
  const target = nearestCorner(pos.x, pos.y);
  return (
    <>
      {CORNERS.map((c) => (
        <span
          key={c.id}
          className={`nm-zone${target === c.id ? " active" : ""}`}
          style={CORNER_STYLE[c.id]}
        >
          {c.label}
        </span>
      ))}
      <span
        className="nm-fab nm-fab-ghost"
        data-paused={paused || undefined}
        style={{ left: pos.x, top: pos.y }}
      >
        <span className="nm-fab-brand">
          <span className="nm-fab-dot" />
          <span className="nm-fab-label">{BADGE_LABEL}</span>
        </span>
        <span className="nm-fab-sep" />
        <span className="nm-fab-stats">
          <SourceCounts counts={counts} />
        </span>
      </span>
    </>
  );
}

export type { MonitorState };
