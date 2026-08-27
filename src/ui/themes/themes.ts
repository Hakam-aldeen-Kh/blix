/**
 * Dev Tools — the theme system.
 *
 * **One source of truth for colour.** Every colour the panel paints is derived
 * from a `Palette` here and emitted as a CSS custom property. Nothing else in
 * the codebase hard-codes a hex value: components name a *role*
 * (`data-state="error"`, `data-accent="post"`) and the stylesheet resolves it
 * through the active theme's tokens. That is what makes a theme complete —
 * before this, the light palette lived in CSS while `kindAccent`/`STATE_COLORS`
 * kept a duplicate copy in JS, and the two could (and did) drift.
 *
 * **A palette is small on purpose.** Roughly twenty deliberate colours; the
 * ~80 tokens the stylesheet actually consumes are *derived* from them by
 * `tokensFor` — the hairline overlays, the soft tints behind badges, the
 * shadows, the per-method and per-state colours. Adding a theme therefore
 * means choosing twenty colours, not maintaining eighty in lockstep.
 *
 * **Themes are independent of the host app.** The panel ships its own palette
 * precisely so a host's stylesheet can never distort it; the `auto` preference
 * only borrows the host's *light/dark* choice and picks this panel's own
 * default for that side.
 */

export type ThemeBase = "light" | "dark";

export type ThemeId =
  | "midnight"
  | "carbon"
  | "nord"
  | "tokyo"
  | "one-dark"
  | "mocha"
  | "dracula"
  | "gruvbox"
  | "daylight"
  | "github"
  | "latte"
  | "solar";

/** What the user picked: a specific theme, or "follow the host app". */
export type ThemePref = "auto" | ThemeId;

/**
 * The hand-picked half of a theme. Everything else is derived.
 *
 * `overlay`/`shadow`/`scrim` are `"r,g,b"` triples rather than hex because they
 * are only ever used at an alpha — hairlines, elevation washes, drop shadows —
 * and composing `rgba(${triple},${a})` keeps that obvious at the call site.
 */
export interface Palette {
  base: ThemeBase;

  /** Elevation, each step a deliberate layer rather than a tint of the last.
   * In a light theme `surface` is the *highest* layer (the panel itself) and
   * `surface-2`/`-3` step down into the chrome, mirroring the dark direction. */
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;

  txt: string;
  muted: string;
  faint: string;

  /** Generic UI accent. Conventionally shares a value with `network`. */
  accent: string;

  /** Section identity — see the four `--nm-c-*` touch points in the stylesheet. */
  network: string;
  realtime: string;
  redux: string;
  query: string;

  /** Strictly semantic; never repurposed as decoration. */
  success: string;
  error: string;
  warning: string;
  /** "No signal" — an aborted request, the All filter's dot. */
  neutral: string;

  /** JSON viewer. `text` is the punctuation/body colour the others sit in. */
  syntax: {
    text: string;
    key: string;
    str: string;
    num: string;
    bool: string;
    nul: string;
    /** Base64 blobs, which are shown as a chip rather than as text. */
    blob: string;
  };

  /** `"r,g,b"` — hairlines and elevation washes, i.e. the colour that "lifts"
   * a surface. Light on a dark theme, ink on a light one. */
  overlay: string;
  /** `"r,g,b"` — drop shadows, and the sunken wells inputs sit in. */
  shadow: string;
  /** `"r,g,b"` — full-screen scrims behind the cheatsheet and drag preview. */
  scrim: string;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** One-line description, shown under the name in the picker. */
  hint: string;
  base: ThemeBase;
  palette: Palette;
}

/* ── Palettes ──────────────────────────────────────────────────────────── */

/** The original panel palette: deep blue-black, blue accent. */
const MIDNIGHT: Palette = {
  base: "dark",
  bg: "#090b10",
  surface: "#12151c",
  surface2: "#191d27",
  surface3: "#21252f",
  txt: "#eef0f4",
  muted: "#99a3b7",
  faint: "#616b80",
  accent: "#5b93ff",
  network: "#5b93ff",
  realtime: "#22d3ee",
  redux: "#a78bfa",
  query: "#fb923c",
  success: "#34d399",
  error: "#f87171",
  warning: "#fbbf24",
  neutral: "#94a3b8",
  syntax: {
    text: "#cbd5e1",
    key: "#93c5fd",
    str: "#86efac",
    num: "#fbbf24",
    bool: "#c084fc",
    nul: "#64748b",
    blob: "#f0abfc",
  },
  overlay: "255,255,255",
  shadow: "0,0,0",
  scrim: "3,5,12",
};

