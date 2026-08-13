"use client";

/**
 * Dev Tools — right-click menu state.
 *
 * The menu is the monitor's own, not a Radix one: the devtool must not depend
 * on app UI, and a Radix menu would steal focus and fight the panel's
 * pointerdown-to-close handler.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import { useCallback, useEffect, useState } from "react";

export interface ContextMenuState {
  entry: MonitorEntry;
  x: number;
  y: number;
  /** Second stage for actions that need confirmation (a replayed write). */
  confirming: boolean;
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const open = useCallback((e: React.MouseEvent, entry: MonitorEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ entry, x: e.clientX, y: e.clientY, confirming: false });
  }, []);

  const close = useCallback(() => setMenu(null), []);
  const arm = useCallback(
    () => setMenu((m) => (m ? { ...m, confirming: true } : m)),
    [],
  );

  // Any scroll, resize or Escape dismisses it — a menu anchored to a viewport
  // point goes stale the moment anything moves underneath it.
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [menu]);

  return { menu, open, close, arm };
}
