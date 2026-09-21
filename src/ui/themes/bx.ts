/**
 * Dev Tools — the redesign's colour contract.
 *
 * **One fixed set of slots, filled by every theme.** Not derived, not
 * optional: a theme that cannot name all of them is not a theme, and
 * `assertThemes` says so in development. The old `themeTokens` derivation —
 * eighty-odd tokens computed from twenty by alpha maths — stays alive beside
 * this for the surfaces that have not been rebuilt yet, and retires with the
 * last of them.
 *
 * **Why authored rather than derived.** The two tokens the old system would
 * have computed, `hover` and `wait`, are exactly the two it got wrong: an
 * alpha over an unknown ground is a different colour on every surface it lands
 * on, and `color-mix()` would put that computation in the paint path of a
 * virtualized list on browsers that do not have it. Both are opaque and
 * written down.
 *
 * **What a theme may not restate.** Sizes, radii, spacing, type — those live
 * in `styles/tokens.ts` and are identical in all twelve. A theme owns colour
 * and nothing else.
 */

import type { ThemeBase } from "./themes";

/**
 * The slots. Every field is a literal colour; nothing here is computed.
 *
 * `shadow` is the one exception and it is not in this interface — the two
 * surviving shadows (the panel's outer edge and the FAB) are geometry as much
 * as colour, so they are built from `shadowRgb` by `bxTokens` below.
 */
export interface BxPalette {
  /** `"r,g,b"` — the only alpha left in the set, for the two shadows. */
  shadowRgb: string;

  /* ── Grounds. Elevation is a background step; there is no shadow inside
     the panel and nothing is blurred. ─────────────────────────────────── */
  /** The list, and the panel body. */
  bg: string;
  /** Column head, status bar, detail pane, sidebar. */
  bar: string;
  /** Header, inline code. */
  raise: string;
  /** Menus, popovers, the palette, the modal. */
  float: string;
  /** Selected row, pressed segment. */
  sel: string;
  /** Row hover, on `bg`. Opaque, because a tint over an unknown ground is a
   * different colour on each of the five above. */
  hover: string;
  /** Menu-item hover, on `float`. A second slot rather than a second use of
   * `hover`: in a dark theme `hover` is a step *up* from the list's ground and
   * would sit below a menu's, so one token cannot serve both. */
  hoverFloat: string;

  /* ── Hairlines, three weights. ──────────────────────────────────────── */
  /** Bar edges — the header, the column head, the status bar. */
  line: string;
  /** Between rows. */
  lineSoft: string;
  /** The edge of an interactive thing: control and input borders, menus,
   * popovers, the palette. */
  lineStrong: string;

  /* ── Text. `fg2` and `fg3` both carry real text and are both held to
     4.5:1 against every ground — see `contrastReport`. ─────────────────── */
  /** Primary — never pure white. */
  fg: string;
  /** Row values. */
  fg2: string;
  /** Labels, meta, column heads, hints, shortcut keys. */
  fg3: string;
  /** **Never text.** Separators, payload punctuation, disabled glyphs, the
   * inactive dot in a chip. Below 4.5:1 by design, which is why nothing
   * readable is allowed to use it. */
  mark: string;

  /* ── Data. Colour means status, state or source — never decoration. ─── */
  ok: string;
  warn: string;
  err: string;
  /** 1xx/3xx, an open socket — "live, not finished". */
  info: string;
  /** Focus ring, active tab underline, the Replay outline. UI, not data. */
  accent: string;
  /** The wait segment of a row's timing bar, before the transfer segment
   * takes over in the status colour. */
  wait: string;

  /* ── Syntax ─────────────────────────────────────────────────────────── */
  synKey: string;
  synStr: string;
  synNum: string;
  synBool: string;
  synPunct: string;

  /* ── Diff. Not `ok` and `err`: "added" and "removed" are not "passed" and
     "failed", and twenty consecutive lines at full strength read as a wall
     of failure rather than as change. ──────────────────────────────────── */
  diffAdd: string;
  diffDel: string;

