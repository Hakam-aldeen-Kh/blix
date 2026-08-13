"use client";

/** Dev Tools — bottom status bar with the aggregate totals, the way
 * Chrome summarizes a session under its request list. */

import { formatBytes, formatDuration } from "../helpers/format";
import type { Counts } from "../hooks/useMonitorList";
import { Icon } from "./Icon";

export function StatusBar({
  counts,
  shown,
  totalBytes,
  slowestMs,
  pinnedCount,
  persistedLabel,
  purgeArmed,
  onPurge,
  onShowErrors,
  onShowPinned,
  onOpenShortcuts,
}: {
  counts: Counts;
  shown: number;
  totalBytes: number;
  slowestMs: number;
  pinnedCount: number;
  persistedLabel: string | null;
  purgeArmed: boolean;
  onPurge: () => void;
  onShowErrors: () => void;
  onShowPinned: () => void;
  onOpenShortcuts: () => void;
}) {
  return (
    <div className="nm-statusbar">
      <span>
        <b>{shown}</b>
        {shown !== counts.all && <> of {counts.all}</>} requests
      </span>
      <span className="nm-status-transferred">
        <b>{formatBytes(totalBytes)}</b> transferred
      </span>
      {slowestMs > 0 && (
        <span className="nm-status-slowest">
          slowest <b>{formatDuration(slowestMs)}</b>
        </span>
      )}
      {counts.pending > 0 && (
        <span className="nm-status-inflight">
          <b>{counts.pending}</b> in flight
        </span>
      )}

      {counts.error > 0 && (
        <button
          className="nm-statusbar-btn nm-statusbar-err"
          onClick={onShowErrors}
          title="Filter to errors"
        >
          {counts.error} {counts.error === 1 ? "error" : "errors"}
        </button>
      )}
      {pinnedCount > 0 && (
        <button
          className="nm-statusbar-btn"
          onClick={onShowPinned}
          title="Filter to pinned requests"
        >
          📌 {pinnedCount} pinned
        </button>
      )}

      <span className="nm-statusbar-spacer" />

      {persistedLabel && (
        <button
          className="nm-statusbar-btn nm-status-persisted"
          onClick={onPurge}
          title={
            purgeArmed
              ? "Click again to delete the saved log"
              : "Saved to IndexedDB — click twice to purge"
          }
          style={purgeArmed ? { color: "#fca5a5", fontWeight: 700 } : undefined}
        >
          {purgeArmed ? "Purge saved log?" : persistedLabel}
        </button>
      )}
      <button
        className="nm-statusbar-btn"
        onClick={onOpenShortcuts}
        title="Keyboard shortcuts (?)"
      >
        <Icon name="keyboard" size={12} />
      </button>
    </div>
  );
}
