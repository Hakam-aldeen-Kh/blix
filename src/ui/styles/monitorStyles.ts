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
  --nm-row-h: 26px;
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
[data-accent="realtime"] { --nm-accent-fg: var(--nm-c-realtime); --nm-accent-bg: var(--nm-c-realtime-soft); }
[data-accent="redux"]    { --nm-accent-fg: var(--nm-c-redux);    --nm-accent-bg: var(--nm-c-redux-soft); }
[data-accent="query"]    { --nm-accent-fg: var(--nm-c-query);    --nm-accent-bg: var(--nm-c-query-soft); }
`;

const FAB = `
.nm-fab {
  display: flex; align-items: center; gap: 9px; padding: 9px 14px 9px 12px;
  border-radius: 999px; border: 1px solid var(--nm-line);
  background: linear-gradient(175deg, var(--nm-surface-2), var(--nm-surface) 70%);
  color: var(--nm-txt); font-size: 12.5px; font-weight: 700; cursor: grab;
  box-shadow: var(--nm-shadow-fab);
  transition: transform .16s var(--nm-ease), box-shadow .16s var(--nm-ease), border-color .16s ease;
  touch-action: none; user-select: none;
}
.nm-fab:active { cursor: grabbing; }
.nm-fab:hover {
  transform: translateY(-1.5px); border-color: var(--nm-line-strong);
  box-shadow: var(--nm-shadow-fab-hover);
}
.nm-fab-dot {
  position: relative; width: 9px; height: 9px; border-radius: 999px;
  background: var(--nm-state-fg); box-shadow: 0 0 0 3px var(--nm-elev);
}
.nm-fab-ping { position: absolute; inset: 0; border-radius: 999px; background: var(--nm-state-fg); animation: nm-ping 1.5s cubic-bezier(0,0,.2,1) infinite; }
@keyframes nm-ping { 0% { transform: scale(1); opacity: .7; } 75%,100% { transform: scale(2.8); opacity: 0; } }
.nm-fab-label { letter-spacing: .3px; }
.nm-fab-count { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--nm-elev-hover); color: var(--nm-muted); font-variant-numeric: tabular-nums; }
.nm-fab-err { font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 999px; color: var(--nm-error); background: var(--nm-error-soft); font-variant-numeric: tabular-nums; }

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
.nm-header {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px; min-width: 0;
  border-bottom: 1px solid var(--nm-line); background: var(--nm-surface-2);
  user-select: none; touch-action: none; flex-shrink: 0;
}
.nm-header.nm-draggable { cursor: move; }
.nm-grip { display: inline-flex; color: var(--nm-faint); cursor: grab; transition: color .12s ease; }
.nm-header:hover .nm-grip { color: var(--nm-muted); }
.nm-header:active .nm-grip { cursor: grabbing; }
/* Brand. The logo doubles as the capture indicator — it takes the colour of
   the worst state currently in the buffer, so the panel says "something is
   failing" from its quietest corner, without a badge competing for space. */