  /* ── Source identity. Two touch points only: the sidebar's 2px active mark
     and a row's cross-source link ticks. Nowhere else. ─────────────────── */
  srcNetwork: string;
  srcRealtime: string;
  srcRedux: string;
  srcQuery: string;
}

/* ── Palettes ──────────────────────────────────────────────────────────── */

/**
 * Midnight and Daylight are transcribed from the approved mockups; every
 * value in them is fixed. The other ten port their published palettes onto
 * the same slots — the semantic, syntax and identity colours are the ones the
 * theme already shipped, and only the ground ramp and `fg3` are re-cut, the
 * ramp because elevation is now a background step and `fg3` because it now
 * carries text that has to clear 4.5:1.
 *
 * The four `src*` slots are the exception in the other direction: the mockups
 * name them only for Midnight, where they are deliberately desaturated to sit
 * inside the new palette. Every other theme keeps the identity colours it
 * already shipped rather than having a muted set invented for it.
 */
const MIDNIGHT: BxPalette = {
  shadowRgb: "0,0,0",
  bg: "#0e0f11", bar: "#131417", raise: "#17181b", float: "#1e2024",
  sel: "#232629", hover: "#16171a",
  hoverFloat: "#2a2e33",
  line: "rgba(255,255,255,.07)", lineSoft: "rgba(255,255,255,.035)",
  lineStrong: "rgba(255,255,255,.11)",
  fg: "#e6e7ea", fg2: "#a2a7b0", fg3: "#868b95", mark: "#5f646c",
  ok: "#4ea674", warn: "#c9963f", err: "#d15b5b", info: "#6ea8c7",
  accent: "#6ea8c7", wait: "#303338",
  synKey: "#9fb8c9", synStr: "#a7bf96", synNum: "#c9a86a",
  synBool: "#c08a94", synPunct: "#5f646c",
  diffAdd: "#a7bf96", diffDel: "#d1a0a0",
  srcNetwork: "#6ea8c7", srcRealtime: "#5fb3a1", srcRedux: "#b08968",
  srcQuery: "#8f9bc4",
};

const DAYLIGHT: BxPalette = {
  shadowRgb: "15,23,42",
  bg: "#ffffff", bar: "#f7f8f9", raise: "#f7f8f9", float: "#ffffff",
  sel: "#dde4ea", hover: "#f0f2f4",
  hoverFloat: "#eef0f2",
  line: "rgba(0,0,0,.10)", lineSoft: "rgba(0,0,0,.05)",
  lineStrong: "rgba(0,0,0,.12)",
  fg: "#16181c", fg2: "#4e545e", fg3: "#656c76", mark: "#949aa3",
  ok: "#1f7a4d", warn: "#97620d", err: "#b4302f", info: "#1f6d92",
  accent: "#1f6d92", wait: "#d4d8dd",
  synKey: "#1f6d92", synStr: "#1f6d43", synNum: "#8a5a1f",
  synBool: "#9c3d68", synPunct: "#858c95",
  diffAdd: "#3d6b4a", diffDel: "#8c3b3b",
  srcNetwork: "#1f6d92", srcRealtime: "#0891a8", srcRedux: "#7c3aed",
  srcQuery: "#dd6a10",
};

/** True black and neutral greys — the OLED theme. Its own palette, so its
 * accents are its canonical values. */
const CARBON: BxPalette = {
  shadowRgb: "0,0,0",
  bg: "#000000", bar: "#0a0a0b", raise: "#0e0e10", float: "#17171a",
  sel: "#202024", hover: "#0b0b0c",
  hoverFloat: "#1c1c20",
  line: "rgba(255,255,255,.08)", lineSoft: "rgba(255,255,255,.04)",
  lineStrong: "rgba(255,255,255,.12)",
  fg: "#fafafa", fg2: "#a3a3a8", fg3: "#8b8b92", mark: "#6e6e75",
  ok: "#4ade80", warn: "#facc15", err: "#fb7185", info: "#38bdf8",
  accent: "#38bdf8", wait: "#2d2d31",
  synKey: "#7dd3fc", synStr: "#86efac", synNum: "#fcd34d",
  synBool: "#d8b4fe", synPunct: "#6e6e75",
  diffAdd: "#8cc79f", diffDel: "#d49a9f",
  srcNetwork: "#38bdf8", srcRealtime: "#2dd4bf", srcRedux: "#c084fc",
  srcQuery: "#fb923c",
};

