"use client";

/**
 * Dev Tools — one shared ticker for the whole panel.
 *
 * Pending waterfall bars need a moving "now". A timer per row would be absurd;
 * this is a single interval that only runs while something is actually pending
 * and the tab is visible.
 */

import { useEffect, useState } from "react";
import { whenIdle } from "../helpers/whenIdle";

const TICK_MS = 250;

export function useMonitorClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    // Checked on every visibility change, not just once at mount — a tab
    // backgrounded *after* this effect ran would otherwise keep ticking
    // (and, with Redux/Query sections open, re-rendering) indefinitely.
    // Each tick waits for an idle moment, so it never interrupts a render the
    // host has under way — see `whenIdle`. At most one is waiting at a time.
    let id: ReturnType<typeof setInterval> | null = null;
    let tick: (() => void) | null = null;
    const start = () => {
      if (id != null) return;
      id = setInterval(() => {
        tick ??= whenIdle(() => {
          tick = null;
          setNow(Date.now());
        });
      }, TICK_MS);
    };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
      tick?.();
      tick = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [active]);

  return now;
}
