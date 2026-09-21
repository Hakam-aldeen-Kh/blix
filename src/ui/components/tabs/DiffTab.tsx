"use client";

/**
 * Dev Tools — the Redux action's structural diff (`stateDiff.ts`).
 *
 * **Changes** is a unified diff: each changed path is a header, and under it
 * both sides pretty-printed and diffed by line, with unchanged stretches
 * collapsed. It replaces a one-line-per-path summary that was the right shape
 * for a scalar and useless for anything else — an object could only ever be
 * shown as `{"items":[…]}` on the left and `{"items":[…]}` on the right, with
 * no way to see which leaf inside it moved.
 *
 * It is contributed to `DataView` as one view among six. The same `changes`
 * array is also a **Table** (path | op | before | after), a **Tree** you can
 * drill into, and JSON/YAML/Text you can copy.
 */

import { isTruncationMarker } from "../../../capture/monitorTruncate";
import type { MonitorEntry } from "../../../capture/networkMonitor";
import type { StateDiffEntry } from "../../../capture/networkMonitor";
import { lineDiff, withHunks } from "../../helpers/lineDiff";
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

/**
 * Both sides of a change, pretty-printed so they can be diffed by line.
 *
 * A string stays a string — quoting it would put escaped quotes in the diff
 * where the value itself has none. Everything else is JSON with two-space
 * indentation, which is what makes an object's changed leaf land on its own
 * line instead of inside a one-line blob.
 */
function toLines(value: unknown): string {
  if (value === undefined) return "";
  if (isTruncationMarker(value)) return formatDiffValue(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** One changed path, rendered the way a diff is read. */
function Change({ change }: { change: StateDiffEntry }) {
  const rows = withHunks(lineDiff(toLines(change.before), toLines(change.after)));
  const counts = rows.reduce(
    (acc, r) => {
      if ("gap" in r) return acc;
      if (r.op === "add") acc.add += 1;
      if (r.op === "del") acc.del += 1;
      return acc;
    },
    { add: 0, del: 0 },
  );

  return (
    <div className="nm-gh">
      {/* The path is this diff's file header: what changed, and by how much. */}
      <div className="nm-gh-head">
        <span className="nm-gh-path">{change.path}</span>
        {counts.add > 0 && <span className="nm-gh-stat-add">+{counts.add}</span>}
        {counts.del > 0 && <span className="nm-gh-stat-del">−{counts.del}</span>}
      </div>
      <div className="nm-gh-body">
        {rows.map((row, i) =>
          "gap" in row ? (
            <div className="nm-gh-gap" key={`gap-${i}`}>
              <span className="nm-gh-n" />
              <span className="nm-gh-n" />
              <span className="nm-gh-sign" />
              <span className="nm-gh-text">
                {row.gap} unchanged {row.gap === 1 ? "line" : "lines"}
              </span>
            </div>
          ) : (
            <div className={`nm-gh-line nm-gh-${row.op}`} key={i}>
              <span className="nm-gh-n">{row.before ?? ""}</span>
              <span className="nm-gh-n">{row.after ?? ""}</span>
              <span className="nm-gh-sign" aria-hidden>
                {row.op === "add" ? "+" : row.op === "del" ? "−" : " "}
              </span>
              {/* dir=auto: these payloads carry Arabic, and mixing it with the
                  Latin punctuation JSON is made of reorders the line. */}
              <bdi className="nm-gh-text" dir="auto">
                {row.text}
              </bdi>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** The rows view — the tab's speciality, handed to `DataView` as its extra. */
function Changes({ changes }: { changes: StateDiffEntry[] }) {
  return (
    <div className="nm-gh-wrap nm-scroll">
      {changes.map((c, i) => (
        <Change key={`${c.path}-${i}`} change={c} />
      ))}
    </div>
  );
}

/**
 * Copying gives a real unified diff, which is what someone pasting "what
 * changed" into a ticket or a PR comment actually wants — and what every tool
 * on the other end already knows how to render.
 */
function changesToText(changes: StateDiffEntry[]): string {
  return changes
    .map((c) => {
      const body = lineDiff(toLines(c.before), toLines(c.after))
        .map((l) => `${l.op === "add" ? "+" : l.op === "del" ? "-" : " "}${l.text}`)
        .join("\n");
      return `--- ${c.path}\n${body}`;
    })
    .join("\n\n");
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
