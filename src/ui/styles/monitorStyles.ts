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

import { BASE_THEME_CSS } from "../themes/themes";

const BASE = `
.nm-root {
  position: fixed; z-index: 2147483647;
  pointer-events: auto;
  direction: ltr; text-align: left;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;

  --nm-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --nm-ease: cubic-bezier(.22,1,.36,1);

  /* Row height, driven by the density setting. */
  --nm-row-h: 30px;

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
.nm-root ::selection { background: var(--nm-accent-soft); color: var(--nm-txt); }
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
/* ── The launcher ──────────────────────────────────────────────────────────
   A segmented pill rather than a padded row of items: brand, counts and grip
   are three different jobs, and hairlines between them read at 34px where
   whitespace alone does not. */
.nm-fab {
  display: flex; align-items: center; height: 34px; padding: 0;
  border-radius: 17px; border: 1px solid var(--nm-line-strong);
  background: var(--nm-surface-2);
  color: var(--nm-txt); font-size: 11px; cursor: grab; overflow: hidden;
  box-shadow: var(--nm-shadow-fab);
  transition: transform .16s var(--nm-ease), box-shadow .16s var(--nm-ease), border-color .16s ease;
  touch-action: none; user-select: none;
}
.nm-fab:active { cursor: grabbing; }
.nm-fab:hover {
  transform: translateY(-1.5px); border-color: var(--nm-accent-line);
  box-shadow: var(--nm-shadow-fab-hover);
}
.nm-fab-brand { display: flex; align-items: center; gap: 7px; padding: 0 11px 0 12px; }
.nm-fab-sep { width: 1px; height: 20px; background: var(--nm-line); flex-shrink: 0; }
.nm-fab-stats { display: flex; align-items: center; gap: 1px; padding: 0 4px; }
.nm-fab-grip { display: flex; align-items: center; padding: 0 8px 0 3px; color: var(--nm-faint); }
.nm-fab-dot {
  position: relative; width: 7px; height: 7px; border-radius: 999px; flex-shrink: 0;
  background: var(--nm-state-fg); box-shadow: 0 0 9px var(--nm-state-glow);
}
.nm-fab-ping { position: absolute; inset: 0; border-radius: 999px; background: var(--nm-state-fg); animation: nm-ping 1.5s cubic-bezier(0,0,.2,1) infinite; }
@keyframes nm-ping { 0% { transform: scale(1); opacity: .7; } 75%,100% { transform: scale(2.8); opacity: 0; } }
.nm-fab-label { font-size: 11px; font-weight: 700; letter-spacing: .1em; color: var(--nm-txt); }
.nm-fab-count {
  display: flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 11px;
  font-family: var(--nm-mono); font-size: 11px; font-weight: 600;
  background: var(--nm-elev); color: var(--nm-txt); font-variant-numeric: tabular-nums;
}
.nm-fab-err {
  display: flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 11px;
  font-family: var(--nm-mono); font-size: 11px; font-weight: 600;
  color: var(--nm-error); background: var(--nm-error-soft); font-variant-numeric: tabular-nums;
}
.nm-fab-err::before { content: ""; width: 5px; height: 5px; border-radius: 999px; background: var(--nm-error); }

.nm-fab-dock { animation: nm-dock .34s cubic-bezier(.34,1.56,.64,1); }
@keyframes nm-dock {
  0% { transform: scale(1.16); opacity: .85; }
  60% { transform: scale(.97); }
  100% { transform: scale(1); opacity: 1; }
}

.nm-fab-ghost {
  position: fixed; transform: translate(-50%, -50%) scale(1.04);
  cursor: grabbing; pointer-events: none; opacity: .98;
  box-shadow: var(--nm-shadow-ghost); z-index: 2147483647;
}
.nm-fab-ghost:hover { transform: translate(-50%, -50%) scale(1.04); }

.nm-zone {
  position: fixed; width: 104px; height: 54px; border-radius: 18px;
  border: 1.5px dashed var(--nm-line-strong); background: var(--nm-elev);
  pointer-events: none; z-index: 2147483646;
  transition: border-color .16s ease, background .16s ease, box-shadow .16s ease, transform .16s ease;
}
.nm-zone.active {
  border-color: var(--nm-accent); border-style: solid;
  background: var(--nm-accent-soft); transform: scale(1.06);
  box-shadow: 0 0 0 3px var(--nm-accent-soft), var(--nm-shadow-ghost);
}
.nm-drag-scrim {
  position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
  background: radial-gradient(120% 120% at 50% 50%, transparent 38%, var(--nm-scrim-drag));
  animation: nm-fade .16s ease-out;
}
@keyframes nm-fade { from { opacity: 0; } to { opacity: 1; } }
`;