/** True black, neutral greys, high contrast — for OLED displays and for
 * anyone who finds Midnight's blue cast tiring over a long session. */
const CARBON: Palette = {
  base: "dark",
  bg: "#000000",
  surface: "#0b0b0c",
  surface2: "#141416",
  surface3: "#1d1d20",
  txt: "#fafafa",
  muted: "#a3a3a8",
  faint: "#6e6e75",
  accent: "#38bdf8",
  network: "#38bdf8",
  realtime: "#2dd4bf",
  redux: "#c084fc",
  query: "#fb923c",
  success: "#4ade80",
  error: "#fb7185",
  warning: "#facc15",
  neutral: "#a1a1aa",
  syntax: {
    text: "#e4e4e7",
    key: "#7dd3fc",
    str: "#86efac",
    num: "#fcd34d",
    bool: "#d8b4fe",
    nul: "#71717a",
    blob: "#f0abfc",
  },
  overlay: "255,255,255",
  shadow: "0,0,0",
  scrim: "0,0,0",
};

/** Nord — the arctic blue-grey palette, muted enough for long sessions. */
const NORD: Palette = {
  base: "dark",
  bg: "#2e3440",
  surface: "#343b49",
  surface2: "#3b4252",
  surface3: "#434c5e",
  txt: "#eceff4",
  muted: "#b3bccd",
  // Lifted off Nord's own nord3 (#4c566a): the panel uses `faint` for column
  // heads and timestamps against surface-2, where the canonical value lands
  // at 2.7:1. Nord's identity colours are kept exactly.
  faint: "#8792a6",
  accent: "#88c0d0",
  network: "#81a1c1",
  realtime: "#8fbcbb",
  redux: "#b48ead",
  query: "#d08770",
  success: "#a3be8c",
  error: "#bf616a",
  warning: "#ebcb8b",
  neutral: "#8792a6",
  syntax: {
    text: "#d8dee9",
    key: "#8fbcbb",
    str: "#a3be8c",
    num: "#ebcb8b",
    // Aurora purple and orange, nudged a step lighter: read as body text in
    // the JSON viewer they need 4.5:1, and the canonical values sit at 4.4.
    bool: "#bd9ab6",
    nul: "#79839c",
    blob: "#d59480",
  },
  overlay: "236,239,244",
  shadow: "10,13,18",
  scrim: "17,21,28",
};

/** Dracula — high-chroma, the most opinionated of the four darks. */
const DRACULA: Palette = {
  base: "dark",
  bg: "#1e1f29",
  surface: "#282a36",
  surface2: "#313442",
  surface3: "#3c3f52",
  txt: "#f8f8f2",
  muted: "#aab0cc",
  // Dracula's comment colour (#6272a4) is deliberately recessive; here the
  // same slot carries column heads and timestamps, so it is lifted to clear
  // 3:1 against surface-2.
  faint: "#7280b3",
  accent: "#bd93f9",
  network: "#8be9fd",
  realtime: "#ff79c6",
  redux: "#bd93f9",
  query: "#ffb86c",
  success: "#50fa7b",
  error: "#ff5555",
  warning: "#f1fa8c",
  neutral: "#7280b3",
  syntax: {
    text: "#e2e2dc",
    key: "#8be9fd",
    str: "#f1fa8c",
    num: "#bd93f9",
    bool: "#ff79c6",
    nul: "#7280b3",
    blob: "#ffb86c",
  },
  overlay: "248,248,242",
  shadow: "0,0,0",
  scrim: "12,12,18",
};

/**
 * The light default. Tuned against white rather than being an inversion of
 * Midnight — the syntax and identity colours in particular need darker, more
 * saturated values to hold their contrast on a pale surface.
 */
