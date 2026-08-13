"use client";

/**
 * Dev Tools — the request table.
 *
 * Chrome-style columns on a fixed grid, a shared-timeline waterfall, and
 * fixed-height virtualized rows. There is deliberately **no horizontal
 * scroll**: the flexible columns are `minmax(0, …fr)` and truncate with an
 * ellipsis, which removes the whole class of header/body scroll-sync bugs.
 * Column widths are user-resizable and persisted.
 */

import { summarizeInitiator } from "../../capture/monitorInitiator";
import type { MonitorEntry } from "../../capture/networkMonitor";
import { memo, useMemo, useRef } from "react";
import { STATE_COLORS, kindAccent } from "../constants/ui";
import { clock, formatBytes, requestName, statusText } from "../helpers/format";
import { barGeometry } from "../helpers/waterfall";
import type { PanelTheme } from "../hooks/useAppTheme";
import { useMeasuredSize } from "../hooks/useMeasuredSize";
import type { UseVirtualRows } from "../hooks/useVirtualRows";
import type {
  ColumnId,
  ListRow,
  Section,
  Sort,
  SortKey,
  Timeline,
} from "../types/monitorUi";
import { Icon } from "./Icon";

interface ColumnDef {
  id: ColumnId;
  label: string;
  sort: SortKey | null;
  /** Fixed px, or a flex weight when `flex` is true. */
  size: number;
  flex?: boolean;
  resizable?: boolean;
  align?: "end";
  /** Narrowest usable width for a flexible column. Below this the column is
   * dropped rather than squeezed to an unreadable sliver. */
  minWidth?: number;
}

const GAP = 8;
const ROW_PADDING = 20;

/**
 * Order in which columns are given up as the pane narrows — least useful
 * first. Name and Status are never dropped; without them a row says nothing.
 *
 * This is what stops the layout from breaking when the list pane is dragged
 * narrow: previously the fixed columns simply outgrew the pane, every
 * `minmax(0, …fr)` column collapsed to zero, and the surplus painted over the
 * detail pane.
 */
const DROP_ORDER: ColumnId[] = [
  "initiator",
  "waterfall",
  "size",
  "method",
  "frames",
  "duration",
];

/** Space a column set needs before anything would be squeezed below its floor. */
function requiredWidth(columns: ColumnDef[]): number {
  const content = columns.reduce(
    (sum, c) => sum + (c.flex ? (c.minWidth ?? 90) : c.size),
    0,
  );
  return content + GAP * Math.max(0, columns.length - 1) + ROW_PADDING;
}

/** Drops columns, least useful first, until the set fits `available`. */
export function fitColumns(all: ColumnDef[], available: number): ColumnDef[] {
  // Before the first measurement, render everything rather than guessing.
  if (!available) return all;

  let visible = all;
  for (const id of DROP_ORDER) {
    if (requiredWidth(visible) <= available) break;
    if (visible.length <= 2) break;
    visible = visible.filter((c) => c.id !== id);
  }
  return visible;
}

const NETWORK_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Name", sort: "name", size: 2.4, flex: true, resizable: true, minWidth: 130 },
  { id: "status", label: "Status", sort: "status", size: 62 },
  { id: "method", label: "Method", sort: null, size: 62 },
  { id: "initiator", label: "Initiator", sort: null, size: 1.6, flex: true, resizable: true, minWidth: 100 },
  { id: "size", label: "Size", sort: "size", size: 74, align: "end" },
  { id: "duration", label: "Time", sort: "duration", size: 72, align: "end" },
  { id: "waterfall", label: "Waterfall", sort: "time", size: 2, flex: true, minWidth: 96 },
];

/** Realtime rows have no status code, size-per-request or initiator; frame
 * count and transport are what matter instead. */