const PANEL = `
.nm-panel {
  position: fixed; display: flex; flex-direction: column; overflow: hidden;
  /* The panel resizes independently of the viewport (dock, splitter, drag), so
     everything inside responds to the panel's width, not the window's. */
  container-type: inline-size; container-name: nm;
  background: var(--nm-surface); border: 1px solid var(--nm-line); color: var(--nm-txt);
  border-radius: 16px;
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
.nm-panel.nm-max { border-radius: 12px; }
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
/* ── Header ────────────────────────────────────────────────────────────────
   One 38px row for everything that is true of the *session* rather than of
   one entry: whether we are capturing, what is being filtered out, and where
   the panel lives. Which of the four sources you are reading moved to the
   rail (see RAIL), because that is navigation, not a session control. */
.nm-header {
  height: 38px; flex: none; display: flex; align-items: center; gap: 10px;
  padding: 0 8px 0 10px; min-width: 0;
  border-bottom: 1px solid var(--nm-line); background: var(--nm-surface-2);
  box-shadow: 0 1px 0 var(--nm-sunken);
  user-select: none; touch-action: none;
}
.nm-header.nm-draggable { cursor: move; }
.nm-grip { display: inline-flex; color: var(--nm-faint); cursor: grab; transition: color .12s ease; }
.nm-header:hover .nm-grip { color: var(--nm-muted); }
.nm-header:active .nm-grip { cursor: grabbing; }
/* Brand. The dot doubles as the capture indicator — it takes the colour of
   the worst state currently in the buffer, so the panel says "something is
   failing" from its quietest corner, without a badge competing for space. */
.nm-brand { display: flex; align-items: center; gap: 6px; flex: none; }
.nm-logo {
  width: 6px; height: 6px; border-radius: 999px; flex-shrink: 0;
  background: var(--nm-state-fg); box-shadow: 0 0 8px var(--nm-state-glow);
  transition: background .2s ease, box-shadow .2s ease;
}
.nm-title { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; color: var(--nm-txt); }
.nm-hsep { width: 1px; height: 18px; background: var(--nm-line); flex: none; }

/* Capture state. A labelled pill rather than a play/pause glyph: "am I still
   recording?" is the one question the header has to answer without being
   interpreted, and a two-state icon answers it ambiguously. */
.nm-capture {
  flex: none; display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px;
  border-radius: 6px; border: 1px solid var(--nm-state-bg);
  background: var(--nm-state-bg); color: var(--nm-state-fg);
  font-family: inherit; font-size: 10.5px; font-weight: 600; letter-spacing: .02em;
  cursor: pointer; transition: filter .14s ease;
}
.nm-capture:hover { filter: brightness(1.18); }
.nm-capture::before {
  content: ""; width: 5px; height: 5px; border-radius: 999px; background: var(--nm-state-fg);
}

/* ── Filter field ──────────────────────────────────────────────────────────
   A composite control, not an input with decoration around it: parsed tokens
   become chips *inside* the field, so what has already been applied and what
   you are still typing occupy the same box. */
.nm-filter {
  flex: 1 1 auto; display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 640px;
  height: 26px; padding: 0 6px 0 8px; border-radius: 7px;
  background: var(--nm-input); border: 1px solid var(--nm-line);
  transition: border-color .16s ease, box-shadow .16s ease;
}
.nm-filter-on { border-color: var(--nm-accent-line); box-shadow: 0 0 0 3px var(--nm-accent-soft); }
.nm-filter-ico { display: inline-flex; color: var(--nm-faint); flex: none; }
.nm-filter-tokens { display: flex; align-items: center; gap: 4px; flex: none; }
.nm-token {
  display: flex; align-items: center; gap: 5px; height: 18px; padding: 0 4px 0 6px;
  border-radius: 4px; background: var(--nm-accent-soft); border: 1px solid var(--nm-accent-line);
  font-family: var(--nm-mono); font-size: 10px; color: var(--nm-accent); white-space: nowrap;
}
.nm-token-x {
  border: none; background: none; color: var(--nm-muted); cursor: pointer;
  font-size: 11px; line-height: 1; padding: 0 1px;
}
.nm-token-x:hover { color: var(--nm-txt); }
.nm-filter-input {
  flex: 1 1 auto; min-width: 40px; border: none; outline: none; background: none;
  font-family: inherit; font-size: 11px; color: var(--nm-txt); padding: 0;
}
.nm-filter-input::placeholder { color: var(--nm-faint); }
.nm-filter-re {
  flex: none; height: 18px; padding: 0 5px; border-radius: 4px;
  border: 1px solid transparent; background: transparent; color: var(--nm-faint);
  font-family: var(--nm-mono); font-size: 10px; cursor: pointer;
  transition: color .14s ease, background .14s ease, border-color .14s ease;
}
.nm-filter-re:hover { color: var(--nm-txt); }
.nm-filter-re.active { color: var(--nm-accent); background: var(--nm-accent-soft); border-color: var(--nm-accent-line); }
.nm-kbd {
  font-family: inherit; font-size: 9.5px; padding: 1px 4px; border-radius: 3px;
  background: var(--nm-elev); border: 1px solid var(--nm-line); color: var(--nm-faint);
  white-space: nowrap;
}

.nm-actions { flex: none; display: flex; align-items: center; gap: 4px; }
/* Toolbar buttons are one shape at two widths — a labelled pill and a square
   icon — so a row of them lines up whatever mix the panel width allows. */
.nm-pill {
  display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px;
  border-radius: 6px; border: 1px solid var(--nm-line); background: var(--nm-elev);
  color: var(--nm-muted); font-family: inherit; font-size: 10.5px; font-weight: 500;
  cursor: pointer; white-space: nowrap;
  transition: background .14s ease, border-color .14s ease, color .14s ease;
}
.nm-pill:hover { background: var(--nm-elev-hover); color: var(--nm-txt); }
.nm-pill:disabled { opacity: .38; cursor: not-allowed; }
.nm-pill:disabled:hover { background: var(--nm-elev); color: var(--nm-muted); }
.nm-pill-sq { width: 24px; padding: 0; justify-content: center; }
.nm-pill-txt { color: var(--nm-txt); }
.nm-pill-caret { color: var(--nm-faint); font-size: 9px; }
.nm-pill-on { color: var(--nm-accent); border-color: var(--nm-accent-line); background: var(--nm-accent-soft); }
.nm-pill-on:hover { color: var(--nm-accent); background: var(--nm-accent-soft); }
/* Preserve log is amber rather than accent-blue when on: it is the one toggle
   that keeps writing to disk after you walk away, and it should not read as
   just another selected control. */
.nm-pill-warn { color: var(--nm-warning); border-color: var(--nm-warning-line); background: var(--nm-warning-soft); }
.nm-pill-warn:hover { color: var(--nm-warning); background: var(--nm-warning-soft); }
.nm-pill-close { border-color: transparent; background: none; }
.nm-pill-close:hover { color: var(--nm-error); background: var(--nm-error-soft); border-color: var(--nm-error-line); }

.nm-dockseg { display: flex; gap: 1px; padding: 2px; border-radius: 7px; border: 1px solid var(--nm-line); background: var(--nm-sunken); }
.nm-dockbtn {
  display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 20px;
  border: none; border-radius: 5px; background: transparent; color: var(--nm-faint); cursor: pointer;
  padding: 0; transition: background .14s ease, color .14s ease;
}
.nm-dockbtn:hover { background: var(--nm-elev-hover); color: var(--nm-txt); }
.nm-dockbtn.active { background: var(--nm-accent-soft); color: var(--nm-accent); }
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
.nm-rail {
  flex: none; display: flex; flex-direction: column; min-height: 0;
  background: var(--nm-surface-2); border-right: 1px solid var(--nm-line);
  transition: width .18s var(--nm-ease);
}
.nm-rail-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 6px 12px; }
.nm-rail-label { font-size: 9px; font-weight: 600; letter-spacing: .14em; color: var(--nm-faint); }
.nm-rail-collapse {
  width: 18px; height: 18px; flex: none; display: flex; align-items: center; justify-content: center;
  border: none; background: none; color: var(--nm-faint); cursor: pointer; border-radius: 4px; padding: 0;
  transition: background .12s ease, color .12s ease;
}
.nm-rail-collapse:hover { background: var(--nm-elev); color: var(--nm-muted); }
.nm-rail-collapse .nm-ico { transform: rotate(180deg); }
.nm-rail-mini .nm-rail-collapse .nm-ico { transform: none; }
.nm-rail-mini .nm-rail-head { justify-content: center; padding: 10px 0 6px; }
.nm-rail-mini .nm-rail-label, .nm-rail-mini .nm-rail-name,
.nm-rail-mini .nm-rail-n, .nm-rail-mini .nm-rail-stats, .nm-rail-mini .nm-rail-cmd { display: none; }
.nm-rail-mini .nm-rail-item { justify-content: center; padding: 0; }

.nm-rail-list { display: flex; flex-direction: column; gap: 1px; padding: 0 6px; }
.nm-rail-item {
  position: relative; display: flex; align-items: center; gap: 9px; height: 30px;
  padding: 0 8px 0 9px; border: none; border-radius: 7px; background: transparent;
  color: var(--nm-muted); font-family: inherit; font-size: 11.5px; font-weight: 400;
  cursor: pointer; text-align: left;
  transition: background .14s ease, color .14s ease;
}
.nm-rail-item:hover { background: var(--nm-elev); color: var(--nm-txt); }
.nm-rail-item.active { background: var(--nm-accent-bg); color: var(--nm-txt); font-weight: 600; }
/* The icon carries the section's identity colour and glows only while that
   source is the one you are reading, which is what makes the rail scannable
   at 52px — where the label is gone and the icon is the whole row. */
.nm-rail-ico {
  position: relative; display: flex; flex: none;
  color: var(--nm-accent-fg); opacity: .7;
  transition: opacity .14s ease, filter .14s ease;
}
.nm-rail-item:hover .nm-rail-ico { opacity: .9; }
.nm-rail-item.active .nm-rail-ico { opacity: 1; filter: drop-shadow(0 0 6px var(--nm-accent-fg)); }
/* A source with nothing in it keeps its shape but drops its colour: the icon
   still says which one it is, without claiming there is traffic to read. */
.nm-rail-empty .nm-rail-ico { color: var(--nm-faint); opacity: .55; }
.nm-rail-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nm-rail-n {
  font-family: var(--nm-mono); font-size: 10px; min-width: 20px; text-align: center;
  padding: 1px 5px; border-radius: 4px; background: var(--nm-elev); color: var(--nm-faint);
  font-variant-numeric: tabular-nums;
}
.nm-rail-item.active .nm-rail-n { background: var(--nm-accent-bg); color: var(--nm-accent-fg); }
.nm-rail-empty .nm-rail-n { color: var(--nm-faint); }
/* An open socket or an in-flight fetch, on a source you are not looking at.
   The ring in the rail's own surface keeps it separable from the icon strokes
   it sits on. */
.nm-rail-live {
  position: absolute; right: -3px; top: -2px; width: 5px; height: 5px;
  border-radius: 999px; background: var(--nm-success);
  box-shadow: 0 0 0 2px var(--nm-surface-2);
  animation: nm-pulse 1.6s ease-in-out infinite;
}

.nm-rail-stats { margin: 14px 12px 0; padding-top: 12px; border-top: 1px solid var(--nm-line-2); }
.nm-rail-stats-head { font-size: 9px; font-weight: 600; letter-spacing: .14em; color: var(--nm-faint); margin-bottom: 8px; }
.nm-rail-stat { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 3px 0; }
.nm-rail-stat-k { font-size: 10.5px; color: var(--nm-faint); }
.nm-rail-stat-v { font-family: var(--nm-mono); font-size: 11px; font-weight: 500; color: var(--nm-muted); font-variant-numeric: tabular-nums; }
.nm-rail-stat-v.nm-hot { color: var(--nm-warning); }
.nm-rail-stat-v.nm-bad { color: var(--nm-error); }
.nm-rail-spacer { flex: 1; min-height: 8px; }
.nm-rail-cmd {
  display: flex; align-items: center; gap: 7px; margin: 10px; padding: 7px 9px;
  border-radius: 7px; border: 1px dashed var(--nm-line-strong); background: none;
  color: var(--nm-faint); font-family: inherit; font-size: 10.5px; cursor: pointer; text-align: left;
  transition: border-color .14s ease, color .14s ease;
}
.nm-rail-cmd:hover { border-color: var(--nm-accent-line); color: var(--nm-muted); }
.nm-rail-cmd > span { flex: 1; }
.nm-restoring { font-size: 10.5px; font-weight: 600; color: var(--nm-muted); animation: nm-pulse 1.4s ease-in-out infinite; }
`;

