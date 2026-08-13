/** Dev Tools — UI-only types. Capture/persistence types live in
 * `../../capture/monitorTypes.ts`. */

import type { MonitorEntry, MonitorState } from "../../capture/networkMonitor";

export type Tab =
  | "preview"
  | "payload"
  | "headers"
  | "timing"
  | "messages"
  | "response"
  | "initiator"
  | "raw"
  | "diff"
  | "reduxState"
  | "queryState";

/** Top-level section. Each kind of traffic has different columns and
 * different notions of a row, so they are separate views rather than one
 * mixed table with half the columns empty. */
export type Section = "network" | "realtime" | "redux" | "query";

export type StateFilter = "all" | MonitorState;

export type ColumnId =
  | "name"
  | "status"
  | "method"
  | "initiator"
  | "frames"
  | "size"
  | "duration"
  | "waterfall"
  /** Redux only: count of changed paths from the action's diff. */
  | "changes";

export type SortKey = "time" | "name" | "status" | "size" | "duration";
export type SortDir = "asc" | "desc";

export interface Sort {
  key: SortKey;
  dir: SortDir;
}

/**
 * Selection is a three-state machine, deliberately without a "fall back to the
 * newest entry" branch.
 *
 * The original panel did `filtered.find(e => e.id === selectedId) ?? filtered[0]`
 * — it resolved against the *filtered* subset while the store prepends new
 * entries, so `filtered[0]` is always the newest request. Any time the pinned
 * id stopped matching the current filter (a pending request resolving, a search
 * keystroke, buffer eviction, or simply nothing selected yet) the detail pane
 * silently re-pointed at the newest request, and re-did so on every store emit.
 * The same fallback drove the row highlight, so the newest row *looked*
 * deliberately selected.
 */
export type Selection =
  | { kind: "none" }
  | {
      kind: "pinned";
      id: string;
      /** True when the id came from restored prefs rather than a click. Such an
       * id failing to resolve just means "nothing selected" — only a request
       * the user actually picked and then lost to eviction earns a tombstone. */
      restored?: boolean;
    }
  | { kind: "follow" };

export type ResolvedStatus =
  | "none"
  | "evicted"
  | "visible"
  | "hidden-by-filter"
  | "follow";

export interface Resolved {
  status: ResolvedStatus;
  entry: MonitorEntry | null;
}

/** A row in the flattened list: either a request or a page-load separator. */
export type ListRow =
  | { kind: "row"; entry: MonitorEntry }
  | { kind: "divider"; loadId: string; at: number };

/** Shared timeline window for one page-load group. */
export interface Timeline {
  t0: number;
  span: number;
}

export interface VirtualWindow {
  start: number;
  end: number;
}