.nm-brand { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
.nm-logo {
  width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0;
  background: var(--nm-state-fg); box-shadow: 0 0 12px var(--nm-state-glow);
  transition: background .2s ease, box-shadow .2s ease;
}
.nm-titles { display: flex; flex-direction: column; line-height: 1.2; }
.nm-title { font-size: 12.5px; font-weight: 800; letter-spacing: .4px; color: var(--nm-txt); }
.nm-sub { font-size: 10px; color: var(--nm-faint); }

.nm-search-wrap { position: relative; display: flex; align-items: center; margin-left: auto; flex: 1 1 300px; min-width: 0; max-width: 340px; }
.nm-search-ico { position: absolute; left: 9px; display: inline-flex; color: var(--nm-faint); pointer-events: none; }
.nm-search {
  width: 100%; font-size: 12px; padding: 7px 62px 7px 30px; border-radius: 9px;
  border: 1px solid var(--nm-line); background: var(--nm-input); color: var(--nm-txt); outline: none;
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
}
.nm-search::placeholder { color: var(--nm-faint); }
.nm-search:focus { border-color: var(--nm-accent); background: var(--nm-input-focus); box-shadow: 0 0 0 3px var(--nm-accent-soft); }
.nm-search-busy { border-color: var(--nm-accent-line); }
.nm-search-deep {
  position: absolute; right: 5px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--nm-line); background: var(--nm-sunken); color: var(--nm-faint);
  cursor: pointer; padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 800;
  font-family: var(--nm-mono); line-height: 1.4;
  transition: color .14s ease, background .14s ease, border-color .14s ease;
}
.nm-search-deep:hover { color: var(--nm-txt); border-color: var(--nm-line-strong); }
.nm-search-deep.active { color: var(--nm-accent); border-color: var(--nm-accent); background: var(--nm-accent-soft); }
.nm-search-clear {
  position: absolute; right: 36px; display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: var(--nm-faint); cursor: pointer; padding: 4px; border-radius: 6px;
  transition: color .12s ease, background .12s ease;
}
.nm-search-clear:hover { color: var(--nm-txt); background: var(--nm-elev); }

.nm-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.nm-actions-sep { width: 1px; height: 20px; background: var(--nm-line-strong); margin: 0 3px; }
.nm-iconbtn {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
  padding: 6px 10px; border-radius: 9px; border: 1px solid var(--nm-line);
  background: var(--nm-elev); color: var(--nm-txt); cursor: pointer;
  transition: background .14s ease, border-color .14s ease, color .14s ease, transform .1s ease;
}
.nm-iconbtn:hover { background: var(--nm-elev-hover); border-color: var(--nm-line-strong); }
.nm-iconbtn:active { transform: scale(.94); }
.nm-iconbtn:disabled { opacity: .38; cursor: not-allowed; }
.nm-iconbtn:disabled:hover { background: var(--nm-elev); border-color: var(--nm-line); }
.nm-iconbtn:disabled:active { transform: none; }
.nm-iconbtn-sq { width: 30px; height: 30px; padding: 0; justify-content: center; }
.nm-iconbtn-on { color: var(--nm-accent); border-color: var(--nm-accent); background: var(--nm-accent-soft); }
.nm-iconbtn-on:hover { background: var(--nm-accent-soft); border-color: var(--nm-accent); }
.nm-iconbtn-close:hover { color: var(--nm-error); background: var(--nm-error-soft); border-color: var(--nm-error-line); }

.nm-dockseg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--nm-line); background: var(--nm-sunken); }
.nm-dockbtn {
  display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 24px;
  border: none; border-radius: 7px; background: transparent; color: var(--nm-muted); cursor: pointer;
  transition: background .14s ease, color .14s ease;
}
.nm-dockbtn:hover { color: var(--nm-txt); }
.nm-dockbtn.active { background: var(--nm-accent-soft); color: var(--nm-accent); box-shadow: inset 0 0 0 1px var(--nm-accent-line); }
`;

const FILTERS = `
.nm-filters { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--nm-line); background: var(--nm-bg); flex-shrink: 0; min-width: 0; overflow: hidden; }
.nm-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 11px; border: 1px solid var(--nm-line); background: var(--nm-sunken); }
.nm-seg-btn {
  display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
  padding: 4px 10px; border: none; border-radius: 8px; background: transparent;
  color: var(--nm-muted); cursor: pointer; transition: background .14s ease, color .14s ease;
}
.nm-seg-btn:hover { color: var(--nm-txt); }
.nm-seg-btn.active { background: var(--nm-surface-2); color: var(--nm-txt); box-shadow: var(--nm-shadow-seg); }
.nm-seg-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--nm-state-fg); }
.nm-seg-n { font-size: 10px; font-weight: 700; color: var(--nm-faint); font-variant-numeric: tabular-nums; }
.nm-seg-btn.active .nm-seg-n { color: var(--nm-muted); }
.nm-filters-spacer { flex: 1; }
.nm-shown { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--nm-faint); }
.nm-summary { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--nm-faint); }
.nm-paused-pill {
  display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800;
  letter-spacing: .3px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px;
  color: var(--nm-warning); background: var(--nm-warning-soft); border: 1px solid var(--nm-warning-line);
}
.nm-restoring { font-size: 10.5px; font-weight: 600; color: var(--nm-muted); animation: nm-pulse 1.4s ease-in-out infinite; }
.nm-persist-pill {
  font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums;
  padding: 2px 8px; border-radius: 999px; cursor: pointer;
  color: var(--nm-accent); background: var(--nm-accent-soft);
  border: 1px solid var(--nm-accent-line);
  transition: color .14s ease, background .14s ease, border-color .14s ease;
}
.nm-persist-pill:hover { color: var(--nm-error); background: var(--nm-error-soft); border-color: var(--nm-error-line); }
`;

const TABLE = `
.nm-body { display: flex; flex: 1; min-height: 0; min-width: 0; }
.nm-body.nm-body-v { flex-direction: column; }
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