const TABLE = `
.nm-body { display: flex; flex: 1; min-height: 0; min-width: 0; }
.nm-body-panes { display: flex; flex: 1; min-height: 0; min-width: 0; }
.nm-body-panes.nm-body-v { flex-direction: column; }
/* overflow:hidden at every level of the pane chain. Without it, a table whose
   fixed columns are wider than the pane paints its overflow straight over the
   detail pane instead of being clipped. */
.nm-list { flex-shrink: 0; display: flex; min-width: 0; min-height: 0; overflow: hidden; background: var(--nm-bg); }

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
.nm-table { display: grid; grid-template-rows: auto 1fr; flex: 1; width: 100%; min-width: 0; min-height: 0; overflow: hidden; }

/* ── List header ───────────────────────────────────────────────────────────
   State filters on the left, the two right-hand column labels on the right,
   in one 30px row. The filters belong here rather than in a bar of their own:
   they act on this list only, and a separate strip cost 30px of vertical
   space on a panel that is usually docked short. */
.nm-list-head {
  height: 30px; flex: none; display: flex; align-items: center; min-width: 0;
  padding-left: 8px; background: var(--nm-surface-2);
  border-bottom: 1px solid var(--nm-line); user-select: none;
}
.nm-fchips { display: flex; align-items: center; gap: 3px; flex: 1 1 auto; min-width: 0; }
.nm-fchip {
  flex: none; display: flex; align-items: center; gap: 5px; height: 20px; padding: 0 6px;
  border: 1px solid transparent; border-radius: 5px; background: transparent;
  color: var(--nm-muted); font-family: inherit; font-size: 10.5px; font-weight: 400;
  cursor: pointer; white-space: nowrap;
  transition: border-color .14s ease, background .14s ease, color .14s ease;
}
.nm-fchip:hover { border-color: var(--nm-line-strong); }
.nm-fchip.active { background: var(--nm-state-bg); border-color: var(--nm-state-fg); color: var(--nm-txt); font-weight: 600; }
.nm-fchip-dot { width: 5px; height: 5px; flex: none; border-radius: 999px; background: var(--nm-state-fg); }
.nm-fchip-0 .nm-fchip-dot { background: var(--nm-line-strong); }
.nm-fchip-n { font-family: var(--nm-mono); font-size: 9.5px; color: var(--nm-faint); font-variant-numeric: tabular-nums; }
.nm-fchip.active .nm-fchip-n { color: var(--nm-state-fg); }

.nm-list-cols { flex: none; display: grid; grid-template-columns: 52px 88px; align-items: center; padding-left: 8px; }
.nm-list-col {
  font-size: 9px; font-weight: 600; letter-spacing: .1em; color: var(--nm-faint);
  text-align: right; border: none; background: none; font-family: inherit;
  cursor: pointer; padding: 0 8px 0 0; transition: color .14s ease;
}
.nm-list-col:last-child { padding-right: 10px; }
.nm-list-col:hover { color: var(--nm-muted); }
.nm-list-col.nm-sorted { color: var(--nm-accent); }
.nm-sort-arrow { font-size: 7px; margin-left: 3px; }

.nm-tbody { overflow-y: auto; overflow-x: hidden; min-height: 0; min-width: 0; background: var(--nm-bg); }

/* ── Row ───────────────────────────────────────────────────────────────────
   Five tracks: the selection edge, the cross-source link ticks, one elastic
   identity column, the status pill and the duration. Everything that used to
   be its own resizable column (initiator, size, transport, slice) folds into
   the elastic column's trailing metadata, which shrinks first and disappears
   before the name does. */
.nm-trow {
  display: grid; grid-template-columns: 3px 15px minmax(0, 1fr) 52px 88px;
  align-items: center; height: var(--nm-row-h); min-width: 0;
  font-size: 11.5px; cursor: pointer; position: relative;
  border-bottom: 1px solid var(--nm-line-2); color: var(--nm-muted);
  transition: background .1s ease;
}
.nm-trow:hover { background: var(--nm-elev); }
.nm-trow.active { background: var(--nm-accent-soft); color: var(--nm-txt); }
/* An aborted row can never complete; it is kept for the record and reads as
   past tense. */
.nm-trow[data-state="aborted"] { opacity: .6; }

.nm-row-bar { width: 3px; height: 100%; background: transparent; }
.nm-trow.active .nm-row-bar { background: var(--nm-accent); }
/* Which of the four worlds a selected row belongs to, reinforced at the row
   itself and not just in the rail. */
.nm-trow[data-kind="ws"].active { background: var(--nm-c-realtime-soft); }
.nm-trow[data-kind="ws"].active .nm-row-bar { background: var(--nm-c-realtime); }
.nm-trow[data-kind="redux"].active { background: var(--nm-c-redux-soft); }
.nm-trow[data-kind="redux"].active .nm-row-bar { background: var(--nm-c-redux); }
.nm-trow[data-kind="query"].active { background: var(--nm-c-query-soft); }
.nm-trow[data-kind="query"].active .nm-row-bar { background: var(--nm-c-query); }

/* Cross-source links, as a tick per linked entry in the section's own colour.
   Two pixels of colour is enough to answer "did this request come from a
   query?" while scanning, and the chips at the foot of the detail pane say
   which one. */
.nm-row-links { display: flex; align-items: center; justify-content: center; gap: 2px; width: 15px; }
.nm-link-tick { width: 3px; height: 11px; border-radius: 2px; background: var(--nm-accent-fg); opacity: .8; }

.nm-row-main { display: flex; align-items: center; gap: 7px; min-width: 0; padding-right: 8px; }
.nm-kind {
  flex: none; width: 34px; text-align: center; padding: 2px 0; border-radius: 3px;
  font-family: var(--nm-mono); font-size: 9px; font-weight: 700; letter-spacing: .04em;
  color: var(--nm-accent-fg); background: var(--nm-accent-bg);
  overflow: hidden; text-overflow: clip; white-space: nowrap;
}
.nm-kind-wide { width: 52px; }
.nm-row-name {
  flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: var(--nm-mono); font-size: 11.5px; color: var(--nm-txt);
}
.nm-trow.active .nm-row-name { font-weight: 600; }
.nm-trow[data-state="error"] .nm-row-name { color: var(--nm-error); }
/* Yields its width before the name does — shrink beats the name's basis by
   four orders of magnitude, so the identity survives to the last pixel. */
.nm-row-meta {
  flex: 0 9999 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 10.5px; color: var(--nm-faint);
}
.nm-row-status { text-align: right; padding-right: 8px; }
.nm-row-time { padding-right: 10px; }
.nm-row-time-v { text-align: right; font-family: var(--nm-mono); font-size: 10.5px; line-height: 12px; color: var(--nm-muted); font-variant-numeric: tabular-nums; }
.nm-row-time-v.nm-hot { color: var(--nm-warning); }
/* A duration bar rather than a waterfall lane: at 88px an offset-plus-length
   bar is unreadable, and "how does this compare to the slowest thing in the
   session" is the question a list answers better than a timeline. */
.nm-row-track { height: 2px; margin-top: 3px; border-radius: 1px; background: var(--nm-wf-track); display: flex; justify-content: flex-end; }
.nm-row-fill { height: 2px; border-radius: 1px; background: var(--nm-state-fg); opacity: .85; }
.nm-row-fill.nm-wf-live {
  background-image: linear-gradient(90deg, var(--nm-stripe) 25%, transparent 25%, transparent 50%, var(--nm-stripe) 50%, var(--nm-stripe) 75%, transparent 75%);
  background-size: 10px 10px; animation: nm-stripe .8s linear infinite;
}
@keyframes nm-stripe { from { background-position: 0 0; } to { background-position: 10px 0; } }

.nm-replay-chip {
  font-size: 9px; font-weight: 800; padding: 0 4px; border-radius: 4px; flex: none;
  color: var(--nm-accent); background: var(--nm-accent-soft);
}

.nm-status {
  display: inline-flex; align-items: center; justify-content: center; height: 16px;
  padding: 0 5px; border-radius: 4px; font-family: var(--nm-mono);
  font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: var(--nm-state-fg); background: var(--nm-state-bg);
}

.nm-load-divider {
  display: flex; align-items: center; gap: 8px; height: var(--nm-row-h); padding: 0 12px 0 20px;
  font-size: 9px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
  color: var(--nm-faint);
}
.nm-load-divider > span { flex: none; display: inline-flex; align-items: center; gap: 5px; }
.nm-load-divider::after {
  content: ""; flex: 1; height: 1px;
  background: repeating-linear-gradient(90deg, var(--nm-line-strong) 0 3px, transparent 3px 7px);
}
`;

