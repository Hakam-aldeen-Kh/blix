"use client";

/**
 * Dev Tools — panel geometry across the three dock modes.
 *
 * ## Overlay, not push
 *
 * The bottom dock overlays the host app rather than shrinking it. Pushing
 * would work, but it would force a full app reflow on every pixel of a resize
 * drag — any nested scroll containers would all recompute their heights — and
 * it would make production layout depend on a devtool. The only thing written
 * to the
 * document is a `--nm-dock-h` custom property, read solely by the monitor's own
 * badge so it can sit above the dock.
 *
 * ## Commit on pointerup
 *
 * Drags write geometry straight to the DOM node and only call `setState` when
 * the pointer is released. The original panel called `setSize`/`setListW` on
 * every `pointermove`, re-rendering the whole tree at pointer rate; with a
 * virtualized list that would also re-window every frame.
 */

import {
  prefsStore,
  savePrefs,
} from "../../capture/monitorPersistence";
import type {
  Corner,
  DockMode,
  Pos,
  Size,
} from "../../capture/monitorTypes";
import { useCallback, useEffect, useState } from "react";
import {
  DOCK_EDGE_GAP,
  KEEP_VISIBLE,
  MARGIN,
  MIN_DETAIL_H,
  MIN_DETAIL_W,
  MIN_DOCK_H,
  MIN_DOCK_W,
  MIN_H,
  MIN_LIST_H,
  MIN_LIST_W,
  MIN_W,
} from "../constants/ui";
import { clamp } from "../helpers/format";

/** Allow the panel to be dragged partly off-screen, but always keep at least
 * KEEP_VISIBLE px on each edge — and the full header band on top — so it can
 * always be grabbed and pulled back. */
export function clampPos(pos: Pos, size: Size): Pos {
  if (typeof window === "undefined") return pos;
  return {
    x: clamp(pos.x, KEEP_VISIBLE - size.w, window.innerWidth - KEEP_VISIBLE),
    y: clamp(pos.y, 0, window.innerHeight - KEEP_VISIBLE),
  };
}

export function defaultPosForCorner(corner: Corner, size: Size): Pos {
  if (typeof window === "undefined") return { x: MARGIN, y: MARGIN };
  return {
    x: corner.endsWith("right") ? window.innerWidth - size.w - MARGIN : MARGIN,
    y: corner.startsWith("top") ? MARGIN : window.innerHeight - size.h - MARGIN,
  };
}

export interface UseDockGeometry {
  mode: DockMode;
  setMode: (mode: DockMode) => void;
  /** Splitter runs vertically (list beside detail) in the wide docks, and
   * horizontally (list above detail) in the narrow right dock. */
  splitAxis: "x" | "y";
  splitSize: number;
  maximized: boolean;
  toggleMaximize: () => void;
  animating: boolean;
  panelStyle: React.CSSProperties;
  corner: Corner;
  setCorner: (corner: Corner) => void;
  ensureFloatPos: () => void;
  startPanelDrag: (e: React.PointerEvent) => void;
  startPanelResize: (e: React.PointerEvent) => void;
  startDockResize: (e: React.PointerEvent) => void;
  startSplit: (e: React.PointerEvent) => void;
}

