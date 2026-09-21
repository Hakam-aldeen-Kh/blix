/**
 * Dev Tools — self-contained stylesheet.
 *
 * The panel deliberately uses none of the host app's styling: it portals to
 * `<body>` outside every stacking context, forces `direction: ltr`, and ships
 * its own palette so host theme changes can never distort it.
 *
 * **Design system.** Four layers of elevation (`--nm-bg` → `--nm-surface` →
 * `--nm-surface-2` → `--nm-surface-3`), one generic UI accent, four
 * *section-identity* colours (`--nm-c-network/realtime/redux/query`) applied
 * at a handful of deliberate touch points — the section tab, the row's
 * selected-state edge, the method/kind badge — so which of the four worlds a
 * row belongs to reads at a glance without reading the label. Everything else
 * (JSON syntax, diff add/remove/change, status pills) stays strictly semantic
 * and universal — colour only carries meaning where it adds one, never as
 * decoration.
 *
 * **Every colour here is a token.** The values live in `themes/themes.ts`;
 * this file only ever names them. The default theme's tokens are baked in as
 * the floor, and the active theme's are written to the root element's `style`
 * attribute, so a new theme needs no edit here at all. A component that needs
 * a colour sets a *role* attribute (`data-state="error"`, `data-accent="post"`)
 * rather than an inline hex, so the role blocks below are the single place
 * those roles resolve.
 *
 * **RTL note:** `direction: ltr` is set on `.nm-root` on purpose, which is why
 * this file uses physical `left`/`right` rather than logical properties.
 * Browser devtools are LTR in every locale, and "dock right" must mean
 * physical right in an RTL locale too. The override is scoped entirely to
 * `.nm-*` selectors, so it cannot leak into the host app — please don't "fix"
 * it in an RTL sweep.
 *
 * Chunked into named sections and joined once at module scope.
 *
 * **Never write a backtick inside these template literals** — not even inside
 * a CSS comment. It closes the string, and the compiler then reports the
 * error at whatever happens to follow rather than at the backtick. Refer to
 * token names as plain words in CSS comments; the JSDoc blocks outside the
 * literals can quote them freely.
 */

import { BX_BASE_CSS } from "../themes/bx";
import { BASE_THEME_CSS } from "../themes/themes";
import { TOKENS_CSS } from "./tokens";

const BASE = `
.nm-root {
  position: fixed; z-index: 2147483647;
  pointer-events: auto;
  direction: ltr; text-align: left;
  -webkit-font-smoothing: antialiased;

  --nm-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --nm-ease: cubic-bezier(.22,1,.36,1);

  /* Row height, driven by the density setting. The floor matches the
     default step; the panel overwrites it from constants/ui.ts. */
  --nm-row-h: 26px;

  /* Floors for the two role variables, so a component that paints with them
     without declaring a role still renders in the generic accent rather than
     with an empty custom property. */
  --nm-accent-fg: var(--nm-accent);
  --nm-accent-bg: var(--nm-accent-soft);
  --nm-state-fg: var(--nm-state-all);
  --nm-state-bg: var(--nm-state-all-soft);
  --nm-state-glow: var(--nm-state-all-glow);
}
.nm-root * { box-sizing: border-box; }
.nm-ico { display: block; flex-shrink: 0; }
/* Selecting a payload is half of what this panel is for, and the browser's
   default selection blue sits badly on eight of the twelve palettes. */
/* Selecting a payload is half of what this panel is for, and the browser's
   own selection blue sits badly on eight of the twelve palettes. It is not
   the accent either: a translucent accent band inside a field whose border
   has just gone accent reads as a second focus ring. --bx-sel is the token
   for exactly this - the ground a selected thing sits on. */
.nm-root ::selection { background: var(--bx-sel); color: var(--bx-fg); }
`;

/**
 * Role → colour. The only place a semantic role becomes a concrete pair of
 * tokens; every consumer below reads `--nm-state-fg`/`--nm-accent-fg` and
 * their `-bg` counterparts, so a badge, a dot, a waterfall bar and a status
 * pill can't disagree about what "error" looks like.
 */
const ROLES = `
[data-state="pending"] { --nm-state-fg: var(--nm-state-pending); --nm-state-bg: var(--nm-state-pending-soft); --nm-state-glow: var(--nm-state-pending-glow); }
[data-state="success"] { --nm-state-fg: var(--nm-state-success); --nm-state-bg: var(--nm-state-success-soft); --nm-state-glow: var(--nm-state-success-glow); }
[data-state="error"]   { --nm-state-fg: var(--nm-state-error);   --nm-state-bg: var(--nm-state-error-soft);   --nm-state-glow: var(--nm-state-error-glow); }
[data-state="aborted"] { --nm-state-fg: var(--nm-state-aborted); --nm-state-bg: var(--nm-state-aborted-soft); --nm-state-glow: var(--nm-state-aborted-glow); }
/* The All filter's dot — a state slot that deliberately means "no state". */
[data-state="all"]     { --nm-state-fg: var(--nm-state-all);     --nm-state-bg: var(--nm-state-all-soft);     --nm-state-glow: var(--nm-state-all-glow); }

[data-accent="get"]      { --nm-accent-fg: var(--nm-m-get);      --nm-accent-bg: var(--nm-m-get-soft); }
[data-accent="post"]     { --nm-accent-fg: var(--nm-m-post);     --nm-accent-bg: var(--nm-m-post-soft); }
[data-accent="put"]      { --nm-accent-fg: var(--nm-m-put);      --nm-accent-bg: var(--nm-m-put-soft); }
[data-accent="delete"]   { --nm-accent-fg: var(--nm-m-delete);   --nm-accent-bg: var(--nm-m-delete-soft); }
[data-accent="other"]    { --nm-accent-fg: var(--nm-m-other);    --nm-accent-bg: var(--nm-m-other-soft); }
/* The four source identities, addressable the same way — the rail, the tab
   underline, the link ticks and the linked chips all need "the colour of the
   section this belongs to" without knowing which section that is. */
[data-accent="network"]  { --nm-accent-fg: var(--nm-c-network);  --nm-accent-bg: var(--nm-c-network-soft); }
[data-accent="realtime"] { --nm-accent-fg: var(--nm-c-realtime); --nm-accent-bg: var(--nm-c-realtime-soft); }
[data-accent="redux"]    { --nm-accent-fg: var(--nm-c-redux);    --nm-accent-bg: var(--nm-c-redux-soft); }
[data-accent="query"]    { --nm-accent-fg: var(--nm-c-query);    --nm-accent-bg: var(--nm-c-query-soft); }
/* Two non-source accents, for the command palette: a command that destroys
   something and one that keeps writing after you walk away. */
[data-accent="danger"]   { --nm-accent-fg: var(--nm-error);      --nm-accent-bg: var(--nm-error-soft); }
[data-accent="warn"]     { --nm-accent-fg: var(--nm-warning);    --nm-accent-bg: var(--nm-warning-soft); }
`;

const FAB = `
/* -- The launcher --------------------------------------------------------
   The panel, collapsed to one line. Same height as the header, same wordmark,
   same capture dot - because it is the same object, and a launcher that looks
   like a different product is a launcher you have to learn twice.

   It keeps a shadow, alone with the panel's outer edge: both sit on a ground
   this stylesheet does not control, so neither can separate itself with a
   background step the way everything inside the panel does. */
.nm-fab {
  display: flex; align-items: center; height: var(--bx-h-header); padding: 0;
  background: var(--bx-raise); border: 1px solid var(--bx-line-strong);
  /* The one radius a developer can change - see FAB_RADIUS. */
  border-radius: var(--bx-r-fab);
  box-shadow: var(--bx-shadow-fab);
  color: var(--bx-fg-2); font-size: var(--bx-fs-sm);
  cursor: grab; overflow: hidden; touch-action: none; user-select: none;
  transition: background-color 90ms linear, border-color 90ms linear;
}
.nm-fab:hover { border-color: var(--bx-accent); }
.nm-fab:active { cursor: grabbing; }

.nm-fab-brand { display: flex; align-items: center; gap: var(--bx-3); padding: 0 var(--bx-4); }
/* Capture state, not buffer state. The worst status in the log is already the
   failing count two segments along; saying it twice in two shapes meant the
   dot carried no information of its own. */
.nm-fab-dot {
  width: 6px; height: 6px; flex: none; border-radius: 50%;
  background: var(--bx-ok);
}
.nm-fab[data-paused] .nm-fab-dot { background: var(--bx-warn); }
/* Something is in flight. Opacity only, and it stops for anyone who has asked
   motion to stop - it is the one live-progress indicator out here. */
.nm-fab[data-live] .nm-fab-dot { animation: nm-pulse 1.6s ease-in-out infinite; }
.nm-fab-label {
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
  letter-spacing: .1em; color: var(--bx-fg-3);
}

.nm-fab-sep { width: 1px; height: 20px; flex: none; background: var(--bx-line); }
/* Numbers, not badges. A tinted capsule behind a count is decoration the
   moment the number is already coloured by what it means. */
.nm-fab-stats {
  display: flex; align-items: center; gap: var(--bx-4); padding: 0 var(--bx-4);
  font-family: var(--bx-font-mono); font-variant-numeric: tabular-nums;
}
.nm-fab-count { color: var(--bx-fg-2); }
.nm-fab-err { color: var(--bx-err); }
.nm-fab-grip { display: flex; align-items: center; padding-right: var(--bx-3); color: var(--bx-mark); }

.nm-fab-ghost {
  position: fixed; transform: translate(-50%, -50%);
  cursor: grabbing; pointer-events: none; z-index: 2147483647;
}

/* Where it will land.

   All four are drawn, not just the one under the pointer: the question being
   answered is "where can this go", and a single box that appears beside the
   cursor answers a different one. Each says which corner it is, because an
   empty dashed rectangle is a shape, not an offer. */
.nm-zone {
  position: fixed; width: 104px; height: 54px;
  display: flex; align-items: flex-end; padding: var(--bx-3);
  border-radius: var(--bx-r-ctl);
  border: 1px dashed var(--bx-line-strong); background: var(--bx-hover);
  font-size: var(--bx-fs-sm); color: var(--bx-fg-3);
  pointer-events: none; z-index: 2147483646;
  transition: background-color 90ms linear, border-color 90ms linear, color 90ms linear;
}
.nm-zone.active {
  border-style: solid; border-color: var(--bx-accent);
  background: var(--bx-sel); color: var(--bx-fg);
}
`;

const PANEL = `
.nm-panel {
  position: fixed; display: flex; flex-direction: column; overflow: hidden;
  /* The panel resizes independently of the viewport (dock, splitter, drag), so
     everything inside responds to the panel's width, not the window's. */
  container-type: inline-size; container-name: nm;
  background: var(--nm-surface); border: 1px solid var(--nm-line); color: var(--nm-txt);
  border-radius: var(--bx-r-modal);
  box-shadow: var(--nm-shadow-panel);
  animation: nm-in .18s var(--nm-ease);
}
/* Docks sit flush against their edge and read against the app via a strong
   border plus an outward shadow. */
.nm-panel.nm-dock-bottom {
  border-radius: 0; border-left: none; border-right: none; border-bottom: none;
  border-top: 1px solid var(--nm-line-strong);
  box-shadow: var(--nm-shadow-dock-b);
}
.nm-panel.nm-dock-right {
  border-radius: 0; border-top: none; border-right: none; border-bottom: none;
  border-left: 1px solid var(--nm-line-strong);
  box-shadow: var(--nm-shadow-dock-r);
}
.nm-panel.nm-max { border-radius: var(--bx-r-modal); }
.nm-panel.nm-anim {
  transition: left .3s var(--nm-ease), top .3s var(--nm-ease),
              width .3s var(--nm-ease), height .3s var(--nm-ease);
}
@keyframes nm-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }

.nm-resize {
  position: absolute; bottom: 2px; right: 2px; width: 18px; height: 18px; z-index: 5;
  cursor: nwse-resize; touch-action: none; opacity: .5; transition: opacity .14s ease;
  background: linear-gradient(-45deg, var(--nm-faint) 0 1.5px, transparent 1.5px),
              linear-gradient(-45deg, transparent 4px, var(--nm-faint) 4px 5.5px, transparent 5.5px),
              linear-gradient(-45deg, transparent 8px, var(--nm-faint) 8px 9.5px, transparent 9.5px);
}
.nm-panel:hover .nm-resize { opacity: .9; }

/* Dock resize grips sit on the dock's inner edge. */
.nm-dock-grip { position: absolute; z-index: 6; touch-action: none; }
.nm-dock-grip::after {
  content: ""; position: absolute; inset: 0; background: transparent;
  transition: background .14s ease;
}
.nm-dock-grip:hover::after { background: var(--nm-accent); }
.nm-dock-grip-h { top: 0; left: 0; right: 0; height: 5px; cursor: ns-resize; }
.nm-dock-grip-v { top: 0; bottom: 0; left: 0; width: 5px; cursor: ew-resize; }
`;

const HEADER = `
/* -- The header -----------------------------------------------------------
   One row for everything true of the *session* rather than of one entry:
   whether capture is running, what is being filtered out, and where the panel
   lives. Export and Appearance are icon-only here and named in the overflow
   menu and the palette, which is where you go when you do not already know
   the glyph. */
.nm-header {
  display: flex; align-items: center; flex: none; gap: var(--bx-4);
  height: var(--bx-h-header); padding: 0 var(--bx-3) 0 8px;
  background: var(--bx-raise); border-bottom: 1px solid var(--bx-line);
  user-select: none;
}
.nm-grip {
  width: 16px; height: 20px; flex: none; display: flex; align-items: center;
  justify-content: center; padding: 0; background: transparent; border: 0;
  color: var(--bx-mark); cursor: grab;
}
.nm-title {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
  letter-spacing: .1em; color: var(--bx-fg-3);
}

/* Capture and preserve: the two controls that silently change what happens to
   the log, so both must read as *on* rather than as pressable. The state
   colour carries on the dot, the icon and the label; the ground is one step of
   elevation, because the slot set has no tint-of-a-state colour and inventing
   one per theme is worse than doing without. */
.nm-chip {
  display: flex; align-items: center; gap: 7px; flex: none;
  height: var(--bx-h-ctl); padding: 0 9px;
  background: var(--bx-hover); border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-r-ctl);
  font-size: var(--bx-fs-sm); color: var(--bx-fg-3); cursor: pointer;
  transition: background-color 90ms linear, border-color 90ms linear;
}
.nm-chip-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: currentColor; }
.nm-chip-ico { display: flex; flex: none; }
.nm-capture[data-on] { color: var(--bx-ok); }
.nm-capture { color: var(--bx-warn); }
.nm-preserve[data-on] { color: var(--bx-warn); }

.nm-filter {
  display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0;
  height: 22px; padding: 0 var(--bx-3) 0 8px;
  background: var(--bx-bg); border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-r-ctl);
  transition: border-color 90ms linear;
}
.nm-filter:focus-within { border-color: var(--bx-accent); }
.nm-filter-ico { display: flex; flex: none; color: var(--bx-fg-3); }
.nm-filter-input {
  flex: 1 1 auto; min-width: 0; padding: 0; background: transparent; border: 0;
  outline: 0; color: var(--bx-fg);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
}
.nm-filter-input::placeholder { color: var(--bx-fg-3); }
/* So that "is a filter on?" never requires reading the status bar. */
.nm-filter-count {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3); font-variant-numeric: tabular-nums;
}
.nm-filter-x, .nm-filter-re {
  height: 16px; padding: 0 var(--bx-3); flex: none; display: flex; align-items: center;
  background: transparent; border: 0; border-radius: 2px; color: var(--bx-fg-3);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta); cursor: pointer;
  transition: background-color 90ms linear;
}
.nm-filter-x:hover, .nm-filter-re:hover { background: var(--bx-hover); }
.nm-filter-re.active { color: var(--bx-accent); }
.nm-kbd {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3); background: none; border: 0; padding: 0; cursor: pointer;
}

.nm-actions { display: flex; align-items: center; gap: 1px; flex: none; }
.nm-ibtn {
  width: 24px; height: 22px; flex: none; display: flex; align-items: center;
  justify-content: center; padding: 0; background: transparent; border: 0;
  border-radius: var(--bx-r-ctl); color: var(--bx-fg-2); cursor: pointer;
  transition: background-color 90ms linear, color 90ms linear;
}
.nm-ibtn-quiet { color: var(--bx-fg-3); }
.nm-ibtn:hover { background: var(--bx-hover); }
.nm-ibtn.active, .nm-ibtn[aria-expanded="true"] { background: var(--bx-sel); color: var(--bx-fg); }
.nm-ibtn:disabled { color: var(--bx-mark); cursor: default; background: transparent; }
.nm-hsep { width: 1px; height: 16px; flex: none; background: var(--bx-line); }
`;

