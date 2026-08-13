/** Dev Tools — layout constants and palette. */

import type { MonitorState } from "../../capture/networkMonitor";
import type { PanelTheme } from "../hooks/useAppTheme";

/**
 * Row heights per density setting.
 *
 * Every row — including page-load dividers — is exactly this tall, which is
 * what reduces virtualization to arithmetic. The value is also published as the
 * `--nm-row-h` custom property so CSS and the virtualizer can never disagree.
 */
export type Density = "compact" | "normal" | "comfy";

export const DENSITY_ROW_H: Record<Density, number> = {
  compact: 22,
  normal: 26,
  comfy: 32,
};

/** Default row height; used where density isn't threaded through. */
export const ROW_H = DENSITY_ROW_H.normal;
export const OVERSCAN = 8;

export const MIN_W = 440;
export const MIN_H = 340;
/** Gap from the viewport edges for the docked badge. */
export const MARGIN = 16;
/** px of the panel that must stay on-screen when dragged off. */
export const KEEP_VISIBLE = 56;

/** Bounds for the list/detail splitter, per axis. */
/* Below this the table can't show even Name + Status legibly. */
export const MIN_LIST_W = 240;
export const MIN_DETAIL_W = 340;
export const MIN_LIST_H = 120;
export const MIN_DETAIL_H = 160;

/** Bounds for the dock edges. */
export const MIN_DOCK_H = 220;
export const MIN_DOCK_W = 380;
export const DOCK_EDGE_GAP = 80;

export const STATE_COLORS: Record<MonitorState, string> = {
  pending: "#fbbf24",
  success: "#34d399",
  error: "#f87171",
  // Restored from a previous page load and still pending — it can never
  // complete, so it gets its own muted colour rather than spinning forever.
  aborted: "#94a3b8",
};

export const NEUTRAL = "#cbd5e1";

export function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "#60a5fa";
    case "POST":
      return "#34d399";
    case "PUT":
    case "PATCH":
      return "#fbbf24";
    case "DELETE":
      return "#f87171";
    default:
      return "#c084fc";
  }
}

/**
 * Per-section identity colours — Redux and Query each get a colour close to
 * their own devtool's brand (violet, orange) so the accent itself hints at
 * which world a row belongs to, the same instinct a React dev already has
 * for the standalone Redux/Query devtools. Realtime gets a cyan distinct
 * from both the HTTP method palette and the semantic success/error/warning
 * colours it sits next to on a WS row.
 *
 * Plain hex, not CSS custom properties: call sites splice an alpha suffix
 * onto the string (`` `${color}1c` ``) for the tinted background, which only
 * works on a literal hex value. Keep in sync with `--nm-c-*` in
 * `styles/monitorStyles.ts` — dark values here must match the `:root` block
 * there, light values must match the `.nm-light` block, since `kindAccent`
 * is a plain JS function with no way to read the CSS custom property that
 * section tabs/rows use for the same colour.
 */
export const KIND_ACCENT = {
  realtime: "#22d3ee",
  redux: "#a78bfa",
  query: "#fb923c",
} as const;

const KIND_ACCENT_LIGHT = {
  realtime: "#0891a8",
  redux: "#7c3aed",
  query: "#ea7317",
} as const;

/** `methodColor` for HTTP, a fixed per-section colour for everything else —
 * replaces `methodColor`'s generic purple fallback, which gave WS, Redux and
 * Query rows the same indistinguishable colour. `theme` picks the palette
 * that matches `--nm-c-*`'s light/dark split so a method badge never mismatches
 * the section tab/row colour it sits next to. */
export function kindAccent(
  kind: string | undefined,
  method: string,
  theme: PanelTheme = "dark",
): string {
  const palette = theme === "light" ? KIND_ACCENT_LIGHT : KIND_ACCENT;
  switch (kind) {
    case "ws":
      return palette.realtime;
    case "redux":
      return palette.redux;
    case "query":
      return palette.query;
    default:
      return methodColor(method);
  }
}

/** Human-readable reason phrase for the common HTTP status codes. */
export const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  408: "Request Timeout",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/* ── JSON tree bounds ──────────────────────────────────────────────────── */

/** Auto-expand to this depth on open… */
export const AUTO_DEPTH = 2;
/** …but stop early once this many nodes would be visible. */
export const AUTO_NODE_BUDGET = 200;
/** Arrays render this many children at a time. */
export const ARRAY_PAGE = 100;
/** Hard ceiling on rendered tree rows. */
export const MAX_RENDERED_NODES = 5000;
/** Strings longer than this are collapsed behind an expand chip. */
export const INLINE_STRING_CAP = 200;
/** Strings at least this long that look like base64 are never rendered as
 * text — this is what stops `/attachments/get` from choking the panel. */
export const BASE64_SNIFF_MIN = 10 * 1024;
/** Ceiling on nodes visited while auto-expanding to search matches. */
export const MAX_SEARCH_NODES = 20_000;
