"use client";

/**
 * Dev Tools — panel geometry across the five dock modes.
 *
 * ## Docked panels reserve their side; the float overlays
 *
 * A panel docked to an edge takes that side of the screen for itself: the host
 * page is pushed over rather than covered, the way a browser's own devtools
 * do. The bottom dock used to overlay, on the reasoning that pushing forces a
 * reflow on every pixel of a resize drag — so the reservation is written at
 * most once per animation frame while dragging, not once per pointer event.
 *
 * The space is reserved with inline `padding` on `<html>`, for the docked side
 * only, and the value that was there before is put back exactly when the dock
 * goes away. Four custom properties — `--blix-dock-top`, `-right`, `-bottom`,
 * `-left` — carry the same numbers for anything the padding cannot move: a
 * `position: fixed` or `sticky` element is laid out against the viewport, so
 * the host has to opt those in itself (`right: var(--blix-dock-right, 0px)`).
 * `--nm-dock-h` is the bottom dock's height under its original name, kept for
 * anything already reading it.
 *
 * The floating panel reserves nothing.
 *
 * ## Commit on pointerup
 *
 * Drags write geometry straight to the DOM node and only call `setState` when
 * the pointer is released. The original panel called `setSize`/`setListW` on
 * every `pointermove`, re-rendering the whole tree at pointer rate; with a
 * virtualized list that would also re-window every frame.
 */

import {
  DOCK_MODES,
  prefsStore,
  savePrefs,
} from "../../capture/monitorPersistence";
import type {
  Corner,
  DockMode,
  Pos,
  Size,
} from "../../capture/monitorTypes";
import { useCallback, useEffect, useRef, useState } from "react";
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
    // Never left of or above the margin: the stored size may be larger than
    // this screen, and the size is fitted at render while this is not.
    x: corner.endsWith("right") ? Math.max(MARGIN, window.innerWidth - size.w - MARGIN) : MARGIN,
    y: corner.startsWith("top") ? MARGIN : Math.max(MARGIN, window.innerHeight - size.h - MARGIN),
  };
}

/** The four edges a panel can dock to — every `DockMode` but `float`. */
export type DockSide = Exclude<DockMode, "float">;

const DOCK_SIDES: readonly DockSide[] = ["top", "right", "bottom", "left"];

/** Docks along the top or bottom edge are sized by height; the side docks by
 * width. */
const isRowDock = (mode: DockMode): mode is "top" | "bottom" =>
  mode === "top" || mode === "bottom";

/* ───────────────────────── reserving the docked side ──────────────────── */

/** The inline padding `<html>` carried before a dock took that side. */
interface Reservation {
  side: DockSide;
  value: string;
  priority: string;
}

/** Puts back exactly what was on `<html>` before `held` was reserved. */
function restorePadding(held: Reservation): void {
  const style = document.documentElement.style;
  const prop = `padding-${held.side}`;
  if (held.value) style.setProperty(prop, held.value, held.priority);
  else style.removeProperty(prop);
}

/**
 * Reserves `px` on `side` of the page — or nothing, for `null` — and returns
 * what is now held, for the next call to release.
 *
 * Only ever touches `<html>`'s *inline* style: the four `--blix-dock-*`
 * properties, `--nm-dock-h`, and one `padding-*`. A host that already had an
 * inline padding on that side keeps it — the dock is added to it, and it is
 * restored verbatim afterwards.
 */
function reserveSide(
  held: Reservation | null,
  side: DockSide | null,
  px: number,
): Reservation | null {
  const style = document.documentElement.style;

  for (const each of DOCK_SIDES) {
    style.setProperty(`--blix-dock-${each}`, each === side ? `${px}px` : "0px");
  }
  if (side === "bottom") style.setProperty("--nm-dock-h", `${px}px`);
  else style.removeProperty("--nm-dock-h");

  let next = held;
  if (next && next.side !== side) {
    restorePadding(next);
    next = null;
  }
  if (!side) return null;

  const prop = `padding-${side}`;
  if (!next) {
    next = {
      side,
      value: style.getPropertyValue(prop),
      priority: style.getPropertyPriority(prop),
    };
  }
  style.setProperty(
    prop,
    next.value ? `calc(${next.value} + ${px}px)` : `${px}px`,
    next.priority,
  );
  return next;
}

/** Undoes everything `reserveSide` wrote. */
function releaseAll(held: Reservation | null): void {
  const style = document.documentElement.style;
  if (held) restorePadding(held);
  for (const each of DOCK_SIDES) style.removeProperty(`--blix-dock-${each}`);
  style.removeProperty("--nm-dock-h");
}

export interface UseDockGeometry {
  mode: DockMode;
  setMode: (mode: DockMode) => void;
  /** Splitter runs vertically (list beside detail) in the wide docks, and
   * horizontally (list above detail) in the narrow side docks. */
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

  const [mode, setModeState] = useState<DockMode>(
    // Stored prefs are validated on the way in (`sanitizePrefs`); this is the
    // same check at the point of use, for a value that arrived any other way.
    DOCK_MODES.includes(initial.mode) ? initial.mode : "float",
  );
  const [bottomH, setBottomH] = useState(initial.bottomH);
  const [rightW, setRightW] = useState(initial.rightW);
  const [topH, setTopH] = useState(initial.topH);
  const [leftW, setLeftW] = useState(initial.leftW);
  const [size, setSize] = useState<Size>(initial.float.size);
  const [pos, setPos] = useState<Pos | null>(initial.float.pos);
  const [corner, setCornerState] = useState<Corner>(initial.corner);
  const [splitW, setSplitW] = useState(initial.splitW);
  const [splitH, setSplitH] = useState(initial.splitH);
  const [maximized, setMaximized] = useState(false);
  const [animating, setAnimating] = useState(false);

