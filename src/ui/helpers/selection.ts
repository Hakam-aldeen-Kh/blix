/**
 * Dev Tools — selection resolution.
 *
 * Kept as a pure module (no React) so the rule that fixes the "details jump to
 * the newest request" bug can be reasoned about — and exercised — in isolation.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import type { Resolved, Selection } from "../types/monitorUi";

/**
 * Resolve the current selection against the buffer.
 *
 * Pure: no effects, no setState, and crucially **no fallback to the newest
 * entry**. The original panel did
 * `filtered.find(e => e.id === selectedId) ?? filtered[0]`, resolving against
 * the *filtered* subset while the store prepends new entries — so any time the
 * pinned id stopped matching the active filter (a pending request resolving, a
 * search keystroke, buffer eviction, or nothing selected yet) the detail pane
 * silently re-pointed at the newest request, and re-did so on every store emit.
 */
export function resolveSelection(
  selection: Selection,
  entries: MonitorEntry[],
  visible: MonitorEntry[],
  visibleIds: Set<string>,
): Resolved {
  if (selection.kind === "follow") {
    return { status: "follow", entry: visible[0] ?? null };
  }
  if (selection.kind === "none") return { status: "none", entry: null };

  // Resolved against the FULL buffer, never the filtered subset — this is what
  // keeps a selected request on screen once it drops out of the active filter.
  const entry = entries.find((e) => e.id === selection.id);
  if (!entry) {
    // A restored id that no longer resolves just means "nothing selected";
    // only a request the user actually picked and then lost to eviction earns
    // a tombstone.
    return selection.restored
      ? { status: "none", entry: null }
      : { status: "evicted", entry: null };
  }
  return visibleIds.has(entry.id)
    ? { status: "visible", entry }
    : { status: "hidden-by-filter", entry };
}