/** Nord — the Polar Night ramp is nord0…nord3, which is four steps where the
 * panel needs five, so `bar` and `hover` are cut between nord0 and nord1. */
const NORD: BxPalette = {
  shadowRgb: "10,13,18",
  bg: "#2e3440", bar: "#353c49", raise: "#3b4252", float: "#434c5e",
  sel: "#4c566a", hover: "#373f4d",
  hoverFloat: "#495265",
  line: "rgba(236,239,244,.09)", lineSoft: "rgba(236,239,244,.045)",
  lineStrong: "rgba(236,239,244,.12)",
  fg: "#eceff4", fg2: "#d8dee9", fg3: "#b4bdcd", mark: "#8792a6",
  ok: "#a3be8c", warn: "#ebcb8b", err: "#bf616a", info: "#88c0d0",
  accent: "#88c0d0", wait: "#616c82",
  synKey: "#8fbcbb", synStr: "#a3be8c", synNum: "#ebcb8b",
  synBool: "#c5a3bf", synPunct: "#8792a6",
  diffAdd: "#a3be8c", diffDel: "#c08b91",
  srcNetwork: "#81a1c1", srcRealtime: "#8fbcbb", srcRedux: "#b48ead",
  srcQuery: "#d08770",
};

/** Tokyo Night — bg_dark, bg, bg_highlight and terminal_black, in that order. */
const TOKYO: BxPalette = {
  shadowRgb: "0,0,0",
  bg: "#1a1b26", bar: "#1e2030", raise: "#222436", float: "#292e42",
  sel: "#313650", hover: "#202233",
  hoverFloat: "#2e3349",
  line: "rgba(192,202,245,.09)", lineSoft: "rgba(192,202,245,.045)",
  lineStrong: "rgba(192,202,245,.12)",
  fg: "#c0caf5", fg2: "#a9b1d6", fg3: "#9aa3c6", mark: "#787c99",
  ok: "#9ece6a", warn: "#e0af68", err: "#f7768e", info: "#7aa2f7",
  accent: "#7aa2f7", wait: "#414868",
  synKey: "#7dcfff", synStr: "#9ece6a", synNum: "#ff9e64",
  synBool: "#bb9af7", synPunct: "#787c99",
  diffAdd: "#a2c489", diffDel: "#d78e9e",
  srcNetwork: "#7aa2f7", srcRealtime: "#2ac3de", srcRedux: "#bb9af7",
  srcQuery: "#ff9e64",
};

/** One Dark — Atom's palette. */
const ONE_DARK: BxPalette = {
  shadowRgb: "0,0,0",
  bg: "#21252b", bar: "#262a31", raise: "#282c34", float: "#2f343d",
  sel: "#3b4048", hover: "#272b32",
  hoverFloat: "#353a44",
  line: "rgba(220,223,228,.09)", lineSoft: "rgba(220,223,228,.045)",
  lineStrong: "rgba(220,223,228,.12)",
  fg: "#dcdfe4", fg2: "#b9c0cc", fg3: "#a2aab8", mark: "#7f8796",
  ok: "#98c379", warn: "#e5c07b", err: "#e06c75", info: "#61afef",
  accent: "#61afef", wait: "#4b515c",
  synKey: "#61afef", synStr: "#98c379", synNum: "#d19a66",
  synBool: "#c678dd", synPunct: "#7f8796",
  diffAdd: "#9ec07f", diffDel: "#d3949a",
  srcNetwork: "#61afef", srcRealtime: "#56b6c2", srcRedux: "#c678dd",
  srcQuery: "#d19a66",
};