/* No horizontal scrolling by design: flexible columns use minmax(0, 1fr) and
   truncate, which removes header/body scroll-sync entirely. */
.nm-table { display: grid; grid-template-rows: auto 1fr; flex: 1; width: 100%; min-width: 0; min-height: 0; overflow: hidden; }
/* The grid template is set inline per section and updated by column resizing;
   only the shared box model lives here. */
.nm-thead, .nm-trow { display: grid; align-items: center; gap: 8px; padding: 0 10px; min-width: 0; overflow: hidden; }
.nm-thead {
  height: 26px; overflow: hidden; font-size: 10px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
  color: var(--nm-faint); background: var(--nm-surface-2);
  border-bottom: 1px solid var(--nm-line); user-select: none;
}
.nm-thead > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-th-sortable { cursor: pointer; }
.nm-th-sortable:hover { color: var(--nm-txt); }
.nm-th-sorted { color: var(--nm-accent); }
.nm-th-arrow { font-size: 7px; margin-left: 3px; }

.nm-tbody { overflow-y: auto; overflow-x: hidden; min-height: 0; min-width: 0; background: var(--nm-bg); }

.nm-trow {
  font-size: 11.5px; cursor: pointer; position: relative;
  border-bottom: 1px solid var(--nm-line-2); color: var(--nm-muted);
  transition: background .1s ease;
}
.nm-trow:hover { background: var(--nm-elev); }
.nm-trow.active { background: var(--nm-accent-soft); color: var(--nm-txt); }
.nm-trow.active::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2.5px; background: var(--nm-accent); }
/* Which of the four worlds a selected row belongs to, reinforced at the row
   itself and not just the section tab above it. */
.nm-trow[data-kind="ws"].active { background: var(--nm-c-realtime-soft); }
.nm-trow[data-kind="ws"].active::before { background: var(--nm-c-realtime); }
.nm-trow[data-kind="redux"].active { background: var(--nm-c-redux-soft); }
.nm-trow[data-kind="redux"].active::before { background: var(--nm-c-redux); }
.nm-trow[data-kind="query"].active { background: var(--nm-c-query-soft); }
.nm-trow[data-kind="query"].active::before { background: var(--nm-c-query); }
.nm-trow > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.nm-col-name { font-family: var(--nm-mono); color: var(--nm-txt); display: flex; align-items: center; gap: 5px; }
.nm-col-method { font-size: 10px; font-weight: 800; letter-spacing: .3px; color: var(--nm-accent-fg); }
.nm-col-init { font-family: var(--nm-mono); font-size: 10.5px; color: var(--nm-faint); }
.nm-col-size, .nm-col-dur { font-variant-numeric: tabular-nums; text-align: right; font-size: 10.5px; }
.nm-col-status { display: flex; }
.nm-col-wf { min-width: 0; overflow: hidden; }

.nm-replay-chip {
  font-size: 9px; font-weight: 800; padding: 0 4px; border-radius: 4px;
  color: var(--nm-accent); background: var(--nm-accent-soft); flex-shrink: 0;
}