const DAYLIGHT: Palette = {
  base: "light",
  bg: "#f6f7f9",
  surface: "#ffffff",
  surface2: "#f0f2f5",
  surface3: "#e7eaf0",
  txt: "#0f1420",
  muted: "#4b5567",
  faint: "#7c8698",
  accent: "#2f6fed",
  network: "#2f6fed",
  realtime: "#0891a8",
  redux: "#7c3aed",
  // Both a step darker than the values this palette shipped with: the orange
  // sat at 2.8:1 against the table ground and the null grey at 2.4:1.
  query: "#dd6a10",
  success: "#059669",
  error: "#dc2626",
  warning: "#b45309",
  neutral: "#64748b",
  syntax: {
    text: "#1f2937",
    key: "#1d4ed8",
    str: "#047857",
    num: "#b45309",
    bool: "#7c3aed",
    nul: "#7d8fa9",
    blob: "#a21caf",
  },
  overlay: "15,23,42",
  shadow: "15,23,42",
  scrim: "15,23,42",
};

/** Solarized Light — warm paper, low blue-light, easy in a bright room. */
const SOLAR: Palette = {
  base: "light",
  bg: "#f1e9d5",
  surface: "#fdf6e3",
  surface2: "#f0e8d4",
  surface3: "#e6dcc3",
  // Solarized's own greys and yellows are famously dim on its cream ground —
  // fine for prose, not for a table of timestamps and a JSON viewer. This is a
  // Solarized-*flavoured* palette rather than a strict port: the hues are
  // Solarized's, the lightness is pulled down until each role clears its
  // contrast floor (body text 4.5:1, badges and quiet chrome 3:1).
  txt: "#073642",
  muted: "#4f6369",
  faint: "#718383",
  accent: "#268bd2",
  network: "#268bd2",
  realtime: "#248b84",
  redux: "#6c71c4",
  query: "#cb4b16",
  success: "#5f7d00",
  error: "#dc322f",
  warning: "#9c7600",
  neutral: "#718383",
  syntax: {
    text: "#073642",
    key: "#1c689e",
    str: "#506a00",
    num: "#7d5e00",
    bool: "#5459b8",
    nul: "#718383",
    blob: "#b9276e",
  },
  overlay: "7,54,66",
  shadow: "88,110,117",
  scrim: "7,54,66",
};

/** Tokyo Night — deep indigo, the most-installed editor theme of its
 * generation. Its own blue/purple/cyan set maps onto the four sections almost
 * one-for-one. */
const TOKYO: Palette = {
  base: "dark",
  bg: "#16161e",
  surface: "#1a1b26",
  surface2: "#20212e",
  surface3: "#292e42",
  txt: "#c0caf5",
  muted: "#9aa5ce",
  faint: "#787c99",
  accent: "#7aa2f7",
  network: "#7aa2f7",
  realtime: "#2ac3de",
  redux: "#bb9af7",
  query: "#ff9e64",
  success: "#9ece6a",
  error: "#f7768e",
  warning: "#e0af68",
  neutral: "#787c99",
  syntax: {
    text: "#a9b1d6",
    key: "#7dcfff",
    str: "#9ece6a",
    num: "#ff9e64",
    bool: "#bb9af7",
    nul: "#787c99",
    blob: "#f7768e",
  },
  overlay: "192,202,245",
  shadow: "0,0,0",
  scrim: "13,13,18",
};

/** Gruvbox Dark — warm retro browns and ambers. The only theme here that is
 * not cool-toned, and the reason it earns a slot: nothing else in the list
 * looks remotely like it. */
const GRUVBOX: Palette = {
  base: "dark",
  bg: "#1d2021",
  surface: "#282828",
  surface2: "#32302f",
  surface3: "#3c3836",
  txt: "#fbf1c7",
  muted: "#d5c4a1",
  faint: "#a89984",
  accent: "#83a598",
  network: "#83a598",
  realtime: "#8ec07c",
  redux: "#d3869b",
  query: "#fe8019",
  success: "#b8bb26",
  error: "#fb4934",
  warning: "#fabd2f",
  neutral: "#a89984",
  syntax: {
    text: "#ebdbb2",
    key: "#8ec07c",
    str: "#b8bb26",
    num: "#d3869b",
    bool: "#fabd2f",
    nul: "#a89984",
    blob: "#fe8019",
  },
  overlay: "251,241,199",
  shadow: "0,0,0",
  scrim: "16,16,16",
};

