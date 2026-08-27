"use client";

/**
 * Dev Tools — the sources rail.
 *
 * Four sources, four different tables. They were four tabs in the toolbar,
 * which said "four views of one thing" and fought the filter field for width
 * on every dock; as a rail they read as what they are — navigation — and the
 * header gets its width back.
 *
 * The rail also carries the session totals. Those were in the status bar,
 * where they were the first things the width breakpoints dropped and the last
 * place anyone looked; stacked here they are legible at a glance and survive
 * a narrow panel, because a rail loses width far more slowly than a bar does.
 *
 * At 52px it keeps only the icons. That is not a degraded state: each source
 * has its own mark, tinted with the same identity colour the rows, the tab
 * underline and the link ticks use — so "which world am I in" reads from the
 * shape even before the colour, which four dots could never do.
 */

import { formatBytes, formatDuration } from "../helpers/format";
import type { Section } from "../types/monitorUi";
import { Icon, type IconName } from "./Icon";

/** Top-level sources, in display/hotkey order. */
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
  live,
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
  live: Partial<Record<Section, boolean>>;
  stats: SessionStats;
  onSection: (section: Section) => void;
  onToggle: () => void;
  onOpenPalette: () => void;
}) {
  const rows: [string, string, string][] = [
    ["Captured", String(stats.captured), ""],
    ["Transferred", formatBytes(stats.transferred), ""],
    ["Slowest", stats.slowestMs > 0 ? formatDuration(stats.slowestMs) : "—", stats.slowestMs > 0 ? "nm-hot" : ""],
    ["Failing", String(stats.failing), stats.failing > 0 ? "nm-bad" : ""],
    ...(stats.persistedLabel
      ? ([["On disk", stats.persistedLabel, ""]] as [string, string, string][])
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
          className="nm-rail-collapse"
          onClick={onToggle}
          aria-label={mini ? "Expand the sources rail" : "Collapse the sources rail"}
          aria-expanded={!mini}
          title={mini ? "Expand" : "Collapse"}
        >
          <Icon name="chevron" size={12} />
        </button>
      </div>

      <div className="nm-rail-list" role="tablist" aria-orientation="vertical">
        {SECTION_DEFS.map((s) => {
          const empty = counts[s.id] === 0;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={active}
              data-accent={s.id}
              className={`nm-rail-item${active ? " active" : ""}${empty ? " nm-rail-empty" : ""}`}
              onClick={() => onSection(s.id)}
              title={`${s.title} — ${counts[s.id]}`}
            >
              {/* Icon rather than a plain dot: collapsed to 52px the label is
                  gone and colour alone is a legend you have to have learned.
                  The icon still carries the source's identity colour, so the
                  two readings reinforce each other instead of competing. */}
              <span className="nm-rail-ico">
                <Icon name={s.icon} size={14} />
                {/* An open socket or an in-flight fetch on a source you are
                    not reading. Anchored to the icon rather than the row, so
                    it stays put when the rail collapses and the row centres.
                    Only realtime and query can be live; a Redux row is born
                    terminal. */}
                {live[s.id] && !active && <span className="nm-rail-live" />}
              </span>
              <span className="nm-rail-name">{s.label}</span>
              <span className="nm-rail-n">{counts[s.id]}</span>
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

      <button className="nm-rail-cmd" onClick={onOpenPalette} title="Command palette">
        <span>All commands</span>
        <kbd className="nm-kbd">⌘K</kbd>
      </button>
    </nav>
  );
}