.nm-wf-track { position: relative; display: block; width: 100%; height: 8px; border-radius: 3px; background: var(--nm-wf-track); overflow: hidden; }
.nm-wf-bar { position: absolute; top: 0; bottom: 0; border-radius: 3px; opacity: .85; background: var(--nm-state-fg); }
.nm-wf-live { background-image: linear-gradient(90deg, var(--nm-stripe) 25%, transparent 25%, transparent 50%, var(--nm-stripe) 50%, var(--nm-stripe) 75%, transparent 75%); background-size: 10px 10px; animation: nm-stripe .8s linear infinite; }
@keyframes nm-stripe { from { background-position: 0 0; } to { background-position: 10px 0; } }
.nm-wf-inf { position: absolute; right: 1px; top: 50%; transform: translateY(-50%); font-size: 9px; line-height: 1; color: var(--nm-txt); pointer-events: none; }

.nm-status {
  font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 5px;
  min-width: 34px; text-align: center;
  color: var(--nm-state-fg); background: var(--nm-state-bg);
}

.nm-load-divider {
  display: flex; align-items: center; gap: 8px; padding: 0 12px;
  font-size: 9.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase;
  color: var(--nm-faint); background: var(--nm-well);
  border-top: 1px solid var(--nm-line); border-bottom: 1px solid var(--nm-line);
}
.nm-load-divider > span { display: inline-flex; align-items: center; gap: 5px; }
.nm-load-divider::before, .nm-load-divider::after { content: ""; flex: 1; height: 1px; background: var(--nm-line-strong); }
`;

const DETAIL = `
/* position:relative plus a background, so the detail pane owns its own paint
   area and can never be written over by a neighbouring pane. */
