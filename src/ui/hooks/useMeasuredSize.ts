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
    let first = true;
    let latest: DOMRectReadOnly | null = null;

    const apply = () => {
      const rect = latest;
      if (!rect) return;
      // setState inside the observer callback, not an effect body.
      setSize((prev) => {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        return prev.width === width && prev.height === height
          ? prev
          : { width, height };
      });
    };

    const observer = new ResizeObserver((entries) => {
      // Always the newest box: a frame that was already scheduled must not
      // commit the size it was scheduled with.
      latest = entries[entries.length - 1]?.contentRect ?? latest;
      // The first delivery is applied at once. It arrives before the first
      // paint, and everything that picks a layout from this size - stacked or
      // side by side, which toolbar, which sidebar - would otherwise paint the
      // roomy one first and correct itself a frame later, or not at all in a
      // tab whose animation frames are paused.
      if (first) {
        first = false;
        apply();
        return;
      }
      if (frame) return;
      // rAF-throttled: a resize drag fires this at pointer rate, and each
      // update re-renders whatever consumes the size.
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
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
