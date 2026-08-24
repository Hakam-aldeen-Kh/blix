"use client";

/**
 * Dev Tools — the export menu.
 *
 * Two decisions, presented in the order you make them.
 *
 * **Scope first.** Exporting the whole buffer when you are staring at twelve
 * filtered rows is almost never what you meant, and the old menu silently did
 * exactly that — it took the unfiltered `entries` array whatever the list was
 * showing. Rather than change that behaviour behind everyone's back, the scope
 * is now a visible toggle with both counts on it, so the export says what it
 * will contain before you pick a format.
 *
 * **Format second**, grouped by who is on the other end: a tool, a person, or
 * a shell. Every row names its consumer, because "HAR vs NDJSON" means nothing
 * to someone who has not needed one before.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import { copyText } from "../helpers/format";
import { downloadText, fileStamp } from "../services/download";
import { exportHar } from "../services/harExport";
import {
  toCsv,
  toCurlScript,
  toMarkdown,
  toNdjson,
} from "../services/exportFormats";
import { Icon } from "./Icon";
import { Menu, MenuItem, type MenuAnchor } from "./Menu";

export type ExportScope = "shown" | "all";

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
    <Menu anchor={anchor} width={272} label="Export">
      <div className="nm-menu-head">Export</div>

      <div className="nm-menu-scope">
        <button
          className={`nm-scope-btn${scope === "shown" ? " active" : ""}`}
          onClick={() => onScope("shown")}
          title="Only what the current section and filters show"
        >
          Shown <b>{shown.length}</b>
        </button>
        <button
          className={`nm-scope-btn${scope === "all" ? " active" : ""}`}
          onClick={() => onScope("all")}
          title="Everything captured, across all four sections"
        >
          All <b>{all.length}</b>
        </button>
      </div>

      <div className="nm-menu-group">For a tool</div>
      <MenuItem
        icon={<Icon name="download" size={13} />}
        disabled={empty}
        onSelect={run(() => exportHar(entries))}
      >
        HAR
      </MenuItem>
      <div className="nm-menu-note">
        Opens in Chrome DevTools, Charles, Insomnia or Postman — with the
        decrypted bodies. HTTP entries only.
      </div>
      <MenuItem
        icon={<Icon name="download" size={13} />}
        disabled={empty}
        onSelect={run(() =>
          save("json", "application/json", JSON.stringify(entries, null, 2)),
        )}
      >
        JSON
      </MenuItem>
      <div className="nm-menu-note">
        Everything captured, including frames, diffs and timings.
      </div>
      <MenuItem
        icon={<Icon name="download" size={13} />}
        disabled={empty}
        onSelect={run(() => save("ndjson", "application/x-ndjson", toNdjson(entries)))}
      >
        NDJSON
      </MenuItem>
      <div className="nm-menu-note">One entry per line — pipe it into jq.</div>

      <div className="nm-menu-group">For a person</div>
      <MenuItem
        icon={<Icon name="copy" size={13} />}
        disabled={empty}
        onSelect={run(() => void copyText(toMarkdown(entries)))}
      >
        Markdown table
        <span className="nm-menu-hint">copy</span>
      </MenuItem>
      <div className="nm-menu-note">
        Paste into an issue, a PR or Slack. Failures come with their error
        bodies.
      </div>
      <MenuItem
        icon={<Icon name="download" size={13} />}
        disabled={empty}
        onSelect={run(() => save("csv", "text/csv;charset=utf-8", toCsv(entries)))}
      >
        CSV
      </MenuItem>
      <div className="nm-menu-note">
        One row per entry, no bodies — for sorting and counting in a
        spreadsheet.
      </div>

      <div className="nm-menu-group">For a shell</div>
      <MenuItem
        icon={<Icon name="terminal" size={13} />}
        disabled={empty}
        onSelect={run(() => save("sh", "text/x-shellscript", toCurlScript(entries)))}
      >
        cURL script
      </MenuItem>
      <div className="nm-menu-note">
        Every request in order, runnable against another environment.
        Authorization headers were masked at capture.
      </div>
    </Menu>
  );
}