/* ── Sources rail ──────────────────────────────────────────────────────────
   The four sources are navigation between four different tables, not a filter
   over one — a vertical rail says that, where four tabs wedged into a toolbar
   said "four views of the same thing" and competed with the search box for
   width on every dock.

   It also gives the session totals a home. They were in the status bar,
   where they were the first thing dropped by the width breakpoints; here they
   are stacked and legible, and the bar keeps only what it can always show. */
const RAIL = `
/* -- The sources sidebar --------------------------------------------------
   Four sources and the session totals. The totals were in the status bar,
   where the width breakpoints dropped them first and nobody looked; stacked
   here they survive a narrow panel, because a column loses width far more
   slowly than a bar does. */
.nm-rail {
  display: flex; flex-direction: column; flex: none; min-height: 0;
  background: var(--bx-bar); border-right: 1px solid var(--bx-line);
  user-select: none; overflow: hidden;
}
.nm-rail-head {
  display: flex; align-items: center; flex: none; height: 26px;
  padding: 0 var(--bx-3) 0 var(--bx-4);
}
.nm-rail-label {
  flex: 1 1 auto; font-size: var(--bx-fs-micro); letter-spacing: .1em;
  color: var(--bx-fg-3); white-space: nowrap; overflow: hidden;
}
.nm-rail-collapse {
  width: 18px; height: 18px; flex: none; display: flex; align-items: center;
  justify-content: center; padding: 0; background: transparent; border: 0;
  border-radius: var(--bx-r-ctl); color: var(--bx-fg-3); cursor: pointer;
  transition: background-color 90ms linear;
}
.nm-rail-collapse:hover { background: var(--bx-hover); }

.nm-rail-list { flex: none; }
.nm-rail-item {
  display: flex; align-items: center; width: 100%; height: var(--bx-row);
  padding: 0 var(--bx-4) 0 0; background: transparent; border: 0;
  border-left: var(--bx-rail) solid transparent;
  text-align: left; cursor: pointer;
  transition: background-color 90ms linear, border-color 90ms linear;
}
.nm-rail-item:hover { background: var(--bx-hover); }
.nm-rail-item.active { background: var(--bx-float); }
/* One of exactly two places a source colour is allowed, and it is data: which
   of the four worlds you are looking at. */
.nm-rail-item[data-src="network"].active  { border-left-color: var(--bx-src-network); }
.nm-rail-item[data-src="realtime"].active { border-left-color: var(--bx-src-realtime); }
.nm-rail-item[data-src="redux"].active    { border-left-color: var(--bx-src-redux); }
.nm-rail-item[data-src="query"].active    { border-left-color: var(--bx-src-query); }
.nm-rail-ico {
  width: 26px; flex: none; display: flex; align-items: center; justify-content: center;
  color: var(--bx-fg-3);
}
.nm-rail-item.active .nm-rail-ico { color: var(--bx-fg-2); }
.nm-rail-name {
  flex: 1 1 auto; min-width: 0; font-size: var(--bx-fs-md); color: var(--bx-fg-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nm-rail-n {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
  color: var(--bx-fg-2); font-variant-numeric: tabular-nums;
}
.nm-rail-item.active .nm-rail-name, .nm-rail-item.active .nm-rail-n { color: var(--bx-fg); }
.nm-rail-empty .nm-rail-name, .nm-rail-empty .nm-rail-n { color: var(--bx-fg-3); }
/* The shortcut is taught where it is used. */
.nm-rail-key {
  width: 20px; flex: none; text-align: right; font-family: var(--bx-font-mono);
  font-size: var(--bx-fs-meta); color: var(--bx-fg-3);
}

.nm-rail-stats { flex: none; }
.nm-rail-stats-head {
  display: flex; align-items: center; height: 26px; margin-top: 16px;
  padding: 0 var(--bx-4); font-size: var(--bx-fs-micro); letter-spacing: .1em;
  color: var(--bx-fg-3);
}
.nm-rail-stat { display: flex; align-items: center; height: 22px; padding: 0 var(--bx-4); }
.nm-rail-stat-k { flex: 1 1 auto; min-width: 0; font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }
.nm-rail-stat-v {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
  color: var(--bx-fg-2); font-variant-numeric: tabular-nums;
}
.nm-rail-stat-v.nm-hot { color: var(--bx-warn); }
.nm-rail-stat-v.nm-bad { color: var(--bx-err); }
.nm-rail-stat-v.nm-zero { color: var(--bx-fg-3); }

.nm-rail-spacer { flex: 1 1 auto; min-height: 0; }
.nm-rail-cmdwrap { flex: none; padding: 8px; }
.nm-rail-cmd {
  display: flex; align-items: center; width: 100%; height: 24px; padding: 0 8px;
  background: transparent; border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-r-ctl); color: var(--bx-fg-2);
  font-size: var(--bx-fs-sm); cursor: pointer;
  transition: background-color 90ms linear, border-color 90ms linear;
}
.nm-rail-cmd:hover { background: var(--bx-hover); }
.nm-rail-cmd > span { flex: 1 1 auto; text-align: left; }

/* Collapsed: the icon still carries the source's identity, which four dots
   never could. */
/* Collapsed: navigation only.

   The session stats go rather than shrink. A column of 34px numbers reading
   25 / 2.2 MB / 1.52 s / 9 with their labels stripped off is not a compact
   version of the stats - it is four unattributed numbers, and a reader who
   has to expand the sidebar to find out what they mean would have been better
   served by nothing at all. What survives is what a sidebar is for: which
   source you are in, and how much is in each.

   Each source stacks its icon over its count, which is why a mini row is
   taller than a list row rather than narrower. */
.nm-rail-mini .nm-rail-label,
.nm-rail-mini .nm-rail-name,
.nm-rail-mini .nm-rail-key,
.nm-rail-mini .nm-rail-stats,
.nm-rail-mini .nm-rail-cmd > span { display: none; }

.nm-rail-mini .nm-rail-head { justify-content: center; padding: 0; }
.nm-rail-mini .nm-rail-item {
  flex-direction: column; justify-content: center; gap: 1px;
  height: calc(var(--bx-row) + var(--bx-4)); padding: 0;
}
.nm-rail-mini .nm-rail-ico { width: auto; }
.nm-rail-mini .nm-rail-n { font-size: var(--bx-fs-micro); font-variant-numeric: tabular-nums; }
/* The button keeps its box so the bottom of the sidebar still reads as a
   control rather than as an empty rectangle. */
.nm-rail-mini .nm-rail-cmdwrap { padding: var(--bx-3); }
.nm-rail-mini .nm-rail-cmd { justify-content: center; padding: 0; }
`;

