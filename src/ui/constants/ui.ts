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

/* Two lines of content now sit in the duration column — the number and its
 * bar — so the floor is a few pixels taller than it was when every cell was a
 * single line. */
export const DENSITY_ROW_H: Record<Density, number> = {
  compact: 26,
  normal: 30,
  comfy: 36,
};

/**
 * Default row height; used where density isn't threaded through.
 *
 * This is the one size the token layer does not own, and deliberately: row
 * height is a *setting*. The panel writes the active step onto the root
 * element as `--bx-row`, so CSS and the virtualizer read one number and there
 * is no second copy in `tokens.ts` to drift from this one.
 */
export const ROW_H = DENSITY_ROW_H.compact;
export const OVERSCAN = 8;

/**
 * Sources sidebar, expanded and icons-only.
 *
 * These mirror `--bx-w-side` and `--bx-w-side-collapsed`. The numbers live
 * here as well because the sidebar is laid out with an inline width — a flex
 * child's basis is set in JS, where CSS cannot reach it.
 */
export const RAIL_W = 180;
export const RAIL_W_MINI = 34;

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
/** Ceiling on nodes visited by an Alt-click expand/collapse of a whole
 * subtree. Well above `MAX_RENDERED_NODES`, since expanding past the render
 * cap is only set entries, but still bounded — the click must not walk an
 * unbounded response. */
export const DEEP_EXPAND_NODES = 20_000;

/* ── Row columns ───────────────────────────────────────────────────────── */

/**
 * The columns a developer can switch off, in row order.
 *
 * ROUTE is absent on purpose: it is the one column that says *which* entry a
 * row is, and a list of rows you cannot identify is not a list. Everything
 * else is optional — which is the point, because what matters differs by what
 * you are chasing. Hunting a payload size and hunting a 500 want different
 * tables.
 *
 * The ids double as the `data-col` attribute on both the cell and its header,
 * so hiding one is a single rule rather than a pair that can disagree.
 */
export const TOGGLEABLE_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "pin", label: "Pin" },
  { id: "method", label: "Method" },
  { id: "size", label: "Size" },
  { id: "status", label: "Status" },
  { id: "time", label: "Time" },
  { id: "links", label: "Linked" },
  { id: "timing", label: "Timing" },
];

export type ColumnId = "pin" | "method" | "size" | "status" | "time" | "links" | "timing";

/** Parses the stored comma-joined list. Unknown ids are dropped rather than
 * kept, so a column removed in a later version cannot haunt the prefs. */
export function parseHiddenColumns(stored: string): Set<ColumnId> {
  const known = new Set(TOGGLEABLE_COLUMNS.map((c) => c.id as string));
  return new Set(
    stored
      .split(",")
      .map((s) => s.trim())
      .filter((s) => known.has(s)) as ColumnId[],
  );
}

/* ── The launcher's corners ────────────────────────────────────────────── */

export type FabRadius = "sharp" | "soft" | "pill";

/**
 * The three steps, as CSS values.
 *
 * Two of them name tokens rather than numbers, because they are the radii the
 * rest of the panel already uses; only `pill` is a value of its own, and it
 * is a shape rather than a size — half the height, whatever the height is.
 */
export const FAB_RADIUS: Record<FabRadius, { label: string; css: string }> = {
  sharp: { label: "Sharp", css: "var(--bx-r-ctl)" },
  soft: { label: "Soft", css: "var(--bx-r-modal)" },
  pill: { label: "Pill", css: "999px" },
};

export function normalizeFabRadius(value: unknown): FabRadius {
  return value === "soft" || value === "pill" ? value : "sharp";
}
