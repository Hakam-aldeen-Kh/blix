"use client";

/**
 * Dev Tools — the status bar.
 *
 * All monospace, all tabular, separators a `/`. The per-source totals moved to
 * the sidebar, which has room to stack them; what is left is the session as a
 * whole plus the things you *act on* from it.
 *
 * The failure count is a sentence and a link — "9 failing on getBacklog" says
 * where to look, and clicking it applies the filter. A count you cannot act on
 * is a count you learn to ignore.
 */

import { formatBytes, formatDuration, requestName } from "../helpers/format";
import type { Counts } from "../hooks/useMonitorList";
import { Icon } from "./Icon";

/**
 * One segment of the bar, with the separator that precedes it.
 *
 * The separator belongs to the segment rather than standing between two of
 * them, because the width breakpoints hide segments — and a free-standing
 * separator has no way to know that what followed it is gone. The bar used to
 * collapse to a row of orphan slashes.
 */
function Seg({
  className,
  first,
  children,
}: {
  className?: string;
  /** No leading separator: it opens its group. */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={`nm-statusbar-seg${className ? ` ${className}` : ""}`}>
      {!first && (
        <span className="nm-statusbar-sep" aria-hidden>
          /
        </span>
      )}
      {/* One wrapper, so the content stays a single flex item. Left bare, each
          text node became its own item and flex trimmed the spaces between
          them: "24 of 24 requests" rendered as "24of24requests". */}
      <span className="nm-statusbar-seg-body">{children}</span>
    </span>
  );
}

export function StatusBar({
  counts,
  shown,
  noun,
  totalBytes,
  slowestMs,
  failingHint,
  pinnedCount,
  persistedLabel,
  persistedCount,
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
  persistedCount: number;
  purgeArmed: boolean;
  dbName: string;
  dbShared: boolean;
  onPurge: () => void;
  onShowDatabases: () => void;
  onShowErrors: () => void;
  onShowPinned: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <div className="nm-statusbar">
      {/* Left: what the session is. Ordered by how often it is the reason you
          looked, which is also the order the breakpoints take them away in —
          in reverse. */}
      <div className="nm-statusbar-group">
        <Seg first>
          <b>{shown}</b> of <b>{counts.all}</b> {noun}
        </Seg>

        <Seg className="nm-status-transferred">
          <b>{formatBytes(totalBytes)}</b> transferred
        </Seg>

        {slowestMs > 0 && (
          <Seg className="nm-status-slowest">
            slowest <b>{formatDuration(slowestMs)}</b>
          </Seg>
        )}

        {counts.error > 0 && (
          <Seg className="nm-status-failing">
            <button
              type="button"
              className="nm-statusbar-btn nm-statusbar-err"
              onClick={onShowErrors}
              title="Filter to errors"
            >
              <b>{counts.error}</b> failing
              {failingHint && <> on {requestName(failingHint)}</>}
            </button>
          </Seg>
        )}

        {/* Never dropped at a breakpoint: of everything about this session it
            is the one fact someone about to screenshot the panel needs. */}
        {authUnmasked && (
          <Seg>
            <button
              type="button"
              className="nm-statusbar-btn nm-statusbar-unmasked"
              onClick={onMaskAuthorization}
              title="Authorization values are shown in full for requests captured while this is on. Exports, copied snippets and the saved log still mask them. Click to mask again."
            >
              <span className="nm-statusbar-unmasked-tag">unmasked</span>
              Authorization
            </button>
          </Seg>
        )}

        {pinnedCount > 0 && (
          <Seg className="nm-status-pinned">
            <button
              type="button"
              className="nm-statusbar-btn nm-statusbar-pin"
              onClick={onShowPinned}
              title="Go to the pinned entry"
            >
              <Icon name="pin" size={10} />
              {pinnedCount} pinned
            </button>
          </Seg>
        )}
      </div>

      <span className="nm-statusbar-spacer" />

      {/* Right: where the session is being kept. This group is the one that
          shrinks — the database name ellipsises rather than the bar clipping
          it, because a name cut off mid-word answers nothing. */}
      <div className="nm-statusbar-group nm-statusbar-right">
        <Seg first className="nm-status-commands">
          <button
            type="button"
            className="nm-statusbar-btn"
            onClick={onOpenPalette}
            title="Command palette"
          >
            commands ⌘K
          </button>
        </Seg>

        {/* Which database this panel is reading and writing. Ambient rather
            than conditional: the answer to "why am I seeing another app's
            requests?" should be on screen before the question gets asked. */}
        <Seg className="nm-status-db">
          <button
            type="button"
            className={`nm-statusbar-btn nm-statusbar-db${
              dbShared ? " nm-statusbar-db-shared" : ""
            }`}
            onClick={onShowDatabases}
            title={
              dbShared
                ? `Writing to the shared default "${dbName}" — every app on this origin uses it, so entries from other projects will appear here. Pass dbName to separate them. Click to see every database on this origin.`
                : `Writing to "${dbName}". Click to see every Blix database on this origin.`
            }
          >
            <span className="nm-statusbar-db-name">{dbName}</span>
            {dbShared && <span className="nm-statusbar-db-tag">shared</span>}
          </button>
        </Seg>

        {persistedLabel && (
          <Seg className="nm-status-persisted">
            <button
              type="button"
              className={`nm-statusbar-btn nm-statusbar-persisted${
                purgeArmed ? " nm-statusbar-armed" : ""
              }`}
              onClick={onPurge}
              title={
                purgeArmed
                  ? "Click again to delete the saved log"
                  : "Saved to IndexedDB — click twice to purge"
              }
            >
              {purgeArmed ? "Purge saved log?" : `${persistedCount} saved · ${persistedLabel}`}
            </button>
          </Seg>
        )}
      </div>
    </div>
  );
}