/** Catppuccin Mocha — mantle, base, surface0, surface1 for the ramp; the text
 * levels are Catppuccin's own text / subtext0 / overlay2 / overlay1. */
const MOCHA: BxPalette = {
  shadowRgb: "0,0,0",
  bg: "#181825", bar: "#1c1c2b", raise: "#1e1e2e", float: "#252539",
  sel: "#313244", hover: "#1e1e2f",
  hoverFloat: "#2b2b41",
  line: "rgba(205,214,244,.09)", lineSoft: "rgba(205,214,244,.045)",
  lineStrong: "rgba(205,214,244,.12)",
  fg: "#cdd6f4", fg2: "#a6adc8", fg3: "#9399b2", mark: "#7f849c",
  ok: "#a6e3a1", warn: "#f9e2af", err: "#f38ba8", info: "#89b4fa",
  accent: "#cba6f7", wait: "#45475a",
  synKey: "#89dceb", synStr: "#a6e3a1", synNum: "#fab387",
  synBool: "#cba6f7", synPunct: "#7f849c",
  diffAdd: "#a6c9a3", diffDel: "#d99eb0",
  srcNetwork: "#89b4fa", srcRealtime: "#94e2d5", srcRedux: "#cba6f7",
  srcQuery: "#fab387",
};

/** Dracula — background, current-line and comment are the canonical three;
 * `bg` takes Dracula's darker background so the list sits below the bars. */
const DRACULA: BxPalette = {
  shadowRgb: "0,0,0",
  bg: "#21222c", bar: "#282a36", raise: "#2c2e3b", float: "#343746",
  sel: "#44475a", hover: "#262834",
  hoverFloat: "#3b3e4e",
  line: "rgba(248,248,242,.09)", lineSoft: "rgba(248,248,242,.045)",
  lineStrong: "rgba(248,248,242,.12)",
  fg: "#f8f8f2", fg2: "#bcc2e0", fg3: "#b0b8d6", mark: "#6272a4",
  ok: "#50fa7b", warn: "#f1fa8c", err: "#ff5555", info: "#8be9fd",
  accent: "#bd93f9", wait: "#565a75",
  synKey: "#8be9fd", synStr: "#f1fa8c", synNum: "#bd93f9",
  synBool: "#ff79c6", synPunct: "#6272a4",
  diffAdd: "#92d9a3", diffDel: "#dd9295",
  srcNetwork: "#8be9fd", srcRealtime: "#ff79c6", srcRedux: "#bd93f9",
  srcQuery: "#ffb86c",
};

/** Gruvbox Dark — bg0_hard through bg1 for the ramp. Gruvbox's own `gray`
 * (#928374) cannot clear 4.5:1 against bg1, so it becomes `mark` and `fg3` is
 * cut a step lighter along the same warm axis. */
const GRUVBOX: BxPalette = {
  shadowRgb: "0,0,0",
  bg: "#1d2021", bar: "#242424", raise: "#282828", float: "#32302f",
  sel: "#3c3836", hover: "#262626",
  hoverFloat: "#383534",
  line: "rgba(251,241,199,.09)", lineSoft: "rgba(251,241,199,.045)",
  lineStrong: "rgba(251,241,199,.12)",
  fg: "#fbf1c7", fg2: "#d5c4a1", fg3: "#b5a68d", mark: "#928374",
  ok: "#b8bb26", warn: "#fabd2f", err: "#fb4934", info: "#83a598",
  accent: "#83a598", wait: "#504945",
  synKey: "#8ec07c", synStr: "#b8bb26", synNum: "#d3869b",
  synBool: "#fabd2f", synPunct: "#928374",
  diffAdd: "#b0b46b", diffDel: "#d89086",
  srcNetwork: "#83a598", srcRealtime: "#8ec07c", srcRedux: "#d3869b",
  srcQuery: "#fe8019",
};

