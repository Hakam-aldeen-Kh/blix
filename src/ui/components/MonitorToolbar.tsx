"use client";

/**
 * Dev Tools — the header bar.
 *
 * One row for everything that is true of the *session* rather than of one
 * entry: whether capture is running, what is being filtered out, and where the
 * panel lives. Which of the four sources you are reading is navigation and
 * lives in the sidebar; as four tabs here it competed with the filter for
 * width on every dock.
 *
 * **Capture and preserve are state, not buttons.** Both silently change what
 * happens to the log, so both read as *on* — a dot or an icon, a word, and the
 * state's colour — rather than as something you might press by accident.
 *
 * **Export and Appearance lose their labels.** An icon either replaces a label
 * or is not there; a glyph beside a word is two things saying one thing. Both
 * are named in the overflow menu and in the command palette, which is where
 * you go when you do not already know the glyph.
 *
 * **Clear beside Export empties the current source only.** Clearing every
 * source stays in the overflow menu and on ⇧C; the header button is scoped so
 * a mis-click costs one source's log, never all four.
 */

import type { DockMode } from "../../capture/monitorTypes";
import { useRef } from "react";
import { PALETTE_KEY } from "../constants/ui";
import { BlixMark } from "./BlixMark";
import { BlixWordmark } from "./BlixWordmark";
import { Icon } from "./Icon";
import type { MenuAnchor } from "./Menu";

export interface ToolbarProps {
  query: string;
  onQuery: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  deepSearch: boolean;
  onDeepSearch: (value: boolean) => void;
  /** `8 of 56`, shown inside the field so a live filter never needs the
   * status bar to be noticed. */
  shown: number;
  total: number;
  paused: boolean;
  onTogglePause: () => void;
  preserveLog: boolean;
  onTogglePreserve: () => void;
  onExportMenu: (anchor: MenuAnchor | null) => void;
  exportOpen: boolean;
  exportDisabled: boolean;
  /** Empties the source being read, and only that one. */
  onClearSection: () => void;
  clearDisabled: boolean;
  /** "Network", "Redux"… — named in the tooltip so it is clear which log
   * the button empties. */
  sectionLabel: string;
  onThemeMenu: (anchor: MenuAnchor | null) => void;
  themeOpen: boolean;
  themeLabel: string;
  onMoreMenu: (anchor: MenuAnchor | null) => void;
  moreOpen: boolean;
  onOpenPalette: () => void;
  compact: boolean;
  tiny: boolean;
  mode: DockMode;
  /** Requests in flight — the mark's REC dot pulses. */
  live: boolean;
  onMode: (mode: DockMode) => void;
  maximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
}

const DOCKS: {
  mode: DockMode;
  icon: "dock-bottom" | "dock-right" | "dock-top" | "dock-left" | "dock-float";
  title: string;
}[] = [
  { mode: "bottom", icon: "dock-bottom", title: "Dock to the bottom" },
  { mode: "right", icon: "dock-right", title: "Dock to the right" },
  { mode: "top", icon: "dock-top", title: "Dock to the top" },
  { mode: "left", icon: "dock-left", title: "Dock to the left" },
  { mode: "float", icon: "dock-float", title: "Float the panel" },
];

