"use client";

/**
 * Dev Tools — rAF-throttled `ResizeObserver` measurement of a DOM node.
 *
 * Shared by `usePanelSize` (the whole panel) and `RequestTable` (just the
 * list pane, to know when to drop columns) — both need the same
 * guard-against-concurrent-frames / measure-in-rAF / dedupe-on-unchanged-size
 * dance, so it lives here once instead of twice.
 */

import { useEffect, useState } from "react";

export interface MeasuredSize {
  width: number;
  height: number;
}

export function useMeasuredSize(
  ref: React.RefObject<HTMLElement | null>,
  active = true,
): MeasuredSize {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!active || !node || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      if (frame) return;
      // rAF-throttled: a resize drag fires this at pointer rate, and each
      // update re-renders whatever consumes the size.
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = entries[0]?.contentRect;
        if (!rect) return;
        // setState inside the observer callback, not an effect body.
        setSize((prev) => {
          const width = Math.round(rect.width);
          const height = Math.round(rect.height);
          return prev.width === width && prev.height === height
            ? prev
            : { width, height };
        });
      });
    });

    observer.observe(node);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref, active]);

  return size;
}