/** GitHub Light — Primer's canvas.default / canvas.subtle / border.default,
 * and Primer's fg.default / fg.muted / fg.subtle for the text levels. */
const GITHUB: BxPalette = {
  shadowRgb: "31,35,40",
  bg: "#ffffff", bar: "#f6f8fa", raise: "#f6f8fa", float: "#ffffff",
  sel: "#e3edf7", hover: "#f0f3f6",
  hoverFloat: "#f3f6f9",
  line: "rgba(0,0,0,.10)", lineSoft: "rgba(0,0,0,.05)",
  lineStrong: "rgba(0,0,0,.14)",
  fg: "#1f2328", fg2: "#59636e", fg3: "#68717c", mark: "#8c959f",
  ok: "#1a7f37", warn: "#9a6700", err: "#cf222e", info: "#0969da",
  accent: "#0969da", wait: "#d1d9e0",
  synKey: "#0550ae", synStr: "#0a3069", synNum: "#953800",
  synBool: "#8250df", synPunct: "#8c959f",
  diffAdd: "#1a6f38", diffDel: "#a13640",
  srcNetwork: "#0969da", srcRealtime: "#137e73", srcRedux: "#8250df",
  srcQuery: "#bc4c00",
};

/** Catppuccin Latte — base, mantle, surface0, surface1; text / subtext1 /
 * subtext0 / overlay0 for the four text levels, exactly as Catppuccin
 * intends them. */
const LATTE: BxPalette = {
  shadowRgb: "76,79,105",
  bg: "#eff1f5", bar: "#e6e9ef", raise: "#e6e9ef", float: "#eff1f5",
  sel: "#ccd0da", hover: "#e4e7ee",
  hoverFloat: "#e8ebf1",
  line: "rgba(76,79,105,.14)", lineSoft: "rgba(76,79,105,.07)",
  lineStrong: "rgba(76,79,105,.16)",
  fg: "#4c4f69", fg2: "#5c5f77", fg3: "#6c6f85", mark: "#9ca0b0",
  ok: "#3f8b3f", warn: "#a6791a", err: "#d20f39", info: "#1e66f5",
  accent: "#1e66f5", wait: "#bcc0cc",
  synKey: "#0b59f3", synStr: "#357535", synNum: "#99570d",
  synBool: "#8535ef", synPunct: "#9ca0b0",
  diffAdd: "#3f7a4a", diffDel: "#a63a52",
  srcNetwork: "#1e66f5", srcRealtime: "#179299", srcRedux: "#8839ef",
  srcQuery: "#c26a12",
};

/** Solarized Light — base3/base2 for the ramp and base02 for primary text.
 * Solarized's own base1/base0 are famously dim; they land in `mark`, and the
 * two text levels are cut from base00/base01 instead. */
const SOLAR: BxPalette = {
  shadowRgb: "88,110,117",
  bg: "#fdf6e3", bar: "#f4eeda", raise: "#f4eeda", float: "#fdf6e3",
  sel: "#ebe3cc", hover: "#f2ebd6",
  hoverFloat: "#f6efdc",
  line: "rgba(7,54,66,.13)", lineSoft: "rgba(7,54,66,.065)",
  lineStrong: "rgba(7,54,66,.15)",
  fg: "#073642", fg2: "#4f6369", fg3: "#5a6e74", mark: "#93a1a1",
  ok: "#5f7d00", warn: "#9c7600", err: "#dc322f", info: "#268bd2",
  accent: "#268bd2", wait: "#ccc4ab",
  synKey: "#1c689e", synStr: "#506a00", synNum: "#7d5e00",
  synBool: "#5459b8", synPunct: "#93a1a1",
  diffAdd: "#5c7530", diffDel: "#b0453f",
  srcNetwork: "#268bd2", srcRealtime: "#248b84", srcRedux: "#6c71c4",
  srcQuery: "#cb4b16",
};

