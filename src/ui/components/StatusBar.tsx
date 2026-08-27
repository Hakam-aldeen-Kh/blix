"use client";

/**
 * Dev Tools — the bottom status bar.
 *
 * The per-source totals moved to the rail, which has room to stack them and
 * does not drop them at the first breakpoint. What is left here is the session
 * as a whole plus the two things you *act on* from it: the command palette,
 * and the log sitting in IndexedDB.
 *
 * The failure count is a sentence rather than a number — "2 failing on /Auth"
 * says where to look, which is the only reason to put failures in a bar you
 * are not looking at.
 */

import { formatBytes, formatDuration, requestName } from "../helpers/format";
import type { Counts } from "../hooks/useMonitorList";
import { Icon } from "./Icon";

export function StatusBar({
  counts,
  shown,
  noun,
  totalBytes,
  slowestMs,
  failingHint,
  pinnedCount,
  persistedLabel,
  purgeArmed,
  onPurge,
  onShowErrors,
  onShowPinned,
  onOpenPalette,
}: {
  counts: Counts;
  shown: number;
  /** What a row *is* in the active section — the bar sat under a table of
   * Redux actions calling them "requests". */
  noun: string;
  totalBytes: number;
  slowestMs: number;
  /** URL of one failing entry, so the count can say where the failures are. */
  failingHint: string | null;
  pinnedCount: number;
  persistedLabel: string | null;
  purgeArmed: boolean;
  onPurge: () => void;
  onShowErrors: () => void;
  onShowPinned: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <div className="nm-statusbar">
      <span className="nm-statusbar-mono">
        <b>{shown}</b>
        {shown !== counts.all && <> of {counts.all}</>} {noun}
      </span>
      <span className="nm-statusbar-sep nm-status-transferred" />
      <span className="nm-statusbar-mono nm-status-transferred">
        <b>{formatBytes(totalBytes)}</b> transferred
      </span>
      {slowestMs > 0 && (
        <>
          <span className="nm-statusbar-sep nm-status-slowest" />
          <span className="nm-statusbar-mono nm-status-slowest">
            slowest <b>{formatDuration(slowestMs)}</b>
          </span>
        </>
      )}

      {counts.error > 0 && (
        <>
          <span className="nm-statusbar-sep nm-status-failing" />
          <button
            className="nm-statusbar-btn nm-statusbar-err nm-status-failing"
            onClick={onShowErrors}
            title="Filter to errors"
          >
            <b>{counts.error}</b> failing
            {failingHint && (
              <span className="nm-statusbar-mono"> on {requestName(failingHint)}</span>
            )}
          </button>
        </>
      )}
      {pinnedCount > 0 && (
        <button
          className="nm-statusbar-btn nm-statusbar-pin"
          onClick={onShowPinned}
          title="Filter to pinned entries"
        >
          <Icon name="pin" size={11} />
          {pinnedCount} pinned
        </button>
      )}

      <span className="nm-statusbar-spacer" />

      <button className="nm-statusbar-btn" onClick={onOpenPalette} title="Command palette">
        commands <kbd className="nm-kbd">⌘K</kbd>
      </button>
      {persistedLabel && (
        <button
          className={`nm-statusbar-btn nm-statusbar-persisted nm-status-persisted${
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
    </div>
  );
}