/** Shared pointer-capture loop: `onMove` writes to the DOM, `onDone` commits. */
function dragLoop(
  onMove: (e: PointerEvent) => void,
  onDone: () => void,
): void {
  const move = (e: PointerEvent) => onMove(e);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onDone();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/**
 * The panel ref is supplied by the caller rather than returned from here.
 * Returning it would make every property of this hook's result count as a ref
 * access during render under `react-hooks/refs`.
 */
export function useDockGeometry(
  open: boolean,
  panelRef: React.RefObject<HTMLDivElement | null>,
  /** Forces the list above the detail regardless of dock mode — set when the
   * panel is too narrow to give both panes their minimum side by side. */
  forceStacked = false,
): UseDockGeometry {
  const initial = prefsStore.getSnapshot().prefs;

  const [mode, setModeState] = useState<DockMode>(initial.mode);
  const [bottomH, setBottomH] = useState(initial.bottomH);
  const [rightW, setRightW] = useState(initial.rightW);
  const [size, setSize] = useState<Size>(initial.float.size);
  const [pos, setPos] = useState<Pos | null>(initial.float.pos);
  const [corner, setCornerState] = useState<Corner>(initial.corner);
  const [splitW, setSplitW] = useState(initial.splitW);
  const [splitH, setSplitH] = useState(initial.splitH);
  const [maximized, setMaximized] = useState(false);
  const [animating, setAnimating] = useState(false);

  const splitAxis: "x" | "y" = mode === "right" || forceStacked ? "y" : "x";

  const setMode = useCallback((next: DockMode) => {
    setModeState(next);
    setMaximized(false);
    savePrefs({ mode: next });
    setAnimating(true);
    window.setTimeout(() => setAnimating(false), 320);
  }, []);

  const setCorner = useCallback((next: Corner) => {
    setCornerState(next);
    savePrefs({ corner: next });
  }, []);

  const toggleMaximize = useCallback(() => {
    setMaximized((m) => !m);
    setAnimating(true);
    window.setTimeout(() => setAnimating(false), 320);
  }, []);

  /** Give the floating panel a position the first time it is opened. */
  const ensureFloatPos = useCallback(() => {
    setPos((p) => p ?? clampPos(defaultPosForCorner(corner, size), size));
  }, [corner, size]);

  // Viewport dimensions, tracked so geometry can be clamped during render.
  // Clamping the stored values instead would mean writing state from an
  // effect, and would also destroy the user's chosen size: shrink the window
  // and grow it again, and their 900px dock should come back.
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  useEffect(() => {
    if (!open) return;
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Keep a floating panel on-screen when the window is resized.
  useEffect(() => {
    if (!open || mode !== "float") return;
    const onResize = () => setPos((p) => (p ? clampPos(p, size) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, mode, size]);

  // Expose the dock's height so the badge can sit clear of it.
  useEffect(() => {
    const root = document.documentElement;
    if (open && mode === "bottom") {
      root.style.setProperty("--nm-dock-h", `${bottomH}px`);
    } else {
      root.style.removeProperty("--nm-dock-h");
    }
    return () => {
      root.style.removeProperty("--nm-dock-h");
    };
  }, [open, mode, bottomH]);

  const startPanelDrag = useCallback(
    (e: React.PointerEvent) => {
      // Only the floating panel moves; the docks are pinned to an edge.
      if (mode !== "float" || maximized) return;
      if ((e.target as HTMLElement).closest("button, input, .nm-resize")) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const base = pos ?? { x: MARGIN, y: MARGIN };
      const node = panelRef.current;
      let next = base;

      dragLoop(
        (ev) => {
          next = clampPos(
            {
              x: base.x + (ev.clientX - startX),
              y: base.y + (ev.clientY - startY),
            },
            size,
          );
          if (node) {
            node.style.left = `${next.x}px`;
            node.style.top = `${next.y}px`;
          }
        },
        () => {
          setPos(next);
          savePrefs({ float: { pos: next, size, maximized: false } });
        },
      );
    },
    [maximized, mode, panelRef, pos, size],
  );

  const startPanelResize = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== "float" || maximized) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const origin = pos ?? { x: MARGIN, y: MARGIN };
      const node = panelRef.current;
      let next = size;

      dragLoop(
        (ev) => {
          const maxW = Math.max(MIN_W, window.innerWidth - Math.max(0, origin.x));
          const maxH = Math.max(MIN_H, window.innerHeight - Math.max(0, origin.y));
          next = {
            w: clamp(size.w + (ev.clientX - startX), MIN_W, maxW),
            h: clamp(size.h + (ev.clientY - startY), MIN_H, maxH),
          };
          if (node) {
            node.style.width = `${next.w}px`;
            node.style.height = `${next.h}px`;
          }
        },
        () => {
          setSize(next);
          savePrefs({ float: { pos, size: next, maximized: false } });
        },
      );
    },
    [maximized, mode, panelRef, pos, size],
  );

  /** Drag the dock's inner edge to resize it. */
  const startDockResize = useCallback(
    (e: React.PointerEvent) => {
      if (mode === "float") return;
      e.preventDefault();
      e.stopPropagation();

      const node = panelRef.current;
      const startX = e.clientX;
      const startY = e.clientY;
      const startH = bottomH;
      const startW = rightW;
      let nextH = startH;
      let nextW = startW;

      dragLoop(
        (ev) => {
          if (mode === "bottom") {
            // Dragging up grows the dock.
            nextH = clamp(
              startH - (ev.clientY - startY),
              MIN_DOCK_H,
              window.innerHeight - DOCK_EDGE_GAP,
            );
            if (node) node.style.height = `${nextH}px`;
          } else {
            nextW = clamp(
              startW - (ev.clientX - startX),
              MIN_DOCK_W,
              window.innerWidth - DOCK_EDGE_GAP,
            );
            if (node) node.style.width = `${nextW}px`;
          }
        },
        () => {
          if (mode === "bottom") {
            setBottomH(nextH);
            savePrefs({ bottomH: nextH });
          } else {
            setRightW(nextW);
            savePrefs({ rightW: nextW });
          }
        },
      );
    },
    [bottomH, mode, panelRef, rightW],
  );

  const startSplit = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const panel = panelRef.current;
      const list = panel?.querySelector<HTMLElement>(".nm-list");
      const startX = e.clientX;
      const startY = e.clientY;
      const horizontal = splitAxis === "x";
      const start = horizontal ? splitW : splitH;
      const extent = horizontal
        ? (panel?.offsetWidth ?? MIN_LIST_W + MIN_DETAIL_W)
        : (panel?.offsetHeight ?? MIN_LIST_H + MIN_DETAIL_H);
      let next = start;

      dragLoop(
        (ev) => {
          next = horizontal
            ? clamp(
                start + (ev.clientX - startX),
                MIN_LIST_W,
                Math.max(MIN_LIST_W, extent - MIN_DETAIL_W),
              )
            : clamp(
                start + (ev.clientY - startY),
                MIN_LIST_H,
                Math.max(MIN_LIST_H, extent - MIN_DETAIL_H),
              );
          if (list) {
            if (horizontal) {
              list.style.width = `${next}px`;
              list.style.flexBasis = `${next}px`;
            } else {
              list.style.height = `${next}px`;
              list.style.flexBasis = `${next}px`;
            }
          }
        },
        () => {
          if (horizontal) {
            setSplitW(next);
            savePrefs({ splitW: next });
          } else {
            setSplitH(next);
            savePrefs({ splitH: next });
          }
        },
      );
    },
    [panelRef, splitAxis, splitH, splitW],
  );

  // Sizes are clamped to the viewport at render time, so a panel sized on a
  // large monitor can never overflow a smaller one — while the stored
  // preference itself is left intact.
  const fitH = (value: number, min: number, inset: number) =>
    clamp(value, Math.min(min, viewport.h), Math.max(min, viewport.h - inset));
  const fitW = (value: number, min: number, inset: number) =>
    clamp(value, Math.min(min, viewport.w), Math.max(min, viewport.w - inset));

  const panelStyle: React.CSSProperties = maximized
    ? {
        left: MARGIN,
        top: MARGIN,
        width: `calc(100vw - ${MARGIN * 2}px)`,
        height: `calc(100vh - ${MARGIN * 2}px)`,
      }
    : mode === "bottom"
      ? {
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: fitH(bottomH, MIN_DOCK_H, DOCK_EDGE_GAP),
        }
      : mode === "right"
        ? {
            top: 0,
            right: 0,
            bottom: 0,
            width: fitW(rightW, MIN_DOCK_W, DOCK_EDGE_GAP),
            height: "100vh",
          }
        : {
            left: pos?.x ?? MARGIN,
            top: pos?.y ?? MARGIN,
            width: fitW(size.w, MIN_W, MARGIN * 2),
            height: fitH(size.h, MIN_H, MARGIN * 2),
          };

  return {
    mode,
    setMode,
    splitAxis,
    splitSize: splitAxis === "x" ? splitW : splitH,
    maximized,
    toggleMaximize,
    animating,
    panelStyle,
    corner,
    setCorner,
    ensureFloatPos,
    startPanelDrag,
    startPanelResize,
    startDockResize,
    startSplit,
  };
}
