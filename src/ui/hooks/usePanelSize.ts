"use client";

/**
 * Dev Tools — panel dimensions and the breakpoints derived from them.
 *
 * The panel's size is independent of the viewport: a right dock is ~500px wide
 * on a 4K monitor and a maximized float is ~2000px wide on the same screen. So
 * every layout decision here keys off the panel, never `window.innerWidth`.
 *
 * CSS handles the presentational collapsing via container queries; this hook
 * exists for the changes that need the DOM itself to differ — stacking the
 * split and moving toolbar actions into an overflow menu.
 */

import { MIN_DETAIL_W, MIN_LIST_W } from "../constants/ui";
import { useMeasuredSize } from "./useMeasuredSize";

/** Width below which a side-by-side split can't give both panes their minimum.
 * `+5` is the splitter itself. */
export const STACK_BELOW = MIN_LIST_W + 5 + MIN_DETAIL_W;

/** Below this the toolbar can't hold every action at full size. */
const COMPACT_TOOLBAR_BELOW = 900;
/** Below this even the dock switcher has to move into the overflow menu. */
const TINY_TOOLBAR_BELOW = 620;
/** Below this a stacked split has no room for two useful panes either. */
const SHORT_PANEL_BELOW = 420;

export interface PanelSize {
  width: number;
  height: number;
  /** True once a real measurement has landed. Before that, render the roomy
   * layout rather than briefly flashing the compact one. */
  measured: boolean;
  /** List above detail instead of beside it. */
  stacked: boolean;
  /** Secondary toolbar actions move into an overflow menu. */
  compactToolbar: boolean;
  /** The dock switcher moves there too. */
  tinyToolbar: boolean;
  /** Too short to show both panes; the detail takes over when something is
   * selected. */
  shortPanel: boolean;
}

export function usePanelSize(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
): PanelSize {
  const size = useMeasuredSize(ref, active);
  const measured = size.width > 0;

  return {
    width: size.width,
    height: size.height,
    measured,
    stacked: measured && size.width < STACK_BELOW,
    compactToolbar: measured && size.width < COMPACT_TOOLBAR_BELOW,
    tinyToolbar: measured && size.width < TINY_TOOLBAR_BELOW,
    shortPanel: measured && size.height > 0 && size.height < SHORT_PANEL_BELOW,
  };
}