.nm-detail {
  flex: 1; display: flex; flex-direction: column; position: relative;
  min-width: 0; min-height: 0; overflow: hidden; background: var(--nm-surface);
}
.nm-detail-head {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid var(--nm-line); background: var(--nm-surface-2); flex-shrink: 0;
}
.nm-method {
  font-size: 10px; font-weight: 800; letter-spacing: .3px; padding: 2px 7px; border-radius: 6px;
  color: var(--nm-accent-fg); background: var(--nm-accent-bg);
}
.nm-method-lg { font-size: 11px; padding: 3px 9px; }
.nm-meta { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--nm-muted); }
.nm-status-text { color: var(--nm-faint); }
.nm-curl {
  display: inline-flex; align-items: center; gap: 5px; margin-left: auto; font-size: 11px; font-weight: 600;
  padding: 4px 9px; border-radius: 7px; border: 1px solid var(--nm-line); background: var(--nm-elev);
  color: var(--nm-txt); cursor: pointer; transition: background .14s ease, border-color .14s ease;
}
.nm-curl:hover { background: var(--nm-elev-hover); border-color: var(--nm-line-strong); }
.nm-detail-url {
  width: 100%; font-size: 11.5px; font-family: var(--nm-mono);
  color: var(--nm-faint); word-break: break-all; user-select: all;
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

.nm-tabs { display: flex; gap: 3px; padding: 7px 10px; border-bottom: 1px solid var(--nm-line); flex-shrink: 0; overflow-x: auto; }
.nm-tab {
  font-size: 11.5px; font-weight: 600; padding: 5px 11px; border: none; background: transparent;
  color: var(--nm-muted); cursor: pointer; border-radius: 8px; white-space: nowrap;
  transition: color .14s ease, background .14s ease, box-shadow .14s ease;
}
.nm-tab:hover { color: var(--nm-txt); background: var(--nm-elev); }
.nm-tab.active { color: var(--nm-accent); background: var(--nm-accent-soft); box-shadow: inset 0 0 0 1px var(--nm-accent-line); }
.nm-tab-body { flex: 1; min-height: 0; min-width: 0; overflow: hidden; background: var(--nm-bg); display: flex; flex-direction: column; }

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

/* Query — State tab caused-requests list */
.nm-caused-list { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0; }
`;

const VIEWERS = `
.nm-json-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nm-json-toolbar { display: flex; align-items: center; gap: 8px; justify-content: flex-end; padding: 6px 12px; border-bottom: 1px solid var(--nm-line-2); flex-shrink: 0; }
.nm-json-size { font-size: 10px; font-variant-numeric: tabular-nums; color: var(--nm-faint); margin-right: auto; }

/* Display-format switch. Sits at the head of the payload toolbar because it
   changes what the pane below it *is*, unlike Wrap and Copy which act on
   whatever is already there. */
.nm-fmt { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; border: 1px solid var(--nm-line); background: var(--nm-sunken); flex-shrink: 0; }
.nm-fmt-btn {
  font-size: 10.5px; font-weight: 600; padding: 3px 8px; border: none; border-radius: 6px;
  background: transparent; color: var(--nm-muted); cursor: pointer;
  transition: background .14s ease, color .14s ease;
}
.nm-fmt-btn:hover:not(:disabled) { color: var(--nm-txt); }
.nm-fmt-btn.active { background: var(--nm-surface-2); color: var(--nm-accent); box-shadow: var(--nm-shadow-seg); }
/* Table stays visible while unavailable rather than disappearing — a control
   that comes and goes as you click between requests is harder to learn than
   one that is simply dim, and its tooltip explains why. */
.nm-fmt-btn:disabled { opacity: .35; cursor: not-allowed; }

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
  font-size: 11px; font-weight: 600; padding: 4px 11px; border-radius: 7px; border: 1px solid var(--nm-line);
  background: var(--nm-elev); color: var(--nm-txt); cursor: pointer;
  transition: background .14s ease, color .14s ease, border-color .14s ease;
}
.nm-copy:hover { background: var(--nm-elev-hover); }
.nm-toggle { color: var(--nm-muted); }
.nm-toggle.active { color: var(--nm-accent); border-color: var(--nm-accent); background: var(--nm-accent-soft); }
.nm-nowrap { white-space: pre !important; word-break: normal !important; }
.nm-json {
  margin: 0; flex: 1; overflow: auto; padding: 12px 14px; font-size: 12px; line-height: 1.6;
  font-family: var(--nm-mono); color: var(--nm-syn-txt); white-space: pre-wrap; word-break: break-word;
}
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
.nm-tree-more { color: var(--nm-accent); cursor: pointer; padding: 2px 0; font-size: 11px; }
.nm-tree-more:hover { text-decoration: underline; }
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
  gap: 3px; height: 100%; padding: 28px 18px; text-align: center; color: var(--nm-faint);
}
.nm-empty-list { height: auto; padding-top: 48px; }
.nm-tbody > .nm-empty-list { min-height: 100%; }
.nm-empty-ico {
  display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px;
  border-radius: 14px; background: var(--nm-elev); color: var(--nm-muted); margin-bottom: 8px;
}
/* Tinted per-section, so even an empty list reads as "the right kind of
   empty" rather than a generic placeholder. */
.nm-empty-ico-network { color: var(--nm-c-network); background: var(--nm-c-network-soft); }
.nm-empty-ico-realtime { color: var(--nm-c-realtime); background: var(--nm-c-realtime-soft); }
.nm-empty-ico-redux { color: var(--nm-c-redux); background: var(--nm-c-redux-soft); }
.nm-empty-ico-query { color: var(--nm-c-query); background: var(--nm-c-query-soft); }
.nm-empty-title { margin: 0; font-size: 13px; font-weight: 700; color: var(--nm-muted); }
.nm-empty-sub { margin: 0; font-size: 11.5px; color: var(--nm-faint); max-width: 260px; }

.nm-pulse { animation: nm-pulse 1.1s ease-in-out infinite; }
@keyframes nm-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

.nm-scroll, .nm-tbody, .nm-headers, .nm-tree, .nm-json, .nm-frames, .nm-timing, .nm-sheet {
  overscroll-behavior: contain;
}
/* Firefox has no ::-webkit-scrollbar; these two properties are all it offers,
   and without them its scrollbars ignore the theme entirely. */