const REALTIME_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Connection", sort: "name", size: 2.6, flex: true, resizable: true, minWidth: 130 },
  { id: "status", label: "State", sort: "status", size: 66 },
  { id: "method", label: "Transport", sort: null, size: 86 },
  { id: "frames", label: "Frames", sort: null, size: 68, align: "end" },
  { id: "size", label: "Size", sort: "size", size: 74, align: "end" },
  { id: "duration", label: "Open for", sort: "duration", size: 78, align: "end" },
  { id: "waterfall", label: "Activity", sort: "time", size: 2, flex: true, minWidth: 96 },
];

/** Redux rows have no status code or frame count; a change count and the
 * touched slice (via Method) are what matter instead. */
const REDUX_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Action", sort: "name", size: 2.6, flex: true, resizable: true, minWidth: 150 },
  { id: "status", label: "Result", sort: "status", size: 62 },
  { id: "method", label: "Slice", sort: null, size: 1, flex: true, resizable: true, minWidth: 90 },
  { id: "changes", label: "Δ", sort: null, size: 44, align: "end" },
  { id: "initiator", label: "Dispatched by", sort: null, size: 1.4, flex: true, resizable: true, minWidth: 100 },
  { id: "size", label: "Payload", sort: "size", size: 74, align: "end" },
  { id: "duration", label: "Reducer", sort: "duration", size: 76, align: "end" },
  { id: "waterfall", label: "Timeline", sort: "time", size: 2, flex: true, minWidth: 96 },
];

/** Query rows reuse Frames for lifecycle-event count and Method for
 * query-vs-mutation, so only the labels differ from the HTTP set. */
const QUERY_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Key", sort: "name", size: 2.8, flex: true, resizable: true, minWidth: 150 },
  { id: "status", label: "Status", sort: "status", size: 70 },
  { id: "method", label: "Type", sort: null, size: 68 },
  { id: "frames", label: "Events", sort: null, size: 62, align: "end" },
  { id: "size", label: "Size", sort: "size", size: 74, align: "end" },
  { id: "duration", label: "Fetch", sort: "duration", size: 66, align: "end" },
  { id: "waterfall", label: "Activity", sort: "time", size: 2, flex: true, minWidth: 96 },
];

export function columnsFor(section: Section): ColumnDef[] {
  switch (section) {
    case "realtime":
      return REALTIME_COLUMNS;
    case "redux":
      return REDUX_COLUMNS;
    case "query":
      return QUERY_COLUMNS;
    default:
      return NETWORK_COLUMNS;
  }
}

function template(columns: ColumnDef[], widths: Partial<Record<ColumnId, number>>) {
  return columns
    .map((c) => {
      const override = widths[c.id];
      if (override != null) return `${override}px`;
      // The floor is expressed in the track itself, so a flexible column can
      // never be squeezed to nothing by its neighbours.
      return c.flex
        ? `minmax(${c.minWidth ?? 90}px, ${c.size}fr)`
        : `${c.size}px`;
    })
    .join(" ");
}

function StatusCell({ entry }: { entry: MonitorEntry }) {
  const kind = entry.kind ?? "http";
  const isWs = kind === "ws";
  // Redux/Query rows have no HTTP status code — "OK" fills the same slot a
  // 200 would, rather than the blank "—" that reads as "unknown" when the
  // aggregate OK/Errors counts above already say otherwise.
  const label = isWs
    ? entry.state === "pending"
      ? "open"
      : "closed"
    : entry.state === "pending"
      ? "•••"
      : entry.state === "aborted"
        ? "⊘"
        : entry.status != null
          ? entry.status
          : entry.state === "error"
            ? "ERR"
            : kind === "redux" || kind === "query"
              ? "OK"
              : "—";

  return (
    <span
      className={`nm-status${entry.state === "pending" && !isWs ? " nm-pulse" : ""}`}
      style={{
        color: STATE_COLORS[entry.state],
        background: `${STATE_COLORS[entry.state]}1f`,
      }}
      title={statusText(entry.status)}
    >
      {label}
    </span>
  );
}

interface RowProps {
  entry: MonitorEntry;
  columns: ColumnDef[];
  gridTemplate: string;
  selected: boolean;
  timeline: Timeline | undefined;
  nowAbs: number;
  theme: PanelTheme;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: MonitorEntry) => void;
}