/** Catppuccin Mocha — soft pastels on a warm charcoal. Lower contrast by
 * design than Carbon, and the gentlest of the darks over a long session. */
const MOCHA: Palette = {
  base: "dark",
  bg: "#181825",
  surface: "#1e1e2e",
  surface2: "#262637",
  surface3: "#313244",
  txt: "#cdd6f4",
  muted: "#a6adc8",
  faint: "#7f849c",
  accent: "#cba6f7",
  network: "#89b4fa",
  realtime: "#94e2d5",
  redux: "#cba6f7",
  query: "#fab387",
  success: "#a6e3a1",
  error: "#f38ba8",
  warning: "#f9e2af",
  neutral: "#7f849c",
  syntax: {
    text: "#bac2de",
    key: "#89dceb",
    str: "#a6e3a1",
    num: "#fab387",
    bool: "#cba6f7",
    nul: "#7f849c",
    blob: "#f5c2e7",
  },
  overlay: "205,214,244",
  shadow: "0,0,0",
  scrim: "17,17,27",
};

/** One Dark — Atom's palette, and the one most developers have seen in a
 * screenshot even if they have never installed it. */
const ONE_DARK: Palette = {
  base: "dark",
  bg: "#21252b",
  surface: "#282c34",
  surface2: "#2f343d",
  surface3: "#3b4048",
  txt: "#dcdfe4",
  muted: "#a6adba",
  faint: "#7f8796",
  accent: "#61afef",
  network: "#61afef",
  realtime: "#56b6c2",
  redux: "#c678dd",
  query: "#d19a66",
  success: "#98c379",
  error: "#e06c75",
  warning: "#e5c07b",
  neutral: "#7f8796",
  syntax: {
    text: "#c8ccd4",
    key: "#61afef",
    str: "#98c379",
    num: "#d19a66",
    bool: "#c678dd",
    nul: "#7f8796",
    blob: "#e06c75",
  },
  overlay: "220,223,228",
  shadow: "0,0,0",
  scrim: "16,18,22",
};

/** Catppuccin Latte — the pastel light. Softer than Daylight's clinical white
 * without going as warm as Solar. */
const LATTE: Palette = {
  base: "light",
  bg: "#e6e9ef",
  surface: "#eff1f5",
  surface2: "#e0e3ea",
  surface3: "#d3d7e0",
  txt: "#4c4f69",
  muted: "#5c5f77",
  faint: "#7c7f93",
  accent: "#1e66f5",
  network: "#1e66f5",
  realtime: "#179299",
  redux: "#8839ef",
  query: "#c26a12",
  success: "#3f8b3f",
  error: "#d20f39",
  warning: "#a6791a",
  neutral: "#7c7f93",
  // Latte's own accents are tuned for prose on its lightest surface; read as
  // dense monospace on the table ground they land around 3.5–4:1, so the
  // syntax set is a shade deeper than the identity colours above it.
  syntax: {
    text: "#4c4f69",
    key: "#0b59f3",
    str: "#357535",
    num: "#99570d",
    bool: "#8535ef",
    nul: "#7c7f93",
    blob: "#c4148c",
  },
  overlay: "76,79,105",
  shadow: "76,79,105",
  scrim: "76,79,105",
};

/** GitHub Light — the light theme most developers already spend their day in,
 * so the panel stops looking like a visitor when docked next to it. */
const GITHUB: Palette = {
  base: "light",
  bg: "#f6f8fa",
  surface: "#ffffff",
  surface2: "#f0f3f6",
  surface3: "#e4e8ed",
  txt: "#1f2328",
  muted: "#59636e",
  faint: "#7b8894",
  accent: "#0969da",
  network: "#0969da",
  realtime: "#137e73",
  redux: "#8250df",
  query: "#bc4c00",
  success: "#1a7f37",
  error: "#cf222e",
  warning: "#9a6700",
  neutral: "#7b8894",
  syntax: {
    text: "#1f2328",
    key: "#0550ae",
    str: "#0a3069",
    num: "#0550ae",
    bool: "#8250df",
    nul: "#7b8894",
    blob: "#a40e26",
  },
  overlay: "31,35,40",
  shadow: "31,35,40",
  scrim: "31,35,40",
};

