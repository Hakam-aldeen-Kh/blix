"use client";

/**
 * Dev Tools — the host app's light/dark choice.
 *
 * Read off `<html>` directly: the panel portals to `<body>`, outside the React
 * tree a theme provider styles, so it cannot take a dependency on any theming
 * library. A `MutationObserver` keeps it in sync when the user switches theme
 * with the panel open. Hosts often ship more than two themes (`light`, `dark`,
 * `midnight`, `dim`); only the light/dark split matters, since the panel has
 * its own palettes.
 *
 * This is one of two inputs to what the panel actually paints — the other is
 * the developer's stored preference, which wins outright unless it is `auto`.
 * `resolveTheme` combines them. The host is observed even while a specific
 * theme is pinned: the listener is two cheap subscriptions, and it means
 * switching back to `auto` lands on the right side immediately rather than
 * waiting for the host's next class mutation.
 */

import { useEffect, useState } from "react";
import type { ThemeBase } from "../themes/themes";

function readHostTheme(): ThemeBase {
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

/** The host app's current light/dark choice, kept live. */
export function useHostTheme(): ThemeBase {
  const [host, setHost] = useState<ThemeBase>(() => readHostTheme());

  useEffect(() => {
    const sync = () => setHost(readHostTheme());
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

  return host;
}
