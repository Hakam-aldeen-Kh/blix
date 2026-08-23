"use client";

/**
 * Dev Tools — the Redux action's structural diff (`stateDiff.ts`).
 *
 * The +/− rows are the right *default* for a diff and nothing generic
 * reproduces them: the operation, the path and the before → after transition
 * belong on one line. But they are a summary, and a summary is exactly the
 * wrong thing when the value that changed is an object — the row could only
 * ever show `{"items":[…]}` flattened onto one line, with no way to look
 * inside it.
 *
 * So the rows are contributed to `DataView` as one view among six. The same
 * `changes` array is then also a **Table** (path | op | before | after, which
 * is what a diff *is*), a **Tree** you can drill into, and JSON/YAML/Text you
 * can copy into a ticket.
 */

import { isTruncationMarker } from "../../../capture/monitorTruncate";
import type { MonitorEntry } from "../../../capture/networkMonitor";
import type { StateDiffEntry } from "../../../capture/networkMonitor";
import type { DataFormat } from "../../types/monitorUi";
import { DataView } from "../DataView";

function formatDiffValue(value: unknown): string {
  if (value === undefined) return "—";
  if (isTruncationMarker(value)) {
    return value.__nmTruncated === "string"
      ? `"${value.head ?? ""}…" (truncated, ${value.bytes ?? "?"} chars)`
      : `{ …truncated, ${value.omitted ?? "?"} omitted }`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function OpBadge({ op }: { op: StateDiffEntry["op"] }) {
  const label = op === "add" ? "+" : op === "remove" ? "−" : "±";
  return (
    <span className={`nm-diff-op nm-diff-op-${op}`} title={op}>
      {label}
    </span>
  );
}

/** The rows view — the tab's speciality, handed to `DataView` as its extra. */
function Changes({ changes }: { changes: StateDiffEntry[] }) {
  return (
    <div className="nm-diff nm-scroll">
      {changes.map((c, i) => (
        <div key={`${c.path}-${i}`} className="nm-diff-row">
          <div className="nm-diff-path">
            <OpBadge op={c.op} />
            <span className="nm-diff-path-txt">{c.path}</span>
          </div>
          <div className="nm-diff-values">
            {c.op !== "add" && (
              <code className="nm-diff-val nm-diff-before">
                {formatDiffValue(c.before)}
              </code>
            )}
            {c.op === "change" && <span className="nm-diff-arrow">→</span>}
            {c.op !== "remove" && (
              <code className="nm-diff-val nm-diff-after">
                {formatDiffValue(c.after)}
              </code>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Copying the rows view gives a unified-diff-ish text, which is what someone
 * pasting "what changed" into a ticket actually wants — not the JSON. */
function changesToText(changes: StateDiffEntry[]): string {
  return changes
    .map((c) => {
      switch (c.op) {
        case "add":
          return `+ ${c.path} = ${formatDiffValue(c.after)}`;
        case "remove":
          return `- ${c.path} (was ${formatDiffValue(c.before)})`;
        default:
          return `~ ${c.path}: ${formatDiffValue(c.before)} -> ${formatDiffValue(c.after)}`;
      }
    })
    .join("\n");
}

export function DiffTab({
  entry,
  query,
  format,
  onFormat,
}: {
  entry: MonitorEntry;
  query: string;
  format: DataFormat;
  onFormat: (format: DataFormat) => void;
}) {
  const diff = entry.redux?.diff;

  if (!diff || diff.changes.length === 0) {
    return (
      <div className="nm-empty">
        <p className="nm-empty-title">No changes</p>
        <p className="nm-empty-sub">
          This action didn&apos;t change any Redux state — a no-op dispatch.
        </p>
      </div>
    );
  }

  return (
    <>
      {diff.truncated && (
        <div className="nm-notice">
          <span className="nm-notice-txt">
            Diff truncated — too many or too deep changes to show in full.
          </span>
        </div>
      )}
      <DataView
        value={diff.changes}
        query={query}
        entryId={`${entry.id}:diff`}
        format={format}
        onFormat={onFormat}
        extraFormat={{
          id: "diff",
          label: "Changes",
          title: "Path-by-path diff — before → after",
          render: () => <Changes changes={diff.changes} />,
          copy: () => changesToText(diff.changes),
        }}
      />
    </>
  );
}
