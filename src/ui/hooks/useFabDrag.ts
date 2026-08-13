"use client";

/**
 * Dev Tools — the floating badge.
 *
 * A real drag lifts a ghost that follows the cursor while the target corner
 * lights up, then snaps and settles on release. A plain click (no movement)
 * opens the panel — the same interaction as the Next.js dev badge.
 */

import type { Corner, Pos } from "../../capture/monitorTypes";
import { useCallback, useState } from "react";

/** Nearest corner to a viewport point — used to snap the badge after a drag. */
export function nearestCorner(x: number, y: number): Corner {
  const v = y < window.innerHeight / 2 ? "top" : "bottom";
  const h = x < window.innerWidth / 2 ? "left" : "right";
  return `${v}-${h}` as Corner;
}

/** How far the pointer must travel before it counts as a drag, not a click. */
const DRAG_THRESHOLD = 5;

export function useFabDrag(
  onOpen: () => void,
  onDock: (corner: Corner) => void,
) {
  /** Live cursor position while dragging (null when idle) — drives the ghost
   * and the corner drop-zone hints. */
  const [dragPos, setDragPos] = useState<Pos | null>(null);
  /** Brief flag that enables the settle animation only after a snap. */
  const [docking, setDocking] = useState(false);

  const start = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;

      const onMove = (ev: PointerEvent) => {
        if (
          !moved &&
          (Math.abs(ev.clientX - startX) > DRAG_THRESHOLD ||
            Math.abs(ev.clientY - startY) > DRAG_THRESHOLD)
        ) {
          moved = true;
        }
        if (moved) setDragPos({ x: ev.clientX, y: ev.clientY });
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setDragPos(null);
        if (moved) {
          onDock(nearestCorner(ev.clientX, ev.clientY));
          setDocking(true);
          window.setTimeout(() => setDocking(false), 340);
        } else {
          onOpen();
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onDock, onOpen],
  );

  return { dragPos, docking, start };
}
