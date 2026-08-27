"use client";

/**
 * Dev Tools — the header bar.
 *
 * One 38px row for everything that is true of the *session* rather than of one
 * entry: whether capture is running, what is being filtered out, and where the
 * panel lives. Which of the four sources you are reading moved to the rail —
 * that is navigation, and as four tabs here it competed with the filter field
 * for width on every dock.
 *
 * The two things a developer glances at mid-debug get words rather than
 * glyphs: capture state ("Capturing" / "Paused") and preserve-log. Everything
 * else is a quiet pill, and the ones that open a menu report their position
 * upward instead of rendering it — a `position: fixed` menu nested here would
 * resolve its offsets against the viewport, not the button.
 */

import type { DockMode, MonitorState } from "../../capture/monitorTypes";
import { useRef } from "react";
import { Icon } from "./Icon";
import type { MenuAnchor } from "./Menu";

export interface ToolbarProps {
  /** Worst state currently in the buffer — colours the brand dot. */
  dotState: MonitorState;
  query: string;
  onQuery: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** Parsed filter tokens, shown as removable chips inside the field. */
  chips: string[];
  onRemoveChip: (index: number) => void;
  deepSearch: boolean;
  onDeepSearch: (value: boolean) => void;
  searching: boolean;
  paused: boolean;
  onTogglePause: () => void;
  preserveLog: boolean;
  onTogglePreserve: () => void;
  /** Opens the export menu anchored under the button, or closes it (null). */
  onExportMenu: (anchor: MenuAnchor | null) => void;
  exportOpen: boolean;
  exportDisabled: boolean;
  /** Same anchoring contract as the export menu. */
  onThemeMenu: (anchor: MenuAnchor | null) => void;
  themeOpen: boolean;
  themeLabel: string;
  onMoreMenu: (anchor: MenuAnchor | null) => void;
  moreOpen: boolean;
  onOpenPalette: () => void;
  /** Labelled pills lose their labels, then the whole button. */
  compact: boolean;
  /** Even the dock switcher moves into the overflow menu. */
  tiny: boolean;
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

export function MonitorToolbar(props: ToolbarProps) {
  const {
    dotState,
    query,
    onQuery,
    searchRef,
    chips,
    onRemoveChip,
    deepSearch,
    onDeepSearch,
    searching,
    paused,
    onTogglePause,
    preserveLog,
    onTogglePreserve,
    onExportMenu,
    exportOpen,
    exportDisabled,
    onThemeMenu,
    themeOpen,
    themeLabel,
    onMoreMenu,
    moreOpen,
    onOpenPalette,
    compact,
    tiny,
    mode,
    onMode,
    maximized,
    onToggleMaximize,
    onClose,
    onPointerDown,
  } = props;

  const exportBtnRef = useRef<HTMLButtonElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const themeBtnRef = useRef<HTMLButtonElement | null>(null);

  /** Menus are rendered by the panel root from a measured viewport rect. Both
   * vertical edges are reported so a tall menu can flip above the button when
   * there is more room there; see `MenuAnchor`. */
  const anchorOf = (el: HTMLElement | null): MenuAnchor | null => {
    const rect = el?.getBoundingClientRect();
    return rect
      ? {
          top: rect.bottom + 6,
          bottom: window.innerHeight - rect.top + 6,
          right: Math.max(8, window.innerWidth - rect.right),
        }
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

      {/* The wordmark earns its space by making the dot legible: on its own the
          dot is an unexplained coloured square, next to the name it reads as
          the tool's status light. Both are dropped first when space runs out. */}
      <span className="nm-brand">
        <span className="nm-logo" data-state={dotState} />
        <span className="nm-title">BLIX</span>
      </span>

      <span className="nm-hsep" />

      <button
        className="nm-capture"
        data-state={paused ? "pending" : "success"}
        onClick={onTogglePause}
        aria-pressed={paused}
        title={paused ? "Resume capturing (Space)" : "Pause capturing (Space)"}
      >
        {paused ? "Paused" : "Capturing"}
      </button>

      {/* The filter field. Parsed tokens become chips inside the box, so what
          has already been applied and what you are still typing occupy one
          control rather than a field plus a separate strip of chips. */}
      <div
        className={`nm-filter${searching ? " nm-filter-on" : ""}`}
        // The field is inside the drag handle; a press that lands on it must
        // put the caret in the input, not start moving the panel.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="nm-filter-ico" aria-hidden>
          <Icon name="search" size={13} />
        </span>
        {chips.length > 0 && (
          <div className="nm-filter-tokens">
            {chips.map((chip, i) => (
              <span className="nm-token" key={`${chip}-${i}`}>
                {chip}
                <button
                  className="nm-token-x"
                  onClick={() => onRemoveChip(i)}
                  aria-label={`Remove filter ${chip}`}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          ref={searchRef}
          className="nm-filter-input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          spellCheck={false}
          aria-label="Filter"
          placeholder={
            chips.length
              ? "and…"
              : deepSearch
                ? "Filter — try status:5xx or slower-than:500"
                : "Filter — try method:post or is:error"
          }
        />
        <button
          className={`nm-filter-re${deepSearch ? " active" : ""}`}
          onClick={() => onDeepSearch(!deepSearch)}
          aria-label="Deep search — also scan request and response bodies"
          aria-pressed={deepSearch}
          title="Deep search — also scan request/response bodies"
        >
          {".*"}
        </button>
        <kbd
          className="nm-kbd"
          onClick={onOpenPalette}
          title="Command palette"
          style={{ cursor: "pointer" }}
        >
          ⌘K
        </kbd>
      </div>

      <div className="nm-actions">
        <button
          className={`nm-pill${preserveLog ? " nm-pill-warn" : ""}`}
          onClick={onTogglePreserve}
          aria-pressed={preserveLog}
          title={
            preserveLog
              ? "Preserve log is on — captured traffic survives a reload (Shift+L)"
              : "Preserve log — keep captured traffic across reloads (Shift+L)"
          }
        >
          <Icon name="preserve" size={13} />
          {!compact && "Preserve"}
        </button>

        <button
          ref={exportBtnRef}
          className={`nm-pill${exportOpen ? " nm-pill-on" : ""}`}
          onClick={() => onExportMenu(exportOpen ? null : anchorOf(exportBtnRef.current))}
          disabled={exportDisabled}
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          title="Export the captured log"
        >
          <Icon name="download" size={13} />
          {!compact && (
            <>
              Export<span className="nm-pill-caret">▾</span>
            </>
          )}
        </button>

        {/* Theme names itself. It is the one appearance control with no other
            way in, and knowing which of twelve palettes is on is half of
            deciding whether to change it. */}
        <button
          ref={themeBtnRef}
          className={`nm-pill${themeOpen ? " nm-pill-on" : ""}`}
          onClick={() => onThemeMenu(themeOpen ? null : anchorOf(themeBtnRef.current))}
          aria-haspopup="menu"
          aria-expanded={themeOpen}
          title={`Theme — ${themeLabel}`}
        >
          <Icon name="theme" size={13} />
          {!compact && (
            <>
              {themeLabel}
              <span className="nm-pill-caret">▾</span>
            </>
          )}
        </button>

        <button
          ref={moreBtnRef}
          className={`nm-pill nm-pill-sq${moreOpen ? " nm-pill-on" : ""}`}
          onClick={() => onMoreMenu(moreOpen ? null : anchorOf(moreBtnRef.current))}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          title="More actions"
        >
          <Icon name="more" size={13} />
        </button>

        {!tiny && (
          <>
            <span className="nm-hsep" style={{ margin: "0 3px" }} />
            <div className="nm-dockseg">
              {DOCKS.map((d) => (
                <button
                  key={d.mode}
                  className={`nm-dockbtn${mode === d.mode ? " active" : ""}`}
                  onClick={() => onMode(d.mode)}
                  aria-label={d.title}
                  aria-pressed={mode === d.mode}
                  title={d.title}
                >
                  <Icon name={d.icon} size={13} />
                </button>
              ))}
            </div>
          </>
        )}

        {!compact && mode === "float" && (
          <button
            className="nm-pill nm-pill-sq"
            onClick={onToggleMaximize}
            aria-label={maximized ? "Restore" : "Maximize"}
            title={maximized ? "Restore" : "Maximize"}
          >
            <Icon name={maximized ? "restore" : "maximize"} size={13} />
          </button>
        )}

        <button
          className="nm-pill nm-pill-sq nm-pill-close"
          onClick={onClose}
          aria-label="Close the panel"
          title="Close (Esc)"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}
