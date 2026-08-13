"use client";

/**
 * Dev Tools — fixed-height row virtualization.
 *
 * No library: every row (including page-load dividers) is exactly `ROW_H` tall,
 * which reduces windowing to arithmetic. The rendered slice is offset with a
 * single `translateY` on one wrapper, so scrolling touches one composited
 * property rather than repositioning each row.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { OVERSCAN, ROW_H } from "../constants/ui";
import type { VirtualWindow } from "../types/monitorUi";

export interface UseVirtualRows {
  window: VirtualWindow;
  totalHeight: number;
  offsetY: number;
  onScroll: () => void;
  /** Scroll a row index into view arithmetically — the row may not be mounted,
   * so `Element.scrollIntoView` is not an option. */
  scrollToIndex: (index: number) => void;
  scrollToTop: () => void;
  /** True when the scroller is at (or within a row or two of) the top. */
  isNearTop: () => boolean;
}

/**
 * The scroller ref is supplied by the caller rather than returned from here.
 * Returning it would make every property of this hook's result count as a ref
 * access during render under `react-hooks/refs`.
 */
export function useVirtualRows(
  total: number,
  scrollerRef: React.RefObject<HTMLDivElement | null>,
  rowHeight: number = ROW_H,
): UseVirtualRows {
  const scrollTopRef = useRef(0);
  const viewportRef = useRef(0);
  const [window_, setWindow] = useState<VirtualWindow>({ start: 0, end: 0 });

  const recompute = useCallback(() => {
    const scrollTop = scrollTopRef.current;
    const viewport = viewportRef.current;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const end = Math.min(
      total,
      Math.ceil((scrollTop + viewport) / rowHeight) + OVERSCAN,
    );

    // Regression guard: `offsetY` is `window_.start * rowHeight`, a pure
    // function of the `scrollTop` this computation used. So the one way for
    // the rendered offset to drift from the real scroll position is for this
    // function to run against a `scrollTopRef.current` that's *not* what the
    // DOM is actually at right now — a stale ref, a batched update that
    // landed late, etc. Checking that here catches the whole bug class at
    // the source rather than re-deriving and comparing `offsetY` downstream.
    const liveScrollTop = scrollerRef.current?.scrollTop;
    if (liveScrollTop != null) {
      console.assert(
        Math.abs(liveScrollTop - scrollTop) <= 1,
        `[useVirtualRows] recompute used a stale scrollTop (${scrollTop}) — DOM is at ${liveScrollTop}`,
      );
    }

    // Only re-render when the slice actually moves; a 3px scroll renders
    // nothing.
    setWindow((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, [total, rowHeight, scrollerRef]);

  // rAF-throttled: a fast wheel/trackpad fling can fire many `scroll` events
  // per frame, but only one recompute is useful per paint. Coalescing to one
  // `requestAnimationFrame` call keeps the offset in lockstep with the
  // scrollbar with no lag or jump between scroll-up and scroll-down — unlike
  // a time-based debounce, the callback always reads `scrollTop` fresh at the
  // moment it actually runs, never the value captured when the frame was
  // scheduled.
  const scrollFrameRef = useRef(0);
  const onScroll = useCallback(() => {
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      scrollTopRef.current = scrollerRef.current?.scrollTop ?? 0;
      recompute();
    });
  }, [recompute, scrollerRef]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  // One ResizeObserver covers window resize, dock resize and splitter drag —
  // no separate listeners for any of them.
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        viewportRef.current = node.clientHeight;
        scrollTopRef.current = node.scrollTop;
        recompute();
      });
    });
    observer.observe(node);
    viewportRef.current = node.clientHeight;
    recompute();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [recompute, scrollerRef]);

  // The row count changing alters the window even when nothing scrolled.
  useEffect(() => {
    recompute();
  }, [total, recompute]);

  /** Mirrors a DOM `scrollTop` write into `window_` immediately, rather than
   * waiting for the resulting native `scroll` event to reach `onScroll`. That
   * event is real but not synchronous with the write — it can land after the
   * next paint — so a caller reading `window_` (or React committing a render)
   * in between would see the *old* window against the *new* scroll position:
   * rows rendered for where the list used to be scrolled, blank space for the
   * rest of the now-revealed viewport. */
  const syncScrollTop = useCallback(
    (top: number) => {
      scrollTopRef.current = top;
      recompute();
    },
    [recompute],
  );

  const scrollToIndex = useCallback(
    (index: number) => {
      const node = scrollerRef.current;
      if (!node) return;
      const y = index * rowHeight;
      const viewport = node.clientHeight;
      if (y < node.scrollTop) {
        node.scrollTop = y;
        syncScrollTop(node.scrollTop);
      } else if (y + rowHeight > node.scrollTop + viewport) {
        node.scrollTop = y + rowHeight - viewport;
        syncScrollTop(node.scrollTop);
      }
    },
    [rowHeight, scrollerRef, syncScrollTop],
  );

  const scrollToTop = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = 0;
    syncScrollTop(0);
  }, [scrollerRef, syncScrollTop]);

  const isNearTop = useCallback(
    () => (scrollerRef.current?.scrollTop ?? 0) <= rowHeight * 2,
    [rowHeight, scrollerRef],
  );

  return {
    window: window_,
    totalHeight: total * rowHeight,
    offsetY: window_.start * rowHeight,
    onScroll,
    scrollToIndex,
    scrollToTop,
    isNearTop,
  };
}