.nm-scroll { scrollbar-width: thin; scrollbar-color: var(--nm-scroll-thumb) transparent; }
.nm-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.nm-scroll::-webkit-scrollbar-thumb { background: var(--nm-scroll-thumb); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
.nm-scroll::-webkit-scrollbar-thumb:hover { background: var(--nm-scroll-thumb-hover); background-clip: content-box; }
.nm-scroll::-webkit-scrollbar-track { background: transparent; }

.nm-fab:focus-visible, .nm-iconbtn:focus-visible, .nm-seg-btn:focus-visible,
.nm-tab:focus-visible, .nm-copy:focus-visible, .nm-search-clear:focus-visible,
.nm-dockbtn:focus-visible, .nm-menu-item:focus-visible, .nm-section:focus-visible {
  outline: 2px solid var(--nm-accent); outline-offset: 2px;
}
.nm-trow:focus-visible { outline: 2px solid var(--nm-accent); outline-offset: -2px; }

@media (prefers-reduced-motion: reduce) {
  .nm-panel, .nm-panel.nm-anim, .nm-fab, .nm-fab-dock, .nm-fab-ping, .nm-zone,
  .nm-drag-scrim, .nm-pulse, .nm-wf-live, .nm-menu, .nm-restoring {
    animation: none !important; transition: none !important;
  }
}
`;

/* ── Section tabs, status bar, density, resizable columns ─────────────── */
const LAYOUT = `
/* Top-level sections: HTTP, realtime, Redux, Query each have their own
   columns and their own notion of a "row", so they are separate views rather
   than one mixed table with half the cells empty. Each carries its own icon
   and identity colour (applied only to the active state, so the inactive row
   stays quiet and the active one is unambiguous). */
.nm-sections { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--nm-line); background: var(--nm-sunken); flex-shrink: 0; }
.nm-section {
  display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600;
  padding: 4px 11px 4px 8px; border: none; border-radius: 7px; background: transparent;
  color: var(--nm-muted); cursor: pointer; transition: background .14s ease, color .14s ease;
}
.nm-section-ico { display: inline-flex; opacity: .8; transition: opacity .14s ease; }
.nm-section:hover { color: var(--nm-txt); }
.nm-section:hover .nm-section-ico { opacity: 1; }
.nm-section.active { background: var(--nm-surface); color: var(--nm-txt); box-shadow: var(--nm-shadow-seg); }
.nm-section.active .nm-section-ico { opacity: 1; }
.nm-section-n { font-size: 10px; font-weight: 800; padding: 0 5px; border-radius: 999px; background: var(--nm-elev); color: var(--nm-faint); font-variant-numeric: tabular-nums; }
.nm-section-live { width: 6px; height: 6px; border-radius: 999px; background: var(--nm-success); box-shadow: 0 0 0 3px var(--nm-success-soft); }

/* Per-section identity — icon, count badge and active text all pick up the
   section's colour once it's the active tab. */
.nm-section-network.active { color: var(--nm-c-network); }
.nm-section-network.active .nm-section-ico { color: var(--nm-c-network); }
.nm-section-network.active .nm-section-n { color: var(--nm-c-network); background: var(--nm-c-network-soft); }
.nm-section-realtime.active { color: var(--nm-c-realtime); }
.nm-section-realtime.active .nm-section-ico { color: var(--nm-c-realtime); }
.nm-section-realtime.active .nm-section-n { color: var(--nm-c-realtime); background: var(--nm-c-realtime-soft); }
.nm-section-redux.active { color: var(--nm-c-redux); }
.nm-section-redux.active .nm-section-ico { color: var(--nm-c-redux); }
.nm-section-redux.active .nm-section-n { color: var(--nm-c-redux); background: var(--nm-c-redux-soft); }
.nm-section-query.active { color: var(--nm-c-query); }
.nm-section-query.active .nm-section-ico { color: var(--nm-c-query); }
.nm-section-query.active .nm-section-n { color: var(--nm-c-query); background: var(--nm-c-query-soft); }