/** Display order in the picker: darks first, then lights. */
export const THEMES: ThemeDef[] = [
  {
    id: "midnight",
    label: "Midnight",
    hint: "Deep blue-black — the default",
    base: "dark",
    palette: MIDNIGHT,
  },
  {
    id: "carbon",
    label: "Carbon",
    hint: "True black, high contrast",
    base: "dark",
    palette: CARBON,
  },
  { id: "nord", label: "Nord", hint: "Muted arctic blues", base: "dark", palette: NORD },
  {
    id: "tokyo",
    label: "Tokyo Night",
    hint: "Deep indigo, soft neon",
    base: "dark",
    palette: TOKYO,
  },
  {
    id: "one-dark",
    label: "One Dark",
    hint: "Atom's classic slate",
    base: "dark",
    palette: ONE_DARK,
  },
  {
    id: "mocha",
    label: "Mocha",
    hint: "Catppuccin — gentle pastels",
    base: "dark",
    palette: MOCHA,
  },
  {
    id: "dracula",
    label: "Dracula",
    hint: "Vivid purples and pinks",
    base: "dark",
    palette: DRACULA,
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    hint: "Warm retro browns and amber",
    base: "dark",
    palette: GRUVBOX,
  },
  {
    id: "daylight",
    label: "Daylight",
    hint: "Clean white — the light default",
    base: "light",
    palette: DAYLIGHT,
  },
  {
    id: "github",
    label: "GitHub",
    hint: "The light theme you already read all day",
    base: "light",
    palette: GITHUB,
  },
  {
    id: "latte",
    label: "Latte",
    hint: "Catppuccin — soft pastel light",
    base: "light",
    palette: LATTE,
  },
  {
    id: "solar",
    label: "Solar",
    hint: "Warm paper, low blue light",
    base: "light",
    palette: SOLAR,
  },
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export const DEFAULT_DARK: ThemeId = "midnight";
export const DEFAULT_LIGHT: ThemeId = "daylight";

export function themeById(id: ThemeId): ThemeDef {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_DARK)!;
}

/** Resolves a stored preference against the host app's current light/dark
 * choice. `auto` is not a theme — it is "whichever of this panel's two
 * defaults matches the app I'm sitting in". */
export function resolveTheme(pref: ThemePref, host: ThemeBase): ThemeDef {
  if (pref === "auto") {
    return themeById(host === "light" ? DEFAULT_LIGHT : DEFAULT_DARK);
  }
  return themeById(pref);
}

/** Prefs are stored as a plain string, so an old or hand-edited value can name
 * a theme that no longer exists. Anything unrecognized falls back to `auto`. */
export function normalizeThemePref(value: unknown): ThemePref {
  if (value === "auto") return "auto";
  return typeof value === "string" && BY_ID.has(value as ThemeId)
    ? (value as ThemeId)
    : "auto";
}

/* ── Token derivation ──────────────────────────────────────────────────── */

/** `#rgb` / `#rrggbb` → `"r, g, b"`. Falls back to mid-grey rather than
 * throwing: a malformed palette should look wrong, not crash the panel. */
function channels(hex: string): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return "128, 128, 128";
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function alpha(hex: string, a: number): string {
  return `rgba(${channels(hex)}, ${a})`;
}

/**
 * Expands a palette into the full token set the stylesheet consumes.
 *
 * The dark/light split is expressed once, here, as a set of alpha pairs —
 * a light theme needs a *stronger* ink overlay for the same perceived hairline
 * and a *weaker* shadow for the same perceived elevation, which is why these
 * are not one shared number.
 */
