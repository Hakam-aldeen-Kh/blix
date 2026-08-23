/** Dev Tools — layout constants and the semantic colour *roles*.
 *
 * No colour values live here any more. A component names the role a piece of
 * UI plays — `data-state="error"`, `data-accent="post"` — and the stylesheet
 * resolves it through the active theme's tokens (`themes/themes.ts`). That is
 * what lets a theme restate every colour in the panel instead of only the ones
 * CSS happened to own: the previous split, with a light palette in CSS and a
 * duplicate dark one in JS, could not be themed and drifted between the two.
 */

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

/**
 * The accent a method/kind badge paints in, as a `data-accent` value.
 *
 * HTTP rows are coloured by verb; everything else takes its section's identity
 * colour instead. That second half matters: colouring purely by verb gave WS,
 * Redux and Query rows one indistinguishable fallback, when the section colour
 * is exactly the signal the reader wants — Redux and Query lean toward their
 * own standalone devtools' brands (violet, orange), which a React developer
 * already has an association for.
 */
export type AccentKey =
  | "get"
  | "post"
  | "put"
  | "delete"
  | "other"
  | "realtime"
  | "redux"
  | "query";

export function accentKey(kind: string | undefined, method: string): AccentKey {
  switch (kind) {
    case "ws":
      return "realtime";
    case "redux":
      return "redux";
    case "query":
      return "query";
  }
  switch (method) {
    case "GET":
      return "get";
    case "POST":
      return "post";
    case "PUT":
    case "PATCH":
      return "put";
    case "DELETE":
      return "delete";
    default:
      return "other";
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
