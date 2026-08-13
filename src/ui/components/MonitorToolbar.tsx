"use client";

/** Dev Tools — header bar: section tabs, search, capture controls, dock
 * switcher, window controls. Doubles as the drag handle in float mode. */

import type { DockMode } from "../../capture/monitorTypes";
import { useRef } from "react";
import type { Density } from "../constants/ui";
import type { Section } from "../types/monitorUi";
import { Icon, type IconName } from "./Icon";

/** Top-level sections, in display/hotkey order. Each gets its own icon and
 * (via the `nm-section-{id}` class) its own accent colour — see `--nm-c-*` in
 * `styles/monitorStyles.ts` — so which world you're in reads at a glance
 * without having to read the label. */
export const SECTION_DEFS: {
  id: Section;
  label: string;
  hotkey: "1" | "2" | "3" | "4";
  title: string;
  icon: IconName;
}[] = [
  { id: "network", label: "Network", hotkey: "1", title: "HTTP requests (1)", icon: "network" },
  { id: "realtime", label: "Realtime", hotkey: "2", title: "WebSocket / ActionCable connections (2)", icon: "bolt" },
  { id: "redux", label: "Redux", hotkey: "3", title: "Redux actions (3)", icon: "stack" },
  { id: "query", label: "Query", hotkey: "4", title: "TanStack Query cache activity (4)", icon: "database" },
];

export interface ToolbarProps {
  dotColor: string;
  section: Section;
  onSection: (section: Section) => void;
  /** Row count per section, for the tab badges. */
  counts: Record<Section, number>;
  /** Which sections show a "something is live" dot — an open socket, or a
   * query currently fetching. */
  live: Partial<Record<Section, boolean>>;
  query: string;
  onQuery: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onSearchFocus: (focused: boolean) => void;
  deepSearch: boolean;
  onDeepSearch: (value: boolean) => void;
  searching: boolean;
  paused: boolean;
  onTogglePause: () => void;
  preserveLog: boolean;
  onTogglePreserve: () => void;
  following: boolean;
  onToggleFollow: () => void;
  /** Opens the export menu anchored under the button, or closes it (null).
   * The menu itself is rendered by the panel root — a `position: fixed` menu
   * nested in the toolbar would resolve its offsets against the viewport, not
   * the button, and fly to the corner of the screen. */
  onExportMenu: (anchor: { top: number; right: number } | null) => void;
  exportOpen: boolean;
  exportDisabled: boolean;
  /** Secondary actions move into an overflow menu when the panel is narrow. */
  compact: boolean;
  /** Even the dock switcher moves there. */
  tiny: boolean;
  onMoreMenu: (anchor: { top: number; right: number } | null) => void;
  moreOpen: boolean;
  onClear: () => void;
  density: Density;
  onDensity: (density: Density) => void;
  mode: DockMode;
  onMode: (mode: DockMode) => void;
  maximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
}

const DOCKS: {
  mode: DockMode;
  icon: "dock-bottom" | "dock-right" | "dock-float";
  title: string;
}[] = [
  { mode: "bottom", icon: "dock-bottom", title: "Dock to bottom" },
  { mode: "right", icon: "dock-right", title: "Dock to right" },
  { mode: "float", icon: "dock-float", title: "Undock (floating window)" },
];

const DENSITIES: Density[] = ["compact", "normal", "comfy"];