export const BX_PALETTES = {
  midnight: MIDNIGHT,
  carbon: CARBON,
  nord: NORD,
  tokyo: TOKYO,
  "one-dark": ONE_DARK,
  mocha: MOCHA,
  dracula: DRACULA,
  gruvbox: GRUVBOX,
  daylight: DAYLIGHT,
  github: GITHUB,
  latte: LATTE,
  solar: SOLAR,
} as const;

/* ── Emission ──────────────────────────────────────────────────────────── */

/**
 * Slot → token name. The single place the two vocabularies meet, and what
 * `assertThemes` walks to decide whether a theme is complete.
 */
const SLOT_TOKEN: Record<keyof Omit<BxPalette, "shadowRgb">, string> = {
  bg: "--bx-bg", bar: "--bx-bar", raise: "--bx-raise", float: "--bx-float",
  sel: "--bx-sel", hover: "--bx-hover", hoverFloat: "--bx-hover-float",
  line: "--bx-line", lineSoft: "--bx-line-soft",
  lineStrong: "--bx-line-strong",
  fg: "--bx-fg", fg2: "--bx-fg-2", fg3: "--bx-fg-3", mark: "--bx-mark",
  ok: "--bx-ok", warn: "--bx-warn", err: "--bx-err", info: "--bx-info",
  accent: "--bx-accent", wait: "--bx-wait",
  synKey: "--bx-syn-key", synStr: "--bx-syn-str", synNum: "--bx-syn-num",
  synBool: "--bx-syn-bool", synPunct: "--bx-syn-punct",
  diffAdd: "--bx-diff-add", diffDel: "--bx-diff-del",
  srcNetwork: "--bx-src-network", srcRealtime: "--bx-src-realtime",
  srcRedux: "--bx-src-redux", srcQuery: "--bx-src-query",
};

/** Every token a complete theme emits — the list the check is written against. */
export const BX_TOKENS: string[] = [
  ...Object.values(SLOT_TOKEN),
  "--bx-shadow-panel",
  "--bx-shadow-fab",
];

/**
 * The two shadows that survive. Everything inside the panel separates itself
 * with a background step and a 1px border; these two are the exception because
 * neither surface sits on a ground the panel controls — the panel's outer edge
 * is against the host app, and so is the FAB.
 */
function shadows(p: BxPalette, base: ThemeBase): Record<string, string> {
  const sh = (a: number) => `rgba(${p.shadowRgb}, ${a})`;
  return base === "dark"
    ? {
        "--bx-shadow-panel": `0 32px 84px ${sh(0.64)}, 0 2px 10px ${sh(0.4)}`,
        "--bx-shadow-fab": `0 10px 28px ${sh(0.5)}`,
      }
    : {
        "--bx-shadow-panel": `0 20px 54px ${sh(0.16)}, 0 2px 7px ${sh(0.07)}`,
        "--bx-shadow-fab": `0 6px 18px ${sh(0.14)}, 0 1px 3px ${sh(0.08)}`,
      };
}

/** A palette as the custom properties the stylesheet reads. */
export function bxTokens(p: BxPalette, base: ThemeBase): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slot, token] of Object.entries(SLOT_TOKEN)) {
    out[token] = p[slot as keyof typeof SLOT_TOKEN];
  }
  return { ...out, ...shadows(p, base) };
}

/**
 * Midnight's slots baked onto bare `.nm-root`, as the floor.
 *
 * Only this one theme ships as CSS; the active theme's values are written to
 * the root element's style attribute, which overrides this. The floor is what
 * paints when there is no style attribute at all — a server render, or a
 * stored theme id that no longer resolves — so the panel degrades to Midnight
 * rather than to an element with forty empty custom properties.
 */
export const BX_BASE_CSS = `.nm-root {\n${Object.entries(
  bxTokens(MIDNIGHT, "dark"),
)
  .map(([k, v]) => `  ${k}: ${v};`)
  .join("\n")}\n}`;