  const splitAxis: "x" | "y" =
    mode === "right" || mode === "left" || forceStacked ? "y" : "x";

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
      setViewport((v) =>
        v.w === window.innerWidth && v.h === window.innerHeight
          ? v
          : { w: window.innerWidth, h: window.innerHeight },
      );
    // The viewport may have changed while the panel was closed and nothing
    // was listening — and a docked panel reserves exactly what is rendered.
    onResize();
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

  // Sizes are clamped to the viewport at render time, so a panel sized on a
  // large monitor can never overflow a smaller one — while the stored
  // preference itself is left intact.
  //
  // The viewport wins over the minimum. A minimum that is wider than the
  // screen is not a floor, it is an overflow: on a 375px phone the 440px
  // floor put the panel's right edge, and the close button on it, off-screen.
  const fit = (value: number, min: number, rawRoom: number) => {
    // Never negative: a window narrower than the inset (or a hidden one, which
    // reports 0×0) would otherwise size the panel, and reserve, below zero.
    const room = Math.max(0, rawRoom);
    const floor = Math.min(min, room);
    return clamp(value, floor, Math.max(floor, room));
  };
  const fitH = (value: number, min: number, inset: number) =>
    fit(value, min, viewport.h - inset);
  const fitW = (value: number, min: number, inset: number) =>
    fit(value, min, viewport.w - inset);

  /** The docked panel's size along the axis it is docked on, as rendered. */
  const dockExtent =
    mode === "bottom"
      ? fitH(bottomH, MIN_DOCK_H, DOCK_EDGE_GAP)
      : mode === "top"
        ? fitH(topH, MIN_DOCK_H, DOCK_EDGE_GAP)
        : mode === "right"
          ? fitW(rightW, MIN_DOCK_W, DOCK_EDGE_GAP)
          : mode === "left"
            ? fitW(leftW, MIN_DOCK_W, DOCK_EDGE_GAP)
            : 0;

  // Which side is reserved right now: none while closed or floating.
  const reservedSide: DockSide | null = open && mode !== "float" ? mode : null;
  const reservation = useRef<Reservation | null>(null);

  useEffect(() => {
    reservation.current = reserveSide(reservation.current, reservedSide, dockExtent);
  }, [reservedSide, dockExtent]);

  // Unmount only — closing and switching sides go through the effect above,
  // which hands the old side back before taking the new one.
  useEffect(
    () => () => {
      releaseAll(reservation.current);
      reservation.current = null;
    },
    [],
  );

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

      const side: DockSide = mode;
      const row = isRowDock(side);
      const node = panelRef.current;
      const startAt = row ? e.clientY : e.clientX;
      const start =
        side === "bottom" ? bottomH : side === "top" ? topH : side === "right" ? rightW : leftW;
      // The inner edge is the one that moves. For the bottom and right docks
      // that is the edge nearer the origin, so dragging towards it grows them;
      // the top and left docks are the mirror image.
      const grows = side === "top" || side === "left" ? 1 : -1;
      let next = start;

      // The page follows the drag, but a reflow of the whole host per pointer
      // event is the cost the old overlay dock existed to avoid — so the
      // reservation is rewritten once per frame at most.
      let frame = 0;
      const reserveNow = () => {
        frame = 0;
        reservation.current = reserveSide(reservation.current, side, next);
      };

      dragLoop(
        (ev) => {
          const at = row ? ev.clientY : ev.clientX;
          next = clamp(
            start + grows * (at - startAt),
            row ? MIN_DOCK_H : MIN_DOCK_W,
            (row ? window.innerHeight : window.innerWidth) - DOCK_EDGE_GAP,
          );
          if (node) {
            if (row) node.style.height = `${next}px`;
            else node.style.width = `${next}px`;
          }
          if (!frame) frame = requestAnimationFrame(reserveNow);
        },
        () => {
          if (frame) cancelAnimationFrame(frame);
          reserveNow();
          if (side === "bottom") {
            setBottomH(next);
            savePrefs({ bottomH: next });
          } else if (side === "top") {
            setTopH(next);
            savePrefs({ topH: next });
          } else if (side === "right") {
            setRightW(next);
            savePrefs({ rightW: next });
          } else {
            setLeftW(next);
            savePrefs({ leftW: next });
          }
        },
      );
    },
    [bottomH, leftW, mode, panelRef, rightW, topH],
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

  const panelStyle: React.CSSProperties = maximized
    ? {
        left: MARGIN,
        top: MARGIN,
        width: `calc(100vw - ${MARGIN * 2}px)`,
        height: `calc(100vh - ${MARGIN * 2}px)`,
      }
    : mode === "bottom"
      ? { left: 0, right: 0, bottom: 0, width: "100vw", height: dockExtent }
      : mode === "top"
        ? { left: 0, right: 0, top: 0, width: "100vw", height: dockExtent }
        : mode === "right"
          ? { top: 0, right: 0, bottom: 0, width: dockExtent, height: "100vh" }
          : mode === "left"
            ? { top: 0, left: 0, bottom: 0, width: dockExtent, height: "100vh" }
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