/* Status bar — Chrome puts the totals at the bottom, and so do we. */
.nm-statusbar {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0; min-width: 0; overflow: hidden;
  padding: 5px 12px; border-top: 1px solid var(--nm-line);
  background: var(--nm-surface-2); font-size: 10.5px; color: var(--nm-faint);
  font-variant-numeric: tabular-nums;
}
.nm-statusbar b { font-weight: 700; color: var(--nm-muted); }
.nm-statusbar-spacer { flex: 1; }
.nm-statusbar-err { color: var(--nm-error); font-weight: 700; }
.nm-statusbar-btn {
  border: none; background: transparent; color: var(--nm-faint); cursor: pointer;
  font-size: 10.5px; font-weight: 600; padding: 1px 6px; border-radius: 5px;
  transition: background .12s ease, color .12s ease;
}
.nm-statusbar-btn:hover { color: var(--nm-txt); background: var(--nm-elev); }
.nm-statusbar-pin { display: inline-flex; align-items: center; gap: 4px; }
/* Armed for a destructive second click — the only thing in the status bar
   allowed to shout. */
.nm-statusbar-armed { color: var(--nm-error); font-weight: 700; }
.nm-statusbar-armed:hover { color: var(--nm-error); background: var(--nm-error-soft); }

/* Active-filter chips. */
.nm-chips { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.nm-chip {
  display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700;
  padding: 1px 4px 1px 7px; border-radius: 999px;
  color: var(--nm-accent); background: var(--nm-accent-soft);
  border: 1px solid var(--nm-accent-line); font-family: var(--nm-mono);
}
.nm-chip-x { border: none; background: transparent; color: inherit; cursor: pointer; padding: 0 2px; opacity: .65; font-size: 11px; line-height: 1; }
.nm-chip-x:hover { opacity: 1; }

/* Filter syntax hint row, shown while the search box is focused. */
.nm-hints { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding: 5px 12px; border-bottom: 1px solid var(--nm-line); background: var(--nm-bg); }
.nm-hint {
  font-size: 10px; font-family: var(--nm-mono); padding: 1px 6px; border-radius: 5px;
  border: 1px solid var(--nm-line); background: var(--nm-elev); color: var(--nm-muted); cursor: pointer;
  transition: color .12s ease, border-color .12s ease;
}
.nm-hint:hover { color: var(--nm-txt); border-color: var(--nm-line-strong); }
.nm-hint span { color: var(--nm-faint); margin-left: 4px; }

/* Density — one variable drives both the CSS and the virtualizer arithmetic. */
.nm-trow, .nm-load-divider { height: var(--nm-row-h); }
.nm-density-compact { font-size: 11px; }
.nm-density-comfy .nm-trow { font-size: 12px; }

/* Column resize handles live in the header. */
.nm-th { position: relative; display: flex; align-items: center; gap: 3px; overflow: hidden; }
.nm-th-grip {
  position: absolute; right: -3px; top: 0; bottom: 0; width: 7px; cursor: col-resize;
  touch-action: none; z-index: 2;
}
.nm-th-grip::after {
  content: ""; position: absolute; left: 3px; top: 4px; bottom: 4px; width: 1px;
  background: var(--nm-line-strong); opacity: 0; transition: opacity .14s ease;
}
.nm-th-grip:hover::after, .nm-th-grip:active::after { opacity: 1; background: var(--nm-accent); }

/* Pin affordance. */
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
.nm-timing { flex: 1; min-height: 0; overflow: auto; padding: 14px; }
.nm-timing-bar { display: flex; height: 22px; border-radius: 6px; overflow: hidden; background: var(--nm-elev); margin-bottom: 12px; }
.nm-timing-seg { height: 100%; transition: width .2s ease; }
.nm-timing-legend { display: flex; flex-direction: column; gap: 6px; }
.nm-timing-row { display: grid; grid-template-columns: 12px minmax(90px, 140px) 1fr auto; gap: 9px; align-items: center; font-size: 11.5px; }
.nm-timing-swatch { width: 10px; height: 10px; border-radius: 3px; }
.nm-timing-label { color: var(--nm-muted); }
.nm-timing-note { color: var(--nm-faint); font-size: 10.5px; }
.nm-timing-value { color: var(--nm-txt); font-variant-numeric: tabular-nums; font-weight: 600; }

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
.nm-kbd {
  display: inline-block; min-width: 20px; text-align: center; font-family: var(--nm-mono);
  font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 5px;
  border: 1px solid var(--nm-line-strong); background: var(--nm-elev); color: var(--nm-txt);
  box-shadow: 0 1px 0 var(--nm-line-strong);
}
.nm-sheet-desc { font-size: 11.5px; color: var(--nm-muted); }
.nm-sheet-wide { grid-column: 1 / -1; line-height: 1.5; }
/* Icons default to display:block so they never pick up line-box descenders;
   inside a sentence they need the opposite. */
.nm-inline-ico { display: inline-flex; vertical-align: -1px; color: var(--nm-txt); }
.nm-sheet-close { position: absolute; top: 12px; right: 12px; }
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
  /* Section tabs keep their counts but lose some padding first. */
  .nm-section { padding: 4px 8px; }
  .nm-search-wrap { max-width: 260px; }
}