/**
 * Memoized on the values that actually affect the row. `timeline` must be a
 * stable object per load group or this defeats itself — see `computeTimelines`,
 * which is memoized upstream.
 */
const RequestRow = memo(function RequestRow({
  entry,
  columns,
  gridTemplate,
  selected,
  timeline,
  nowAbs,
  theme,
  onSelect,
  onTogglePin,
  onContextMenu,
}: RowProps) {
  const bar = barGeometry(entry, timeline, nowAbs);
  const initiator = entry.initiator ? summarizeInitiator(entry.initiator) : "";
  const kind = entry.kind ?? "http";
  // `requestName` parses `entry.url` as a URL path and drops generic/parent
  // segments — exactly wrong for a Redux action type ("slice/actionName") or
  // a serialized query key, where the full string *is* the useful label.
  const rowLabel =
    kind === "redux" || kind === "query" ? entry.url : requestName(entry.url);

  const cell = (column: ColumnDef) => {
    switch (column.id) {
      case "name":
        return (
          <span className="nm-col-name" key={column.id} title={entry.url}>
            <button
              className={`nm-pin${entry.pinned ? " pinned" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(entry.id);
              }}
              title={entry.pinned ? "Unpin" : "Pin (survives Clear)"}
            >
              <Icon name="pin" size={11} />
            </button>
            {entry.replayOf && (
              <span className="nm-replay-chip" title="Replay of an earlier request">
                ↻
              </span>
            )}
            {rowLabel}
            {!!entry.redux?.batchCount && entry.redux.batchCount > 1 && (
              <span className="nm-replay-chip" title={`${entry.redux.batchCount} dispatches folded into this row`}>
                ×{entry.redux.batchCount}
              </span>
            )}
            {!!entry.replayCount && (
              <span className="nm-replay-chip" title={`${entry.replayCount} replays`}>
                ↻{entry.replayCount}
              </span>
            )}
          </span>
        );
      case "status":
        return (
          <span className="nm-col-status" key={column.id}>
            <StatusCell entry={entry} />
          </span>
        );
      case "method":
        return (
          <span
            className="nm-col-method"
            key={column.id}
            style={{ color: kindAccent(entry.kind, entry.method, theme) }}
          >
            {entry.transport ?? entry.method}
          </span>
        );
      case "initiator":
        return (
          <span className="nm-col-init" key={column.id} title={initiator}>
            {initiator || "—"}
          </span>
        );
      case "frames":
        return (
          <span className="nm-col-size" key={column.id}>
            {entry.frames?.length ?? 0}
          </span>
        );
      case "changes": {
        const n = entry.redux?.diff?.changes.length ?? 0;
        return (
          <span
            className="nm-col-size"
            key={column.id}
            title={entry.redux?.diff?.truncated ? "Diff truncated — too many/too deep changes" : undefined}
          >
            {n === 0 ? "—" : n}
            {entry.redux?.diff?.truncated ? "+" : ""}
          </span>
        );
      }
      case "size":
        return (
          <span className="nm-col-size" key={column.id}>
            {entry.sizeBytes != null ? formatBytes(entry.sizeBytes) : "—"}
          </span>
        );
      case "duration":
        return (
          <span className="nm-col-dur" key={column.id}>
            {entry.durationMs != null ? `${entry.durationMs} ms` : "—"}
          </span>
        );
      case "waterfall":
      default:
        return (
          <span className="nm-col-wf" key={column.id}>
            <span className="nm-wf-track" aria-hidden>
              <span
                className={`nm-wf-bar${bar.live ? " nm-wf-live" : ""}`}
                style={{
                  left: `${bar.left}%`,
                  width: `${bar.width}%`,
                  background: STATE_COLORS[entry.state],
                }}
              />
              {bar.overflowed && <span className="nm-wf-inf">∞</span>}
            </span>
          </span>
        );
    }
  };

  return (
    <div
      role="row"
      data-nm-id={entry.id}
      data-kind={kind}
      className={`nm-trow${selected ? " active" : ""}`}
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={() => onSelect(entry.id)}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      {columns.map(cell)}
    </div>
  );
});

export function RequestTable({
  rows,
  columns,
  widths,
  onResizeColumn,
  timelines,
  nowAbs,
  activeRowId,
  sort,
  onSort,
  onSelect,
  onTogglePin,
  onContextMenu,
  virtual,
  scrollerRef,
  empty,
  theme,
}: {
  rows: ListRow[];
  columns: ColumnDef[];
  widths: Partial<Record<ColumnId, number>>;
  onResizeColumn: (id: ColumnId, width: number) => void;
  timelines: Map<string, Timeline>;
  nowAbs: number;
  activeRowId: string | null;
  sort: Sort;
  onSort: (key: SortKey) => void;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: MonitorEntry) => void;
  virtual: UseVirtualRows;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  empty: React.ReactNode;
  theme: PanelTheme;
}) {
  const slice = rows.slice(virtual.window.start, virtual.window.end);

  // Measure the pane so columns can be dropped before they collapse.
  // Shared with `usePanelSize` via `useMeasuredSize` rather than a second
  // hand-rolled rAF-throttled ResizeObserver.
  const tableRef = useRef<HTMLDivElement | null>(null);
  const { width: paneWidth } = useMeasuredSize(tableRef);

  // Memoized: `fitColumns`/`template` otherwise return a fresh array/string
  // every render, which busts `RequestRow`'s `memo` on every currently
  // rendered row (via the `columns`/`gridTemplate` props) whenever anything
  // re-renders the table — including an unrelated incoming event — even
  // though the actual visible-column set only changes when `columns` or
  // `paneWidth` do.
  const visibleColumns = useMemo(
    () => fitColumns(columns, paneWidth),
    [columns, paneWidth],
  );
  const gridTemplate = useMemo(
    () => template(visibleColumns, widths),
    [visibleColumns, widths],
  );

  /** Column resize: measure from the header cell, commit on pointerup so the
   * table isn't re-rendered (and re-windowed) on every pointer move. */
  const startResize = (e: React.PointerEvent, column: ColumnDef) => {
    e.preventDefault();
    e.stopPropagation();
    const cell = (e.currentTarget as HTMLElement).parentElement;
    const startX = e.clientX;
    const startW = cell?.offsetWidth ?? 120;
    let next = startW;

    const onMove = (ev: PointerEvent) => {
      next = Math.max(48, startW + (ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onResizeColumn(column.id, next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="nm-table" ref={tableRef}>
      {/* The header is a sibling of the scroller, not `position: sticky` inside
          it — sticky within a transformed subtree is a known source of jitter. */}
      <div className="nm-thead" role="row" style={{ gridTemplateColumns: gridTemplate }}>
        {visibleColumns.map((column) => (
          <span
            key={column.id}
            className={`nm-th${column.sort ? " nm-th-sortable" : ""}${
              column.sort && sort.key === column.sort ? " nm-th-sorted" : ""
            }`}
            style={column.align === "end" ? { justifyContent: "flex-end" } : undefined}
            onClick={column.sort ? () => onSort(column.sort as SortKey) : undefined}
          >
            {column.label}
            {column.sort && sort.key === column.sort && (
              <span className="nm-th-arrow">{sort.dir === "asc" ? "▲" : "▼"}</span>
            )}
            {column.resizable && (
              <span
                className="nm-th-grip"
                onPointerDown={(e) => startResize(e, column)}
                onClick={(e) => e.stopPropagation()}
                title="Drag to resize"
              />
            )}
          </span>
        ))}
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
                    <span>
                      <Icon name="preserve" size={10} /> page load · {clock(row.at)}
                    </span>
                  </div>
                ) : (
                  <RequestRow
                    key={row.entry.id}
                    entry={row.entry}
                    columns={visibleColumns}
                    gridTemplate={gridTemplate}
                    selected={activeRowId === row.entry.id}
                    timeline={timelines.get(row.entry.loadId)}
                    nowAbs={nowAbs}
                    theme={theme}
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