const TABLE = `
.nm-body { display: flex; flex: 1; min-height: 0; min-width: 0; }
.nm-body-panes { display: flex; flex: 1; min-height: 0; min-width: 0; }
.nm-body-panes.nm-body-v { flex-direction: column; }
/* overflow:hidden at every level of the pane chain. Without it, a table whose
   fixed columns are wider than the pane paints its overflow straight over the
   detail pane instead of being clipped. */
.nm-list {
  flex-shrink: 0; display: flex; min-width: 0; min-height: 0; overflow: hidden;
  background: var(--bx-bg);
  container-type: inline-size; container-name: nmlist;
}

.nm-split {
  flex: 0 0 5px; cursor: col-resize; touch-action: none;
  background: var(--nm-line); position: relative; transition: background .14s ease;
}
.nm-split-v { cursor: row-resize; }
.nm-split::after {
  content: ""; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: 2px; height: 26px; border-radius: 999px; background: var(--nm-line-strong);
  opacity: .6; transition: opacity .14s ease;
}
.nm-split-v::after { width: 26px; height: 2px; }
.nm-split::before { content: ""; position: absolute; left: -4px; right: -4px; top: -4px; bottom: -4px; }
.nm-split:hover, .nm-split:active { background: var(--nm-accent); }
.nm-split:hover::after { opacity: 0; }

/* No horizontal scrolling by design: the one flexible column is
   minmax(0, 1fr) and truncates, which removes header/body scroll-sync
   entirely — and lets the header row spend its width on the state filters
   instead of on labels for columns that never move. */
.nm-table { display: flex; flex-direction: column; flex: 1; width: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.nm-grid { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; }

/* -- State filters --------------------------------------------------------
   Its own bar above the column head. The chips act on this list only, which is
   why they sit with it rather than in the panel header. */
/* Outranks .nm-strip-scroll, which the same element also carries for its
   overflow fade and which would otherwise let the chip bar grow to fill the
   whole list pane. */
.nm-table > .nm-fchips {
  display: flex; align-items: center; flex: none; min-width: 0;
  height: var(--bx-h-chips); padding: 0 var(--bx-4); gap: var(--bx-1);
  background: var(--bx-bg); border-bottom: 1px solid var(--bx-line-soft);
  user-select: none;
}
.nm-fchip {
  display: flex; align-items: center; gap: var(--bx-3); flex: none;
  height: var(--bx-h-chip); padding: 0 9px;
  background: transparent; border: 0; border-radius: var(--bx-r-ctl);
  color: var(--bx-fg-2); font-size: var(--bx-fs-sm); cursor: pointer;
  white-space: nowrap;
  transition: background-color 90ms linear, color 90ms linear;
}
.nm-fchip:hover { background: var(--bx-hover); }
.nm-fchip.active { background: var(--bx-sel); color: var(--bx-fg); }
.nm-fchip-dot { width: 5px; height: 5px; flex: none; border-radius: 50%; background: var(--bx-mark); }
.nm-fchip[data-state="success"] .nm-fchip-dot { background: var(--bx-ok); }
.nm-fchip[data-state="error"]   .nm-fchip-dot { background: var(--bx-err); }
.nm-fchip[data-state="pending"] .nm-fchip-dot { background: var(--bx-info); }
.nm-fchip-n {
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3); font-variant-numeric: tabular-nums;
}
.nm-fchip.active .nm-fchip-n { color: var(--bx-fg-2); }


.nm-tbody { flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; min-width: 0; background: var(--bx-bg); }

/* -- Row ------------------------------------------------------------------
   Nine tracks, one of them elastic. Every fixed width is a token, and the
   column head below reads the same ones - a row and its header that disagree
   about a column boundary is the failure mode this replaces. */
.nm-trow {
  display: flex; align-items: stretch; min-width: 0;
  height: var(--bx-row); padding-right: var(--bx-4);
  border-bottom: 1px solid var(--bx-line-soft);
  cursor: pointer; background: transparent;
  transition: background-color 90ms linear;
}
.nm-trow:hover { background: var(--bx-hover); }
.nm-trow.active { background: var(--bx-sel); }
.nm-trow:focus-visible { outline: 1px solid var(--bx-accent); outline-offset: -1px; }

/* The rail carries status and nothing else. Selection paints the row's
   background and deliberately never touches the rail - the two facts are
   independent, and a selected error must still read as an error. */
/* Not .nm-rail: the sources sidebar already owns that class. */
.nm-row-rail { flex: none; width: var(--bx-rail); background: var(--bx-mark); }
.nm-trow[data-tone="ok"]   .nm-row-rail { background: var(--bx-ok); }
.nm-trow[data-tone="warn"] .nm-row-rail { background: var(--bx-warn); }
.nm-trow[data-tone="err"]  .nm-row-rail { background: var(--bx-err); }
.nm-trow[data-tone="info"] .nm-row-rail { background: var(--bx-info); }
/* A response a rule supplied rather than the server: the rail breaks into
   three, which reads as "interrupted" at 2px where no colour change would.
   Nothing sets it yet - the feature it belongs to is not built. */
.nm-row-rail-forced {
  background-image: linear-gradient(
    var(--bx-warn) 0 calc(33.33% - 1px),
    transparent calc(33.33% - 1px) calc(33.33% + 1px),
    var(--bx-warn) calc(33.33% + 1px) calc(66.66% - 1px),
    transparent calc(66.66% - 1px) calc(66.66% + 1px),
    var(--bx-warn) calc(66.66% + 1px) 100%);
}

/* Every cell is the same box; only width, alignment and colour differ, so the
   shared half is declared once. */
.nm-trow > span, .nm-cols > * {
  display: flex; align-items: center; flex: none;
  font-family: var(--bx-font-mono); font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Reserved whether or not there is a pin, so nothing to its right moves when
   one appears under the pointer. */
.nm-col-pin { width: var(--bx-col-pin); justify-content: center; }
.nm-pin {
  width: 16px; height: 16px; padding: 0; display: flex; align-items: center;
  justify-content: center; background: transparent; border: 0;
  border-radius: var(--bx-r-ctl); color: var(--bx-mark); cursor: pointer;
  opacity: 0; transition: background-color 90ms linear, border-color 90ms linear;
}
.nm-trow:hover .nm-pin, .nm-trow:focus-within .nm-pin, .nm-pin.pinned { opacity: 1; }
.nm-pin.pinned { color: var(--bx-warn); }
.nm-pin:focus-visible { opacity: 1; outline: 1px solid var(--bx-accent); outline-offset: -1px; }

.nm-col-method {
  width: var(--bx-col-method); padding-left: var(--bx-4);
  font-size: var(--bx-fs-meta); letter-spacing: .06em; color: var(--bx-fg-2);
}
.nm-col-method[data-dim] { color: var(--bx-fg-3); }

/* Two spans, not one string: the module gives up width first and truncates,
   the identifier never does. A grid rather than flex, so the second track
   takes its content's width before the first is allowed any. */
/* Selector has to outrank the shared cell rule above, which is a class
   plus an element and therefore beats a bare class. */
.nm-trow > .nm-col-route, .nm-cols > .nm-col-route {
  flex: 1 1 auto; min-width: 0;
}
.nm-col-route {
  display: grid;
  grid-template-columns: minmax(0, max-content) max-content;
  align-items: center; padding-right: var(--bx-5);
  font-size: var(--bx-fs-code);
  /* The tail is max-content and will not shrink, so without this it paints
     across SIZE once the column is narrower than the identifier itself. */
  overflow: hidden;
}
.nm-route-head { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--bx-fg-3); }
.nm-route-tail { white-space: nowrap; color: var(--bx-fg); }
/* Selection promotes the module a level rather than brightening the
   identifier, which is already as bright as the palette goes. */
.nm-trow.active .nm-route-head { color: var(--bx-fg-2); }
/* 8px: optical separation from the identifier, not a rhythm step. */
.nm-route-note { padding-left: 8px; font-size: var(--bx-fs-meta); color: var(--bx-fg-3); }

.nm-col-size {
  width: var(--bx-col-size); justify-content: flex-end;
  font-size: var(--bx-fs-sm); color: var(--bx-fg-3);
}
.nm-col-status {
  width: var(--bx-col-status); justify-content: flex-end; padding-right: var(--bx-4);
  font-size: var(--bx-fs-sm); color: var(--bx-fg-3);
}
.nm-trow[data-tone="ok"]   .nm-col-status { color: var(--bx-ok); }
.nm-trow[data-tone="warn"] .nm-col-status { color: var(--bx-warn); }
.nm-trow[data-tone="err"]  .nm-col-status { color: var(--bx-err); }
.nm-trow[data-tone="info"] .nm-col-status { color: var(--bx-info); }

/* 12px, not a spacing step: this is optical alignment of the duration against
   the axis labels above it, not rhythm between groups. */
.nm-col-time {
  width: var(--bx-col-time); justify-content: flex-end; padding-right: 12px;
  font-size: var(--bx-fs-sm); color: var(--bx-fg-2);
}
.nm-col-time[data-slow] { color: var(--bx-warn); }

.nm-col-links { width: var(--bx-col-links); justify-content: center; gap: var(--bx-1); }
/* One of exactly two places a source colour is allowed. Two pixels of it, and
   it is data - which source this entry is also recorded in. */
.nm-link-tick { width: 2px; height: 8px; display: block; background: var(--bx-mark); }
.nm-link-tick[data-src="network"]  { background: var(--bx-src-network); }
.nm-link-tick[data-src="realtime"] { background: var(--bx-src-realtime); }
.nm-link-tick[data-src="redux"]    { background: var(--bx-src-redux); }
.nm-link-tick[data-src="query"]    { background: var(--bx-src-query); }

.nm-col-timing { width: var(--bx-col-timing); }
/* Not .nm-timing: the Timing tab already owns that class, later in this
   sheet, and won this collision silently. */
.nm-tbar { display: flex; width: 100%; height: var(--bx-timing-h); background: var(--bx-line-soft); }
.nm-tbar > span { flex: none; display: block; }
.nm-tbar-wait { background: var(--bx-wait); }
.nm-trow[data-tone="ok"]   .nm-tbar-xfer { background: var(--bx-ok); }
.nm-trow[data-tone="warn"] .nm-tbar-xfer { background: var(--bx-warn); }
.nm-trow[data-tone="err"]  .nm-tbar-xfer { background: var(--bx-err); }
.nm-trow[data-tone="info"] .nm-tbar-xfer { background: var(--bx-info); }
.nm-trow[data-tone="mark"] .nm-tbar-xfer { background: var(--bx-mark); }

/* A column the developer switched off, and a column the pane is too narrow
   to afford, collapse the same way: to zero width, never display:none. The
   row keeps its nine children either way, so nothing downstream - the grid
   roles, the header alignment, the breakpoints - has to know which of the two
   happened. */
.nm-table[data-hide~="pin"]    [data-col="pin"],
.nm-table[data-hide~="method"] [data-col="method"],
.nm-table[data-hide~="size"]   [data-col="size"],
.nm-table[data-hide~="status"] [data-col="status"],
.nm-table[data-hide~="time"]   [data-col="time"],
.nm-table[data-hide~="links"]  [data-col="links"],
.nm-table[data-hide~="timing"] [data-col="timing"] {
  width: 0; padding-left: 0; padding-right: 0; overflow: hidden;
}

/* -- Column head ----------------------------------------------------------
   The same tracks, from the same tokens, so the two cannot drift apart. */
.nm-cols {
  display: flex; align-items: stretch; flex: none; min-width: 0;
  height: var(--bx-h-bar); padding-right: var(--bx-4);
  background: var(--bx-bar);
  border-top: 1px solid var(--bx-line);
  border-bottom: 1px solid var(--bx-line);
  font-size: var(--bx-fs-micro); letter-spacing: .08em; color: var(--bx-fg-3);
  user-select: none;
}
.nm-cols > * { font-family: var(--bx-font-sans); }
.nm-col-lead { width: calc(var(--bx-rail) + var(--bx-col-pin)); }
.nm-cols .nm-col-route { display: flex; }
/* The mockup sets METHOD flush with the lead track rather than indenting
   it to meet the values below, so the label and its column start 10px
   apart. Reproduced as drawn. */
.nm-cols .nm-col-method { padding-left: 0; color: var(--bx-fg-3); }
.nm-colhead {
  background: none; border: 0; cursor: pointer; padding: 0;
  font-size: inherit; letter-spacing: inherit; color: inherit;
  transition: color 90ms linear;
}
.nm-col-status.nm-colhead { padding-right: var(--bx-4); }
.nm-col-time.nm-colhead { padding-right: 12px; }
.nm-colhead:focus-visible { outline: 1px solid var(--bx-accent); outline-offset: -1px; }
.nm-sorted { color: var(--bx-fg-2); }
.nm-sort-arrow { padding-left: var(--bx-2); color: var(--bx-mark); }
/* The scale every bar in the list is drawn against, printed once. */
.nm-axis { justify-content: space-between; color: var(--bx-mark); }

.nm-load-divider {
  display: flex; align-items: center; gap: 8px; height: var(--nm-row-h); padding: 0 12px 0 20px;
  font-size: 9px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
  color: var(--nm-faint);
}
.nm-load-divider > span { flex: none; display: inline-flex; align-items: center; gap: 5px; }
.nm-load-divider::after {
  content: ""; flex: 1; height: 1px;
  background: var(--bx-line);
}
`;

const DETAIL = `
/* -- The detail pane ------------------------------------------------------
   A 2px left border in the request's status colour runs down the head, tying
   the pane back to the row it came from in a list that may have scrolled. */
.nm-detail {
  display: flex; flex-direction: column; flex: 1 1 auto;
  min-width: 0; min-height: 0; background: var(--bx-bar);
}
.nm-detail-head {
  flex: none; padding: var(--bx-4) 12px;
  border-left: var(--bx-rail) solid var(--bx-mark);
  border-bottom: 1px solid var(--bx-line);
}
.nm-detail[data-tone="ok"]   .nm-detail-head { border-left-color: var(--bx-ok); }
.nm-detail[data-tone="warn"] .nm-detail-head { border-left-color: var(--bx-warn); }
.nm-detail[data-tone="err"]  .nm-detail-head { border-left-color: var(--bx-err); }
.nm-detail[data-tone="info"] .nm-detail-head { border-left-color: var(--bx-info); }

.nm-detail-id {
  display: flex; align-items: baseline; gap: 9px;
  font-family: var(--bx-font-mono); font-variant-numeric: tabular-nums;
}
.nm-detail-status { flex: none; font-size: var(--bx-fs-lg); color: var(--bx-fg-3); }
.nm-detail[data-tone="ok"]   .nm-detail-status,
.nm-detail[data-tone="ok"]   .nm-detail-reason { color: var(--bx-ok); }
.nm-detail[data-tone="warn"] .nm-detail-status,
.nm-detail[data-tone="warn"] .nm-detail-reason { color: var(--bx-warn); }
.nm-detail[data-tone="err"]  .nm-detail-status,
.nm-detail[data-tone="err"]  .nm-detail-reason { color: var(--bx-err); }
.nm-detail[data-tone="info"] .nm-detail-status,
.nm-detail[data-tone="info"] .nm-detail-reason { color: var(--bx-info); }
.nm-detail-method { flex: none; font-size: var(--bx-fs-sm); letter-spacing: .06em; color: var(--bx-fg-2); }
.nm-detail-reason {
  flex: none; min-width: 0; font-size: var(--bx-fs-sm); color: var(--bx-fg-3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nm-detail-gap { flex: 1 1 auto; }
.nm-detail-meta { flex: none; font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }

.nm-detail-url {
  margin-top: var(--bx-3); font-family: var(--bx-font-mono);
  font-size: var(--bx-fs-md); color: var(--bx-fg); word-break: break-all;
}
.nm-detail-url-head { color: var(--bx-fg-3); }
.nm-detail-note { margin-top: var(--bx-2); font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }

.nm-detail-actions { margin-top: var(--bx-4); display: flex; align-items: center; gap: var(--bx-2); }
.nm-dbtn {
  display: flex; align-items: center; gap: 5px; flex: none; height: 22px; padding: 0 9px;
  background: transparent; border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-r-ctl); color: var(--bx-fg-2);
  font-size: var(--bx-fs-sm); cursor: pointer; white-space: nowrap;
  transition: background-color 90ms linear, border-color 90ms linear;
}
.nm-dbtn:hover { background: var(--bx-hover); }
.nm-dbtn:disabled { color: var(--bx-fg-3); cursor: not-allowed; }
/* The one outlined action in the pane: it re-runs a request against the live
   backend, which is not the same kind of thing as copying a URL. */
.nm-dbtn-primary { border-color: var(--bx-accent); color: var(--bx-accent); }
.nm-dbtn-on { background: var(--bx-sel); color: var(--bx-fg); }
.nm-dbtn-sq { width: 22px; padding: 0; justify-content: center; }
.nm-dbtn-gap { flex: 1 1 auto; }

.nm-tabrow {
  display: flex; align-items: stretch; flex: none; min-width: 0;
  height: var(--bx-h-tabs); border-bottom: 1px solid var(--bx-line);
}
.nm-tabs { display: flex; align-items: stretch; min-width: 0; }
/* The tab strip scrolls when a source brings more tabs than fit; the two
   paging arrows only exist while it actually overflows, and sit inside the
   strip rather than over the pane beside it. */
.nm-strip { position: relative; display: flex; min-width: 0; flex: 1 1 auto; }
/* The scroller is what clips: without it the tabs are laid out at their full
   width and paint straight over whatever shares the row. The fade tells you
   there is more in the direction it darkens. */
.nm-strip-scroll {
  --nm-fade-s: 0px; --nm-fade-e: 0px;
  min-width: 0; flex: 1 1 auto;
  overflow-x: auto; overflow-y: hidden;
  scrollbar-width: none; -ms-overflow-style: none;
  /* No scroll-behavior: smooth here on purpose - it would animate every wheel
     tick, which reads as lag. The arrows opt into smooth per call instead. */
  overscroll-behavior-x: contain;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--nm-fade-s),
    #000 calc(100% - var(--nm-fade-e)), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 var(--nm-fade-s),
    #000 calc(100% - var(--nm-fade-e)), transparent 100%);
}
.nm-strip-scroll::-webkit-scrollbar { height: 0; width: 0; }
.nm-strip-s .nm-strip-scroll { --nm-fade-s: 26px; }
.nm-strip-e .nm-strip-scroll { --nm-fade-e: 26px; }
.nm-strip-nav {
  position: absolute; top: 0; bottom: 0; z-index: 1; width: 18px;
  display: none; align-items: center; justify-content: center; padding: 0;
  background: var(--bx-bar); border: 0; color: var(--bx-fg-3); cursor: pointer;
}
.nm-strip-nav-s { left: 0; }
.nm-strip-nav-e { right: 0; transform: scaleX(-1); }
.nm-strip-s .nm-strip-nav-s, .nm-strip-e .nm-strip-nav-e { display: flex; }

.nm-tab {
  flex: none; padding: 0 var(--bx-4); background: transparent; border: 0;
  border-bottom: 2px solid transparent; color: var(--bx-fg-2);
  font-size: var(--bx-fs-code); cursor: pointer; white-space: nowrap;
  transition: color 90ms linear, border-color 90ms linear;
}
.nm-tab.active { border-bottom-color: var(--bx-accent); color: var(--bx-fg); }
.nm-tab-n { padding-left: var(--bx-2); color: var(--bx-fg-3); font-variant-numeric: tabular-nums; }

/* The format controls share the tab row. Two stacked bars squeezed the size
   readout into a 40px column that wrapped across three lines; this is the fix
   for that, and it stays. */
/* The tools keep their natural width and the tab strip gives way - it can
   scroll, they cannot, and two of them overlapping is worse than tabs that
   need a nudge. */
.nm-tabrow-tools {
  display: flex; align-items: center; gap: var(--bx-4); flex: none;
  padding: 0 var(--bx-4);
}
.nm-json-toolbar {
  display: flex; align-items: center; gap: var(--bx-4); flex: none; min-width: 0;
  padding: 0 var(--bx-4);
}
.nm-json-toolbar { flex: none; height: 26px; border-bottom: 1px solid var(--bx-line-soft); }
.nm-fmt { display: flex; align-items: center; flex: none; }
.nm-fmt-btn {
  flex: none;
  height: var(--bx-h-ctl-sm); padding: 0 8px; background: transparent; border: 0;
  color: var(--bx-fg-2); font-size: var(--bx-fs-meta); cursor: pointer;
  transition: background-color 90ms linear, color 90ms linear;
}
.nm-fmt-btn:first-child { border-radius: var(--bx-r-ctl) 0 0 var(--bx-r-ctl); }
.nm-fmt-btn:last-child { border-radius: 0 var(--bx-r-ctl) var(--bx-r-ctl) 0; }
.nm-fmt-btn.active { background: var(--bx-sel); color: var(--bx-fg); }
.nm-json-size {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3); font-variant-numeric: tabular-nums; white-space: nowrap;
}
/* How many values on screen are not the values that were sent. */
.nm-masked {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-warn); white-space: nowrap;
}
.nm-tool-gap { flex: 1 1 auto; min-width: 0; }
.nm-copy {
  display: flex; align-items: center; gap: 5px; flex: none;
  height: var(--bx-h-ctl-sm); padding: 0 8px; background: transparent;
  border: 1px solid var(--bx-line-strong); border-radius: var(--bx-r-ctl);
  color: var(--bx-fg-2); font-size: var(--bx-fs-meta); cursor: pointer; white-space: nowrap;
  transition: background-color 90ms linear;
}
.nm-copy:hover { background: var(--bx-hover); }
.nm-toggle.active { background: var(--bx-sel); color: var(--bx-fg); }

.nm-tab-body {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
  overflow: hidden;
}
.nm-detail-foot {
  display: flex; align-items: center; flex: none; height: 24px; padding: 0 12px;
  border-top: 1px solid var(--bx-line);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta); color: var(--bx-fg-3);
}
.nm-detail-foot > span:first-child { flex: 1 1 auto; }

/* The selection has left the current filter. Keep showing it - hiding it would
   make the reader's context vanish for a reason they did not cause - but say
   so, and offer to clear only the filter responsible. */
.nm-notice {
  display: flex; align-items: center; gap: var(--bx-3); flex: none;
  padding: var(--bx-3) 12px; background: var(--bx-hover);
  border-bottom: 1px solid var(--bx-line); font-size: var(--bx-fs-sm);
}
.nm-notice-txt { flex: 1 1 auto; color: var(--bx-fg-2); }
.nm-notice-btn {
  flex: none; height: var(--bx-h-ctl-sm); padding: 0 8px; background: transparent;
  border: 1px solid var(--bx-line-strong); border-radius: var(--bx-r-ctl);
  color: var(--bx-fg-2); font-size: var(--bx-fs-meta); cursor: pointer;
}

.nm-empty {
  flex: 1 1 auto; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: var(--bx-4); padding: var(--bx-6) var(--bx-5);
  text-align: center; color: var(--bx-fg-3);
}
.nm-empty-title { margin: 0; font-size: var(--bx-fs-lg); color: var(--bx-fg); }
.nm-empty-sub { margin: 0; font-size: var(--bx-fs-sm); line-height: 1.6; color: var(--bx-fg-3); max-width: 420px; }
.nm-empty-copy { display: flex; flex-direction: column; gap: var(--bx-2); }
.nm-empty-ico { display: flex; color: var(--bx-fg-3); }
.nm-empty-setups { display: flex; flex-direction: column; gap: var(--bx-2); width: 100%; max-width: 420px; }
.nm-empty-setup { display: flex; align-items: center; gap: var(--bx-2); }
.nm-empty-snippet {
  flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: var(--bx-3);
  padding: var(--bx-2) var(--bx-3); background: var(--bx-raise);
  border: 1px solid var(--bx-line); border-radius: var(--bx-r-ctl);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm); color: var(--bx-fg-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nm-empty-label { flex: none; font-size: var(--bx-fs-meta); color: var(--bx-fg-3); }
.nm-empty-btn {
  flex: none; height: var(--bx-h-ctl-sm); padding: 0 8px; background: transparent;
  border: 1px solid var(--bx-line-strong); border-radius: var(--bx-r-ctl);
  color: var(--bx-fg-2); font-size: var(--bx-fs-meta); cursor: pointer;
}
.nm-empty-list { background: var(--bx-bg); }
`;