export function themeTokens(p: Palette): Record<string, string> {
  const dark = p.base === "dark";
  /** Elevation wash / hairlines. */
  const ov = (a: number) => `rgba(${p.overlay}, ${a})`;
  /** Shadows and sunken wells. */
  const sh = (a: number) => `rgba(${p.shadow}, ${a})`;
  /** The tint behind a coloured badge, pill or selected row. */
  const soft = (hex: string) => alpha(hex, dark ? 0.14 : 0.12);
  /** The border of that same badge — one step more present than its fill. */
  const line = (hex: string) => alpha(hex, dark ? 0.34 : 0.28);

  /** The 1px top highlight that makes a raised surface look lit from above.
   * Composed into the shadow tokens below rather than exposed on its own —
   * a light theme has nothing to catch the light, so it is simply absent. */
  const inset = ov(dark ? 0.025 : 0);

  /** HTTP methods reuse the semantic and identity colours rather than
   * introducing five more: GET reads as "the neutral one" (network), POST as
   * "creates" (success), PUT/PATCH as "mutates" (warning), DELETE as
   * "destroys" (error). Only the fallback needs a colour of its own. */
  const methods: Record<string, string> = {
    get: p.network,
    post: p.success,
    put: p.warning,
    delete: p.error,
    other: p.redux,
  };

  /** Request state. `aborted` is deliberately colourless — it can never
   * complete, so it must not read as "still working". */
  const states: Record<string, string> = {
    pending: p.warning,
    success: p.success,
    error: p.error,
    aborted: p.neutral,
    /** The All filter's dot: a state slot that means "no state at all". */
    all: p.neutral,
  };

  const t: Record<string, string> = {
    "--nm-bg": p.bg,
    "--nm-surface": p.surface,
    "--nm-surface-2": p.surface2,
    "--nm-surface-3": p.surface3,

    "--nm-elev": ov(dark ? 0.05 : 0.045),
    "--nm-elev-hover": ov(dark ? 0.09 : 0.08),
    "--nm-line": ov(dark ? 0.08 : 0.1),
    "--nm-line-strong": ov(dark ? 0.16 : 0.19),
    "--nm-line-2": ov(dark ? 0.05 : 0.06),

    /* Recessed surfaces. On a dark theme a control sinks by going darker than
       its container; on a light one there is nowhere darker to go without
       looking like a hole, so an input keeps the panel's own surface and only
       the segmented controls take a faint ink wash. */
    "--nm-sunken": dark ? sh(0.26) : ov(0.035),
    "--nm-well": dark ? sh(0.28) : ov(0.045),
    "--nm-input": dark ? sh(0.28) : p.surface,
    "--nm-input-focus": dark ? sh(0.36) : p.surface,

    "--nm-txt": p.txt,
    "--nm-muted": p.muted,
    "--nm-faint": p.faint,

    "--nm-accent": p.accent,
    "--nm-accent-soft": soft(p.accent),
    "--nm-accent-line": line(p.accent),

    "--nm-c-network": p.network,
    "--nm-c-network-soft": soft(p.network),
    "--nm-c-realtime": p.realtime,
    "--nm-c-realtime-soft": soft(p.realtime),
    "--nm-c-redux": p.redux,
    "--nm-c-redux-soft": soft(p.redux),
    "--nm-c-query": p.query,
    "--nm-c-query-soft": soft(p.query),

    "--nm-success": p.success,
    "--nm-success-soft": soft(p.success),
    "--nm-error": p.error,
    "--nm-error-soft": soft(p.error),
    "--nm-error-line": line(p.error),
    "--nm-warning": p.warning,
    "--nm-warning-soft": soft(p.warning),
    "--nm-warning-line": line(p.warning),
    /* `neutral` has no token of its own: it reaches the stylesheet only as the
       `aborted` and `all` state colours, which is the only meaning it carries. */

    "--nm-syn-txt": p.syntax.text,
    "--nm-syn-key": p.syntax.key,
    "--nm-syn-str": p.syntax.str,
    "--nm-syn-num": p.syntax.num,
    "--nm-syn-bool": p.syntax.bool,
    "--nm-syn-null": p.syntax.nul,
    "--nm-syn-blob": p.syntax.blob,
    /* The blob colour also marks ciphertext outside the viewer — the Encrypted
       tab's badge — so it needs the same soft companion every badge colour has. */
    "--nm-syn-blob-soft": soft(p.syntax.blob),
    "--nm-mark": alpha(p.warning, dark ? 0.32 : 0.28),

    "--nm-wf-track": ov(dark ? 0.05 : 0.07),
    /* The barber-pole stripe over an in-flight waterfall bar. It sits *on* a
       saturated state colour, so it takes the overlay direction — light
       stripes on a dark theme, ink on a light one. */
    "--nm-stripe": ov(dark ? 0.28 : 0.22),
    "--nm-scroll-thumb": ov(dark ? 0.13 : 0.18),
    "--nm-scroll-thumb-hover": ov(dark ? 0.22 : 0.3),

    /* Shadows carry both geometry and colour so a theme can restate the whole
       elevation model — a light theme needs a tighter, weaker shadow than a
       dark one to read as the same height. */
    "--nm-shadow-panel": dark
      ? `0 32px 84px ${sh(0.64)}, 0 2px 10px ${sh(0.4)}, inset 0 1px 0 ${inset}`
      : `0 20px 54px ${sh(0.16)}, 0 2px 7px ${sh(0.07)}`,
    "--nm-shadow-dock-b": dark ? `0 -10px 28px ${sh(0.42)}` : `0 -7px 22px ${sh(0.12)}`,
    "--nm-shadow-dock-r": dark ? `-10px 0 28px ${sh(0.42)}` : `-7px 0 22px ${sh(0.12)}`,
    "--nm-shadow-fab": dark
      ? `0 10px 28px ${sh(0.5)}, inset 0 1px 0 ${ov(0.05)}`
      : `0 6px 18px ${sh(0.14)}, 0 1px 3px ${sh(0.08)}`,
    "--nm-shadow-fab-hover": dark
      ? `0 14px 36px ${sh(0.58)}, inset 0 1px 0 ${ov(0.07)}`
      : `0 10px 24px ${sh(0.18)}, 0 1px 3px ${sh(0.1)}`,
    "--nm-shadow-ghost": dark ? `0 22px 48px ${sh(0.62)}` : `0 18px 40px ${sh(0.22)}`,
    "--nm-shadow-menu": dark
      ? `0 20px 48px ${sh(0.6)}, inset 0 1px 0 ${ov(0.03)}`
      : `0 16px 40px ${sh(0.16)}, 0 2px 6px ${sh(0.06)}`,
    "--nm-shadow-sheet": dark
      ? `0 26px 64px ${sh(0.55)}, inset 0 1px 0 ${ov(0.03)}`
      : `0 22px 54px ${sh(0.2)}, 0 2px 8px ${sh(0.06)}`,
    "--nm-shadow-seg": `0 1px 3px ${sh(dark ? 0.32 : 0.12)}`,

    "--nm-scrim": `rgba(${p.scrim}, ${dark ? 0.55 : 0.32})`,
    "--nm-scrim-drag": `rgba(${p.scrim}, ${dark ? 0.5 : 0.24})`,
  };

  for (const [key, color] of Object.entries(methods)) {
    t[`--nm-m-${key}`] = color;
    t[`--nm-m-${key}-soft`] = soft(color);
  }
  for (const [key, color] of Object.entries(states)) {
    t[`--nm-state-${key}`] = color;
    t[`--nm-state-${key}-soft`] = alpha(color, dark ? 0.18 : 0.14);
    // The glow under the badge dot and the header logo — the one place a
    // colour is allowed to bloom rather than sit inside a border.
    t[`--nm-state-${key}-glow`] = alpha(color, 0.55);
  }

  return t;
}

/**
 * The default theme's tokens, baked into the stylesheet on bare `.nm-root`.
 *
 * Only this one theme ships as CSS. The *active* theme's tokens are written to
 * the root element's `style` attribute instead (see `DevToolsPanel`), which is
 * why adding a theme costs nothing here: one inline style block of ~80
 * properties, regardless of whether the panel ships six themes or sixty.
 * Emitting every theme as its own selector — the obvious first approach — grew
 * the stylesheet by ~10 kB per theme for tokens that all but one theme would
 * never read.
 *
 * This block still earns its place as the floor: inline styles override it, so
 * it is what paints if the style attribute is ever missing (a server render, a
 * theme id that no longer resolves), and the panel degrades to Midnight rather
 * than to an unstyled box.
 */
export const BASE_THEME_CSS = `.nm-root {\n${Object.entries(themeTokens(MIDNIGHT))
  .map(([k, v]) => `  ${k}: ${v};`)
  .join("\n")}\n}`;
