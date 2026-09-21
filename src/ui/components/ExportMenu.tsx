"use client";

/**
 * Dev Tools — the export menu.
 *
 * Two decisions, presented in the order you make them.
 *
 * **Scope first.** Exporting the whole buffer while you are staring at twelve
 * filtered rows is almost never what you meant, and the old menu silently did
 * exactly that. The scope is a visible toggle with both counts on it, so the
 * export says what it will contain before you pick a format.
 *
 * **Format second**, grouped by who is on the other end: a tool, a person, or
 * a shell. Each item is two lines — the name with its file extension, and the
 * description. The copy was already right; it only needed room.
 *
 * The cURL item carries a left mark in `--bx-warn` because its masking note is
 * a guarantee, not a footnote.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import { copyText } from "../helpers/format";
import { downloadText, fileStamp } from "../services/download";
import { exportHar } from "../services/harExport";
import { toCsv, toCurlScript, toMarkdown, toNdjson } from "../services/exportFormats";
import { Menu, type MenuAnchor } from "./Menu";

export type ExportScope = "shown" | "all";

/** One format. `warn` marks the row whose description is a promise. */
function Item({
  name,
  ext,
  copy,
  warn,
  disabled,
  onSelect,
  children,
}: {
  name: string;
  ext: string;
  /** The extension column names the clipboard rather than a file. */
  copy?: boolean;
  warn?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`nm-export-item${warn ? " nm-export-warn" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="nm-export-top">
        <span className="nm-export-name">{name}</span>
        <span className="nm-export-ext" data-copy={copy || undefined}>
          {ext}
        </span>
      </span>
      <span className="nm-export-note">{children}</span>
    </button>
  );
}

export function ExportMenu({
  anchor,
  scope,
  onScope,
  shown,
  all,
  onDone,
}: {
  anchor: MenuAnchor;
  scope: ExportScope;
  onScope: (scope: ExportScope) => void;
  /** What the current section and filters leave visible. */
  shown: MonitorEntry[];
  /** Everything in the buffer, across all four sections. */
  all: MonitorEntry[];
  /** Close the menu — every format is a one-shot action. */
  onDone: () => void;
}) {
  const entries = scope === "all" ? all : shown;
  const stamp = fileStamp();
  const empty = entries.length === 0;

  /** Runs an export, then closes. Downloads and clipboard writes both fail
   * silently in a sandboxed frame; neither is worth a modal. */
  const run = (fn: () => void) => () => {
    fn();
    onDone();
  };

  const save = (ext: string, mime: string, text: string) =>
    downloadText(`blix-${stamp}.${ext}`, mime, text);

  return (
    <Menu anchor={anchor} width={420} label="Export">
      <div className="nm-menu-head">
        <span>Export</span>
        <div className="nm-menu-scope">
          <button
            type="button"
            className={`nm-scope-btn${scope === "shown" ? " active" : ""}`}
            onClick={() => onScope("shown")}
            title="Only what the current section and filters show"
          >
            Shown <b>{shown.length}</b>
          </button>
          <button
            type="button"
            className={`nm-scope-btn${scope === "all" ? " active" : ""}`}
            onClick={() => onScope("all")}
            title="Everything in the buffer, across all four sources"
          >
            All <b>{all.length}</b>
          </button>
        </div>
      </div>

      <div className="nm-menu-group">
        <span>FOR A TOOL</span>
      </div>
      <Item name="HAR" ext=".har" disabled={empty} onSelect={run(() => exportHar(entries))}>
        Opens in Chrome DevTools, Charles, Insomnia or Postman — with the decrypted
        bodies. HTTP entries only.
      </Item>
      <Item
        name="JSON"
        ext=".json"
        disabled={empty}
        onSelect={run(() => save("json", "application/json", JSON.stringify(entries, null, 2)))}
      >
        Everything captured, including frames, diffs and timings.
      </Item>
      <Item
        name="NDJSON"
        ext=".ndjson"
        disabled={empty}
        onSelect={run(() => save("ndjson", "application/x-ndjson", toNdjson(entries)))}
      >
        One entry per line — pipe it into jq.
      </Item>

      <div className="nm-menu-group">
        <span>FOR A PERSON</span>
      </div>
      <Item
        name="Markdown table"
        ext="copy"
        copy
        disabled={empty}
        onSelect={run(() => void copyText(toMarkdown(entries)))}
      >
        Paste into an issue, a PR or Slack. Failures come with their error bodies.
      </Item>
      <Item
        name="CSV"
        ext=".csv"
        disabled={empty}
        onSelect={run(() => save("csv", "text/csv;charset=utf-8", toCsv(entries)))}
      >
        One row per entry, no bodies — for sorting and counting in a spreadsheet.
      </Item>

      <div className="nm-menu-group">
        <span>FOR A SHELL</span>
      </div>
      <Item
        name="cURL script"
        ext=".sh"
        warn
        disabled={empty}
        onSelect={run(() => save("sh", "text/x-shellscript", toCurlScript(entries)))}
      >
        Every request in order, runnable against another environment. Authorization
        headers are always masked — even while the panel shows them in full.
      </Item>
    </Menu>
  );
}
