"use client";

/**
 * Dev Tools — the entry list.
 *
 * **Nine fixed tracks, one of them elastic.** `rail · pin · method · route ·
 * size · status · time · links · timing`. Only ROUTE flexes, which is what
 * keeps the list free of horizontal scroll and removes the whole class of
 * header/body scroll-sync bugs. Every width is a token, and the column head
 * reads the same tokens the row does, so the two cannot drift.
 *
 * **PIN and LINKS reserve their width unconditionally.** A pin that only
 * exists on hover, or a tick that only exists on a linked entry, must not move
 * the six columns to its right — a list that reflows under the pointer is a
 * list you cannot aim at.
 *
 * **ROUTE is the point of the redesign.** The list used to show one path
 * segment, so `Tickets/getAll`, `Macros/getAll`, `Agents/getAll` and
 * `Presence/getAll` were four rows that all read `getAll`. It now renders the
 * whole route with the module dimmed and the identifier bright; the module is
 * what truncates, and the identifier never does.
 *
 * **It is an ARIA grid, not a list of buttons.** A row contains a real
 * `<button>` (the pin), and a button may not nest one — so the row is a
 * `role="row"` with a roving `tabindex`, which is what Chrome DevTools does
 * and what the keyboard model here already assumed.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import { memo, useEffect, useRef } from "react";
import {
  entryStatusLabel,
  formatBytes,
  formatDuration,
  splitRoute,
  statusTone,
  type Tone,
} from "../helpers/format";
import type { Counts } from "../hooks/useMonitorList";
import type { RowTiming } from "../helpers/waterfall";
import type { UseVirtualRows } from "../hooks/useVirtualRows";
import type { ColumnId } from "../constants/ui";
import type { ListRow, Section, Sort, SortKey, StateFilter } from "../types/monitorUi";
import { Icon } from "./Icon";

/** The two sortable column labels, per section. Between them they cover the
 * two questions a list is sorted by in practice: what failed, and what was
 * slow. */
const COLUMNS: Record<Section, [string, string]> = {
  network: ["STATUS", "TIME"],
  realtime: ["STATE", "OPEN"],
  redux: ["DIFF", "TIME"],
  query: ["STATUS", "FETCH"],
};

/**
 * The method column: the HTTP verb on Network, the kind of thing on the other
 * three. Plain monospace text — the coloured badge it replaces spent the
 * palette's loudest colours on the one field that is already a word.
 */
function methodLabel(entry: MonitorEntry): string {
  switch (entry.kind ?? "http") {
    case "ws":
      return (entry.transport ?? "WS").slice(0, 6).toUpperCase();
    case "redux":
      // The slice now leads the ROUTE column, so repeating it here would say
      // the same thing twice in the two columns that sit side by side.
      return "REDUX";
    case "query":
      return entry.query?.sub === "mutation" ? "MUT" : "KEY";
    default:
      return entry.method;
  }
}

/**
 * The trailing note after the identifier — the last survivor of the old
 * trailing-metadata column, now that size has a column of its own and the
 * initiator has the detail pane.
 */
function rowNote(entry: MonitorEntry): string {
  switch (entry.kind ?? "http") {
    case "ws":
      return entry.frames?.length ? `${entry.frames.length} frames` : "";
    case "redux": {
      const n = entry.redux?.batchCount ?? 0;
      return n > 1 ? `×${n}` : "";
    }
    case "query":
      return entry.query?.observers === 0 ? "no observers" : "";
    default:
      return entry.replayOf ? "replay" : "";
  }
}

/** Size, or the dash that means "there was never a body to measure". */
function sizeLabel(entry: MonitorEntry): string {
  return entry.sizeBytes != null ? formatBytes(entry.sizeBytes) : "—";
}

/** Duration. An open socket reads `live`; anything still in flight has no
 * duration yet and says so. */
function timeLabel(entry: MonitorEntry): string {
  if (entry.durationMs != null) return formatDuration(entry.durationMs);
  if (entry.state === "pending") {
    return (entry.kind ?? "http") === "ws" ? "live" : "—";
  }
  return "—";
}

interface RowProps {
  entry: MonitorEntry;
  selected: boolean;
  /** Roving `tabindex`: exactly one row in the grid is tabbable at a time. */
  tabbable: boolean;
  /** Comma-joined source names of this entry's cross-source links — a string
   * so the memo below survives an unrelated capture. */
  linkTags: string;
  timing: RowTiming;
  /** 1-based position in the grid, for `aria-rowindex`. */
  rowIndex: number;
  /** The response was supplied by a rule rather than by the server. Draws the
   * rail as three segments. Nothing sets this yet — the interference feature
   * it belongs to is not built. */
  forced?: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: MonitorEntry) => void;
}

