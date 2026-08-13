"use client";

/**
 * Dev Tools — follow the host app's light/dark theme.
 *
 * The panel portals to `<body>`, outside the React tree a theme provider
 * styles, so it reads the theme class off `<html>` directly rather than taking
 * a dependency on any theming library. A `MutationObserver` keeps it in sync
 * when the user switches theme with the panel open.
 *
 * Hosts often ship more than two themes (`light`, `dark`, `midnight`, `dim`);
 * only the light/dark split matters here, since the panel has its own palette.
 */

import { useEffect, useState } from "react";

export type PanelTheme = "light" | "dark";

function readTheme(): PanelTheme {
  if (typeof document === "undefined") return "dark";
  const classes = document.documentElement.classList;
  if (classes.contains("light")) return "light";
  if (
    classes.contains("dark") ||
    classes.contains("midnight") ||
    classes.contains("dim")
  ) {
    return "dark";
  }
  // No theme class yet (first paint) — fall back to the OS preference so the
  // panel doesn't flash the wrong palette.
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function useAppTheme(): PanelTheme {
  const [theme, setTheme] = useState<PanelTheme>(() => readTheme());

  useEffect(() => {
    const sync = () => setTheme(readTheme());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    media?.addEventListener?.("change", sync);

    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", sync);
    };
  }, []);

  return theme;
}