@container nm (max-width: 760px) {
  /* Filter segments collapse to a coloured dot plus its count; the label is
     redundant once you know the colours, and the counts are the useful part. */
  .nm-seg-label { display: none; }
  .nm-seg-btn { padding: 4px 7px; gap: 4px; }
  .nm-hints { display: none; }
  .nm-detail-head { gap: 6px; padding: 8px 10px; }
  .nm-tab { padding: 5px 9px; font-size: 11px; }
}

@container nm (max-width: 640px) {
  .nm-header { gap: 7px; padding: 8px 9px; }
  .nm-section-label { display: none; }
  .nm-section { padding: 5px; }
  .nm-search-wrap { max-width: none; }
  .nm-chips { display: none; }
  /* Key/value rows stack rather than squeezing the value into a sliver. */
  .nm-kv-row { grid-template-columns: 1fr; gap: 1px; padding: 5px 0; }
  .nm-kv-k { font-size: 10.5px; }
  /* Frame rows drop the size column. */
  .nm-frame { grid-template-columns: 58px 1fr; gap: 6px; row-gap: 0; }
  .nm-frame-time, .nm-frame-size { display: none; }
  /* The timing legend loses its explanatory note column. */
  .nm-timing-row { grid-template-columns: 12px 1fr auto; }
  .nm-timing-note { display: none; }
}

@container nm (max-width: 520px) {
  .nm-brand { display: none; }
  .nm-statusbar { gap: 7px; font-size: 10px; }
  .nm-detail-url { font-size: 11px; }
  .nm-tabs { padding: 6px 8px; }
  .nm-htable { padding: 4px 10px 0; }
  .nm-tree { font-size: 11px; }
}

/* Very short panels: give the list and detail a usable minimum each and let the
   toolbar shrink rather than eating the whole panel. */
@container nm (max-height: 340px) {
  .nm-filters { display: none; }
  .nm-statusbar { display: none; }
}

/* Stacked layout — the list sits above the detail. Applied by JS whenever the
   panel is too narrow for a side-by-side split to give both panes their
   minimum, regardless of dock mode. */
.nm-body.nm-body-v { flex-direction: column; }
.nm-body.nm-body-v > .nm-list { width: auto !important; max-width: none; }
.nm-body.nm-body-v > .nm-detail { min-height: 0; }

/* Status bar items hide in priority order as space runs out. */
@container nm (max-width: 820px) { .nm-status-transferred { display: none; } }
@container nm (max-width: 700px) { .nm-status-slowest { display: none; } }
@container nm (max-width: 600px) { .nm-status-inflight { display: none; } }
@container nm (max-width: 480px) { .nm-status-persisted { display: none; } }

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
  FILTERS,
  TABLE,
  DETAIL,
  VIEWERS,
  MENU,
  LAYOUT,
  MISC,
  RESPONSIVE,
].join("\n");