const DETAIL = `
/* position:relative plus a background, so the detail pane owns its own paint
   area and can never be written over by a neighbouring pane. */
.nm-detail {
  flex: 1; display: flex; flex-direction: column; position: relative;
  min-width: 0; min-height: 0; overflow: hidden; background: var(--nm-surface);
}
/* ── Detail head ───────────────────────────────────────────────────────────
   Two lines: what this is and what you can do to it, then the URL. The
   identity line stays on one row and truncates, so the action buttons never
   move as you click down the list — a Replay button that shifts sideways per
   entry is a Replay button you have to re-aim at every time. */
.nm-detail-head {
  flex: none; padding: 8px 10px 7px 12px; border-bottom: 1px solid var(--nm-line-2);
}
.nm-detail-id { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nm-method {
  flex: none; font-family: var(--nm-mono); font-size: 10px; font-weight: 700; letter-spacing: .05em;
  padding: 2px 7px; border-radius: 4px; border: 1px solid var(--nm-accent-fg);
  color: var(--nm-accent-fg); background: var(--nm-accent-bg);
}
.nm-detail-status {
  flex: none; font-family: var(--nm-mono); font-size: 10.5px; font-weight: 700;
  padding: 2px 7px; border-radius: 4px;
  color: var(--nm-state-fg); background: var(--nm-state-bg); font-variant-numeric: tabular-nums;
}
.nm-detail-summary {
  min-width: 0; flex: 1 1 auto; font-size: 11px; color: var(--nm-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums;
}
.nm-meta { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--nm-muted); }
.nm-status-text { color: var(--nm-faint); }
/* Detail-head buttons: one primary (the thing this entry can be *made* to do
   again) and a run of quiet ones. */
.nm-dbtn {
  flex: none; display: flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px;
  border-radius: 5px; border: 1px solid var(--nm-line); background: var(--nm-elev);
  color: var(--nm-muted); font-family: inherit; font-size: 10.5px; cursor: pointer; white-space: nowrap;
  transition: background .14s ease, color .14s ease, border-color .14s ease;
}
.nm-dbtn:hover:not(:disabled) { background: var(--nm-elev-hover); color: var(--nm-txt); }
.nm-dbtn:disabled { opacity: .4; cursor: not-allowed; }
.nm-dbtn-sq { width: 22px; padding: 0; justify-content: center; }
.nm-dbtn-mono { font-family: var(--nm-mono); font-size: 10px; }
.nm-dbtn-primary {
  padding: 0 9px; font-weight: 600;
  color: var(--nm-accent); background: var(--nm-accent-soft); border-color: var(--nm-accent-line);
}
.nm-dbtn-primary:hover:not(:disabled) { color: var(--nm-accent); background: var(--nm-accent-soft); filter: brightness(1.3); }
.nm-dbtn-on { color: var(--nm-warning); background: var(--nm-warning-soft); border-color: var(--nm-warning-line); }
.nm-dbtn-on:hover:not(:disabled) { color: var(--nm-warning); background: var(--nm-warning-soft); }
.nm-detail-url {
  margin-top: 6px; font-size: 11px; font-family: var(--nm-mono);
  color: var(--nm-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  user-select: all;
}

/* Why the primary action (Replay, Re-dispatch) is disabled. Text rather than
   only a tooltip: a disabled button does not reliably show its title. */
.nm-detail-reason {
  margin-top: 4px; font-size: 10.5px; line-height: 1.35; color: var(--nm-faint);
}
.nm-notice {
  display: flex; align-items: center; gap: 8px; padding: 6px 14px; flex-shrink: 0;
  border-bottom: 1px solid var(--nm-line);
  background: var(--nm-warning-soft); color: var(--nm-warning);
}
.nm-notice-txt { font-size: 11.5px; font-weight: 600; margin-right: auto; }
.nm-notice-btn {
  font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 7px;
  border: 1px solid var(--nm-line-strong); background: var(--nm-elev);
  color: var(--nm-txt); cursor: pointer; transition: background .14s ease;
}
.nm-notice-btn:hover { background: var(--nm-elev-hover); }
.nm-empty .nm-notice-btn { margin-top: 10px; }

/* ── Scrolling chip strips ─────────────────────────────────────────────────
   The tab row and the store slice picker. Both overflow routinely — eight tabs
   in a 320px dock, twenty reducers at any width — so both get the same
   treatment: no scrollbar stealing height from a 28px row, a fade over each
   edge that is *actually* clipped, and arrows for pointer users, since a fade
   says "there is more" without offering any way to reach it.

   The fade widths are variables rather than four mask rules, and default to 0
   so a strip that fits is not dimmed at all. */
.nm-strip { position: relative; display: flex; min-width: 0; flex: 1 1 auto; }
.nm-strip-scroll {
  --nm-fade-s: 0px; --nm-fade-e: 0px;
  min-width: 0; flex: 1 1 auto;
  overflow-x: auto; overflow-y: hidden;
  scrollbar-width: none; -ms-overflow-style: none;
  /* No scroll-behavior: smooth here on purpose — it would animate every wheel
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

/* Sits over the fade, not beside it: stealing 22px of a narrow strip to park
   an arrow would cost more chips than the arrow is worth. Hidden entirely
   while that direction has nowhere to go, so it never offers a dead click. */
.nm-strip-nav {
  position: absolute; top: 0; bottom: 0; z-index: 2;
  display: none; align-items: center; justify-content: center;
  width: 20px; padding: 0; border: none; background: transparent;
  color: var(--nm-muted); cursor: pointer; opacity: .75;
  transition: opacity .14s ease, color .14s ease;
}
.nm-strip-nav:hover { opacity: 1; color: var(--nm-txt); }
.nm-strip-nav-s { left: 0; }
.nm-strip-nav-e { right: 0; }
.nm-strip-nav-s .nm-ico { transform: rotate(180deg); }
.nm-strip-s .nm-strip-nav-s, .nm-strip-e .nm-strip-nav-e { display: flex; }

/* The rule lives on the wrapper, not the scroller: a border on a masked
   element fades out with the chips, leaving the tab row visibly unfinished at
   both ends. */
/* ── Tab row ───────────────────────────────────────────────────────────────
   The tabs and the payload's format switch share one 32px row. They are
   different questions — which field, and how to render it — but both belong
   to the pane below them, and two stacked 32px bars over a 200px payload was
   more chrome than payload.

   The active tab is marked by an underline in the *section's* colour, not by
   a filled pill: a filled tab competed with the format switch beside it, and
   the underline carries the source identity for free. */
.nm-tabrow {
  flex: 0 0 auto; display: flex; align-items: center; gap: 10px; height: 32px;
  padding: 0 10px 0 12px; min-width: 0;
  background: var(--nm-surface-2); border-bottom: 1px solid var(--nm-line);
}
.nm-tabs { display: flex; align-items: center; gap: 2px; }
.nm-tab {
  position: relative; display: flex; align-items: center; gap: 5px; height: 32px; padding: 0 8px;
  border: none; background: none; color: var(--nm-muted);
  font-family: inherit; font-size: 11.5px; font-weight: 400; cursor: pointer; white-space: nowrap;
  transition: color .14s ease, box-shadow .14s ease;
}
.nm-tab:hover { color: var(--nm-txt); }
.nm-tab.active { color: var(--nm-txt); font-weight: 600; box-shadow: inset 0 -2px 0 var(--nm-accent-fg); }
.nm-tab-n {
  font-family: var(--nm-mono); font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px;
  background: var(--nm-elev); color: var(--nm-faint); font-variant-numeric: tabular-nums;
}
.nm-tab-aes { background: var(--nm-syn-blob-soft); color: var(--nm-syn-blob); }
.nm-tab-body { flex: 1; min-height: 0; min-width: 0; overflow: hidden; background: var(--nm-bg); display: flex; flex-direction: column; }

/* ── Linked events ─────────────────────────────────────────────────────────
   The correlations Blix already knows about — the query that caused a request,
   the requests a query caused, the original of a replay — as a strip at the
   foot of the pane. They were buried in a notice above the tabs and in a list
   inside one tab; a request and the query behind it are one story, and the
   strip is where you step between them. */
.nm-linked {
  flex: none; display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px;
  background: var(--nm-surface-2); border-top: 1px solid var(--nm-line);
}
.nm-linked-label { flex: none; font-size: 9px; font-weight: 700; letter-spacing: .14em; color: var(--nm-faint); }
.nm-linked-chips { display: flex; align-items: center; gap: 6px; }
.nm-linked-chip {
  flex: none; display: flex; align-items: center; gap: 6px; height: 20px; padding: 0 8px;
  border-radius: 5px; border: 1px solid var(--nm-accent-fg); background: var(--nm-accent-bg);
  color: var(--nm-accent-fg); font-family: var(--nm-mono); font-size: 10px;
  cursor: pointer; white-space: nowrap; transition: filter .14s ease;
}
.nm-linked-chip:hover { filter: brightness(1.3); }
.nm-linked-chip::before { content: ""; width: 5px; height: 5px; border-radius: 2px; background: currentColor; flex: none; }

.nm-headers { flex: 1; min-height: 0; overflow: auto; padding: 6px 0 14px; background: var(--nm-bg); }
.nm-htable { padding: 4px 14px 0; }
.nm-htable-title {
  position: sticky; top: 0; font-size: 11px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
  color: var(--nm-muted); padding: 10px 0 7px; background: var(--nm-bg); border-bottom: 1px solid var(--nm-line);
  z-index: 1;
}
.nm-kv { margin: 0; padding: 4px 0; }
.nm-kv-row { display: grid; grid-template-columns: minmax(120px, 200px) 1fr; gap: 12px; padding: 4px 0; border-bottom: 1px solid var(--nm-line-2); }
.nm-kv-k { margin: 0; font-size: 11.5px; font-weight: 700; color: var(--nm-muted); font-family: var(--nm-mono); word-break: break-word; }
.nm-kv-v { margin: 0; font-size: 11.5px; color: var(--nm-txt); font-family: var(--nm-mono); word-break: break-all; user-select: all; }
.nm-tag-masked {
  display: inline-block; margin-left: 7px; vertical-align: 1px; user-select: none;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 9px; font-weight: 700; letter-spacing: .06em;
  padding: 1px 5px; border-radius: 3px;
  color: var(--nm-warning); background: var(--nm-warning-soft); border: 1px solid var(--nm-warning-line);
}
/* Masking off: the one tag on the Headers tab that must not blend in — it
   marks the row nobody should screenshot without noticing. */
.nm-tag-unmasked { color: var(--nm-error); background: var(--nm-error-soft); border-color: var(--nm-error-line); }
/* The value keeps click-to-select-all; the tags, chips and claims beside it
   must not be swept into the selection with it. */
.nm-kv-auth { user-select: text; }
.nm-kv-val { user-select: all; }
.nm-kv-note {
  display: block; margin-top: 4px; user-select: none; word-break: normal;
  font-family: ui-sans-serif, system-ui, sans-serif; font-size: 10.5px; color: var(--nm-faint);
}
.nm-jwt-chip[aria-expanded="true"] { color: var(--nm-txt); background: var(--nm-elev-hover); }
.nm-jwt {
  margin-top: 6px; padding: 4px 8px; border-radius: 6px; user-select: text; word-break: break-word;
  border: 1px solid var(--nm-line); background: var(--nm-sunken);
}
.nm-jwt-row { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; padding: 2px 0; }
.nm-jwt-k { color: var(--nm-faint); }
.nm-jwt-bad, .nm-jwt-chip.nm-jwt-bad { color: var(--nm-error); }
.nm-jwt-note { padding: 3px 0 1px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 10px; color: var(--nm-faint); }
/* "no alg" and "not a string" are statements about the header, not values —
   set apart so they are not read as an algorithm called "no alg". */
.nm-jwt-muted { color: var(--nm-faint); font-style: italic; }
.nm-jwt-warn, .nm-jwt-chip.nm-jwt-warn { color: var(--nm-warning); }
/* alg: none. Amber rather than red: it reports what was sent and what came
   back, and leaves the verdict to the reader. */
.nm-jwt-warning {
  margin: 2px 0 4px; padding: 3px 7px; border-radius: 4px;
  font-family: ui-sans-serif, system-ui, sans-serif; font-size: 10.5px; font-weight: 600;
  color: var(--nm-warning); background: var(--nm-warning-soft); border: 1px solid var(--nm-warning-line);
}

.nm-stack { margin: 0; padding: 6px 0 0; list-style: none; }
.nm-stack-frame { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--nm-line-2); font-family: var(--nm-mono); font-size: 11.5px; }
.nm-stack-fn { color: var(--nm-accent); flex-shrink: 0; }
.nm-stack-file { color: var(--nm-muted); word-break: break-all; margin-right: auto; }

/* Redux — Diff tab */
.nm-diff { flex: 1; min-height: 0; overflow: auto; padding: 8px 14px 14px; background: var(--nm-bg); }
.nm-diff-row { display: flex; flex-direction: column; gap: 3px; padding: 7px 0; border-bottom: 1px solid var(--nm-line-2); }
.nm-diff-path { display: flex; align-items: center; gap: 7px; }
.nm-diff-path-txt { font-family: var(--nm-mono); font-size: 11.5px; font-weight: 700; color: var(--nm-txt); word-break: break-all; }
.nm-diff-op {
  display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px;
  border-radius: 4px; font-size: 10px; font-weight: 800; flex-shrink: 0;
}
.nm-diff-op-add { color: var(--nm-success); background: var(--nm-success-soft); }
.nm-diff-op-remove { color: var(--nm-error); background: var(--nm-error-soft); }
.nm-diff-op-change { color: var(--nm-warning); background: var(--nm-warning-soft); }
.nm-diff-values { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding-left: 22px; min-width: 0; }
.nm-diff-val {
  font-family: var(--nm-mono); font-size: 11px; padding: 2px 7px; border-radius: 6px;
  background: var(--nm-elev); color: var(--nm-txt); word-break: break-all; max-width: 100%; min-width: 0;
}
.nm-diff-before { color: var(--nm-muted); text-decoration: line-through; text-decoration-color: var(--nm-error-line); }
.nm-diff-after { color: var(--nm-success); }
.nm-diff-arrow { color: var(--nm-faint); font-size: 11px; }

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
.nm-json-size {
  font-family: var(--nm-mono); font-size: 9.5px; font-variant-numeric: tabular-nums;
  color: var(--nm-faint); min-width: 0; flex-shrink: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nm-json-toolbar .nm-json-size { margin-right: auto; }

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
.nm-menu {
  position: fixed; z-index: 2147483647; padding: 4px;
  border-radius: 11px; border: 1px solid var(--nm-line-strong);
  background: var(--nm-surface-3); color: var(--nm-txt);
  box-shadow: var(--nm-shadow-menu);
  animation: nm-in .12s ease-out;
  outline: none;
  /* The theme list is long enough to run past the bottom of a short viewport.
     The ceiling is computed per-menu from its own anchor (see Menu.tsx); this
     is the fallback for menus that don't set one. */
  max-height: 70vh; overflow-y: auto;
}
.nm-menu-head {
  font-size: 10px; font-weight: 700; color: var(--nm-faint); padding: 5px 9px 7px;
  border-bottom: 1px solid var(--nm-line); margin-bottom: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--nm-mono);
  /* Sticks while a long menu scrolls, so you never lose track of which menu
     you are in. The -4px cancels the menu's own padding. */
  position: sticky; top: -4px; z-index: 1; background: var(--nm-surface-3);
}
.nm-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  font-size: 12px; font-weight: 500; padding: 6px 9px; border: none; border-radius: 7px;
  background: transparent; color: var(--nm-txt); cursor: pointer; transition: background .12s ease;
}
.nm-menu-item:hover:not(:disabled) { background: var(--nm-elev-hover); }
.nm-menu-item:disabled { opacity: .4; cursor: not-allowed; }
.nm-menu-danger { color: var(--nm-error); }
.nm-menu-danger:hover { background: var(--nm-error-soft); }
.nm-menu-hint { margin-left: auto; font-size: 9px; font-weight: 800; text-transform: uppercase; color: var(--nm-warning); }
.nm-menu-sep { height: 1px; background: var(--nm-line); margin: 4px 0; }
.nm-menu-note { font-size: 10px; color: var(--nm-faint); padding: 2px 9px 6px; line-height: 1.35; }
.nm-menu-warn { font-size: 10.5px; color: var(--nm-warning); padding: 4px 9px 8px; line-height: 1.35; }
.nm-menu-err { color: var(--nm-error); }
/* Group label inside a menu — quieter than a section head, since it labels a
   run of items rather than the menu itself. */
.nm-menu-group {
  font-size: 9px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase;
  color: var(--nm-faint); padding: 7px 9px 3px;
}
/* Export scope. A segmented control rather than two menu items, because it is
   a property *of* the formats below it, not a seventh thing you can pick. */
.nm-menu-scope { display: flex; gap: 2px; padding: 3px; margin: 2px 0 4px; border-radius: 8px; background: var(--nm-sunken); }
.nm-scope-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  font-size: 11px; font-weight: 600; padding: 4px 8px; border: none; border-radius: 6px;
  background: transparent; color: var(--nm-muted); cursor: pointer;
  transition: background .14s ease, color .14s ease;
}
.nm-scope-btn:hover { color: var(--nm-txt); }
.nm-scope-btn.active { background: var(--nm-surface-2); color: var(--nm-accent); box-shadow: var(--nm-shadow-seg); }
.nm-scope-btn b { font-variant-numeric: tabular-nums; font-weight: 800; }

/* The chosen item, marked rather than highlighted: a menu of themes is a set
   of radio buttons, and a hover highlight already means something else here. */
.nm-menu-item.nm-menu-on { color: var(--nm-accent); }
.nm-menu-check { margin-left: auto; display: inline-flex; color: var(--nm-accent); }

/* ── Theme picker ──────────────────────────────────────────────────────────
   Each row previews the theme it selects, not the theme currently applied —
   the swatch is painted from that palette's own literal colours, which is the
   one place in the panel where an inline colour is correct. Three chips is
   enough to tell six themes apart: the surface you'd read code on, the accent,
   and one identity colour. */
.nm-swatch {
  display: inline-flex; align-items: center; flex-shrink: 0;
  padding: 2px; border-radius: 6px; border: 1px solid var(--nm-line-strong);
}
.nm-swatch-chip { width: 9px; height: 14px; }
.nm-swatch-chip:first-child { border-radius: 3px 0 0 3px; }
.nm-swatch-chip:last-child { border-radius: 0 3px 3px 0; }
.nm-theme-row { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 0; }
.nm-theme-name { font-size: 12px; font-weight: 600; }
.nm-theme-hint { font-size: 10px; color: var(--nm-faint); line-height: 1.3; }
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

.nm-pulse { animation: nm-pulse 1.1s ease-in-out infinite; }
@keyframes nm-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

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
.nm-linked-chip:focus-visible, .nm-list-col:focus-visible, .nm-statusbar-btn:focus-visible,
.nm-fmt-btn:focus-visible, .nm-empty-btn:focus-visible {
  outline: 2px solid var(--nm-accent); outline-offset: 2px;
}
/* Inset: the filter field clips, and an outline drawn outside the field would
   be cut at its rounded corners. */
.nm-filter:focus-within { border-color: var(--nm-accent-line); box-shadow: 0 0 0 3px var(--nm-accent-soft); }
.nm-palette-item:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }
.nm-trow:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }
/* Inset, unlike the rest: the slice strip clips its overflow, so an outline
   drawn outside a chip would be sliced off at the strip's edges. */
.nm-slice:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }

@media (prefers-reduced-motion: reduce) {
  .nm-panel, .nm-panel.nm-anim, .nm-fab, .nm-fab-dock, .nm-fab-ping, .nm-zone,
  .nm-drag-scrim, .nm-pulse, .nm-wf-live, .nm-menu, .nm-restoring,
  .nm-palette, .nm-rail, .nm-rail-live {
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

/* Pin affordance. Pinned is a state worth seeing while scanning; the control
   itself only surfaces on hover. */
.nm-pin {
  border: none; background: transparent; cursor: pointer; padding: 0;
  color: var(--nm-faint); opacity: 0; flex-shrink: 0; display: inline-flex;
  transition: opacity .12s ease, color .12s ease;
}
.nm-trow:hover .nm-pin { opacity: .55; }
.nm-pin:hover { opacity: 1 !important; color: var(--nm-accent); }
.nm-pin.pinned { opacity: 1; color: var(--nm-warning); }

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

.nm-db-intro { line-height: 1.5; margin-bottom: 12px; }
.nm-db-intro code, .nm-db-warn code {
  font-family: var(--nm-mono); font-size: 10.5px;
  padding: 1px 4px; border-radius: 4px; background: var(--nm-surface-2);
}
.nm-db-warn, .nm-db-error {
  font-size: 11.5px; line-height: 1.5; padding: 9px 11px;
  border-radius: 9px; margin-bottom: 10px; border: 1px solid var(--nm-line-strong);
}
.nm-db-warn { color: var(--nm-muted); background: var(--nm-surface-2); }
.nm-db-error {
  color: var(--nm-error); background: var(--nm-error-soft);
  border-color: var(--nm-error-line);
}
.nm-db-list { display: flex; flex-direction: column; gap: 6px; }
.nm-db-item {
  border-radius: 9px; border: 1px solid var(--nm-line);
  background: var(--nm-surface-2); overflow: hidden;
}
.nm-db-open { border-color: var(--nm-line-strong); }
.nm-db-row { display: flex; align-items: center; gap: 10px; padding: 9px 11px; }
.nm-db-ico { color: var(--nm-faint); flex: none; }
.nm-db-main { min-width: 0; flex: 1; }
.nm-db-name {
  display: flex; align-items: center; gap: 6px; font-family: var(--nm-mono);
  font-size: 11.5px; color: var(--nm-txt); overflow-wrap: anywhere;
}
.nm-db-tag {
  flex: none;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 9.5px; font-weight: 700;
  letter-spacing: .3px; text-transform: uppercase; padding: 1px 5px;
  border-radius: 4px; color: var(--nm-accent);
  background: var(--nm-accent-soft); border: 1px solid var(--nm-accent-line);
}
.nm-db-tag-legacy {
  color: var(--nm-warning); background: var(--nm-warning-soft);
  border-color: var(--nm-warning-line);
}
.nm-db-note { font-size: 10.5px; color: var(--nm-faint); margin-top: 3px; }
.nm-db-row .nm-pill { flex: none; }
.nm-db-armed { color: var(--nm-error); border-color: var(--nm-error-line); }

/* The peek: the newest entries of a database this panel is not using. Denser
   than the request table and deliberately less capable — it is a read-only
   snapshot for identifying a log, not a second copy of the list. */
.nm-db-peek {
  border-top: 1px solid var(--nm-line); background: var(--nm-sunken);
  max-height: 260px; overflow: auto; padding: 4px 0;
}
.nm-db-peek-msg {
  padding: 7px 11px; font-size: 10.5px; line-height: 1.45; color: var(--nm-faint);
}
.nm-db-peek-row {
  display: flex; align-items: center; gap: 8px; padding: 3px 11px;
  font-size: 10.5px; font-family: var(--nm-mono); white-space: nowrap;
}
.nm-db-peek-row:hover { background: var(--nm-elev); }
.nm-db-peek-dot {
  flex: none; width: 6px; height: 6px; border-radius: 50%;
  background: var(--nm-accent-fg);
}
.nm-db-peek-when { flex: none; color: var(--nm-faint); font-variant-numeric: tabular-nums; }
.nm-db-peek-method { flex: none; width: 42px; color: var(--nm-muted); font-weight: 600; }
.nm-db-peek-url {
  flex: 1; min-width: 0; color: var(--nm-txt);
  overflow: hidden; text-overflow: ellipsis;
}
.nm-db-peek-status {
  flex: none; color: var(--nm-muted); font-variant-numeric: tabular-nums;
}
.nm-db-peek-bad { color: var(--nm-error); }
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
  /* The controls win the toolbar outright once it is this tight; the byte
     count is the one thing there that nothing depends on. */
  .nm-json-size { display: none; }
  .nm-slicebar-label { display: none; }
}

@container nm (max-width: 520px) {
  .nm-brand { display: none; }
  .nm-statusbar { gap: 8px; font-size: 10px; }
  .nm-detail-url { font-size: 10.5px; }
  .nm-htable { padding: 4px 10px 0; }
  .nm-tree { font-size: 11px; }
  /* Two of the five row tracks are the first to go: the link ticks are a
     shortcut to something the linked strip still shows, and the duration bar
     is a comparison the number above it already carries.

     The ticks are collapsed to a zero-width track, never display:none —
     removing a grid item shifts every later child up one column, which put
     the name in the 0px track and the duration off the end of the row. */
  .nm-trow { grid-template-columns: 3px 0 minmax(0, 1fr) 46px 62px; }
  .nm-row-links { width: 0; overflow: hidden; }
  .nm-row-track { display: none; }
  .nm-list-cols { grid-template-columns: 46px 62px; }
}

/* Very short panels: give the list and detail a usable minimum each and let the
   chrome shrink rather than eating the whole panel. */
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
@container nm (max-width: 820px) { .nm-status-transferred { display: none; } }
@container nm (max-width: 700px) { .nm-status-slowest { display: none; } }
@container nm (max-width: 600px) { .nm-status-failing { display: none; } }
@container nm (max-width: 480px) { .nm-status-persisted { display: none; } }
/* The database chip keeps its icon and its "shared" warning to the end; only
   the name, which is the long part, gives up its width. */
@container nm (max-width: 560px) { .nm-statusbar-db-name { display: none; } }

/* The floating panel must never exceed the viewport on a small screen. */
.nm-panel.nm-dock-float { max-width: 100vw; max-height: 100vh; }
`;

export const MONITOR_STYLES = [
  BASE,
  // Tokens come before anything that reads them. Ordering is not strictly
  // required for custom properties, but it keeps the emitted stylesheet
  // readable when inspected in the browser.
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
].join("\n");
