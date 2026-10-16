"use client";

/**
 * Dev Tools — the mark ("Aperture"), in the full-colour brand states.
 *
 * Four blades around an open centre. The blades are the four edges the panel
 * docks to, and the green one is the edge it is docked to now — a floating
 * panel has no edge, so it shows the default, bottom. The centre dot is the
 * REC light: there while capture runs, gone while it is paused.
 *
 * **Errors never reach the mark.** There is no red blade and no "failing"
 * state in the product; the failing counts already say where something
 * failed, beside the mark rather than on it.
 *
 * Colours come from `--bx-*` classes in the stylesheet, not attributes: an
 * SVG presentation attribute cannot read a custom property.
 */

import type { DockMode } from "../../capture/monitorTypes";

type Edge = "top" | "right" | "bottom" | "left";

/** [x, y, w, h, rx] on a 100-unit box — BRAND_BOOK §2. */
type Blade = readonly [number, number, number, number, number];

const NORMAL: Record<Edge, Blade> = {
  top: [10, 10, 51, 24, 5],
  right: [66, 10, 24, 51, 5],
  bottom: [39, 66, 51, 24, 5],
  left: [10, 39, 24, 51, 5],
};

/** Under 40px the blades thicken and close up, so the gaps survive the pixel
 * grid. The book drops the dot here; the product keeps it, because it is the
 * one place the launcher says whether capture is running. */
const SMALL: Record<Edge, Blade> = {
  top: [8, 8, 54, 27, 4],
  right: [65, 8, 27, 54, 4],
  bottom: [38, 65, 54, 27, 4],
  left: [8, 38, 27, 54, 4],
};

const EDGES: Edge[] = ["top", "right", "bottom", "left"];

export function BlixMark({
  size,
  dock,
  capture,
  live,
  idle,
  title,
}: {
  size: number;
  /** The edge that is lit. `float` lights the default edge, bottom. */
  dock: DockMode;
  /** `on` shows the REC dot; `paused` and `none` leave the centre open. */
  capture: "on" | "paused" | "none";
  /** Requests in flight — the dot pulses. */
  live?: boolean;
  /** The brand's idle state: every blade grey, none lit. For empty states. */
  idle?: boolean;
  title?: string;
}) {
  const small = size < 40;
  const geometry = small ? SMALL : NORMAL;
  const lit: Edge = dock === "float" ? "bottom" : dock;
  return (
    <svg
      className="nm-logo"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      data-live={live || undefined}
      data-idle={idle || undefined}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {EDGES.map((edge) => {
        const [x, y, w, h, rx] = geometry[edge];
        return (
          <rect
            key={edge}
            className={`nm-logo-b nm-logo-${edge}`}
            data-lit={edge === lit || undefined}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={rx}
          />
        );
      })}
      {capture === "on" && <circle className="nm-logo-dot" cx={50} cy={50} r={small ? 9 : 7} />}
    </svg>
  );
}
