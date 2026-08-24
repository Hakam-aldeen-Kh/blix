"use client";

/**
 * Dev Tools — horizontal strip scrolling (the tab row, the store slice picker).
 *
 * A strip of chips that overflows is easy to build and easy to get wrong. The
 * three failures this hook exists to prevent:
 *
 * 1. **A mouse can't scroll it.** A trackpad swipes sideways; a wheel mouse
 *    only sends `deltaY`, which a horizontal scroller ignores. Every wheel user
 *    sees a strip that visibly has more in it and does not move. So vertical
 *    wheel is translated to horizontal — but only while the strip can still
 *    move that way, otherwise the page below it stops scrolling when the
 *    pointer happens to cross a tab row.
 * 2. **The fade lies.** A fade painted permanently on the right edge dims the
 *    last chip once you have scrolled to the end, and says nothing about the
 *    chips now hidden to the left. The edges here are measured, so each fade
 *    appears only over content that is actually clipped.
 * 3. **The selection hides.** Auto-selecting a slice, or restoring a tab, can
 *    land on a chip well off-screen. `activeKey` scrolls the current one back
 *    into view whenever it changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface StripEdges {
  /** Content is clipped past the left edge — there is more behind you. */
  start: boolean;
  /** Content is clipped past the right edge. */
  end: boolean;
}

export interface StripScroll<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  edges: StripEdges;
  /** Scroll roughly a screenful, `-1` towards the start and `1` towards the end. */
  page: (direction: -1 | 1) => void;
  /** Bring an element inside the strip fully into view without moving further
   * than it has to — used by the roving-focus keyboard handlers. */
  reveal: (el: HTMLElement | null) => void;
}

/** Sub-pixel layout means `scrollLeft` rarely lands exactly on the bounds. */
const EPSILON = 2;

export function useStripScroll<T extends HTMLElement>(
  /** Identifies the active chip; changing it re-reveals the selection. */
  activeKey?: string | number | null,
): StripScroll<T> {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<StripEdges>({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > EPSILON;
    const end = max > EPSILON && el.scrollLeft < max - EPSILON;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  // Deliberately un-deped: the strip re-renders when its chips change, and
  // `scrollWidth` moving is exactly what a dependency array cannot see. The
  // reads are two per render, on an element that renders on tab clicks.
  useEffect(measure);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("scroll", measure, { passive: true });

    // Non-passive, because translating the wheel means preventing the page
    // scroll it would otherwise cause. React's own onWheel is passive at the
    // root, so this cannot be a JSX prop.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented) return;
      // A trackpad's horizontal component is already the right axis; leave it.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= EPSILON) return;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const next = Math.max(0, Math.min(max, el.scrollLeft + delta));
      if (next === el.scrollLeft) return; // At the bound — let the page have it.
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      el.removeEventListener("wheel", onWheel);
      observer?.disconnect();
    };
  }, [measure]);

  /**
   * Deliberately not `scrollIntoView`: that walks every scrollable ancestor,
   * and this panel is injected into somebody else's app — a mounting tab strip
   * must not scroll the host page. It also stops at "just visible", which here
   * means "just under the fade", so the padding clears the chip of it.
   */
  const reveal = useCallback((el: HTMLElement | null) => {
    const box = ref.current;
    if (!box || !el) return;
    const pad = 28;
    const outer = box.getBoundingClientRect();
    const inner = el.getBoundingClientRect();
    if (inner.left < outer.left + pad) {
      box.scrollLeft -= outer.left + pad - inner.left;
    } else if (inner.right > outer.right - pad) {
      box.scrollLeft += inner.right - (outer.right - pad);
    }
  }, []);

  // Keeps the selected chip visible across an auto-selected slice, a restored
  // tab, or a resize that pushed it out of the viewport.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-strip-active='true']");
    reveal(el ?? null);
  }, [activeKey, reveal]);

  const page = useCallback((direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const still =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Not a full width: leaving a chip of overlap keeps the reader's place.
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: still ? "auto" : "smooth",
    });
  }, []);

  return { ref, edges, page, reveal };
}
