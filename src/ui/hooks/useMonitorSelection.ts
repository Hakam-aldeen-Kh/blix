"use client";

/**
 * Dev Tools — selection state machine.
 *
 * This is the fix for the reported bug: the detail pane jumping to whichever
 * request arrived most recently. See `Selection` in `types/monitorUi.ts` for
 * the full description of what used to go wrong.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import { useCallback, useMemo, useState } from "react";
import { prefsStore, savePrefs } from "../../capture/monitorPersistence";
import { resolveSelection } from "../helpers/selection";
import type { Resolved, Selection } from "../types/monitorUi";

export interface UseMonitorSelection {
  selection: Selection;
  resolved: Resolved;
  selected: MonitorEntry | null;
  /** The row to highlight — derived from the *selection*, not the resolved
   * entry. Comparing against the resolved entry is what used to light up the
   * fallback row and make an automatic jump look deliberate. */
  activeRowId: string | null;
  isFollowing: boolean;
  pin: (id: string) => void;
  clear: () => void;
  toggleFollow: () => void;
  /** Move by ±1 through the visible list. */
  step: (delta: 1 | -1, visible: MonitorEntry[]) => void;
}

export function useMonitorSelection(
  entries: MonitorEntry[],
  visible: MonitorEntry[],
  visibleIds: Set<string>,
): UseMonitorSelection {
  const [selection, setSelection] = useState<Selection>(() => {
    const p = prefsStore.getSnapshot().prefs;
    if (p.followLatest) return { kind: "follow" };
    return p.selectedId
      ? { kind: "pinned", id: p.selectedId, restored: true }
      : { kind: "none" };
  });

  const resolved = useMemo(
    () => resolveSelection(selection, entries, visible, visibleIds),
    [selection, entries, visible, visibleIds],
  );

  /** Writes through to prefs as part of the interaction rather than in an
   * effect, so there is no render→effect→render round trip. */
  const commit = useCallback((next: Selection) => {
    setSelection(next);
    savePrefs({
      followLatest: next.kind === "follow",
      selectedId: next.kind === "pinned" ? next.id : null,
    });
  }, []);

  const pin = useCallback((id: string) => commit({ kind: "pinned", id }), [commit]);
  const clear = useCallback(() => commit({ kind: "none" }), [commit]);

  const toggleFollow = useCallback(() => {
    if (selection.kind === "follow") {
      // Turning follow off freezes on whatever is on screen rather than
      // dropping the user back to nothing selected.
      commit(
        resolved.entry
          ? { kind: "pinned", id: resolved.entry.id }
          : { kind: "none" },
      );
    } else {
      commit({ kind: "follow" });
    }
  }, [commit, resolved.entry, selection.kind]);

  const step = useCallback(
    (delta: 1 | -1, rows: MonitorEntry[]) => {
      if (rows.length === 0) return;
      // From none / evicted / hidden-by-filter this jumps into the visible
      // list. That's fine — the user pressed a key, unlike the automatic
      // re-snap this replaces.
      const current =
        selection.kind === "pinned"
          ? rows.findIndex((r) => r.id === selection.id)
          : -1;
      const next =
        current < 0
          ? delta === 1
            ? 0
            : rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, current + delta));
      commit({ kind: "pinned", id: rows[next].id });
    },
    [commit, selection],
  );

  const activeRowId =
    selection.kind === "pinned"
      ? selection.id
      : selection.kind === "follow"
        ? (resolved.entry?.id ?? null)
        : null;

  return {
    selection,
    resolved,
    selected: resolved.entry,
    activeRowId,
    isFollowing: selection.kind === "follow",
    pin,
    clear,
    toggleFollow,
    step,
  };
}

export { resolveSelection };
