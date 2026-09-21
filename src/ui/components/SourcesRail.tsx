"use client";

/**
 * Dev Tools — the sources sidebar.
 *
 * Four sources, four different tables. As tabs in the header they said "four
 * views of one thing" and fought the filter for width on every dock; as a
 * column they read as what they are — navigation.
 *
 * The sidebar also carries the session totals. Those were in the status bar,
 * where the width breakpoints dropped them first and nobody looked.
 *
 * Each source row ends with **its own number key**, right-aligned. The
 * shortcut is taught where it is used, not in a sheet you have to know to
 * open.
 */

import { formatBytes, formatDuration } from "../helpers/format";
import type { Section } from "../types/monitorUi";
import { Icon, type IconName } from "./Icon";

/** Top-level sources, in display and hotkey order. */
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

export interface SessionStats {
  captured: number;
  transferred: number;
  slowestMs: number;
  failing: number;
  persistedLabel: string | null;
}

export function SourcesRail({
  width,
  mini,
  section,
  counts,
  stats,
  onSection,
  onToggle,
  onOpenPalette,
}: {
  width: number;
  /** Icons only — either the developer collapsed it or the panel is too
   * narrow to afford the labels. */
  mini: boolean;
  section: Section;
  counts: Record<Section, number>;
  stats: SessionStats;
  onSection: (section: Section) => void;
  onToggle: () => void;
  onOpenPalette: () => void;
}) {
  /** label, value, tone. Slowest is always warm; Failing only once it is not
   * zero; On disk goes quiet at zero, because "0 B saved" is not news. */
  const rows: [string, string, string][] = [
    ["Captured", String(stats.captured), ""],
    ["Transferred", formatBytes(stats.transferred), ""],
    ["Slowest", stats.slowestMs > 0 ? formatDuration(stats.slowestMs) : "—", stats.slowestMs > 0 ? "nm-hot" : "nm-zero"],
    ["Failing", String(stats.failing), stats.failing > 0 ? "nm-bad" : "nm-zero"],
    ...(stats.persistedLabel
      ? ([["On disk", stats.persistedLabel, stats.persistedLabel === "0 B" ? "nm-zero" : ""]] as [
          string,
          string,
          string,
        ][])
      : []),
  ];

  return (
    <nav
      className={`nm-rail${mini ? " nm-rail-mini" : ""}`}
      style={{ width }}
      aria-label="Sources"
    >
      <div className="nm-rail-head">
        <span className="nm-rail-label">SOURCES</span>
        <button
          type="button"
          className="nm-rail-collapse"
          onClick={onToggle}
          aria-label={mini ? "Expand the sidebar" : "Collapse the sidebar"}
          aria-expanded={!mini}
          title={mini ? "Expand" : "Collapse"}
        >
          <Icon name="chevron" size={10} />
        </button>
      </div>

      <div className="nm-rail-list" role="tablist" aria-orientation="vertical">
        {SECTION_DEFS.map((s) => {
          const empty = counts[s.id] === 0;
          const active = section === s.id;
          return (
            <button
              type="button"
              key={s.id}
              role="tab"
              aria-selected={active}
              data-src={s.id}
              className={`nm-rail-item${active ? " active" : ""}${empty ? " nm-rail-empty" : ""}`}
              onClick={() => onSection(s.id)}
              title={`${s.title} — ${counts[s.id]}`}
            >
              <span className="nm-rail-ico">
                <Icon name={s.icon} size={12} />
              </span>
              <span className="nm-rail-name">{s.label}</span>
              <span className="nm-rail-n">{counts[s.id]}</span>
              <span className="nm-rail-key">{s.hotkey}</span>
            </button>
          );
        })}
      </div>

      <div className="nm-rail-stats">
        <div className="nm-rail-stats-head">SESSION</div>
        {rows.map(([k, v, tone]) => (
          <div className="nm-rail-stat" key={k}>
            <span className="nm-rail-stat-k">{k}</span>
            <span className={`nm-rail-stat-v ${tone}`}>{v}</span>
          </div>
        ))}
      </div>

      <div className="nm-rail-spacer" />

      {/* Collapsed, the label and the shortcut both go — so the button needs a
          glyph, or the foot of the sidebar is an empty rectangle. An icon
          either replaces the label or is not there; here it replaces it. */}
      <div className="nm-rail-cmdwrap">
        <button
          type="button"
          className="nm-rail-cmd"
          onClick={onOpenPalette}
          aria-label="All commands"
          title="All commands (⌘K)"
        >
          {mini ? (
            <Icon name="search" size={12} />
          ) : (
            <>
              <span>All commands</span>
              <span className="nm-rail-key">⌘K</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