const VIEWERS = `
.nm-json-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* The payload controls render into the tab row when the detail pane offers a
   slot for them (see PayloadTools in DataView) — tabs and format are both
   properties of the pane below, and two stacked 32px bars over a short docked
   payload was more chrome than content. This is the standalone fallback. */
.nm-json-toolbar { display: flex; align-items: center; gap: 6px; justify-content: flex-end; padding: 5px 10px; border-bottom: 1px solid var(--nm-line-2); flex-shrink: 0; }
.nm-tabrow-tools { display: flex; align-items: center; gap: 6px; flex: none; margin-left: auto; min-width: 0; }
/* Tertiary information: it yields its space to the controls rather than
   competing for it. The nowrap is the part that matters — as a wrapping flex
   item it once folded "116 B · 10 lines" onto three lines and made the whole
   toolbar twice as tall. */

/* Display-format switch. Leads the payload controls because it changes what
   the pane below it *is*, unlike Wrap and Copy which act on whatever is
   already there. */
.nm-fmt { display: flex; gap: 1px; padding: 2px; border-radius: 6px; border: 1px solid var(--nm-line); background: var(--nm-sunken); flex-shrink: 0; }
.nm-fmt-btn {
  height: 18px; padding: 0 7px; font-size: 10px; font-weight: 400; border: none; border-radius: 4px;
  background: transparent; color: var(--nm-faint); cursor: pointer; font-family: inherit;
  transition: background .14s ease, color .14s ease;
}
.nm-fmt-btn:hover:not(:disabled) { color: var(--nm-txt); }
.nm-fmt-btn.active { background: var(--nm-accent-soft); color: var(--nm-accent); font-weight: 600; }
/* Table stays visible while unavailable rather than disappearing — a control
   that comes and goes as you click between requests is harder to learn than
   one that is simply dim, and its tooltip explains why. */
.nm-fmt-btn:disabled { opacity: .35; cursor: not-allowed; }

/* ── Redux store slices ────────────────────────────────────────────────────
   Its own bar above the format toolbar. Sharing that row meant three
   different jobs — navigation, presentation and metadata — competing for one
   line, which clipped slice names mid-word and squeezed the size readout into
   a column narrow enough to wrap onto three lines. */
.nm-slicebar {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0; min-width: 0;
  padding: 5px 12px; border-bottom: 1px solid var(--nm-line-2);
  background: var(--nm-surface-2);
}
.nm-slicebar-label {
  flex-shrink: 0; font-size: 9.5px; font-weight: 800; letter-spacing: .5px;
  text-transform: uppercase; color: var(--nm-faint);
}
.nm-slicebar-hint {
  flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 1px 7px;
  border-radius: 999px; font-variant-numeric: tabular-nums;
  color: var(--nm-warning); background: var(--nm-warning-soft);
  border: 1px solid var(--nm-warning-line);
}

/* Scrolls rather than wrapping — a twenty-reducer store must not push the
   payload off the bottom of the pane. Scrolling, fades and arrows come from
   .nm-strip-scroll; this rule only lays the chips out. */
.nm-slices { display: flex; align-items: center; gap: 4px; padding: 2px 0; }
.nm-slice {
  flex-shrink: 0; font-size: 11px; font-weight: 600; font-family: var(--nm-mono);
  padding: 2px 9px; border-radius: 6px; border: 1px solid transparent;
  background: transparent; color: var(--nm-muted); cursor: pointer;
  white-space: nowrap;
  transition: color .14s ease, background .14s ease, border-color .14s ease;
}
/* Quiet by default. Twenty outlined pills read as twenty things demanding
   attention; the only chips that earn a border are the selected one and the
   ones this action actually wrote to. */
.nm-slice:hover { color: var(--nm-txt); background: var(--nm-elev); }
.nm-slice.active {
  color: var(--nm-c-redux); background: var(--nm-c-redux-soft);
  border-color: var(--nm-c-redux);
}
.nm-slice-root { color: var(--nm-faint); }
.nm-slice-root.active { color: var(--nm-c-redux); }
/* Changed by this action — a leading dot rather than a colour swap, so
   "changed" and "selected" stay independently readable. */
.nm-slice-hit { color: var(--nm-txt); }
.nm-slice-hit::before {
  content: ""; display: inline-block; width: 5px; height: 5px; margin-right: 6px;
  border-radius: 999px; background: var(--nm-warning); vertical-align: 1px;
}

/* Grid view of a tabular payload. */
.nm-tv { flex: 1; min-height: 0; overflow: auto; background: var(--nm-bg); }
.nm-tv-grid { display: grid; min-width: min-content; }
.nm-tv-head, .nm-tv-row { display: contents; }
.nm-tv-head > span {
  position: sticky; top: 0; z-index: 1;
  font-size: 9.5px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
  color: var(--nm-faint); background: var(--nm-surface-2);
  padding: 5px 10px; border-bottom: 1px solid var(--nm-line);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nm-td {
  padding: 3px 10px; font-family: var(--nm-mono); font-size: 11px;
  border-bottom: 1px solid var(--nm-line-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* Hovering a row highlights the whole row even though the cells are grid
   children with no row element of their own to hang :hover on. */
.nm-tv-row:hover > .nm-td { background: var(--nm-elev); }
.nm-tv-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px; }
.nm-tv-note { font-size: 10.5px; color: var(--nm-faint); }
.nm-copy {
  flex: none; height: 20px; padding: 0 7px; font-size: 10px; border-radius: 5px;
  border: 1px solid var(--nm-line); font-family: inherit;
  background: var(--nm-elev); color: var(--nm-muted); cursor: pointer; white-space: nowrap;
  transition: background .14s ease, color .14s ease, border-color .14s ease;
}
.nm-copy:hover { background: var(--nm-elev-hover); color: var(--nm-txt); }
.nm-toggle { color: var(--nm-muted); }
.nm-toggle.active { color: var(--nm-accent); border-color: var(--nm-accent); background: var(--nm-accent-soft); }
.nm-nowrap { white-space: pre !important; word-break: normal !important; }
.nm-json {
  margin: 0; flex: 1; overflow: auto; padding: 12px 14px; font-size: 12px; line-height: 1.6;
  font-family: var(--nm-mono); color: var(--nm-syn-txt); white-space: pre-wrap; word-break: break-word;
}
/* Foldable JSON. Same typography as the flat .nm-json above, but one row per
   line so each can carry a gutter. The padding moves from the container to the
   rows, so a row's hover highlight runs the full width of the pane. */
.nm-jfold {
  flex: 1; min-height: 0; overflow: auto; padding: 12px 0;
  font-size: 12px; line-height: 1.6; font-family: var(--nm-mono);
  color: var(--nm-syn-txt);
}
.nm-jrow { display: flex; align-items: flex-start; padding-right: 14px; }
.nm-jrow:hover { background: var(--nm-elev); }
.nm-jline { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; }
/* Wrapping off: rows size to their content so the pane scrolls sideways, and
   the 100% floor keeps the hover highlight spanning the full scrolled width
   instead of stopping at the shortest line. */
.nm-jfold.nm-nowrap .nm-jrow { width: max-content; min-width: 100%; }
.nm-jfold.nm-nowrap .nm-jline { flex: 0 0 auto; white-space: pre; word-break: normal; }
/* Fixed-width gutter, present on every row — a caret that only occupies space
   on foldable lines would shift the indentation of everything around it.

   The triangle is drawn by CSS rather than being text inside the button: a
   selection dragged across the pane picks up DOM text, so a caret glyph per
   row landed in the clipboard, and what you pasted was JSON with a triangle
   welded to the front of every foldable line. */
.nm-jcaret {
  flex-shrink: 0; width: 18px; padding: 0 0 0 4px; border: none; background: transparent;
  font-family: inherit; font-size: 9px; line-height: inherit; text-align: left;
  color: var(--nm-faint); cursor: pointer; transition: color .12s ease;
  user-select: none; -webkit-user-select: none;
}
.nm-jcaret::before { content: "\\25BE"; }
.nm-jcaret[aria-expanded="false"]::before { content: "\\25B8"; }
.nm-jcaret-empty { cursor: default; }
.nm-jcaret-empty::before { content: none; }
.nm-jrow:hover .nm-jcaret { color: var(--nm-muted); }
.nm-jcaret:hover { color: var(--nm-accent); }
.nm-jcaret:focus-visible, .nm-jsum:focus-visible {
  outline: 2px solid var(--nm-accent); outline-offset: -1px; border-radius: 3px;
}
/* The collapsed stand-in. Reads as content, not as a control, until hovered —
   it is standing in for the lines it replaced. */
.nm-jsum {
  border: none; background: var(--nm-elev); color: var(--nm-faint);
  font-family: inherit; font-size: 10.5px; line-height: 1.4;
  padding: 0 6px; margin: 0 2px; border-radius: 5px; cursor: pointer;
  transition: color .12s ease, background .12s ease;
}
.nm-jsum:hover { color: var(--nm-accent); background: var(--nm-accent-soft); }

.nm-key { color: var(--nm-syn-key); }
.nm-str { color: var(--nm-syn-str); }
.nm-num { color: var(--nm-syn-num); }
.nm-bool { color: var(--nm-syn-bool); }
.nm-null { color: var(--nm-syn-null); font-style: italic; }

.nm-tree { flex: 1; min-height: 0; overflow: auto; padding: 6px 0 14px; font-family: var(--nm-mono); font-size: 11.5px; line-height: 1.55; }
.nm-tree-row { display: flex; align-items: flex-start; gap: 4px; padding: 1px 8px 1px 0; white-space: pre-wrap; word-break: break-word; }
.nm-tree-open { cursor: pointer; }
.nm-tree-open:hover { background: var(--nm-elev); }
.nm-tree-caret { display: inline-flex; width: 12px; flex-shrink: 0; color: var(--nm-faint); transition: transform .12s ease; margin-top: 2px; }
.nm-tree-caret.open { transform: rotate(90deg); }
.nm-tree-caret-empty { visibility: hidden; }
.nm-tree-key { color: var(--nm-syn-key); flex-shrink: 0; }
.nm-tree-colon { color: var(--nm-faint); margin-right: 3px; }
.nm-tree-summary { color: var(--nm-faint); font-style: italic; }
.nm-tree-string, .nm-tree-str { color: var(--nm-syn-str); }
.nm-tree-number { color: var(--nm-syn-num); }
.nm-tree-boolean { color: var(--nm-syn-bool); }
.nm-tree-null, .nm-tree-undefined { color: var(--nm-syn-null); font-style: italic; }
.nm-tree-blob { color: var(--nm-syn-blob); display: inline-flex; align-items: center; gap: 6px; }
.nm-tree-trunc { color: var(--nm-warning); font-style: italic; }
.nm-tree-chip {
  font-size: 9.5px; font-weight: 700; padding: 0 6px; border-radius: 5px; margin-left: 6px;
  border: 1px solid var(--nm-line-strong); background: var(--nm-elev); color: var(--nm-muted);
  cursor: pointer; font-family: inherit; transition: background .12s ease, color .12s ease;
}
.nm-tree-chip:hover { color: var(--nm-txt); background: var(--nm-elev-hover); }
/* A real button, not a styled div: it is a control the tree's arrow keys land
   on, and Enter has to activate it there. */
.nm-tree-more {
  display: block; width: 100%; text-align: left; border: none; background: none;
  font-family: inherit; font-size: 11px; color: var(--nm-accent);
  cursor: pointer; padding: 2px 0;
}
.nm-tree-more:hover { text-decoration: underline; }
/* Inset, because the tree clips its overflow — an outline drawn outside the
   row would be cut off at the left edge, which is exactly where the caret is. */
.nm-tree-row:focus-visible, .nm-tree-more:focus-visible {
  outline: 2px solid var(--nm-accent); outline-offset: -2px; border-radius: 4px;
}
.nm-tree-cap { padding: 10px 14px; color: var(--nm-warning); font-size: 11px; }
.nm-mark { background: var(--nm-mark); color: inherit; border-radius: 2px; }
`;

