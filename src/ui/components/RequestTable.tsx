"use client";

/**
 * Dev Tools — the entry list.
 *
 * Five fixed tracks, not a resizable column set: the selection edge, the
 * cross-source link ticks, one elastic identity column, the status pill and
 * the duration. The columns that used to be resizable — initiator, size,
 * transport, slice — fold into the identity column's trailing metadata, which
 * shrinks before the name does and disappears before it truncates.
 *
 * That trade buys two things. The list stays readable in a 380px right dock,
 * where seven columns collapsed into slivers and painted over the detail pane;
 * and the header row, freed of labels for columns that never move, can carry
 * the state filters instead — which used to cost a 30px bar of their own on a
 * panel that is usually docked short.
 *
 * There is still deliberately **no horizontal scroll**: the one elastic track
 * is `minmax(0, 1fr)` and truncates, which removes the whole class of
 * header/body scroll-sync bugs.
 */

import { summarizeInitiator } from "../../capture/monitorInitiator";
import type { MonitorEntry } from "../../capture/networkMonitor";
import { memo } from "react";
import { accentKey } from "../constants/ui";
import {
  clock,
  entryStatusLabel,
  formatBytes,
  formatDuration,
  requestName,
  statusText,
} from "../helpers/format";
import type { Counts } from "../hooks/useMonitorList";
import type { UseVirtualRows } from "../hooks/useVirtualRows";
import type { ListRow, Section, Sort, SortKey, StateFilter } from "../types/monitorUi";
import { Icon } from "./Icon";

/** The two right-hand column labels, per section. Both are sortable, and
 * between them they cover the two questions a list is sorted by in practice:
 * "what failed" and "what was slow". */
const COLUMNS: Record<Section, [string, string]> = {
  network: ["STATUS", "TIME"],
  realtime: ["STATE", "OPEN"],
  redux: ["DIFF", "TIME"],
  query: ["STATUS", "FETCH"],
};

/** What goes in the 34px badge at the head of a row: the one token that says
 * which *kind* of thing this is without reading the name. */
function kindBadge(entry: MonitorEntry): string {
  switch (entry.kind ?? "http") {
    case "ws":
      return (entry.transport ?? "WS").slice(0, 6).toUpperCase();
    case "redux":
      // The slice prefix of "cif/branchesLoaded". Actions cluster by slice far
      // more than by verb, so the prefix is what makes a scroll scannable.
      return (entry.url.split("/")[0] || "REDUX").slice(0, 7).toUpperCase();
    case "query":
      return entry.query?.sub === "mutation" ? "MUT" : "KEY";
    default:
      return entry.method;
  }
}

/** The row's label. `requestName` drops generic and parent path segments,
 * which is exactly wrong for a Redux action type or a serialized query key —
 * there, the whole string *is* the useful label. */
function rowName(entry: MonitorEntry): string {
  const kind = entry.kind ?? "http";
  return kind === "redux" || kind === "query" ? entry.url : requestName(entry.url);
}

/**
 * The trailing metadata — everything that used to have a column of its own.
 * Ordered most-useful-first, because this is what gives up width as the pane
 * narrows and it truncates from the right.
 */
function rowMeta(entry: MonitorEntry): string {
  const parts: string[] = [];
  switch (entry.kind ?? "http") {
    case "ws":
      parts.push(`${entry.frames?.length ?? 0} frames`);
      break;
    case "redux": {
      const diff = entry.redux?.diff;
      const slices = diff?.slices.length ?? 0;
      if (slices) parts.push(`${slices} ${slices === 1 ? "slice" : "slices"}`);
      const changes = diff?.changes.length ?? 0;
      if (changes) parts.push(`${changes}${diff?.truncated ? "+" : ""} paths`);
      break;
    }
    case "query": {
      const events = entry.frames?.length ?? 0;
      if (events) parts.push(`${events} ${events === 1 ? "event" : "events"}`);
      if (entry.query?.observers === 0) parts.push("no observers");
      break;
    }
    default: {
      if (entry.sizeBytes != null) parts.push(formatBytes(entry.sizeBytes));
      const initiator = entry.initiator ? summarizeInitiator(entry.initiator) : "";
      if (initiator) parts.push(initiator);
    }
  }
  return parts.join(" · ");
}

