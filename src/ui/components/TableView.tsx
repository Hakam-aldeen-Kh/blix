"use client";

/**
 * Dev Tools — the grid view of a tabular payload.
 *
 * A list response is the one shape a JSON tree renders badly: the key names
 * repeat down the left edge and the values you want to compare end up on
 * separate rows. Here the keys are the header, read once, and the values line
 * up in columns.
 *
 * Rows are paged rather than virtualized. The same reasoning as the tree: a
 * hard cap plus a "show more" bounds the rendered row count without a
 * variable-height virtualizer, and nobody scans past a few hundred rows of a
 * payload by eye — past that the answer is a filter or the CSV export.
 */

import { useMemo, useState } from "react";
import { cellClass, cellText, type TableShape } from "../helpers/tabular";
import { splitHighlight } from "../helpers/jsonTree";

/** Rows rendered at once, and how many more each "show more" adds. */
const PAGE = 200;

function Cell({ value, query }: { value: unknown; query: string }) {
  const text = cellText(value);
  const title =
    value !== null && typeof value === "object"
      ? // A container collapses to `{3}`/`[5]` in the grid; the full shape is
        // still one hover away rather than being lost.
        safeJson(value)
      : text;

  return (
    <span className={`nm-td ${cellClass(value)}`} role="cell" title={title}>
      {query ? (
        splitHighlight(text, query).map((part, i) =>
          part.match ? (
            <mark key={i} className="nm-mark">
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )
      ) : (
        text
      )}
    </span>
  );
}

function safeJson(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  } catch {
    return String(value);
  }
}

export function TableView({
  shape,
  query,
}: {
  shape: TableShape;
  query: string;
}) {
  const [shown, setShown] = useState(PAGE);

  // Fixed columns rather than `auto`: a grid whose tracks resize as you page
  // in more rows is unreadable, and one long URL in row 300 should not widen
  // the column the other 299 rows already settled into.
  const template = useMemo(
    () => shape.columns.map(() => "minmax(90px, 1fr)").join(" "),
    [shape.columns],
  );

  const rows = shape.rows.slice(0, shown);
  const remaining = shape.rows.length - rows.length;

  return (
    <div className="nm-tv nm-scroll">
      {/* Rows are `display: contents`, so the cells are the grid's own
          children and every column lines up across the whole table. The ARIA
          roles restore the row/cell structure that removes from the tree. */}
      <div
        className="nm-tv-grid"
        role="table"
        aria-rowcount={shape.rows.length}
        style={{ gridTemplateColumns: template }}
      >
        <div className="nm-tv-head" role="row">
          {shape.columns.map((column) => (
            <span key={column} role="columnheader" title={column}>
              {column}
            </span>
          ))}
        </div>

        {rows.map((row, i) => (
          <div className="nm-tv-row" role="row" key={i}>
            {shape.columns.map((column) => (
              <Cell key={column} value={shape.cell(row, column)} query={query} />
            ))}
          </div>
        ))}
      </div>

      {(remaining > 0 || shape.hiddenColumns > 0) && (
        <div className="nm-tv-foot">
          {remaining > 0 && (
            <button className="nm-tree-more" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, remaining)} more of {remaining}
            </button>
          )}
          {shape.hiddenColumns > 0 && (
            <span className="nm-tv-note">
              {shape.hiddenColumns} {shape.hiddenColumns === 1 ? "column" : "columns"}{" "}
              hidden — switch to Tree or JSON to see every field
            </span>
          )}
        </div>
      )}
    </div>
  );
}