const MENU = `
/* -- Menus, popovers ------------------------------------------------------
   Elevation is a background step plus a hairline. No shadow: a menu sits on a
   ground the panel controls, so it does not need to prove it is floating. */
.nm-menu {
  position: fixed; z-index: 30; min-width: 0;
  background: var(--bx-float); border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-r-pop); padding: 5px 0;
  max-height: 70vh; overflow-y: auto;
}
.nm-menu-head {
  display: flex; align-items: center; height: 30px; padding: 0 12px;
  border-bottom: 1px solid var(--bx-line); font-size: var(--bx-fs-md); color: var(--bx-fg);
}
.nm-menu-head > span:first-child { flex: 1 1 auto; }
.nm-menu-count {
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3); font-variant-numeric: tabular-nums;
}
.nm-menu-group {
  padding: 9px 12px 4px; font-size: var(--bx-fs-micro); letter-spacing: .1em;
  color: var(--bx-fg-3); display: flex; align-items: center;
}
.nm-menu-group > span:first-child { flex: 1 1 auto; }
/* A group label can carry a control on its right — the launcher's corner
   lives beside the LAUNCHER heading rather than in a row of its own, because
   it is one setting with three values, not three commands. */
.nm-menu-group .nm-menu-scope { margin: -2px 0; }
.nm-menu-item {
  display: flex; align-items: center; width: 100%; height: 26px; padding: 0 12px;
  background: transparent; border: 0; text-align: left; cursor: pointer;
  transition: background-color 90ms linear;
}
.nm-menu-item:hover, .nm-menu-item.active { background: var(--bx-hover-float); }
.nm-menu-item:disabled { cursor: not-allowed; }
.nm-menu-label { flex: 1 1 auto; min-width: 0; font-size: var(--bx-fs-md); color: var(--bx-fg); }
.nm-menu-item:disabled .nm-menu-label { color: var(--bx-fg-3); }
/* A row that carries a state prints it where the icon used to be. A disabled
   row prints its *reason* there instead of being red and dead. */
.nm-menu-state {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  letter-spacing: .04em; color: var(--bx-fg-3);
}
.nm-menu-state[data-on] { color: var(--bx-warn); }
.nm-menu-state[data-value] { color: var(--bx-fg-2); }
.nm-menu-arrow { width: 12px; flex: none; text-align: right; color: var(--bx-mark); }
.nm-menu-sep { height: 1px; margin: 5px 0; background: var(--bx-line); }
.nm-menu-foot {
  display: flex; align-items: center; height: 26px; padding: 0 12px;
  border-top: 1px solid var(--bx-line); font-size: var(--bx-fs-meta); color: var(--bx-fg-3);
}
.nm-menu-foot > span:first-child { flex: 1 1 auto; }

/* -- Export ---------------------------------------------------------------
   Two lines per item: what it is, and who is on the other end. The
   descriptions were already right; they only needed room. */
.nm-menu-scope { display: flex; align-items: center; flex: none; }
.nm-scope-btn {
  height: var(--bx-h-ctl-sm); padding: 0 9px; background: transparent; border: 0;
  color: var(--bx-fg-2); font-size: var(--bx-fs-meta); cursor: pointer;
  transition: background-color 90ms linear, color 90ms linear;
}
.nm-scope-btn:first-child { border-radius: var(--bx-r-ctl) 0 0 var(--bx-r-ctl); }
.nm-scope-btn:last-child { border-radius: 0 var(--bx-r-ctl) var(--bx-r-ctl) 0; }
.nm-scope-btn.active { background: var(--bx-hover-float); color: var(--bx-fg); }
.nm-scope-btn b {
  font-family: var(--bx-font-mono); font-weight: 400; color: var(--bx-fg-3);
  font-variant-numeric: tabular-nums;
}
.nm-scope-btn.active b { color: var(--bx-fg-2); }

.nm-export-item {
  display: block; width: 100%; padding: 6px 12px 7px; background: transparent;
  border: 0; border-left: var(--bx-rail) solid transparent;
  text-align: left; cursor: pointer;
  transition: background-color 90ms linear;
}
.nm-export-item:hover { background: var(--bx-hover-float); }
/* The masking note is a guarantee, not a footnote. */
.nm-export-item.nm-export-warn { border-left-color: var(--bx-warn); }
.nm-export-top { display: flex; align-items: baseline; gap: 8px; }
.nm-export-name { flex: 1 1 auto; min-width: 0; font-size: var(--bx-fs-md); color: var(--bx-fg); }
.nm-export-ext {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3);
}
.nm-export-ext[data-copy] { color: var(--bx-accent); }
.nm-export-note {
  margin-top: 2px; font-size: var(--bx-fs-sm); line-height: 1.5; color: var(--bx-fg-3);
}
.nm-export-item:disabled { cursor: not-allowed; }
.nm-export-item:disabled .nm-export-name { color: var(--bx-fg-3); }

/* -- Appearance -----------------------------------------------------------
   Four bands, not two: a two-tone chip cannot tell you whether a theme's text
   has contrast against its own ground, which is the only thing you actually
   need to know before trying one on. */
.nm-theme-item {
  display: flex; align-items: center; gap: 11px; width: 100%; height: 28px;
  padding: 0 12px; background: transparent; border: 0; text-align: left;
  cursor: pointer; transition: background-color 90ms linear;
}
.nm-theme-item:hover, .nm-theme-item.active { background: var(--bx-hover-float); }
.nm-theme-sys { height: auto; padding: 8px 12px; border-bottom: 1px solid var(--bx-line); }
.nm-swatch {
  display: flex; width: 36px; height: 14px; flex: none; overflow: hidden;
  border: 1px solid var(--bx-line-strong); border-radius: 2px;
}
.nm-theme-sys .nm-swatch { height: 18px; }
.nm-swatch > span { display: block; height: 100%; }
.nm-theme-name { flex: 1 1 auto; min-width: 0; font-size: var(--bx-fs-md); color: var(--bx-fg); }
.nm-theme-sub { display: block; font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }
.nm-theme-note { flex: none; font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }
.nm-theme-check { flex: none; display: flex; color: var(--bx-accent); }
`;

const MISC = `
.nm-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; height: 100%; padding: 30px 18px; text-align: center; color: var(--nm-faint);
}
.nm-empty-list { height: auto; padding-top: 48px; }
.nm-tbody > .nm-empty-list { min-height: 100%; }
.nm-empty-ico {
  display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px;
  border-radius: 12px; border: 1px solid var(--nm-accent-fg);
  background: var(--nm-accent-bg); color: var(--nm-accent-fg);
}
/* An empty section is where a developer finds out that capture has to be
   installed where the adapter is *constructed* — so the setup call sits in the
   empty state itself, one click from the clipboard, rather than in a README. */
.nm-empty-snippet {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 7px;
  background: var(--nm-sunken); border: 1px solid var(--nm-line);
  font-family: var(--nm-mono); font-size: 10.5px; color: var(--nm-muted);
  max-width: 100%; overflow: auto; white-space: nowrap;
}
.nm-empty-fn { color: var(--nm-syn-bool); }
.nm-empty-arg { color: var(--nm-syn-str); }
.nm-empty-punct { color: var(--nm-syn-null); }
.nm-empty-btn {
  display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 6px;
  border: 1px solid var(--nm-accent-line); background: var(--nm-accent-soft); color: var(--nm-accent);
  font-family: inherit; font-size: 10.5px; font-weight: 600; cursor: pointer;
  transition: filter .14s ease;
}
.nm-empty-btn:hover { filter: brightness(1.3); }
/* One row per setup call — a snippet and its own copy button — so a section
   offering two (axios and fetch) never makes you guess which one a button
   copies. */
.nm-empty-setups { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 100%; }
.nm-empty-setup { display: flex; align-items: center; gap: 8px; max-width: 100%; }
.nm-empty-setup .nm-empty-snippet { min-width: 0; }
.nm-empty-setup .nm-empty-btn { flex: none; }
.nm-empty-label {
  flex: none; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 9px; font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase; color: var(--nm-faint);
}
/* Tinted per-section via data-accent, so even an empty list reads as "the
   right kind of empty" rather than a generic placeholder. */
.nm-empty-copy { display: flex; flex-direction: column; gap: 5px; }
.nm-empty-title { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--nm-txt); }
.nm-empty-sub { margin: 0; font-size: 11px; line-height: 1.6; color: var(--nm-faint); max-width: 330px; }

/* The only thing that animates: something is still in flight. Opacity only,
   so nothing moves, and it stops for anyone who has asked motion to stop. */
.nm-pulse { animation: nm-pulse 1.6s ease-in-out infinite; }
@keyframes nm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }

.nm-scroll, .nm-tbody, .nm-headers, .nm-tree, .nm-json, .nm-jfold, .nm-frames, .nm-timing, .nm-sheet {
  overscroll-behavior: contain;
}
/* Firefox has no ::-webkit-scrollbar; these two properties are all it offers,
   and without them its scrollbars ignore the theme entirely. */
.nm-scroll { scrollbar-width: thin; scrollbar-color: var(--nm-scroll-thumb) transparent; }
.nm-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.nm-scroll::-webkit-scrollbar-thumb { background: var(--nm-scroll-thumb); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
.nm-scroll::-webkit-scrollbar-thumb:hover { background: var(--nm-scroll-thumb-hover); background-clip: content-box; }
.nm-scroll::-webkit-scrollbar-track { background: transparent; }

.nm-fab:focus-visible, .nm-pill:focus-visible, .nm-capture:focus-visible,
.nm-fchip:focus-visible, .nm-tab:focus-visible, .nm-copy:focus-visible,
.nm-dbtn:focus-visible, .nm-dockbtn:focus-visible, .nm-menu-item:focus-visible,
.nm-rail-item:focus-visible, .nm-rail-cmd:focus-visible, .nm-rail-collapse:focus-visible,
.nm-linked-chip:focus-visible, .nm-statusbar-btn:focus-visible,
.nm-fmt-btn:focus-visible, .nm-empty-btn:focus-visible {
  outline: 2px solid var(--nm-accent); outline-offset: 2px;
}
/* Inset: the filter field clips, and an outline drawn outside the field would
   be cut at its rounded corners. */
.nm-palette-item:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }
.nm-trow:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }
/* Inset, unlike the rest: the slice strip clips its overflow, so an outline
   drawn outside a chip would be sliced off at the strip's edges. */
.nm-slice:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }

@media (prefers-reduced-motion: reduce) {
  .nm-panel, .nm-panel.nm-anim, .nm-fab, .nm-fab-dot, .nm-zone,
  .nm-pulse, .nm-menu, .nm-restoring,
  .nm-palette, .nm-rail {
    animation: none !important; transition: none !important;
  }
}
`;

