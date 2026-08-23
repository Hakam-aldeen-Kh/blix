"use client";

/**
 * Dev Tools — one payload, five renderings.
 *
 * Before this, the *tab* chose the format: "Preview" was the tree and
 * "Response" was raw JSON, showing identical data twice under names that gave
 * no hint of the difference. Format is a property of how you want to read
 * something, not of which field you are reading, so it belongs in a switch
 * next to the payload — and the two tabs collapse into one.
 *
 * Each format answers a different question:
 *
 * - **Tree** — "what is in here?" Collapsible, searchable, safe on huge
 *   payloads because collapsed subtrees cost one row.
 * - **Table** — "how do these records compare?" Only offered when the payload
 *   is genuinely tabular; disabled with a reason when it is not.
 * - **JSON** — "what exactly came back?" The literal bytes, syntax-coloured.
 * - **YAML** — "what shape is this?" Indentation instead of punctuation, and
 *   multi-line strings rendered as text rather than escapes.
 * - **Text** — "it isn't JSON." An HTML error page, a CSV body, a stack trace
 *   from a proxy. The tree shows those as one enormous quoted string.
 *
 * The toolbar is shared across all five, so size, wrapping and Copy sit in the
 * same place whichever one is showing. **Copy copies what you are looking at**
 * — Table copies CSV, YAML copies YAML — which is the behaviour that makes the
 * formats worth having at the payload level rather than only at export time.
 */

import { useMemo, useState } from "react";
import { copyText, formatBytes } from "../helpers/format";
import { asTable } from "../helpers/tabular";
import { toYaml } from "../helpers/toYaml";
import type { DataFormat } from "../types/monitorUi";
import { JsonText } from "./JsonText";
import { JsonTree } from "./JsonTree";
import { TableView } from "./TableView";

const FORMATS: { id: DataFormat; label: string; title: string }[] = [
  { id: "tree", label: "Tree", title: "Collapsible tree — best for exploring" },
  { id: "table", label: "Table", title: "Grid — best for comparing records" },
  { id: "json", label: "JSON", title: "Raw JSON, syntax-coloured" },
  { id: "yaml", label: "YAML", title: "Indented — best for nested shapes" },
  { id: "text", label: "Text", title: "The body as plain text" },
];

/** Formats whose output is a flat block of text, and so can wrap. */
const TEXTUAL: DataFormat[] = ["json", "yaml", "text"];

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    // Circular or otherwise unstringifiable — can reach here from a live
    // Redux store snapshot, which is not capture-sanitized.
    return String(value);
  }
}

/**
 * The payload as plain text.
 *
 * A captured body that *is* a string is shown verbatim — that is the whole
 * point of this format, and it is the only view that shows an HTML error page
 * as an HTML error page rather than as one long quoted line.
 */
function plainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return String(value);
  return jsonText(value);
}

/** CSV of the visible grid, for Copy while the Table format is showing. */
function tableCsv(shape: NonNullable<ReturnType<typeof asTable>>): string {
  const field = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = shape.columns.map(field).join(",");
  const body = shape.rows.map((row) =>
    shape.columns
      .map((c) => {
        const cell = shape.cell(row, c);
        return field(
          cell !== null && typeof cell === "object" ? jsonText(cell) : cell,
        );
      })
      .join(","),
  );
  return [head, ...body].join("\r\n");
}

export function DataView({
  value,
  query,
  entryId,
  format,
  onFormat,
}: {
  value: unknown;
  /** Active search term, highlighted by the tree and the table. */
  query: string;
  /** Stable per payload — the tree keys its expansion state off this. */
  entryId: string;
  format: DataFormat;
  onFormat: (format: DataFormat) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(true);

  // Computed for every payload regardless of the active format, because the
  // Table button's enabled state depends on it. Bounded by `tabular.ts`'s scan
  // limit, so this costs the same on a ten-row response and a ten-thousand-row
  // one.
  const table = useMemo(() => asTable(value), [value]);
  const tabular = table !== null;

  // The textual formats are derived only while showing: serializing a
  // multi-megabyte payload to YAML is not something to do for a tab nobody
  // opened.
  const yaml = useMemo(
    () => (format === "yaml" ? toYaml(value) : null),
    [format, value],
  );
  const text = useMemo(
    () => (format === "text" ? plainText(value) : null),
    [format, value],
  );
  const json = useMemo(
    () => (format === "json" ? jsonText(value) : null),
    [format, value],
  );

  if (value === undefined) {
    return <div className="nm-empty">— not captured —</div>;
  }

  /** What Copy puts on the clipboard: whatever is on screen. */
  const copyPayload = (): string => {
    switch (format) {
      case "yaml":
        return yaml?.text ?? toYaml(value).text;
      case "text":
        return text ?? plainText(value);
      case "table":
        return table ? tableCsv(table) : jsonText(value);
      default:
        return json ?? jsonText(value);
    }
  };

  const copy = () => {
    void copyText(copyPayload()).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const body = json ?? yaml?.text ?? text ?? null;
  const lines = body ? body.split("\n").length : 0;
  const isTextual = TEXTUAL.includes(format);

  return (
    <div className="nm-json-wrap">
      <div className="nm-json-toolbar">
        <div className="nm-fmt" role="tablist" aria-label="Display format">
          {FORMATS.map((f) => {
            const disabled = f.id === "table" && !tabular;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={format === f.id}
                className={`nm-fmt-btn${format === f.id ? " active" : ""}`}
                disabled={disabled}
                title={
                  disabled
                    ? "Table needs a list of records — this payload isn't one"
                    : f.title
                }
                onClick={() => onFormat(f.id)}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <span className="nm-json-size">
          {body != null &&
            `${formatBytes(body.length)} · ${lines} ${lines === 1 ? "line" : "lines"}`}
          {format === "table" &&
            table &&
            `${table.rows.length} rows · ${table.columns.length} cols`}
          {yaml?.truncated && " · truncated"}
        </span>

        {isTextual && (
          <button
            className={`nm-copy nm-toggle${wrap ? " active" : ""}`}
            onClick={() => setWrap((w) => !w)}
            title="Toggle line wrapping"
          >
            Wrap
          </button>
        )}
        <button
          className="nm-copy"
          onClick={copy}
          title={`Copy as ${format === "table" ? "CSV" : format.toUpperCase()}`}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {format === "tree" && (
        <JsonTree value={value} query={query} entryId={entryId} />
      )}
      {format === "table" &&
        (table ? (
          <TableView shape={table} query={query} />
        ) : (
          <div className="nm-empty">— not a list of records —</div>
        ))}
      {isTextual && body !== null && (
        <JsonText text={body} wrap={wrap} highlight={format === "json"} />
      )}
    </div>
  );
}
