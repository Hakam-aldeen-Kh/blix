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

import { MASK_SUFFIX } from "../../capture/monitorSerialize";
import { createContext, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { copyText, formatBytes } from "../helpers/format";
import { analyzeFolds } from "../helpers/jsonFold";
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

/**
 * A rendering only one pane can offer, added to the front of the switch.
 *
 * The Redux Diff tab is the case this exists for: its +/− rows are the best
 * way to read a diff and no generic format can reproduce them, but the same
 * data is *also* worth seeing as a table of paths or as YAML you can copy. A
 * pane contributes its speciality here instead of that view living in a
 * separate control beside the generic ones.
 */
export interface ExtraFormat {
  id: DataFormat;
  label: string;
  title: string;
  render: () => React.ReactNode;
  /** What Copy produces while this view is showing. */
  copy: () => string;
}

/**
 * Where the payload controls should render.
 *
 * The detail pane hands down the empty half of its tab row, and the format
 * switch, byte count, Wrap and Copy go there instead of into a bar of their
 * own. Tabs and format are different questions — which field, and how to read
 * it — but both belong to the same pane, and two stacked 32px bars over a
 * short docked payload was more chrome than content.
 *
 * `null` (the default) keeps the standalone toolbar, which is what a payload
 * viewer rendered anywhere other than the detail pane's tab body needs.
 */
export const PayloadToolbarSlot = createContext<HTMLElement | null>(null);

/** Formats whose output is a flat block of text, and so can wrap. */
const TEXTUAL: DataFormat[] = ["json", "yaml", "text"];

/** Shared empty set, so "nothing folded" is one stable reference. */
const EMPTY_FOLDS: ReadonlySet<string> = new Set();

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
  format: requested,
  onFormat,
  extraFormat,
  sizeBytes,
  children,
}: {
  value: unknown;
  /** Active search term, highlighted by the tree and the table. */
  query: string;
  /** Stable per payload — the tree keys its expansion state off this. */
  entryId: string;
  format: DataFormat;
  onFormat: (format: DataFormat) => void;
  extraFormat?: ExtraFormat;
  /** The entry's captured size, for the formats that never build a flat
   * string. Tree and Table render from the parsed value, so stringifying one
   * just to measure it would put a full JSON.stringify in every render. */
  sizeBytes?: number;
  /** A pane's own navigation, rendered as its own bar above the format
   * toolbar — the Redux State tab's slice picker. Kept separate because
   * "which part of the store am I looking at" and "how is it rendered" are
   * different questions and should not compete for the same row. */
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(true);
  const toolbarSlot = useContext(PayloadToolbarSlot);

  // The stored format may name a view this pane does not offer — "diff" is
  // remembered globally but only the Diff tab can render it. Fall back rather
  // than showing an empty pane.
  const format: DataFormat =
    requested === extraFormat?.id || FORMATS.some((f) => f.id === requested)
      ? requested
      : "tree";

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

  // Foldable blocks in the JSON rendering. Only JSON: the map's rules are
  // `JSON.stringify`'s output conventions, not something general.
  const jsonLines = useMemo(() => (json === null ? null : json.split("\n")), [json]);
  const folds = useMemo(
    () => (jsonLines === null ? null : analyzeFolds(jsonLines)),
    [jsonLines],
  );
  /**
   * Which blocks the reader has folded, as the paths they occupy in the value
   * — `$.user.tags` — carried on each region by `analyzeFolds`.
   *
   * This is the payload tree's model, and it is here because the line-number
   * version it replaced could not survive the text changing underneath it. The
   * text changes constantly in one important case: the Redux **State** tab
   * reads the live store, so every dispatched action re-serializes the whole
   * payload. A fold addressed by line either vanished when a line shifted or
   * landed on whatever moved into that position. A path is a fact about the
   * structure, so `$.cart.items` stays folded while a counter ticks beside it,
   * and a path that no longer exists simply matches nothing.
   *
   * `key` is the entry it belongs to, compared during render rather than
   * cleared in an effect — an effect runs *after* the render that already drew
   * the previous payload's folds over this one.
   */
  const [foldState, setFoldState] = useState<{ key: string; paths: Set<string> }>(
    () => ({ key: entryId, paths: new Set() }),
  );
  const folded: ReadonlySet<string> =
    foldState.key === entryId ? foldState.paths : EMPTY_FOLDS;

  /** Blocks below the outermost one — what "Collapse all" acts on. Folding the
   * root too would leave a single line, which is not a view of anything. */
  const collapsible = useMemo(
    () => (folds?.regions ?? []).filter((r) => r.depth > 0),
    [folds],
  );
  const allFolded =
    collapsible.length > 0 && collapsible.every((r) => folded.has(r.path));

  const setPaths = (paths: Set<string>) => setFoldState({ key: entryId, paths });

  const toggleFold = (path: string) => {
    const paths = new Set(folded);
    if (!paths.delete(path)) paths.add(path);
    setPaths(paths);
  };

  const foldAll = () => setPaths(new Set(collapsible.map((r) => r.path)));
  const unfoldAll = () => setPaths(new Set());

  if (value === undefined) {
    return <div className="nm-empty">— not captured —</div>;
  }

  /** What Copy puts on the clipboard: whatever is on screen. */
  const copyPayload = (): string => {
    if (format === extraFormat?.id) return extraFormat.copy();
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

  /**
   * How many values on screen are not the values that were sent.
   *
   * The panel masks sensitive strings before they are ever stored, so a
   * reader comparing a payload against the wire needs to know the difference
   * is deliberate. Counted from the rendered text rather than tracked through
   * the pipeline: the mask suffix is the only thing that survives every
   * format, and a count that disagreed with what is on screen would be worse
   * than none.
   */
  const maskedCount = useMemo(() => {
    const source = json ?? text ?? "";
    let n = 0;
    let at = source.indexOf(MASK_SUFFIX);
    while (at !== -1) {
      n += 1;
      at = source.indexOf(MASK_SUFFIX, at + MASK_SUFFIX.length);
    }
    return n;
  }, [json, text]);

  const body = json ?? yaml?.text ?? text ?? null;
  const lines = jsonLines?.length ?? (body ? body.split("\n").length : 0);
  const isTextual = TEXTUAL.includes(format);

  const tools = (
    <>
      <div className="nm-fmt" role="tablist" aria-label="Display format">
          {/* The pane's own view leads: it is the one this tab was designed
              around, and the generic formats are the alternatives to it. */}
          {(extraFormat ? [extraFormat, ...FORMATS] : FORMATS).map((f) => {
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

        {maskedCount > 0 && (
          <span className="nm-masked">{maskedCount} masked</span>
        )}
        <span className="nm-json-size">
          {body == null && sizeBytes != null && format !== "table" && formatBytes(sizeBytes)}
          {body != null &&
            `${formatBytes(body.length)} · ${lines} ${lines === 1 ? "line" : "lines"}`}
          {format === "table" &&
            table &&
            `${table.rows.length} rows · ${table.columns.length} cols`}
          {yaml?.truncated && " · truncated"}
        </span>

        {/* Only JSON folds, so this only appears there. It offers Expand all
            only once everything *is* folded: flipping the moment one block was
            folded by hand left no way to collapse the rest without expanding
            them all first. */}
        <span className="nm-tool-gap" />
        {collapsible.length > 0 && (
          <button
            className="nm-copy"
            onClick={allFolded ? unfoldAll : foldAll}
            title={
              allFolded
                ? "Expand every collapsed object"
                : "Collapse every object below the top level"
            }
          >
            {allFolded ? "Expand all" : "Collapse all"}
          </button>
        )}
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
          title={`Copy as ${
            format === extraFormat?.id
              ? extraFormat.label
              : format === "table"
                ? "CSV"
                : format.toUpperCase()
          }`}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
    </>
  );

  return (
    <div className="nm-json-wrap">
      {/* Navigation sits *above* the presentation controls, not inside them.
          Crammed into one row it squeezed the size readout into a 40px column
          that wrapped "116 B · 10 lines" across three lines, and clipped the
          slice names mid-word — three unrelated jobs competing for one line. */}
      {children}

      {/* Into the detail pane's tab row when there is one, into a bar of its
          own otherwise. */}
      {toolbarSlot ? (
        createPortal(<div className="nm-tabrow-tools">{tools}</div>, toolbarSlot)
      ) : (
        <div className="nm-json-toolbar">{tools}</div>
      )}

      {format === extraFormat?.id && extraFormat.render()}
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
        <JsonText
          text={body}
          wrap={wrap}
          highlight={format === "json"}
          folds={folds}
          folded={folded}
          onToggleFold={toggleFold}
        />
      )}
    </div>
  );
}