/* ── Status bar, command palette, density ─────────────────────────────── */
const LAYOUT = `
/* Status bar — Chrome puts the totals at the bottom, and so do we. The
   per-source totals moved to the rail, so what is left here is the session
   as a whole plus the two things you act on: the commands, and the log
   sitting on disk. */
.nm-statusbar {
  height: 26px; flex: none; display: flex; align-items: center; gap: 12px;
  min-width: 0; overflow: hidden; padding: 0 10px 0 12px;
  border-top: 1px solid var(--nm-line);
  background: var(--nm-surface-2); font-size: 10.5px; color: var(--nm-faint);
  font-variant-numeric: tabular-nums;
}
.nm-statusbar > span { white-space: nowrap; }
.nm-statusbar b { font-weight: 600; color: var(--nm-muted); }
.nm-statusbar-mono { font-family: var(--nm-mono); }
.nm-statusbar-sep { width: 1px; height: 12px; flex: none; background: var(--nm-line); }
.nm-statusbar-spacer { flex: 1; }
.nm-statusbar-err { display: inline-flex; align-items: center; gap: 5px; color: var(--nm-faint); }
.nm-statusbar-err::before { content: ""; width: 5px; height: 5px; border-radius: 999px; background: var(--nm-error); }
.nm-statusbar-err b { color: var(--nm-error); font-weight: 700; }
.nm-statusbar-btn {
  display: inline-flex; align-items: center; gap: 5px; height: 18px; padding: 0 6px;
  border: none; background: none; color: var(--nm-faint); cursor: pointer;
  font-family: inherit; font-size: 10px; border-radius: 4px;
  transition: background .12s ease, color .12s ease;
}
.nm-statusbar-btn:hover { color: var(--nm-muted); }
.nm-statusbar-pin { color: var(--nm-warning); }
.nm-statusbar-persisted { font-family: var(--nm-mono); border: 1px solid transparent; }
/* Armed for a destructive second click — the only thing in the status bar
   allowed to shout. */
.nm-statusbar-armed { color: var(--nm-error); background: var(--nm-error-soft); border-color: var(--nm-error-line); }
/* Which database this panel is on. Quiet by default — it is a fact, not a
   warning — and amber only when it is the shared default. */
.nm-statusbar-db {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--nm-mono); max-width: 240px;
}
.nm-statusbar-db-name { overflow: hidden; text-overflow: ellipsis; }
.nm-statusbar-db-shared { color: var(--nm-warning); }
.nm-statusbar-db-shared:hover { color: var(--nm-warning); filter: brightness(1.2); }
.nm-statusbar-db-tag {
  flex: none; font-size: 9px; font-weight: 700; letter-spacing: .3px;
  text-transform: uppercase; padding: 1px 4px; border-radius: 4px;
  background: var(--nm-warning-soft); border: 1px solid var(--nm-warning-line);
}
.nm-statusbar-armed:hover { color: var(--nm-error); filter: brightness(1.3); }
/* Authorization masking is off. Red rather than the database chip's amber:
   that one means "you may be reading another app's log", this one means "a
   screenshot of this panel can contain live credentials". */
.nm-statusbar-unmasked { flex: none; color: var(--nm-error); font-weight: 600; }
.nm-statusbar-unmasked:hover { color: var(--nm-error); filter: brightness(1.2); }
.nm-statusbar-unmasked-tag {
  font-size: 9px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase;
  padding: 1px 4px; border-radius: 4px;
  background: var(--nm-error-soft); border: 1px solid var(--nm-error-line);
}

/* ── Command palette ───────────────────────────────────────────────────────
   Everything the panel can do, in one list, reachable from three places that
   all say the same shortcut. It is also where the controls that the header
   and the row can no longer afford now live — sorting, density, the per-entry
   copy formats — so narrowing the chrome costs reach rather than capability. */
.nm-palette {
  position: absolute; top: 74px; left: 50%; transform: translateX(-50%);
  width: min(540px, calc(100% - 48px)); max-height: calc(100% - 140px); z-index: 50;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--nm-surface-3); border: 1px solid var(--nm-line-strong);
  border-radius: 12px; box-shadow: var(--nm-shadow-sheet);
  animation: nm-in .16s var(--nm-ease);
}
.nm-palette-head { display: flex; align-items: center; gap: 9px; padding: 11px 13px; border-bottom: 1px solid var(--nm-line); flex: none; }
.nm-palette-ico { display: inline-flex; color: var(--nm-accent); flex: none; }
.nm-palette-input {
  flex: 1; min-width: 0; border: none; outline: none; background: none;
  font-family: inherit; font-size: 12.5px; color: var(--nm-txt);
}
.nm-palette-input::placeholder { color: var(--nm-faint); }
.nm-palette-list { flex: 1; min-height: 0; overflow: auto; padding: 6px 0 8px; }
.nm-palette-group { padding: 9px 14px 4px; font-size: 9px; font-weight: 700; letter-spacing: .14em; color: var(--nm-faint); }
.nm-palette-item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  padding: 7px 14px; border: none; border-left: 2px solid transparent; background: none;
  font-family: inherit; cursor: pointer;
  transition: background .1s ease, border-color .1s ease;
}
.nm-palette-item:disabled { opacity: .4; cursor: not-allowed; }
.nm-palette-item.active:not(:disabled) { background: var(--nm-accent-soft); border-left-color: var(--nm-accent); }
.nm-palette-dot { flex: none; width: 6px; height: 6px; border-radius: 2px; background: var(--nm-accent-fg); }
.nm-palette-label { flex: 1; min-width: 0; font-size: 12px; color: var(--nm-txt); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-palette-note { flex: none; font-size: 10.5px; color: var(--nm-faint); }
.nm-palette-key {
  flex: none; font-family: var(--nm-mono); font-size: 10px; padding: 2px 6px; border-radius: 4px;
  background: var(--nm-sunken); border: 1px solid var(--nm-line); color: var(--nm-muted);
}
.nm-palette-empty { padding: 22px 14px; text-align: center; font-size: 11.5px; color: var(--nm-faint); }
.nm-scrim-full { position: absolute; inset: 0; z-index: 40; background: var(--nm-scrim); }

/* Density — one variable drives both the CSS and the virtualizer arithmetic. */
.nm-density-compact { font-size: 11px; }
.nm-density-comfy .nm-trow { font-size: 12px; }

/* Realtime frames. */
.nm-frames { flex: 1 1 55%; min-height: 0; overflow: auto; background: var(--nm-bg); }
.nm-frame {
  display: grid; grid-template-columns: 62px 74px minmax(0, 1fr) 66px;
  gap: 8px; align-items: center; padding: 4px 12px;
  border-bottom: 1px solid var(--nm-line-2); font-size: 11px; cursor: pointer;
}
.nm-frame:hover { background: var(--nm-elev); }
.nm-frame.active { background: var(--nm-c-realtime-soft); }
.nm-frame-dir { font-size: 9.5px; font-weight: 800; letter-spacing: .3px; text-transform: uppercase; }
.nm-frame-in { color: var(--nm-success); }
.nm-frame-out { color: var(--nm-c-network); }
.nm-frame-system { color: var(--nm-faint); }
.nm-frame-time { color: var(--nm-faint); font-variant-numeric: tabular-nums; font-size: 10px; }
.nm-frame-event { font-family: var(--nm-mono); color: var(--nm-txt); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-frame-size { color: var(--nm-faint); text-align: right; font-variant-numeric: tabular-nums; font-size: 10px; }
.nm-frame-body { flex: 1 1 45%; min-height: 0; border-top: 1px solid var(--nm-line); display: flex; flex-direction: column; overflow: hidden; }

/* Timing breakdown. The three phases borrow existing identity colours rather
   than inventing a fourth palette: network time takes the Network section's
   colour, and the two crypto phases take the two colours furthest from it. */
.nm-timing-encrypt { --nm-phase: var(--nm-c-redux); }
.nm-timing-network { --nm-phase: var(--nm-c-network); }
.nm-timing-decrypt { --nm-phase: var(--nm-warning); }
.nm-timing-seg, .nm-timing-swatch { background: var(--nm-phase); }
.nm-timing { flex: 1; min-height: 0; overflow: auto; padding: 16px 16px 20px; }
.nm-timing-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.nm-timing-title { font-size: 9px; font-weight: 700; letter-spacing: .14em; color: var(--nm-faint); }
.nm-timing-total { font-family: var(--nm-mono); font-size: 11px; color: var(--nm-faint); font-variant-numeric: tabular-nums; }
.nm-timing-total b { color: var(--nm-txt); font-weight: 600; }
.nm-timing-bar {
  display: flex; height: 26px; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--nm-line); background: var(--nm-sunken);
}
/* The label goes *inside* its own segment. A legend below can say how long
   each phase took, but only an in-bar number ties the width you are looking
   at to the duration it represents. */
.nm-timing-seg {
  height: 100%; display: flex; align-items: center; justify-content: center;
  font-family: var(--nm-mono); font-size: 9.5px; font-weight: 700;
  color: var(--nm-bg); overflow: hidden; white-space: nowrap;
  transition: width .2s ease;
}
.nm-timing-legend { display: flex; flex-direction: column; gap: 1px; margin-top: 14px; }
.nm-timing-row {
  display: grid; grid-template-columns: 14px minmax(90px, 130px) 1fr 70px 46px;
  gap: 10px; align-items: center; padding: 6px 4px; font-size: 11.5px;
  border-bottom: 1px solid var(--nm-line-2);
}
.nm-timing-swatch { width: 8px; height: 8px; border-radius: 2px; }
.nm-timing-label { color: var(--nm-txt); }
.nm-timing-note { color: var(--nm-faint); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-timing-value { text-align: right; font-family: var(--nm-mono); font-size: 11px; color: var(--nm-muted); font-variant-numeric: tabular-nums; }
.nm-timing-pct { text-align: right; font-family: var(--nm-mono); font-size: 11px; color: var(--nm-faint); font-variant-numeric: tabular-nums; }

/* "Is 712 ms slow?" is unanswerable on its own and obvious next to the
   session's median and its worst offender — which the panel already knows.
   Three bars against one scale, so the comparison is spatial rather than
   arithmetic. */
.nm-timing-ctx {
  margin-top: 18px; padding: 12px 14px; border-radius: 8px;
  background: var(--nm-surface-2); border: 1px solid var(--nm-line);
}
.nm-timing-ctx-head { font-size: 9px; font-weight: 700; letter-spacing: .14em; color: var(--nm-faint); margin-bottom: 10px; }
.nm-timing-ctx-row { display: grid; grid-template-columns: minmax(80px, 118px) 1fr 62px; gap: 10px; align-items: center; padding: 4px 0; }
.nm-timing-ctx-k { font-size: 10.5px; color: var(--nm-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-timing-ctx-track { height: 5px; border-radius: 3px; background: var(--nm-wf-track); display: flex; }
.nm-timing-ctx-fill { height: 5px; border-radius: 3px; background: var(--nm-phase); }
.nm-timing-ctx-v { text-align: right; font-family: var(--nm-mono); font-size: 10.5px; color: var(--nm-muted); font-variant-numeric: tabular-nums; }
.nm-timing-this { --nm-phase: var(--nm-accent); }
.nm-timing-this .nm-timing-ctx-v, .nm-timing-this .nm-timing-ctx-k { color: var(--nm-txt); }
/* Deliberately colourless — the median is the baseline, not a result.
   Faint rather than a hairline token: at 5px tall a border colour is
   indistinguishable from the empty track behind it. */
.nm-timing-median { --nm-phase: var(--nm-faint); }
.nm-timing-worst { --nm-phase: var(--nm-warning); }
.nm-timing-worst .nm-timing-ctx-v { color: var(--nm-warning); }

/* Shortcut cheatsheet. */
.nm-sheet-scrim { position: fixed; inset: 0; z-index: 2147483646; background: var(--nm-scrim); animation: nm-fade .14s ease-out; }
.nm-sheet {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
  z-index: 2147483647; width: min(520px, calc(100vw - 32px)); max-height: 80vh; overflow: auto;
  padding: 18px 20px; border-radius: 14px; border: 1px solid var(--nm-line-strong);
  background: var(--nm-surface-3); color: var(--nm-txt);
  box-shadow: var(--nm-shadow-sheet);
  animation: nm-in .16s var(--nm-ease);
}
.nm-sheet h3 { margin: 0 0 12px; font-size: 13px; font-weight: 700; }
.nm-sheet-grid { display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; align-items: center; }
.nm-sheet-group { grid-column: 1 / -1; font-size: 10px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--nm-faint); margin-top: 10px; }
.nm-sheet-group:first-of-type { margin-top: 0; }
/* The sheet's keys are the subject of the page rather than a hint in the
   corner of a control, so they get the mono face and a little more weight
   than the shared .nm-kbd. */
.nm-sheet .nm-kbd {
  display: inline-block; min-width: 20px; text-align: center; font-family: var(--nm-mono);
  font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 5px;
  border: 1px solid var(--nm-line-strong); color: var(--nm-txt);
  box-shadow: 0 1px 0 var(--nm-line-strong);
}
.nm-sheet-desc { font-size: 11.5px; color: var(--nm-muted); }
.nm-sheet-wide { grid-column: 1 / -1; line-height: 1.5; }
/* Icons default to display:block so they never pick up line-box descenders;
   inside a sentence they need the opposite. */
.nm-inline-ico { display: inline-flex; vertical-align: -1px; color: var(--nm-txt); }
.nm-sheet-close { position: absolute; top: 12px; right: 12px; }

/* Databases on this origin. Shares the sheet's shell; the rows are their own
   thing — a name that can be long, a subdued second line, and one destructive
   action pinned to the right. */
/* A purge that did not happen. Inside the panel, above the status bar the
   developer just clicked, rather than a corner of the viewport. */
.nm-purge-note {
  position: absolute; left: 12px; right: 12px; bottom: 34px; z-index: 6;
  padding: 8px 11px; border-radius: 9px; font-size: 11.5px; line-height: 1.45;
  color: var(--nm-error); background: var(--nm-error-soft);
  border: 1px solid var(--nm-error-line); box-shadow: var(--nm-shadow-menu);
  animation: nm-in .16s var(--nm-ease);
}

`;

const RESPONSIVE = `
/* ── Responsive ────────────────────────────────────────────────────────────
   All breakpoints are container queries against the PANEL, not the viewport:
   a right-docked panel is ~500px wide on a 4K monitor, and a maximized one is
   ~2000px wide on the same screen. Viewport media queries would get both wrong.

   Structural changes (stacking the split, moving actions into an overflow
   menu) are driven from JS where the DOM itself has to change; everything that
   is purely presentational lives here. */

/* Roomy — everything visible. */

@container nm (max-width: 900px) {
  .nm-filter { max-width: none; }
  .nm-detail-summary { flex-shrink: 9999; }
}

@container nm (max-width: 760px) {
  /* Filter chips collapse to a coloured dot plus its count; the label is
     redundant once you know the colours, and the counts are the useful part. */
  .nm-fchip-label { display: none; }
  .nm-fchip { padding: 0 5px; gap: 4px; }
  .nm-detail-head { padding: 8px 10px 7px 10px; }
  .nm-tab { padding: 0 6px; font-size: 11px; }
}

@container nm (max-width: 640px) {
  .nm-header { gap: 7px; padding: 0 6px 0 8px; }
  /* Key/value rows stack rather than squeezing the value into a sliver. */
  .nm-kv-row { grid-template-columns: 1fr; gap: 1px; padding: 5px 0; }
  .nm-kv-k { font-size: 10.5px; }
  /* Frame rows drop the size column. */
  .nm-frame { grid-template-columns: 58px 1fr; gap: 6px; row-gap: 0; }
  .nm-frame-time, .nm-frame-size { display: none; }
  /* The timing legend loses its explanatory note column. */
  .nm-timing-row { grid-template-columns: 12px 1fr auto; }
  .nm-timing-note { display: none; }
  .nm-slicebar-label { display: none; }
}

@container nm (max-width: 520px) {
  .nm-brand { display: none; }
  .nm-statusbar { gap: 8px; font-size: 10px; }
  .nm-detail-url { font-size: 10.5px; }
  .nm-htable { padding: 4px 10px 0; }
  .nm-tree { font-size: 11px; }
  /* The first two tracks to go in a narrow dock. The timing bar is a
     comparison the duration beside it already carries, and the link ticks are
     a shortcut to something the detail pane's linked strip still shows.

     Collapsed to zero width rather than display:none, so the row keeps the
     same nine children and nothing downstream has to know they are gone. */
}

/* Very short panels: give the list and detail a usable minimum each and let the
   chrome shrink rather than eating the whole panel. */
/* The route is the column that tells two rows apart, and it is the only one
   that flexes - so it must not be the one that starves. Below this the
   timing bar goes first: it is a comparison the duration beside it already
   carries, and the link ticks are a shortcut to something the detail pane
   still shows. Collapsed to zero width rather than display:none, so the row
   keeps its nine children and nothing downstream has to know. */
@container nmlist (max-width: 560px) {
  .nm-col-timing, .nm-cols .nm-axis { width: 0; overflow: hidden; }
  .nm-col-links { width: 0; overflow: hidden; }
}

/* Then SIZE. The eight tracks cost 264px even with the bar gone, so a list
   much under 420px has nothing left for the route - and a row you cannot
   read the name of is not a row. Size is the cheapest of what is left: the
   detail pane states it, and nobody scans a list for bytes. */
@container nmlist (max-width: 420px) {
  .nm-col-size { width: 0; overflow: hidden; }
}

/* Last, METHOD. What survives is route, status and duration - which is the
   irreducible answer to what ran, whether it worked, and how long it took.
   The verb is one click away in the pane, and the rail already carries the
   outcome as colour. */
@container nmlist (max-width: 340px) {
  .nm-col-method { width: 0; overflow: hidden; padding-left: 0; }
  .nm-col-pin { width: 0; overflow: hidden; }
}

@container nm (max-height: 340px) {
  .nm-statusbar { display: none; }
  .nm-linked { display: none; }
  .nm-rail-stats { display: none; }
}

/* Stacked layout — the list sits above the detail. Applied by JS whenever the
   panel is too narrow for a side-by-side split to give both panes their
   minimum, regardless of dock mode. */
.nm-body-panes.nm-body-v > .nm-list { width: auto !important; max-width: none; }
.nm-body-panes.nm-body-v > .nm-detail { min-height: 0; }

/* Status bar items hide in priority order as space runs out. */
/* Two classes, not one: the segment rules live in the SURFACES block, which
   joins after this one, and a bare class there would win the tie and put every
   segment back.

   Each of these is a whole segment, so its separator goes with it. Dropping
   the content and leaving the slash is what turned this bar into a row of
   orphan punctuation. */
@container nm (max-width: 820px) { .nm-statusbar .nm-status-transferred { display: none; } }
@container nm (max-width: 700px) { .nm-statusbar .nm-status-slowest { display: none; } }
@container nm (max-width: 640px) { .nm-statusbar .nm-status-commands { display: none; } }
@container nm (max-width: 600px) { .nm-statusbar .nm-status-failing { display: none; } }
@container nm (max-width: 480px) { .nm-statusbar .nm-status-persisted { display: none; } }
@container nm (max-width: 400px) { .nm-statusbar .nm-status-pinned { display: none; } }
/* The name truncates long before this; below it the whole chip goes, because
   the button has no icon of its own and an empty one says nothing. */
@container nm (max-width: 440px) { .nm-statusbar .nm-status-db { display: none; } }

/* The floating panel must never exceed the viewport on a small screen. */
.nm-panel.nm-dock-float { max-width: 100vw; max-height: 100vh; }
`;