export function MonitorToolbar(props: ToolbarProps) {
  const {
    dotColor,
    section,
    onSection,
    counts,
    live,
    query,
    onQuery,
    searchRef,
    onSearchFocus,
    deepSearch,
    onDeepSearch,
    searching,
    paused,
    onTogglePause,
    preserveLog,
    onTogglePreserve,
    following,
    onToggleFollow,
    onExportMenu,
    exportOpen,
    exportDisabled,
    compact,
    tiny,
    onMoreMenu,
    moreOpen,
    onClear,
    density,
    onDensity,
    mode,
    onMode,
    maximized,
    onToggleMaximize,
    onClose,
    onPointerDown,
  } = props;

  const exportBtnRef = useRef<HTMLButtonElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);

  /** Menus are rendered by the panel root from a measured viewport rect — a
   * `position: fixed` menu nested here would resolve against the viewport. */
  const anchorOf = (el: HTMLElement | null) => {
    const rect = el?.getBoundingClientRect();
    return rect
      ? { top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) }
      : null;
  };

  return (
    <div
      className={`nm-header${mode === "float" && !maximized ? " nm-draggable" : ""}`}
      onPointerDown={onPointerDown}
    >
      {mode === "float" && !maximized && (
        <span className="nm-grip" title="Drag to move">
          <Icon name="grip" size={14} />
        </span>
      )}

      <span className="nm-brand">
        <span
          className="nm-logo"
          style={{ background: dotColor, boxShadow: `0 0 12px ${dotColor}99` }}
        />
      </span>

      {/* Top-level sections — each kind of traffic is a separate view, not
          one mixed table with half the columns empty. */}
      <div className="nm-sections" role="tablist">
        {SECTION_DEFS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            className={`nm-section nm-section-${s.id}${section === s.id ? " active" : ""}`}
            onClick={() => onSection(s.id)}
            title={s.title}
          >
            <span className="nm-section-ico">
              <Icon name={s.icon} size={12.5} />
            </span>
            {live[s.id] && <span className="nm-section-live" />}
            <span className="nm-section-label">{s.label}</span>
            <span className="nm-section-n">{counts[s.id]}</span>
          </button>
        ))}
      </div>

      <div className="nm-search-wrap">
        <span className="nm-search-ico" aria-hidden>
          <Icon name="search" size={14} />
        </span>
        <input
          ref={searchRef}
          className={`nm-search${searching ? " nm-search-busy" : ""}`}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onFocus={() => onSearchFocus(true)}
          onBlur={() => onSearchFocus(false)}
          placeholder={
            deepSearch
              ? "Filter — try  -polling  status:5xx  slower-than:500"
              : "Filter — try  method:post  is:error  larger-than:10k"
          }
        />
        <button
          className={`nm-search-deep${deepSearch ? " active" : ""}`}
          onClick={() => onDeepSearch(!deepSearch)}
          title="Deep search — also scan request/response bodies"
        >
          {".*"}
        </button>
        {query && (
          <button
            className="nm-search-clear"
            onClick={() => onQuery("")}
            title="Clear filter"
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      <div className="nm-actions">
        <button
          className={`nm-iconbtn nm-iconbtn-sq${paused ? " nm-iconbtn-on" : ""}`}
          onClick={onTogglePause}
          title={paused ? "Resume capturing (Space)" : "Pause capturing (Space)"}
        >
          <Icon name={paused ? "play" : "pause"} size={14} />
        </button>
        {!compact && (
          <>
            <button
              className={`nm-iconbtn nm-iconbtn-sq${preserveLog ? " nm-iconbtn-on" : ""}`}
              onClick={onTogglePreserve}
              title={
                preserveLog
                  ? "Preserve log is on — captured traffic survives a reload (Shift+L)"
                  : "Preserve log — keep captured traffic across reloads (Shift+L)"
              }
            >
              <Icon name="preserve" size={14} />
            </button>
            <button
              className={`nm-iconbtn nm-iconbtn-sq${following ? " nm-iconbtn-on" : ""}`}
              onClick={onToggleFollow}
              title={
                following
                  ? "Following the newest request — click to pin the current one"
                  : "Follow the newest request"
              }
            >
              <Icon name="follow" size={14} />
            </button>
          </>
        )}

        {/* Export has two formats, so it opens a menu. The button only reports
            its position; the panel root renders the menu. */}
        {!compact && (
          <button
            ref={exportBtnRef}
            className={`nm-iconbtn nm-iconbtn-sq${exportOpen ? " nm-iconbtn-on" : ""}`}
            onClick={() =>
              onExportMenu(exportOpen ? null : anchorOf(exportBtnRef.current))
            }
            disabled={exportDisabled}
            title="Export the captured log"
          >
            <Icon name="download" size={14} />
          </button>
        )}

        <button
          className="nm-iconbtn nm-iconbtn-sq"
          onClick={onClear}
          title="Clear — pinned entries are kept (Shift+C)"
        >
          <Icon name="clear" size={14} />
        </button>

        {compact && (
          <button
            ref={moreBtnRef}
            className={`nm-iconbtn nm-iconbtn-sq${moreOpen ? " nm-iconbtn-on" : ""}`}
            onClick={() => onMoreMenu(moreOpen ? null : anchorOf(moreBtnRef.current))}
            title="More actions"
          >
            <Icon name="more" size={14} />
          </button>
        )}

        {!compact && <span className="nm-actions-sep" />}

        {!compact && (
          <button
            className="nm-iconbtn nm-iconbtn-sq"
            onClick={() =>
              onDensity(
                DENSITIES[(DENSITIES.indexOf(density) + 1) % DENSITIES.length],
              )
            }
            title={`Row density: ${density} — click to cycle`}
          >
            <Icon name="density" size={14} />
          </button>
        )}

        {!tiny && (
          <div className="nm-dockseg">
            {DOCKS.map((d) => (
              <button
                key={d.mode}
                className={`nm-dockbtn${mode === d.mode ? " active" : ""}`}
                onClick={() => onMode(d.mode)}
                title={d.title}
              >
                <Icon name={d.icon} size={13} />
              </button>
            ))}
          </div>
        )}

        {!compact && mode === "float" && (
          <button
            className="nm-iconbtn nm-iconbtn-sq"
            onClick={onToggleMaximize}
            title={maximized ? "Restore" : "Maximize"}
          >
            <Icon name={maximized ? "restore" : "maximize"} size={14} />
          </button>
        )}
        <button
          className="nm-iconbtn nm-iconbtn-sq nm-iconbtn-close"
          onClick={onClose}
          title="Close (Esc)"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
