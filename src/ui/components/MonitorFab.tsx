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
import { Icon } from "./Icon";

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
  errors,
  pending,
  onPointerDown,
}: {
  /** Capture is stopped. Colours the dot amber rather than green. */
  paused: boolean;
  total: number;
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
        <span className="nm-fab-count" title={`${total} captured`}>
          {total}
        </span>
        {errors > 0 && (
          <span className="nm-fab-err" title={`${errors} failing`}>
            {errors}
          </span>
        )}
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
  total,
}: {
  pos: Pos;
  paused: boolean;
  total: number;
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
          <span className="nm-fab-count">{total}</span>
        </span>
      </span>
    </>
  );
}

export type { MonitorState };
