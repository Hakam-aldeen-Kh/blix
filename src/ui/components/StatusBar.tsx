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
  dbName,
  dbShared,
  onPurge,
  onShowDatabases,
  onShowErrors,
  onShowPinned,
  onOpenPalette,
  authUnmasked,
  onMaskAuthorization,
}: {
  /** `Authorization` masking is switched off. A persisted setting, so it is
   * announced here rather than left for someone to find in a menu. */
  authUnmasked: boolean;
  onMaskAuthorization: () => void;
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
  /** Resolved name of the database this panel is using. */
  dbName: string;
  /** True when no `dbName` was given and this is the origin-wide default. */
  dbShared: boolean;
  onPurge: () => void;
  onShowDatabases: () => void;
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
      {/* Second in the bar and never dropped at a breakpoint: of everything
          about this session, it is the one fact someone about to screenshot
          the panel needs to see. */}
      {authUnmasked && (
        <button
          className="nm-statusbar-btn nm-statusbar-unmasked"
          onClick={onMaskAuthorization}
          title="Authorization values are shown in full for requests captured while this is on. Exports, copied snippets and the saved log still mask them. Click to mask again."
        >
          <span className="nm-statusbar-unmasked-tag">unmasked</span>
          Authorization
        </button>
      )}
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

      {/* Which database this panel is reading and writing. Ambient rather than
          conditional: the answer to "why am I seeing another app's requests?"
          should be on screen before the question gets asked, not only once
          something has already gone wrong. It turns amber on the shared
          default, which is the case where the answer is "you are". */}
      <button
        className={`nm-statusbar-btn nm-statusbar-db nm-status-db${
          dbShared ? " nm-statusbar-db-shared" : ""
        }`}
        onClick={onShowDatabases}
        title={
          dbShared
            ? `Writing to the shared default "${dbName}" — every app on this origin uses it, so entries from other projects will appear here. Pass dbName to separate them. Click to see every database on this origin.`
            : `Writing to "${dbName}". Click to see every Blix database on this origin.`
        }
      >
        <Icon name="database" size={11} />
        {/* The name is the first thing to go when the bar runs out of room —
            it is the longest part and the icon still opens the screen that
            spells it out. The `shared` tag outlives it: it is the warning. */}
        <span className="nm-statusbar-db-name">{dbName}</span>
        {dbShared && <span className="nm-statusbar-db-tag">shared</span>}
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
