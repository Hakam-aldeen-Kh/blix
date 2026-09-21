/**
 * Dev Tools — the theme contract, enforced.
 *
 * Two failures are worth catching, and both are silent without this:
 *
 * 1. **An incomplete theme.** A slot a theme forgot resolves to the empty
 *    string, and the element paints with whatever it inherits — usually
 *    plausible, occasionally invisible, never noticed in the one theme the
 *    person writing the code had selected.
 * 2. **Text below 4.5:1.** `--bx-fg-2` and `--bx-fg-3` both carry real text —
 *    row values, column heads, meta, shortcut keys — on four different
 *    grounds. A palette ported from an editor theme has no reason to clear AA
 *    on a ground that editor never had.
 *
 * Failures are **reported, never corrected**. Several of these palettes are
 * published — Nord, Dracula, Gruvbox and the Catppuccin pair have canonical
 * values — and quietly nudging one to pass a check would be a worse outcome
 * than the check firing. `--bx-mark` is deliberately not tested: it is below
 * AA by design, which is exactly why it may never hold text.
 *
 * This runs once, in development only, and is tree-shaken out of a production
 * build along with the panel that calls it.
 */

import { BX_PALETTES, BX_TOKENS, bxTokens, type BxPalette } from "./bx";
import { THEMES, type ThemeId } from "./themes";

/** WCAG relative luminance. */
function luminance(hex: string): number | null {
  const h = hex.trim().replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (full.length !== 6) return null;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

/** WCAG contrast ratio, or `null` if either colour is not a plain hex. */
export function contrast(fg: string, bg: string): number | null {
  const a = luminance(fg);
  const b = luminance(bg);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export interface ContrastFailure {
  theme: ThemeId;
  /** The text token — always one of the two that carry text. */
  text: "--bx-fg-2" | "--bx-fg-3";
  ground: "--bx-bg" | "--bx-bar" | "--bx-float" | "--bx-sel";
  textHex: string;
  groundHex: string;
  ratio: number;
}

/** Every ground a piece of text can land on. `--bx-raise` is omitted only
 * because it is `--bx-bar` or between it and `--bx-float` in all twelve. */
const GROUNDS = ["bg", "bar", "float", "sel"] as const;
const TEXTS = ["fg2", "fg3"] as const;
const TOKEN_OF: Record<string, string> = {
  fg2: "--bx-fg-2",
  fg3: "--bx-fg-3",
  bg: "--bx-bg",
  bar: "--bx-bar",
  float: "--bx-float",
  sel: "--bx-sel",
};

/** Every `--bx-fg-2` / `--bx-fg-3` pair under 4.5:1, across all twelve. */
export function contrastReport(): ContrastFailure[] {
  const out: ContrastFailure[] = [];
  for (const theme of THEMES) {
    const p: BxPalette | undefined = BX_PALETTES[theme.id];
    if (!p) continue;
    for (const text of TEXTS) {
      for (const ground of GROUNDS) {
        const ratio = contrast(p[text], p[ground]);
        if (ratio === null || ratio >= 4.5) continue;
        out.push({
          theme: theme.id,
          text: TOKEN_OF[text] as ContrastFailure["text"],
          ground: TOKEN_OF[ground] as ContrastFailure["ground"],
          textHex: p[text],
          groundHex: p[ground],
          ratio: Math.round(ratio * 100) / 100,
        });
      }
    }
  }
  return out;
}

/** Themes missing one of the tokens in `BX_TOKENS`, and the tokens they miss. */
export function missingSlots(): { theme: ThemeId; tokens: string[] }[] {
  const out: { theme: ThemeId; tokens: string[] }[] = [];
  for (const theme of THEMES) {
    const p: BxPalette | undefined = BX_PALETTES[theme.id];
    if (!p) {
      out.push({ theme: theme.id, tokens: [...BX_TOKENS] });
      continue;
    }
    const emitted = bxTokens(p, theme.base);
    const tokens = BX_TOKENS.filter((t) => {
      const v = emitted[t];
      return typeof v !== "string" || v.trim() === "";
    });
    if (tokens.length) out.push({ theme: theme.id, tokens });
  }
  return out;
}

let ran = false;

/**
 * Runs both checks once and warns. Call it from the panel; it is a no-op in
 * production and after the first call.
 */
export function assertThemes(): void {
  if (ran || process.env.NODE_ENV === "production") return;
  ran = true;

  const missing = missingSlots();
  for (const m of missing) {
    console.warn(
      `[blix] theme "${m.theme}" is missing ${m.tokens.length} of the ${BX_TOKENS.length} colour slots: ${m.tokens.join(", ")}`,
    );
  }

  const failures = contrastReport();
  for (const f of failures) {
    console.warn(
      `[blix] theme "${f.theme}": ${f.text} (${f.textHex}) on ${f.ground} (${f.groundHex}) is ${f.ratio}:1 — below the 4.5:1 both text tokens are held to.`,
    );
  }

  if (!missing.length && !failures.length) return;
  console.warn(
    `[blix] ${missing.length} incomplete theme(s), ${failures.length} contrast failure(s). Reported, not corrected — several of these palettes are published and the values are deliberate.`,
  );
}
