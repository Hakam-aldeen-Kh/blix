"use client";

/** Dev Tools — bottom status bar with the aggregate totals, the way
 * Chrome summarizes a session under its request list. */

import { formatBytes, formatDuration } from "../helpers/format";
import type { Counts } from "../hooks/useMonitorList";
import { Icon } from "./Icon";

export function StatusBar({
  counts,
  shown,
  noun,
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
  /** What a row *is* in the active section — the bar sat under a table of
   * Redux actions calling them "requests". */
  noun: string;
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
        {shown !== counts.all && <> of {counts.all}</>} {noun}
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
          className="nm-statusbar-btn nm-statusbar-pin"
          onClick={onShowPinned}
          title="Filter to pinned entries"
        >
          {/* The panel's own pin glyph, not the 📌 emoji this used to carry:
              an emoji renders in the system font at a size and weight nothing
              else in the bar shares, and looks different on every platform. */}
          <Icon name="pin" size={11} />
          {pinnedCount} pinned
        </button>
      )}

      <span className="nm-statusbar-spacer" />

      {persistedLabel && (
        <button
          className={`nm-statusbar-btn nm-status-persisted${
            purgeArmed ? " nm-statusbar-armed" : ""
          }`}
          onClick={onPurge}
          title={
            purgeArmed
              ? "Click again to delete the saved log"
              : "Saved to IndexedDB — click twice to purge"
          }
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