const RequestRow = memo(function RequestRow({
  entry,
  selected,
  tabbable,
  linkTags,
  timing,
  rowIndex,
  forced,
  onSelect,
  onTogglePin,
  onContextMenu,
}: RowProps) {
  const tone: Tone = statusTone(entry);
  const route = splitRoute(entry);
  const note = rowNote(entry);
  const slow = (entry.durationMs ?? 0) >= 1000;

  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      aria-selected={selected}
      data-nm-id={entry.id}
      data-tone={tone}
      tabIndex={tabbable ? 0 : -1}
      className={`nm-trow${selected ? " active" : ""}`}
      onClick={() => onSelect(entry.id)}
      // Enter only. A row that also took Space swallowed the global
      // pause-capture binding the moment you clicked a row — and Space is
      // not how you activate a cell in a grid anyway.
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        onSelect(entry.id);
      }}
      onContextMenu={(e) => onContextMenu(e, entry)}
      title={`${route.head}${route.tail}`}
    >
      <span className={`nm-row-rail${forced ? " nm-row-rail-forced" : ""}`} aria-hidden />

      <span className="nm-col-pin" data-col="pin" role="gridcell">
        <button
          type="button"
          className={`nm-pin${entry.pinned ? " pinned" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(entry.id);
          }}
          aria-label={entry.pinned ? "Unpin this request" : "Pin this request"}
          aria-pressed={entry.pinned}
          title={entry.pinned ? "Unpin" : "Pin (survives Clear)"}
          tabIndex={tabbable ? 0 : -1}
        >
          <Icon name="pin" size={10} />
        </button>
      </span>

      {/* POST is dimmed because in an RPC-over-POST API it is every second
          row, and a column where every value is the same value is noise. The
          verbs that are rare are the ones worth seeing. */}
      <span
        className="nm-col-method"
        data-col="method"
        role="gridcell"
        data-dim={entry.method === "POST" || undefined}
      >
        {methodLabel(entry)}
      </span>

      <span className="nm-col-route" role="gridcell">
        <span className="nm-route-head">{route.head}</span>
        <span className="nm-route-tail">
          {route.tail}
          {note && <span className="nm-route-note">{note}</span>}
        </span>
      </span>

      <span className="nm-col-size" data-col="size" role="gridcell">
        {sizeLabel(entry)}
      </span>

      <span className="nm-col-status" data-col="status" role="gridcell">
        {entryStatusLabel(entry)}
      </span>

      <span className="nm-col-time" data-col="time" role="gridcell" data-slow={slow || undefined}>
        {timeLabel(entry)}
      </span>

      {/* Two pixels of colour answers "did this request come from a query?"
          while scanning; the detail pane's chips say which one. */}
      <span className="nm-col-links" data-col="links" role="gridcell">
        {linkTags
          ? linkTags.split(",").map((s) => (
              <span key={s} className="nm-link-tick" data-src={s} title={`Linked ${s} event`} />
            ))
          : null}
      </span>

      <span className="nm-col-timing" data-col="timing" role="gridcell">
        <span className="nm-tbar" aria-hidden>
          <span className="nm-tbar-off" style={{ width: `${timing.offsetPct}%` }} />
          <span className="nm-tbar-wait" style={{ width: `${timing.waitPct}%` }} />
          <span className="nm-tbar-xfer" style={{ width: `${timing.transferPct}%` }} />
        </span>
      </span>
    </div>
  );
});

/**
 * Axis labels for the TIME column head — `0 · 800 · 1.6s`.
 *
 * The bars are only comparable if the reader knows what the width means, and
 * the scale is shared across the whole list, so it is printed once here rather
 * than implied.
 */
export function axisTicks(scaleMs: number): [string, string, string] {
  // Whole milliseconds below a second, seconds above it - and the unit only
  // on the last tick, which is the one that says what the axis is in.
  const tick = (ms: number): string =>
    ms < 1000 ? String(Math.round(ms)) : `${+(ms / 1000).toFixed(1)}s`;
  const mid = tick(scaleMs / 2);
  const max = tick(scaleMs);
  return ["0", mid, scaleMs < 1000 ? `${max}ms` : max];
}

export function RequestTable({
  section,
  rows,
  counts,
  stateFilter,
  onStateFilter,
  pendingLabel,
  scaleMs,
  activeRowId,
  sort,
  onSort,
  onSelect,
  onTogglePin,
  onContextMenu,
  onColumnMenu,
  hidden,
  linkTags,
  timings,
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
  /** The shared timing scale every bar in the list is drawn against. */
  scaleMs: number;
  activeRowId: string | null;
  sort: Sort;
  onSort: (key: SortKey) => void;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: MonitorEntry) => void;
  /** Right-click on the column head — opens the column picker. */
  onColumnMenu: (e: React.MouseEvent) => void;
  /** Columns the developer has switched off. */
  hidden: Set<ColumnId>;
  linkTags: Map<string, string>;
  timings: Map<string, RowTiming>;
  virtual: UseVirtualRows;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  empty: React.ReactNode;
}) {
  const slice = rows.slice(virtual.window.start, virtual.window.end);
  const [statusCol, timeCol] = COLUMNS[section];
  const gridRef = useRef<HTMLDivElement | null>(null);

  // The roving tabstop, when nothing is selected, is the first row — so Tab
  // into the grid always lands somewhere rather than skipping it entirely.
  const firstId = rows.find((r) => r.kind !== "divider")?.entry?.id ?? null;
  const tabbableId = activeRowId ?? firstId;

  // Arrow keys move the selection from the panel's own handler; focus has to
  // follow it, but only when the grid already had focus — moving the caret out
  // of the filter box because a new request arrived would be intolerable.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !activeRowId) return;
    if (!grid.contains(document.activeElement)) return;
    const row = grid.querySelector<HTMLElement>(`[data-nm-id="${CSS.escape(activeRowId)}"]`);
    if (row && row !== document.activeElement) row.focus();
  }, [activeRowId]);

  const segments: [StateFilter, string, number][] = [
    ["all", "All", counts.all],
    ["success", "OK", counts.success],
    ["error", "Errors", counts.error],
    ["pending", pendingLabel, counts.pending],
  ];
  // "Aborted" earns a chip only once there is something in it — a cancelled
  // request, or one a page reload cut off mid-flight.
  if (counts.aborted > 0) segments.push(["aborted", "Aborted", counts.aborted]);

  const ticks = axisTicks(scaleMs);

  const header = (key: SortKey, label: string, className: string, col: ColumnId) => (
    <button
      type="button"
      role="columnheader"
      data-col={col}
      aria-sort={
        sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={`${className} nm-colhead${sort.key === key ? " nm-sorted" : ""}`}
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
    <div className="nm-table" data-hide={hidden.size ? [...hidden].join(" ") : undefined}>
      <div className="nm-fchips nm-strip-scroll" role="tablist">
        {segments.map(([key, label, n]) => (
          <button
            type="button"
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

      <div className="nm-grid" role="grid" aria-label="Captured entries" ref={gridRef}>
        {/* A sibling of the scroller, not `position: sticky` inside it —
            sticky within a transformed subtree is a known source of jitter. */}
        <div
          className="nm-cols"
          role="row"
          onContextMenu={(e) => {
            e.preventDefault();
            onColumnMenu(e);
          }}
          title="Right-click to choose columns"
        >
          <span className="nm-col-lead" data-col="pin" role="columnheader" aria-label="Pin" />
          <span className="nm-col-method" data-col="method" role="columnheader">
            METHOD
          </span>
          <span className="nm-col-route" role="columnheader">
            ROUTE
          </span>
          <span className="nm-col-size" data-col="size" role="columnheader">
            SIZE
          </span>
          {header("status", statusCol, "nm-col-status", "status")}
          {header("duration", timeCol, "nm-col-time", "time")}
          <span className="nm-col-links" data-col="links" role="columnheader" aria-label="Linked entries" />
          <span className="nm-col-timing nm-axis" data-col="timing" role="columnheader">
            <span>{ticks[0]}</span>
            <span>{ticks[1]}</span>
            <span>{ticks[2]}</span>
          </span>
        </div>

        <div
          className="nm-tbody nm-scroll"
          role={rows.length ? "rowgroup" : "presentation"}
          ref={scrollerRef}
          onScroll={virtual.onScroll}
        >
          {rows.length === 0 ? (
            empty
          ) : (
            <div style={{ height: virtual.totalHeight, position: "relative" }} role="presentation">
              <div style={{ transform: `translateY(${virtual.offsetY}px)` }} role="presentation">
                {slice.map((row, i) =>
                  row.kind === "divider" ? (
                    <div key={`d-${row.loadId}`} className="nm-load-divider" role="presentation">
                      <span>page load</span>
                    </div>
                  ) : (
                    <RequestRow
                      key={row.entry.id}
                      entry={row.entry}
                      selected={activeRowId === row.entry.id}
                      tabbable={tabbableId === row.entry.id}
                      linkTags={linkTags.get(row.entry.id) ?? ""}
                      timing={
                        timings.get(row.entry.id) ?? {
                          offsetPct: 0,
                          waitPct: 0,
                          transferPct: 0,
                        }
                      }
                      rowIndex={virtual.window.start + i + 1}
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
    </div>
  );
}
