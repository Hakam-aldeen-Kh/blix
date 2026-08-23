/**
 * Dev Tools — deciding whether a payload is a table, and shaping it into one.
 *
 * Most list endpoints answer with an array of uniform objects, and that is the
 * one payload shape a JSON tree renders *badly*: forty repeated key names down
 * the left edge, with the values you actually want to compare scattered across
 * forty separate rows. A grid puts the keys in the header once and lines the
 * values up in columns, which is the whole reason the Table view exists.
 *
 * Detection is deliberately conservative. A grid is only clearer than a tree
 * when the rows genuinely share a shape, so a ragged array falls back to the
 * tree rather than rendering a mostly-empty matrix.
 */

/** Columns beyond this are dropped — past ~30 the grid is unreadable anyway,
 * and the header row is what pays for each one. */
const MAX_COLUMNS = 40;

/** A row array shorter than this is not worth a grid; the tree shows two
 * objects perfectly well and with less ceremony. */
const MIN_ROWS = 2;

/** Share of rows a key must appear in for its column to be kept. Below this
 * the column is mostly blank and costs more width than it returns. */
const COLUMN_COVERAGE = 0.25;

/**
 * Rows sampled when working out the column set.
 *
 * Detection runs on every payload the developer clicks — including while
 * arrowing down the list — so it has to cost the same whether the response
 * holds ten records or a hundred thousand. A sample of the first few hundred
 * settles the columns of any real list endpoint; a field that appears only
 * past row 500 was going to fail the coverage test anyway.
 */
const SCAN_LIMIT = 500;

export interface TableShape {
  columns: string[];
  rows: unknown[];
  /** Reads a cell out of a row — differs between the array-of-objects and
   * object-of-objects cases, so the renderer does not have to care which. */
  cell: (row: unknown, column: string) => unknown;
  /** Columns not shown — sparse ones plus any past `MAX_COLUMNS`. Surfaced in
   * the grid's footer, so a hidden field is never silently missing. */
  hiddenColumns: number;
  /** What the first column holds when rows came from an object's keys. */
  keyColumn: string | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The synthetic column name used when the rows are scalars rather than
 * objects — an array of ids or strings is still worth a single column. */
export const VALUE_COLUMN = "value";

/**
 * Collects column names across rows in first-seen order, then drops the
 * long tail that only a few rows carry.
 *
 * First-seen order rather than sorted: an API's own field order is meaningful
 * (`id` first, timestamps last) and alphabetising it throws that away.
 */
function columnsOf(rows: Record<string, unknown>[]): {
  columns: string[];
  hiddenColumns: number;
} {
  const sample = rows.length > SCAN_LIMIT ? rows.slice(0, SCAN_LIMIT) : rows;

  const seen = new Map<string, number>();
  for (const row of sample) {
    for (const key of Object.keys(row)) {
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.max(1, sample.length * COLUMN_COVERAGE);
  const dense = [...seen.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([key]) => key);
  const columns = dense.slice(0, MAX_COLUMNS);

  // Counts both reasons a column can be missing — sparseness and the cap — so
  // the footer's number matches what the reader can actually not see.
  return { columns, hiddenColumns: seen.size - columns.length };
}

/**
 * Returns a table shape, or `null` when the value is not usefully tabular —
 * in which case the Table view stays disabled and says why.
 *
 * Three shapes qualify:
 *  - an array of objects — the common list response
 *  - an array of scalars — one column, still easier to scan than a tree
 *  - an object whose values are all objects — a keyed map, e.g. `{ [id]: user }`
 */
export function asTable(value: unknown): TableShape | null {
  if (Array.isArray(value)) {
    if (value.length < MIN_ROWS) return null;

    if (value.every(isPlainObject)) {
      const { columns, hiddenColumns } = columnsOf(value);
      if (columns.length === 0) return null;
      return {
        columns,
        rows: value,
        cell: (row, column) => (row as Record<string, unknown>)[column],
        hiddenColumns,
        keyColumn: null,
      };
    }

    // A mixed array (objects *and* scalars) would render as a grid with holes
    // in it; only a uniformly scalar array gets the single-column treatment.
    if (value.every((v) => !isPlainObject(v) && !Array.isArray(v))) {
      return {
        columns: [VALUE_COLUMN],
        rows: value,
        cell: (row) => row,
        hiddenColumns: 0,
        keyColumn: null,
      };
    }

    return null;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length < MIN_ROWS) return null;
    if (!entries.every(([, v]) => isPlainObject(v))) return null;

    const { columns, hiddenColumns } = columnsOf(
      entries.map(([, v]) => v as Record<string, unknown>),
    );
    if (columns.length === 0) return null;

    const keyColumn = columns.includes("key") ? "(key)" : "key";
    return {
      columns: [keyColumn, ...columns],
      rows: entries,
      cell: (row, column) => {
        const [k, v] = row as [string, Record<string, unknown>];
        return column === keyColumn ? k : v[column];
      },
      hiddenColumns,
      keyColumn,
    };
  }

  return null;
}

/** How a cell prints. Containers collapse to a shape summary rather than
 * being stringified into the grid — a nested object in a cell is a signal to
 * switch to the tree, not something to read inside a 120px column. */
export function cellText(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value as object).length}}`;
  }
  return String(value);
}

/** The class that colours a cell, reusing the JSON viewer's syntax tokens so
 * a number looks like a number in every view. */
export function cellClass(value: unknown): string {
  if (value === undefined) return "nm-tree-undefined";
  if (value === null) return "nm-tree-null";
  if (typeof value === "number") return "nm-tree-number";
  if (typeof value === "boolean") return "nm-tree-boolean";
  if (typeof value === "object") return "nm-tree-summary";
  return "nm-tree-string";
}
