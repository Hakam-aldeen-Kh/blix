"use client";

/** Dev Tools — the docked badge, plus its drag ghost and corner drop
 * zones. Lifted from the original panel unchanged in behaviour. */

import type { Corner, Pos } from "../../capture/monitorTypes";
import { MARGIN } from "../constants/ui";
import { nearestCorner } from "../hooks/useFabDrag";

/** Fixed-position inline style that docks the badge to a viewport corner. */
export const CORNER_STYLE: Record<Corner, React.CSSProperties> = {
  "bottom-left": { bottom: MARGIN, left: MARGIN },
  "bottom-right": { bottom: MARGIN, right: MARGIN },
  "top-left": { top: MARGIN, left: MARGIN },
  "top-right": { top: MARGIN, right: MARGIN },
};

const CORNERS: Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

export function MonitorFab({
  dotColor,
  total,
  errors,
  pending,
  docking,
  onPointerDown,
}: {
  dotColor: string;
  total: number;
  errors: number;
  pending: number;
  docking: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      className={`nm-fab${docking ? " nm-fab-dock" : ""}`}
      onPointerDown={onPointerDown}
      title="Dev Tools — click to open, drag to a corner"
    >
      <span className="nm-fab-dot" style={{ background: dotColor }}>
        {pending > 0 && <span className="nm-fab-ping" style={{ background: dotColor }} />}
      </span>
      <span className="nm-fab-label">Dev</span>
      <span className="nm-fab-count">{total}</span>
      {errors > 0 && <span className="nm-fab-err">{errors}</span>}
    </button>
  );
}

export function FabDragPreview({
  pos,
  dotColor,
  total,
}: {
  pos: Pos;
  dotColor: string;
  total: number;
}) {
  const target = nearestCorner(pos.x, pos.y);
  return (
    <>
      <span className="nm-drag-scrim" />
      {CORNERS.map((c) => (
        <span
          key={c}
          className={`nm-zone${target === c ? " active" : ""}`}
          style={CORNER_STYLE[c]}
        />
      ))}
      <span className="nm-fab nm-fab-ghost" style={{ left: pos.x, top: pos.y }}>
        <span className="nm-fab-dot" style={{ background: dotColor }} />
        <span className="nm-fab-label">Dev</span>
        <span className="nm-fab-count">{total}</span>
      </span>
    </>
  );
}