/* ── Status bar, palette, shortcuts ───────────────────────────────────────
 *
 * These three restate surfaces the blocks above still describe in the old
 * `--nm-*` vocabulary. They are last in the join on purpose: every rule here
 * ties on specificity with the one it supersedes, so source order is what
 * decides. The superseded rules go when `--nm-*` itself does — deleting them
 * now would mean touching four files that have nothing else wrong with them.
 */
const SURFACES = `
/* -- Status bar -----------------------------------------------------------
   Everything mono, everything tabular, separators as a slash. The failing
   count is a link that applies the filter, because a count you cannot act on
   is a count you learn to ignore. */
.nm-statusbar {
  display: flex; align-items: center; flex: none; min-width: 0; overflow: hidden;
  height: var(--bx-h-status); padding: 0 var(--bx-4);
  background: var(--bx-bar); border-top: 1px solid var(--bx-line);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3); font-variant-numeric: tabular-nums;
}
.nm-statusbar-group { display: flex; align-items: center; min-width: 0; }
/* The left group states the session and keeps its width; the right group
   says where it is being kept, and is the one that shrinks. */
.nm-statusbar-group:first-child { flex: 0 1 auto; }
.nm-statusbar-right { flex: 0 1 auto; }
.nm-statusbar-seg { display: flex; align-items: center; white-space: nowrap; min-width: 0; }
.nm-statusbar-seg-body { display: flex; align-items: center; gap: 5px; min-width: 0; }
.nm-statusbar-seg:has(.nm-statusbar-db) { min-width: 0; flex: 0 1 auto; }
.nm-statusbar b { font-weight: 400; color: var(--bx-fg-2); }
.nm-statusbar-sep { padding: 0 7px; color: var(--bx-mark); background: none; width: auto; height: auto; }
.nm-statusbar-spacer { flex: 1 1 auto; min-width: 0; }
.nm-statusbar-btn {
  display: inline-flex; align-items: center; gap: 5px; height: 18px; padding: 0;
  background: none; border: 0; border-radius: var(--bx-r-ctl);
  color: var(--bx-fg-3); font-family: var(--bx-font-mono);
  font-size: var(--bx-fs-meta); cursor: pointer;
  transition: color 90ms linear;
}
.nm-statusbar-btn:hover { color: var(--bx-fg-2); }
.nm-statusbar-err, .nm-statusbar-err:hover { color: var(--bx-err); }
.nm-statusbar-err b { color: var(--bx-err); }
.nm-statusbar-err::before { content: none; }
.nm-statusbar-pin { color: var(--bx-warn); }
.nm-statusbar-db { display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: 240px; }
.nm-statusbar-db-name { overflow: hidden; text-overflow: ellipsis; }
.nm-statusbar-db-shared, .nm-statusbar-db-shared:hover { color: var(--bx-warn); filter: none; }
.nm-statusbar-db-tag {
  flex: none; padding: 0; background: none; border: 0; border-radius: 0;
  font-size: var(--bx-fs-micro); letter-spacing: .04em; color: var(--bx-warn);
  text-transform: none; font-weight: 400;
}
.nm-statusbar-persisted { border: 0; }
.nm-statusbar-armed, .nm-statusbar-armed:hover {
  color: var(--bx-err); background: none; border: 0; filter: none;
}
.nm-statusbar-unmasked, .nm-statusbar-unmasked:hover { color: var(--bx-err); background: none; border: 0; }
.nm-statusbar-unmasked-tag {
  padding: 0 4px 0 0; background: none; border: 0; border-radius: 0;
  font-size: var(--bx-fs-micro); letter-spacing: .04em; color: var(--bx-err); font-weight: 400;
}

/* -- Command palette ------------------------------------------------------
   No coloured dots: the group above an item already says what kind of thing
   it is, and twelve dots down the left edge read as a legend you have to have
   learned. The one command that destroys something says so in its own label
   instead. */
.nm-palette {
  position: fixed; left: 50%; transform: translateX(-50%); z-index: 2147483647;
  display: flex; flex-direction: column; width: 760px; max-width: calc(100vw - 32px);
  max-height: 70vh; background: var(--bx-float);
  border: 1px solid var(--bx-line-strong); border-radius: var(--bx-r-modal);
  overflow: hidden; box-shadow: none;
}
.nm-palette-head {
  display: flex; align-items: center; gap: var(--bx-4); flex: none;
  height: 42px; padding: 0 12px 0 14px; border-bottom: 1px solid var(--bx-line);
}
.nm-palette-ico { display: flex; flex: none; color: var(--bx-fg-3); }
.nm-palette-input {
  flex: 1 1 auto; min-width: 0; padding: 0; background: transparent; border: 0;
  outline: 0; color: var(--bx-fg);
  font-family: var(--bx-font-sans); font-size: var(--bx-fs-xl);
}
.nm-palette-input::placeholder { color: var(--bx-fg-3); }
.nm-palette-esc {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3); border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-r-ctl); padding: 2px 6px;
}
.nm-palette-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 0 6px; }
.nm-palette-group {
  display: flex; align-items: center; padding: 10px 14px 5px;
  font-size: var(--bx-fs-micro); letter-spacing: .1em; color: var(--bx-fg-3);
  font-weight: 400; text-transform: none;
}
.nm-palette-item {
  display: flex; align-items: center; gap: 12px; width: 100%; height: 30px;
  padding: 0 14px 0 12px; background: transparent; border: 0;
  border-left: var(--bx-rail) solid transparent; text-align: left; cursor: pointer;
  transition: background-color 90ms linear, border-color 90ms linear;
}
.nm-palette-item:hover { background: var(--bx-hover-float); }
.nm-palette-item.active:not(:disabled) {
  background: var(--bx-hover-float); border-left-color: var(--bx-accent);
}
.nm-palette-item:disabled { cursor: not-allowed; opacity: 1; }
.nm-palette-label { flex: none; font-size: var(--bx-fs-lg); color: var(--bx-fg); }
.nm-palette-item:disabled .nm-palette-label { color: var(--bx-fg-3); }
/* The only destructive command in the list, and the only coloured label. */
.nm-palette-item[data-danger] .nm-palette-label { color: var(--bx-err); }
.nm-palette-gap { flex: 1 1 auto; min-width: 0; }
.nm-palette-note {
  flex: none; font-size: var(--bx-fs-sm); color: var(--bx-fg-3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nm-palette-count {
  flex: none; min-width: 22px; text-align: right; font-family: var(--bx-font-mono);
  font-size: var(--bx-fs-sm); color: var(--bx-fg-3); font-variant-numeric: tabular-nums;
}
.nm-palette-key {
  flex: none; min-width: 14px; text-align: center; padding: 2px 6px;
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta); color: var(--bx-fg-2);
  border: 1px solid var(--bx-line-strong); border-radius: var(--bx-r-ctl);
  background: none;
}
.nm-palette-foot {
  display: flex; align-items: center; gap: var(--bx-5); flex: none; height: 28px;
  padding: 0 14px; border-top: 1px solid var(--bx-line);
  font-size: var(--bx-fs-meta); color: var(--bx-fg-3);
}
.nm-palette-foot .nm-k { font-family: var(--bx-font-mono); color: var(--bx-fg-2); }
.nm-palette-foot-gap { flex: 1 1 auto; }
.nm-palette-empty { padding: 22px 14px; text-align: center; font-size: var(--bx-fs-code); color: var(--bx-fg-3); }
.nm-palette-dot { display: none; }

/* -- Shortcuts ------------------------------------------------------------
   Two sentences, then a two-column key reference. It is a reference, not an
   essay. */
.nm-sheet {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 2147483647; display: flex; flex-direction: column;
  width: 700px; max-width: calc(100vw - 32px); max-height: 80vh;
  padding: 0; background: var(--bx-float);
  border: 1px solid var(--bx-line-strong); border-radius: var(--bx-r-modal);
  box-shadow: none; overflow: hidden;
}
.nm-sheet-head {
  display: flex; align-items: center; flex: none; height: 40px; padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--bx-line);
}
.nm-sheet-head h3 {
  flex: 1 1 auto; margin: 0; font-size: var(--bx-fs-xl); font-weight: 400; color: var(--bx-fg);
}
.nm-sheet-close {
  width: 26px; height: 26px; flex: none; display: flex; align-items: center;
  justify-content: center; padding: 0; position: static;
  background: transparent; border: 0; border-radius: var(--bx-r-ctl);
  color: var(--bx-fg-2); cursor: pointer;
}
.nm-sheet-lead {
  flex: none; padding: 12px 16px 10px; border-bottom: 1px solid var(--bx-line);
  font-size: var(--bx-fs-md); line-height: 1.65; color: var(--bx-fg-2);
}
.nm-sheet-lead b { font-weight: 400; color: var(--bx-fg); }
.nm-sheet-cols {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  display: flex; gap: var(--bx-6); padding: 4px 16px 14px;
}
.nm-sheet-col { flex: 1 1 0; min-width: 0; }
.nm-sheet-group {
  grid-column: auto; margin: 0; padding: 13px 0 6px;
  font-size: var(--bx-fs-micro); letter-spacing: .1em; color: var(--bx-fg-3);
  font-weight: 400; text-transform: none;
}
.nm-sheet-row { display: flex; align-items: center; gap: var(--bx-4); height: 25px; }
.nm-sheet-key {
  width: 74px; flex: none; font-family: var(--bx-font-mono);
  font-size: var(--bx-fs-meta); color: var(--bx-fg-2);
}
.nm-sheet-desc {
  flex: 1 1 auto; min-width: 0; font-size: var(--bx-fs-md); color: var(--bx-fg-2);
}
.nm-scrim-full, .nm-sheet-scrim { background: transparent; animation: none; }

/* -- Databases on this origin ---------------------------------------------
   The same shell as the shortcuts modal, because they are the same kind of
   thing: a sheet you open, read and close. */
.nm-db-lead {
  flex: none; padding: 12px 16px 10px; border-bottom: 1px solid var(--bx-line);
  font-size: var(--bx-fs-md); line-height: 1.65; color: var(--bx-fg-2);
}
.nm-db-lead code, .nm-db-warn code {
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
  padding: 1px var(--bx-2); border-radius: var(--bx-r-ctl);
  background: var(--bx-raise); color: var(--bx-fg);
}
.nm-db-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--bx-4) 16px 16px; }
.nm-db-warn, .nm-db-error {
  padding: var(--bx-3) var(--bx-4); margin-bottom: var(--bx-4);
  border-radius: var(--bx-r-ctl); border: 1px solid var(--bx-line);
  font-size: var(--bx-fs-sm); line-height: 1.55; background: var(--bx-raise);
  color: var(--bx-fg-2);
}
.nm-db-error { border-color: var(--bx-err); color: var(--bx-err); }
.nm-db-empty { padding: var(--bx-6) var(--bx-4); text-align: center; font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }

.nm-db-list { display: flex; flex-direction: column; gap: var(--bx-2); }
.nm-db-item {
  border: 1px solid var(--bx-line); border-radius: var(--bx-r-ctl);
  background: var(--bx-raise); overflow: hidden;
}
.nm-db-open { border-color: var(--bx-line-strong); }
/* No icon beside the name: the sheet is a list of databases and nothing in it
   is anything else, so a database glyph on every row says nothing. */
.nm-db-row { display: flex; align-items: center; gap: var(--bx-4); padding: var(--bx-3) var(--bx-4); }
.nm-db-main { flex: 1 1 auto; min-width: 0; }
.nm-db-name {
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-code); color: var(--bx-fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nm-db-note { margin-top: 2px; font-size: var(--bx-fs-sm); color: var(--bx-fg-3); line-height: 1.5; }
/* The menu idiom: a row that carries a state prints it, right-aligned, in
   monospace. It was a blue capsule, which is a badge - and a badge for "you
   are here" competes with the two controls next to it. */
.nm-db-tag {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  letter-spacing: .04em; color: var(--bx-fg-3);
}
.nm-db-tag-legacy { color: var(--bx-warn); }
.nm-db-btn {
  flex: none; height: var(--bx-h-ctl-sm); padding: 0 8px;
  background: transparent; border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-r-ctl); color: var(--bx-fg-2);
  font-size: var(--bx-fs-meta); cursor: pointer; white-space: nowrap;
  transition: background-color 90ms linear, border-color 90ms linear;
}
.nm-db-btn:hover:not(:disabled) { background: var(--bx-hover); }
.nm-db-btn:disabled { color: var(--bx-fg-3); cursor: not-allowed; }
/* The one destructive control in the sheet, and the only coloured label -
   same rule as Clear log in the palette. */
.nm-db-del:not(:disabled) { color: var(--bx-err); }
.nm-db-armed { border-color: var(--bx-err); }

.nm-db-peek {
  border-top: 1px solid var(--bx-line); padding: var(--bx-3) 0;
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
}
.nm-db-peek-msg {
  padding: var(--bx-2) var(--bx-4); font-family: var(--bx-font-sans);
  font-size: var(--bx-fs-sm); line-height: 1.5; color: var(--bx-fg-3);
}
.nm-db-peek-row {
  display: flex; align-items: center; gap: var(--bx-3);
  height: var(--bx-row); padding: 0 var(--bx-4);
  font-variant-numeric: tabular-nums;
}
.nm-db-peek-row:hover { background: var(--bx-hover); }
/* The second of the two places a source colour is allowed, for the same
   reason as the row's link ticks: which source wrote this record is data. */
.nm-db-peek-dot { width: 2px; height: 10px; flex: none; background: var(--bx-mark); }
.nm-db-peek-dot[data-src="network"]  { background: var(--bx-src-network); }
.nm-db-peek-dot[data-src="realtime"] { background: var(--bx-src-realtime); }
.nm-db-peek-dot[data-src="redux"]    { background: var(--bx-src-redux); }
.nm-db-peek-dot[data-src="query"]    { background: var(--bx-src-query); }
.nm-db-peek-when { flex: none; color: var(--bx-fg-3); }
.nm-db-peek-method {
  flex: none; width: var(--bx-col-method); font-size: var(--bx-fs-meta);
  letter-spacing: .06em; color: var(--bx-fg-3);
}
.nm-db-peek-url {
  flex: 1 1 auto; min-width: 0; color: var(--bx-fg-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nm-db-peek-status { flex: none; color: var(--bx-fg-3); }
.nm-db-peek-bad { color: var(--bx-err); }

/* -- The unified diff ------------------------------------------------------
   A changed path is a file header; the lines under it are the diff. Two
   gutters, a sign column, then the text — the shape everyone already knows
   how to read, which is most of why it is worth doing this way.

   The slot set has a colour for added and removed *text* but none for a
   tinted row ground, so a changed line takes a 2px mark in its own colour and
   one step of elevation. That is this panel's own idiom for "this row is
   different" (the status rail, the cURL export's mark) and it survives the
   themes that have no business rendering a green wash. */
.nm-gh-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--bx-4) 0; }
.nm-gh { margin: 0 var(--bx-4) var(--bx-4); border: 1px solid var(--bx-line); border-radius: var(--bx-r-ctl); overflow: hidden; }
.nm-gh:last-child { margin-bottom: 0; }
.nm-gh-head {
  display: flex; align-items: center; gap: var(--bx-3);
  padding: var(--bx-2) var(--bx-4); background: var(--bx-bar);
  border-bottom: 1px solid var(--bx-line);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
}
.nm-gh-path { flex: 1 1 auto; min-width: 0; color: var(--bx-fg); word-break: break-all; }
.nm-gh-stat-add { flex: none; color: var(--bx-diff-add); font-variant-numeric: tabular-nums; }
.nm-gh-stat-del { flex: none; color: var(--bx-diff-del); font-variant-numeric: tabular-nums; }

.nm-gh-body { font-family: var(--bx-font-mono); font-size: var(--bx-fs-code); line-height: 1.7; }
.nm-gh-line, .nm-gh-gap { display: flex; align-items: flex-start; border-left: var(--bx-rail) solid transparent; }
.nm-gh-line:hover { background: var(--bx-hover); }
/* The gutters are numbers you compare down a column, so they are tabular and
   they never hold anything that could be mistaken for content. */
.nm-gh-n {
  flex: none; width: 38px; padding: 0 var(--bx-3); text-align: right;
  color: var(--bx-mark); font-variant-numeric: tabular-nums;
  user-select: none;
}
.nm-gh-sign { flex: none; width: 14px; text-align: center; user-select: none; color: var(--bx-mark); }
.nm-gh-text { flex: 1 1 auto; min-width: 0; white-space: pre-wrap; word-break: break-word; color: var(--bx-fg-2); padding-right: var(--bx-4); }

.nm-gh-add { background: var(--bx-hover); border-left-color: var(--bx-diff-add); }
.nm-gh-add .nm-gh-sign, .nm-gh-add .nm-gh-text { color: var(--bx-diff-add); }
.nm-gh-del { background: var(--bx-hover); border-left-color: var(--bx-diff-del); }
.nm-gh-del .nm-gh-sign, .nm-gh-del .nm-gh-text { color: var(--bx-diff-del); }

/* Collapsed context. Says how much it is hiding, because "…" does not. */
.nm-gh-gap { background: var(--bx-bar); color: var(--bx-fg-3); font-size: var(--bx-fs-meta); }
.nm-gh-gap .nm-gh-text { color: var(--bx-fg-3); font-style: italic; }

/* -- Headers, and the Query/Connection tabs that reuse them ---------------
   A key/value list, not a table: the keys are short and the values are long,
   and a two-column grid that sizes to the longest key wastes the width the
   values need. Restored here after the detail-pane rewrite dropped it, which
   is what collapsed these tabs into one item per line. */
.nm-htable { padding: var(--bx-4) 12px; }
.nm-htable-title {
  padding-bottom: var(--bx-3); font-size: var(--bx-fs-micro);
  letter-spacing: .1em; color: var(--bx-fg-3);
}
.nm-kv {
  margin: 0; display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: var(--bx-1) var(--bx-4); align-items: baseline;
}
.nm-kv-row { display: contents; }
.nm-kv-k {
  margin: 0; font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
  color: var(--bx-fg-3); word-break: break-word; white-space: nowrap;
}
.nm-kv-v {
  margin: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--bx-2);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
  color: var(--bx-fg); word-break: break-all; user-select: all;
}
.nm-kv-val { min-width: 0; word-break: break-all; }
.nm-kv-note { width: 100%; font-family: var(--bx-font-sans); font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }
/* Say it rather than leaving it to be inferred from an ellipsis: a truncated
   bearer token looks exactly like a bearer token. */
.nm-tag-masked {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-micro);
  letter-spacing: .06em; color: var(--bx-fg-3); user-select: none;
}
.nm-tag-unmasked { color: var(--bx-err); }

/* The JWT inspector, inside the Authorization row. */
.nm-jwt { width: 100%; margin-top: var(--bx-2); padding-left: var(--bx-4); border-left: var(--bx-rail) solid var(--bx-line); }
.nm-jwt-row { display: flex; align-items: baseline; gap: var(--bx-4); min-width: 0; }
.nm-jwt-k { flex: none; width: 76px; font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }
.nm-jwt-v { flex: 1 1 auto; min-width: 0; font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm); color: var(--bx-fg-2); word-break: break-all; }
.nm-jwt-alg { font-family: var(--bx-font-mono); }
.nm-jwt-muted { color: var(--bx-fg-3); }
.nm-jwt-warn { color: var(--bx-warn); }
.nm-jwt-bad { color: var(--bx-err); }
.nm-jwt-chip { color: var(--bx-fg-3); }
.nm-jwt-warning {
  margin-bottom: var(--bx-3); padding: var(--bx-2) var(--bx-3);
  border-left: var(--bx-rail) solid var(--bx-warn);
  font-family: var(--bx-font-sans); font-size: var(--bx-fs-sm); line-height: 1.5;
  color: var(--bx-warn);
}
.nm-jwt-note { padding-top: var(--bx-2); font-family: var(--bx-font-sans); font-size: var(--bx-fs-sm); color: var(--bx-fg-3); }

/* -- Initiator: the captured call stack ----------------------------------- */
.nm-stack { padding: var(--bx-4) 12px; }
.nm-stack-frame {
  display: flex; align-items: baseline; gap: var(--bx-4);
  padding: var(--bx-1) 0; border-bottom: 1px solid var(--bx-line-soft);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
}
.nm-stack-fn { flex: none; color: var(--bx-fg); }
.nm-stack-file { flex: 1 1 auto; min-width: 0; color: var(--bx-fg-3); word-break: break-all; text-align: right; }

/* -- The linked-events strip ---------------------------------------------- */
.nm-linked {
  display: flex; align-items: center; gap: var(--bx-3); flex: none;
  padding: var(--bx-2) 12px; border-top: 1px solid var(--bx-line);
}
.nm-linked-label { flex: none; font-size: var(--bx-fs-micro); letter-spacing: .1em; color: var(--bx-fg-3); }
.nm-linked-chips { display: flex; align-items: center; gap: var(--bx-2); min-width: 0; }
.nm-linked-chip {
  flex: none; height: var(--bx-h-ctl-sm); padding: 0 8px;
  background: transparent; border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-r-ctl); color: var(--bx-fg-2);
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  cursor: pointer; white-space: nowrap;
  transition: background-color 90ms linear;
}
.nm-linked-chip:hover { background: var(--bx-hover); }

/* -- The per-entry context menu ------------------------------------------- */
.nm-menu-hint {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-fg-3);
}
.nm-menu-danger { color: var(--bx-err); }
.nm-menu-err, .nm-menu-warn {
  padding: var(--bx-2) 12px; font-size: var(--bx-fs-sm); line-height: 1.5;
}
.nm-menu-err { color: var(--bx-err); }
.nm-menu-warn { color: var(--bx-warn); }
.nm-menu-note { padding: 0 12px var(--bx-2); font-size: var(--bx-fs-sm); line-height: 1.5; color: var(--bx-fg-3); }

/* -- Timing ----------------------------------------------------------------
   The three phases are a measurement, not four sources: they take the data
   colours, not the source-identity ones the old palette lent them. Crypto is
   the panel's own time and network is the wire, so one of them is warm and
   the other is the accent - and a phase that took no time is dimmed rather
   than dropped, because "0 ms in crypto" is an answer. */
.nm-timing { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--bx-4) 12px var(--bx-5); }
.nm-timing-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--bx-4); margin-bottom: var(--bx-3); }
.nm-timing-title { font-size: var(--bx-fs-micro); letter-spacing: .1em; color: var(--bx-fg-3); }
.nm-timing-total { font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm); color: var(--bx-fg-3); font-variant-numeric: tabular-nums; }
.nm-timing-total b { font-weight: 400; color: var(--bx-fg); }
.nm-timing-bar {
  display: flex; height: var(--bx-h-ctl-sm); overflow: hidden;
  border-radius: var(--bx-r-ctl); background: var(--bx-line-soft);
}
.nm-timing-seg {
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-bg); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.nm-timing-encrypt, .nm-timing-decrypt { --nm-phase: var(--bx-warn); }
.nm-timing-network { --nm-phase: var(--bx-accent); }
.nm-timing-seg, .nm-timing-swatch, .nm-timing-ctx-fill { background: var(--nm-phase, var(--bx-accent)); }

.nm-timing-legend { display: flex; flex-direction: column; margin-top: var(--bx-4); }
.nm-timing-row {
  display: grid; grid-template-columns: 10px minmax(96px, auto) 1fr auto 52px;
  align-items: center; gap: var(--bx-4); height: var(--bx-row);
  border-bottom: 1px solid var(--bx-line-soft);
}
/* A phase that cost nothing recedes rather than disappearing. */
.nm-timing-row[data-zero] { color: var(--bx-fg-3); }
.nm-timing-row[data-zero] .nm-timing-swatch { background: var(--bx-mark); }
.nm-timing-swatch { width: 8px; height: 8px; border-radius: 2px; }
.nm-timing-label { font-size: var(--bx-fs-sm); color: var(--bx-fg-2); }
.nm-timing-row[data-zero] .nm-timing-label { color: var(--bx-fg-3); }
.nm-timing-note { min-width: 0; font-size: var(--bx-fs-sm); color: var(--bx-fg-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-timing-value, .nm-timing-pct {
  text-align: right; font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm);
  color: var(--bx-fg-2); font-variant-numeric: tabular-nums;
}
.nm-timing-pct { color: var(--bx-fg-3); }

.nm-timing-ctx { margin-top: var(--bx-5); padding: var(--bx-4); border: 1px solid var(--bx-line); border-radius: var(--bx-r-ctl); }
.nm-timing-ctx-head { margin-bottom: var(--bx-3); font-size: var(--bx-fs-micro); letter-spacing: .1em; color: var(--bx-fg-3); }
.nm-timing-ctx-row { display: grid; grid-template-columns: minmax(0, 120px) 1fr auto; align-items: center; gap: var(--bx-4); height: var(--bx-row); }
.nm-timing-ctx-k { min-width: 0; font-size: var(--bx-fs-sm); color: var(--bx-fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-timing-ctx-row.nm-timing-median .nm-timing-ctx-k,
.nm-timing-ctx-row.nm-timing-worst .nm-timing-ctx-k { color: var(--bx-fg-3); }
.nm-timing-ctx-track { height: 5px; background: var(--bx-line-soft); }
.nm-timing-ctx-fill { display: block; height: 100%; }
.nm-timing-this { --nm-phase: var(--bx-accent); }
.nm-timing-median { --nm-phase: var(--bx-mark); }
.nm-timing-worst { --nm-phase: var(--bx-warn); }
.nm-timing-ctx-v { text-align: right; font-family: var(--bx-font-mono); font-size: var(--bx-fs-sm); color: var(--bx-fg-2); font-variant-numeric: tabular-nums; }
.nm-timing-worst .nm-timing-ctx-v { color: var(--bx-warn); }

/* -- The Redux slice bar --------------------------------------------------
   Navigation, so it reads like the tab row above it rather than like a row of
   pills. The change count was an amber capsule; it is the same quiet state
   the menus print, in the same place. */
.nm-slicebar {
  display: flex; align-items: center; gap: var(--bx-3); flex: none; min-width: 0;
  height: var(--bx-h-tabs); padding: 0 var(--bx-4);
  border-bottom: 1px solid var(--bx-line-soft);
}
.nm-slicebar-label { flex: none; font-size: var(--bx-fs-micro); letter-spacing: .1em; color: var(--bx-fg-3); }
.nm-slices { display: flex; align-items: center; gap: var(--bx-1); min-width: 0; }
.nm-slice {
  flex: none; height: var(--bx-h-ctl-sm); padding: 0 8px;
  background: transparent; border: 0; border-radius: var(--bx-r-ctl);
  color: var(--bx-fg-2); font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  cursor: pointer; white-space: nowrap;
  transition: background-color 90ms linear, color 90ms linear;
}
.nm-slice:hover { background: var(--bx-hover); }
.nm-slice.active { background: var(--bx-sel); color: var(--bx-fg); }
/* This action touched this slice. A 2px mark, not a dot before the label -
   the label is already the thing being marked. */
.nm-slice[data-hit] { box-shadow: inset var(--bx-rail) 0 0 var(--bx-warn); }
.nm-slicebar-hint {
  flex: none; font-family: var(--bx-font-mono); font-size: var(--bx-fs-meta);
  color: var(--bx-warn); background: none; border: 0; padding: 0; border-radius: 0;
  font-weight: 400;
}

/* Odds and ends the audit found rendered with no rule of their own. */
/* The floating panel is dragged by its header. */
.nm-draggable { cursor: grab; }
.nm-draggable:active { cursor: grabbing; }
/* A filter chip with nothing behind it: still offered, visibly empty. */
.nm-fchip-0 .nm-fchip-dot { background: var(--bx-mark); }
.nm-fchip-0 .nm-fchip-label, .nm-fchip-0 .nm-fchip-n { color: var(--bx-fg-3); }
/* The Encrypted tab says what kind of ciphertext it holds. */
.nm-tab-aes { color: var(--bx-fg-3); }
/* The detail pane with nothing selected yet. */
.nm-empty-detail { background: var(--bx-bar); }

/* -- Focus ----------------------------------------------------------------
   One ring, everywhere, inside the element's own box so it never overlaps the
   row above it in a 26px list. */
.nm-root :focus-visible:not([tabindex="-1"]) {
  outline: 1px solid var(--bx-accent); outline-offset: -1px;
}
/* An input that fills a bordered box does not get a ring of its own: the box
   already went accent on :focus-within, and the two land a pixel apart and
   read as one thick band rather than as two rings. The container is the
   thing you clicked, so the container is the thing that shows focus. */
.nm-root .nm-filter-input:focus-visible,
.nm-root .nm-palette-input:focus-visible { outline: none; }
`;

export const MONITOR_STYLES = [
  // First, and it has to be: the scoped reset inside it carries exactly one
  // class of specificity, so it beats a host stylesheet's bare element
  // selectors and *ties* with every `.nm-*` rule below — which is what lets
  // source order hand the panel's own rules the win.
  TOKENS_CSS,
  BASE,
  // Tokens come before anything that reads them. Ordering is not strictly
  // required for custom properties, but it keeps the emitted stylesheet
  // readable when inspected in the browser.
  BX_BASE_CSS,
  BASE_THEME_CSS,
  ROLES,
  FAB,
  PANEL,
  HEADER,
  RAIL,
  TABLE,
  DETAIL,
  VIEWERS,
  MENU,
  LAYOUT,
  MISC,
  RESPONSIVE,
  SURFACES,
].join("\n");
