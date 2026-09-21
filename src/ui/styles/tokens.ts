/**
 * Dev Tools — the token layer.
 *
 * **This file is the only place a size, a radius, a font or a spacing step is
 * allowed to be written down.** Everything else in the stylesheet names a
 * token. Colour lives in `themes/bx.ts`, because colour is the one axis a
 * theme may restate; every value here is identical in all twelve themes.
 *
 * **Why not a `.css` file.** The package ships as ESM with `sideEffects:
 * false` and no CSS pipeline — a consumer importing `blix` gets JavaScript and
 * nothing else, so a real stylesheet could never reach the page. The panel's
 * CSS has always been a string joined at module scope and rendered once into
 * `<style>`; these tokens join it at the front. The rule the brief was after —
 * one source of truth, nothing hardcoded downstream — is what matters, and it
 * holds here exactly as it would in a `.css` file.
 *
 * **Declared on `.nm-root`, not `:host, :root`.** There is no shadow root:
 * the panel portals to `<body>` and relies on its `.nm-` prefix for isolation.
 * `:root` would leak all forty-odd tokens into the host document, and `:host`
 * would match nothing at all.
 *
 * **Never write a backtick inside these template literals** — see the note at
 * the top of `monitorStyles.ts`.
 */

/**
 * Sizes, radii, spacing and type. Identical in all twelve themes; a theme that
 * sets one of these is a bug, which is what `assertThemes` checks for.
 *
 * `--bx-row` is deliberately absent: row height is a *setting*, not a
 * constant, and `constants/ui.ts` owns the three density steps. The panel
 * writes the active one onto the root element's style attribute, down the same
 * path the theme's colours take, so the virtualizer and CSS read one number.
 */
const SIZES = `
.nm-root {
  --bx-font-sans: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  --bx-font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;

  --bx-fs-micro: 9.5px;   /* group labels, uppercase, letter-spacing .1em */
  --bx-fs-meta:  10px;    /* status bar, shortcut keys, method column */
  --bx-fs-sm:    11px;    /* sidebar, chips, buttons, descriptions */
  --bx-fs-code:  11.5px;  /* routes, payload bodies, tabs */
  --bx-fs-md:    12px;    /* menu items, detail route */
  --bx-fs-lg:    13px;    /* status code, palette items */
  --bx-fs-xl:    14px;    /* palette input, modal title */

  --bx-h-header:  34px;
  --bx-h-bar:     22px;   /* column head */
  --bx-h-chips:   28px;
  --bx-h-status:  24px;
  --bx-h-tabs:    27px;
  --bx-h-ctl:     21px;   /* header buttons */
  --bx-h-ctl-sm:  19px;   /* segmented controls */
  --bx-h-chip:    20px;   /* the state-filter chips inside --bx-h-chips */
  --bx-w-side:   180px;
  --bx-w-side-collapsed: 34px;

  /* The row's fixed tracks, in order. Only ROUTE is elastic, which is what
     keeps the list free of horizontal scroll and of header/body scroll-sync.
     PIN and LINKS reserve their width whether or not they have anything to
     show, so nothing shifts when a pin appears on hover or an entry gains a
     cross-source link. The column head reads the same tokens, so the two can
     never drift apart. */
  --bx-col-pin:     20px;
  --bx-col-method:  52px;
  --bx-col-size:    64px;
  /* The mockup draws 42px, which holds a three-digit code but not the two
     states that are words rather than numbers: pending and aborted overhang
     it and paint across SIZE. 58px is the smallest width that fits them. */
  --bx-col-status:  58px;
  --bx-col-time:    58px;
  --bx-col-links:   10px;
  --bx-col-timing: 130px;
  --bx-timing-h:     5px;   /* the timing bar itself, inside that column */

  /* Non-linear on purpose, so a group reads as a group rather than as evenly
     spaced items that happen to be near each other. */
  --bx-1: 2px; --bx-2: 4px; --bx-3: 6px; --bx-4: 10px;
  --bx-5: 14px; --bx-6: 22px; --bx-7: 36px;

  --bx-r-ctl: 3px; --bx-r-pop: 5px; --bx-r-modal: 6px;
  /* The launcher's own corner, and the floor for it: the panel overwrites
     this from the stored setting, the same way it writes the row height. */
  --bx-r-fab: 3px;
  --bx-rail: 2px;
}
`;

/**
 * The scoped reset.
 *
 * The panel has no shadow root, so a host stylesheet's element selectors —
 * `button { font-family: … }`, `input { font-size: … }`, a global `* { color }`
 * — reach straight into it. Five properties are pinned to `inherit` because
 * those are the five that visibly distort a dense table when a host restates
 * them, and because form controls do not inherit them from their parent by
 * default in any browser.
 *
 * Specificity is exactly one class, which beats a host's bare element selector
 * and ties with the panel's own `.nm-*` rules — so this block must stay first
 * in the joined stylesheet, where source order lets every panel rule win. It
 * is `*`, not `:where(*)`: zero specificity would lose to the host.
 *
 * `code`, `kbd` and `pre` therefore lose the UA's monospace default. Every one
 * of them in this panel already names `var(--nm-mono)` explicitly, which is
 * why this is safe — but a new one must say so too.
 */
const RESET = `
.nm-root {
  font-family: var(--bx-font-sans);
  font-size: var(--bx-fs-sm);
  line-height: 1.45;
  letter-spacing: normal;
  color: var(--bx-fg);
}
.nm-root * {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  color: inherit;
}
`;

export const TOKENS_CSS = [SIZES, RESET].join("\n");