interface RowProps {
  entry: MonitorEntry;
  selected: boolean;
  /** Comma-joined section names of this entry's cross-source links — a string
   * so the memo below survives an unrelated capture. */
  linkTags: string;
  /** Longest duration in the current list, for the comparison bar. */
  slowestMs: number;
  nowAbs: number;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: MonitorEntry) => void;
}

const RequestRow = memo(function RequestRow({
  entry,
  selected,
  linkTags,
  slowestMs,
  nowAbs,
  onSelect,
  onTogglePin,
  onContextMenu,
}: RowProps) {
  const kind = entry.kind ?? "http";
  const live = entry.state === "pending";
  // An in-flight request grows against the same scale as the finished ones,
  // so a request that is *becoming* the slowest of the session says so while
  // it is still running.
  const ms = entry.durationMs ?? (live ? Math.max(0, nowAbs - entry.startAbs) : 0);
  const pct = slowestMs > 0 ? Math.min(100, Math.round((ms / slowestMs) * 100)) : 0;
  const timeLabel =
    entry.durationMs != null
      ? formatDuration(entry.durationMs)
      : live
        ? formatDuration(ms)
        : clock(entry.at);

  return (
    <div
      role="row"
      data-nm-id={entry.id}
      data-kind={kind}
      data-state={entry.state}
      className={`nm-trow${selected ? " active" : ""}`}
      onClick={() => onSelect(entry.id)}
      onContextMenu={(e) => onContextMenu(e, entry)}
      title={entry.url}
    >
      <span className="nm-row-bar" />

      <span className="nm-row-links">
        {linkTags
          ? linkTags.split(",").map((s) => (
              <span
                key={s}
                className="nm-link-tick"
                data-accent={s}
                title={`Linked ${s} event`}
              />
            ))
          : null}
      </span>

      <span className="nm-row-main">
        <button
          className={`nm-pin${entry.pinned ? " pinned" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(entry.id);
          }}
          title={entry.pinned ? "Unpin" : "Pin (survives Clear)"}
        >
          <Icon name="pin" size={10} />
        </button>
        <span
          className={`nm-kind${kind === "redux" ? " nm-kind-wide" : ""}`}
          data-accent={accentKey(entry.kind, entry.method)}
        >
          {kindBadge(entry)}
        </span>
        <span className="nm-row-name">{rowName(entry)}</span>
        {entry.replayOf && (
          <span className="nm-replay-chip" title="Replay of an earlier request">
            ↻
          </span>
        )}
        {!!entry.redux?.batchCount && entry.redux.batchCount > 1 && (
          <span
            className="nm-replay-chip"
            title={`${entry.redux.batchCount} dispatches folded into this row`}
          >
            ×{entry.redux.batchCount}
          </span>
        )}
        <span className="nm-row-meta">{rowMeta(entry)}</span>
      </span>

      <span className="nm-row-status">
        <span
          className={`nm-status${live && kind !== "ws" ? " nm-pulse" : ""}`}
          data-state={entry.state}
          title={statusText(entry.status)}
        >
          {entryStatusLabel(entry)}
        </span>
      </span>

      <span className="nm-row-time">
        <span className={`nm-row-time-v${ms >= 1500 ? " nm-hot" : ""}`}>{timeLabel}</span>
        <span className="nm-row-track" aria-hidden>
          <span
            className={`nm-row-fill${live ? " nm-wf-live" : ""}`}
            data-state={entry.state}
            style={{ width: `${pct}%` }}
          />
        </span>
      </span>
    </div>
  );
});

export function RequestTable({
  section,
  rows,
  counts,
  stateFilter,
  onStateFilter,
  pendingLabel,
  slowestMs,
  nowAbs,
  activeRowId,
  sort,
  onSort,
  onSelect,
  onTogglePin,
  onContextMenu,
  linkTags,
  virtual,
  scrollerRef,
  empty,
}: {
  section: Section;
  rows: ListRow[];
  counts: Counts;
  stateFilter: StateFilter;
  onStateFilter: (filter: StateFilter) => void;
  /** What "pending" is called in this section — Open, Fetching, Pending. */
  pendingLabel: string;
  slowestMs: number;
  nowAbs: number;
  activeRowId: string | null;
  sort: Sort;
  onSort: (key: SortKey) => void;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: MonitorEntry) => void;
  linkTags: Map<string, string>;
  virtual: UseVirtualRows;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  empty: React.ReactNode;
}) {
  const slice = rows.slice(virtual.window.start, virtual.window.end);
  const [statusCol, timeCol] = COLUMNS[section];

  const segments: [StateFilter, string, number][] = [
    ["all", "All", counts.all],
    ["success", "OK", counts.success],
    ["error", "Errors", counts.error],
    ["pending", pendingLabel, counts.pending],
  ];
  // "Aborted" earns a chip only once there is something in it — it exists
  // solely for requests restored mid-flight from a previous page load.
  if (counts.aborted > 0) segments.push(["aborted", "Aborted", counts.aborted]);

  const header = (key: SortKey, label: string) => (
    <button
      className={`nm-list-col${sort.key === key ? " nm-sorted" : ""}`}
      onClick={() => onSort(key)}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      {sort.key === key && (
        <span className="nm-sort-arrow">{sort.dir === "asc" ? "▲" : "▼"}</span>
      )}
    </button>
  );

  return (
    <div className="nm-table">
      {/* A sibling of the scroller, not `position: sticky` inside it — sticky
          within a transformed subtree is a known source of jitter. */}
      <div className="nm-list-head">
        {/* Scrolls rather than wrapping: five chips plus two column labels
            outgrow a narrow dock, and a second row here would cost the list
            30px of the height it is short of. */}
        <div className="nm-fchips nm-strip-scroll" role="tablist">
          {segments.map(([key, label, n]) => (
            <button
              key={key}
              role="tab"
              aria-selected={stateFilter === key}
              data-state={key}
              className={`nm-fchip${stateFilter === key ? " active" : ""}${
                n === 0 ? " nm-fchip-0" : ""
              }`}
              onClick={() => onStateFilter(key)}
              title={`${label} — ${n} ${n === 1 ? "entry" : "entries"}`}
            >
              <span className="nm-fchip-dot" />
              <span className="nm-fchip-label">{label}</span>
              <span className="nm-fchip-n">{n}</span>
            </button>
          ))}
        </div>
        <div className="nm-list-cols">
          {header("status", statusCol)}
          {header("duration", timeCol)}
        </div>
      </div>

      <div className="nm-tbody nm-scroll" ref={scrollerRef} onScroll={virtual.onScroll}>
        {rows.length === 0 ? (
          empty
        ) : (
          <div style={{ height: virtual.totalHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${virtual.offsetY}px)` }}>
              {slice.map((row) =>
                row.kind === "divider" ? (
                  <div key={`d-${row.loadId}`} className="nm-load-divider">
                    <span>page load · {clock(row.at)}</span>
                  </div>
                ) : (
                  <RequestRow
                    key={row.entry.id}
                    entry={row.entry}
                    selected={activeRowId === row.entry.id}
                    linkTags={linkTags.get(row.entry.id) ?? ""}
                    slowestMs={slowestMs}
                    nowAbs={nowAbs}
                    onSelect={onSelect}
                    onTogglePin={onTogglePin}
                    onContextMenu={onContextMenu}
                  />
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