export function MonitorToolbar(props: ToolbarProps) {
  const {
    query,
    onQuery,
    searchRef,
    deepSearch,
    onDeepSearch,
    shown,
    total,
    paused,
    onTogglePause,
    preserveLog,
    onTogglePreserve,
    onExportMenu,
    exportOpen,
    exportDisabled,
    onClearSection,
    clearDisabled,
    sectionLabel,
    onThemeMenu,
    themeOpen,
    themeLabel,
    onMoreMenu,
    moreOpen,
    onOpenPalette,
    compact,
    tiny,
    mode,
    live,
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

  const closeButton = (
    <button
      type="button"
      className="nm-ibtn"
      onClick={onClose}
      aria-label="Close the panel"
      title="Close (Esc)"
    >
      <Icon name="close" size={13} />
    </button>
  );

  return (
    <div
      className={`nm-header${mode === "float" && !maximized ? " nm-draggable" : ""}`}
      onPointerDown={onPointerDown}
    >
      {mode === "float" && !maximized && (
        <button type="button" className="nm-grip" aria-label="Move panel">
          <Icon name="grip" size={12} />
        </button>
      )}

      {/* The full-colour mark: green blade on the edge the panel is docked to,
          the REC dot while capture runs. The chip beside it still says which
          in words. The blades open once when the panel mounts — a dock change
          re-renders without remounting, so it cuts, as a state change should. */}
      <span className="nm-title">
        <BlixMark size={14} dock={mode} capture={paused ? "paused" : "on"} live={live} />
        <BlixWordmark height={10} title="blix" />
      </span>

      <button
        type="button"
        className="nm-chip nm-capture"
        data-on={!paused || undefined}
        onClick={onTogglePause}
        aria-pressed={paused}
        title={paused ? "Resume capturing (Space)" : "Pause capturing (Space)"}
      >
        <span className="nm-chip-dot" />
        <span>{paused ? "paused" : "recording"}</span>
      </button>

      {/* The field is inside the drag handle; a press that lands on it must put
          the caret in the input, not start moving the panel. */}
      <div className="nm-filter" onPointerDown={(e) => e.stopPropagation()}>
        <span className="nm-filter-ico" aria-hidden>
          <Icon name="search" size={11} />
        </span>
        <input
          ref={searchRef}
          className="nm-filter-input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          spellCheck={false}
          aria-label="Filter requests"
          placeholder="method:post   is:error   url:tickets   -status:2xx"
        />
        {/* Whenever a filter is applied — not only while the deferred query
            is catching up to the typing, which is a frame or two. */}
        {query.trim() !== "" && (
          <>
            <span className="nm-filter-count">
              {shown} of {total}
            </span>
            <button
              type="button"
              className="nm-filter-x"
              onClick={() => onQuery("")}
              aria-label="Clear the filter"
              title="Clear"
            >
              ×
            </button>
          </>
        )}
        <button
          type="button"
          className={`nm-filter-re${deepSearch ? " active" : ""}`}
          onClick={() => onDeepSearch(!deepSearch)}
          aria-label="Search bodies too"
          aria-pressed={deepSearch}
          title="Deep search — also scan request/response bodies"
        >
          {".*"}
        </button>
        <button type="button" className="nm-kbd" onClick={onOpenPalette} title="Command palette">
          {PALETTE_KEY}
        </button>
      </div>

      <button
        type="button"
        className="nm-chip nm-preserve"
        data-on={preserveLog || undefined}
        onClick={onTogglePreserve}
        aria-pressed={preserveLog}
        title={
          preserveLog
            ? "Preserve log is on — captured traffic survives a reload (Shift+L)"
            : "Preserve log — keep captured traffic across reloads (Shift+L)"
        }
      >
        <span className="nm-chip-ico" aria-hidden>
          <Icon name="preserve" size={10} />
        </span>
        <span>{preserveLog ? "preserving" : "preserve"}</span>
      </button>

      <div className="nm-actions">
        <button
          type="button"
          ref={exportBtnRef}
          className="nm-ibtn"
          onClick={() => onExportMenu(exportOpen ? null : anchorOf(exportBtnRef.current))}
          disabled={exportDisabled}
          aria-label="Export the log"
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          title="Export the log"
        >
          <Icon name="download" size={13} />
        </button>
        <button
          type="button"
          className="nm-ibtn nm-ibtn-danger"
          onClick={onClearSection}
          disabled={clearDisabled}
          aria-label={`Clear the ${sectionLabel} log`}
          title={`Clear the ${sectionLabel} log — other sources and pinned entries are kept`}
        >
          <Icon name="clear" size={13} />
        </button>
        <button
          type="button"
          ref={themeBtnRef}
          className="nm-ibtn"
          onClick={() => onThemeMenu(themeOpen ? null : anchorOf(themeBtnRef.current))}
          aria-label={`Appearance — ${themeLabel}`}
          aria-haspopup="menu"
          aria-expanded={themeOpen}
          title={`Appearance — ${themeLabel}`}
        >
          <Icon name="theme" size={13} />
        </button>
        <button
          type="button"
          ref={moreBtnRef}
          className="nm-ibtn"
          onClick={() => onMoreMenu(moreOpen ? null : anchorOf(moreBtnRef.current))}
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          title="More options"
        >
          <Icon name="more" size={13} />
        </button>
      </div>

      {!tiny && (
        <>
          <span className="nm-hsep" />
          <div className="nm-actions">
            {DOCKS.map((d) => (
              <button
                type="button"
                key={d.mode}
                className={`nm-ibtn nm-ibtn-quiet${mode === d.mode ? " active" : ""}`}
                onClick={() => onMode(d.mode)}
                aria-label={d.title}
                aria-pressed={mode === d.mode}
                title={d.title}
              >
                <Icon name={d.icon} size={13} />
              </button>
            ))}
            {!compact && mode === "float" && (
              <button
                type="button"
                className="nm-ibtn nm-ibtn-quiet"
                onClick={onToggleMaximize}
                aria-label={maximized ? "Restore" : "Maximize"}
                title={maximized ? "Restore" : "Maximize"}
              >
                <Icon name={maximized ? "restore" : "maximize"} size={13} />
              </button>
            )}
            {closeButton}
          </div>
        </>
      )}

      {/* The dock switcher can move into the overflow menu when the panel is
          narrow; the way out cannot. A docked panel no longer closes on a
          press outside it, so below 620px — which is every side dock at its
          default width — this button is the only thing a pointer can close
          the panel with. */}
      {tiny && <div className="nm-actions">{closeButton}</div>}
    </div>
  );
}
