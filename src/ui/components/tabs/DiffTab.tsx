"use client";

/**
 * Dev Tools — the Redux action's structural diff (`stateDiff.ts`).
 *
 * Deliberately lightweight compared to `JsonText`/`JsonTree` — a diff can have
 * dozens of rows, each needing two values, so this renders plain formatted
 * text rather than a full interactive viewer per cell.
 */

import { isTruncationMarker } from "../../../capture/monitorTruncate";
import type { MonitorEntry } from "../../../capture/networkMonitor";
import type { StateDiffEntry } from "../../../capture/networkMonitor";

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

export function DiffTab({ entry }: { entry: MonitorEntry }) {
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
    <div className="nm-diff nm-scroll">
      {diff.truncated && (
        <div className="nm-notice">
          <span className="nm-notice-txt">
            Diff truncated — too many or too deep changes to show in full.
          </span>
        </div>
      )}
      {diff.changes.map((c, i) => (
        <div key={`${c.path}-${i}`} className="nm-diff-row">
          <div className="nm-diff-path">
            <OpBadge op={c.op} />
            <span className="nm-diff-path-txt">{c.path}</span>
          </div>
          <div className="nm-diff-values">
            {c.op !== "add" && (
              <code className="nm-diff-val nm-diff-before">{formatDiffValue(c.before)}</code>
            )}
            {c.op === "change" && <span className="nm-diff-arrow">→</span>}
            {c.op !== "remove" && (
              <code className="nm-diff-val nm-diff-after">{formatDiffValue(c.after)}</code>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
