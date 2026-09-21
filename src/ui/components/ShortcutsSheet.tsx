"use client";

/**
 * Dev Tools — the keyboard reference, opened with `?`.
 *
 * Two sentences, then a two-column table: key on the left in a fixed 74px
 * monospace column, what it does beside it. It is a reference, not an essay —
 * the prose it replaces explained the design to someone who had already
 * decided to look something up.
 */

import { Icon } from "./Icon";

export const SHORTCUT_GROUPS: {
  title: string;
  /** Which of the two columns this group belongs to. */
  col: 0 | 1;
  items: { keys: string; desc: string }[];
}[] = [
  {
    title: "PANEL",
    col: 0,
    items: [
      { keys: "Ctrl + `", desc: "Open or close the monitor" },
      { keys: "Ctrl + K", desc: "Command palette — everything, searchable" },
      { keys: "Esc", desc: "Close the palette, then the panel" },
      { keys: "?", desc: "Show this sheet" },
    ],
  },
  {
    title: "SOURCES",
    col: 0,
    items: [
      { keys: "1", desc: "Network" },
      { keys: "2", desc: "Realtime" },
      { keys: "3", desc: "Redux" },
      { keys: "4", desc: "Query" },
    ],
  },
  {
    title: "LIST",
    col: 1,
    items: [
      { keys: "↑ ↓", desc: "Move through requests" },
      { keys: "j k", desc: "Move down or up, vim style" },
      { keys: "/", desc: "Focus the filter box" },
      { keys: "g / ⇧G", desc: "Jump to the newest or oldest" },
    ],
  },
  /**
   * Case is load-bearing here, so the sheet prints it exactly.
   *
   * `c` copies the response and `⇧C` clears the log — two different commands
   * one Shift apart. Writing the unshifted ones in upper case, as this sheet
   * used to, documented a key that reaches no branch at all.
   */
  {
    title: "SELECTED",
    col: 1,
    items: [
      { keys: "p", desc: "Pin — survives Clear and eviction" },
      { keys: "r", desc: "Replay through the HTTP client" },
      { keys: "c", desc: "Copy the response as JSON" },
      { keys: "u", desc: "Copy the URL" },
      { keys: "x", desc: "Clear the selection" },
    ],
  },
  {
    title: "LOG",
    col: 1,
    items: [
      { keys: "Space", desc: "Pause or resume capture" },
      { keys: "⇧C", desc: "Clear the log, keeping pins" },
      { keys: "⇧L", desc: "Stop preserving to IndexedDB" },
    ],
  },
  {
    title: "PAYLOAD",
    col: 1,
    items: [
      { keys: "↑ ↓ ← →", desc: "Walk the tree, expand, collapse" },
      { keys: "Enter", desc: "Toggle the focused object" },
      { keys: "Alt-click", desc: "Fold or unfold everything below" },
    ],
  },
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const columns: (typeof SHORTCUT_GROUPS)[] = [
    SHORTCUT_GROUPS.filter((g) => g.col === 0),
    SHORTCUT_GROUPS.filter((g) => g.col === 1),
  ];

  return (
    <>
      <div className="nm-sheet-scrim" onClick={onClose} />
      <div
        className="nm-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="nm-sheet-head">
          <h3>Keyboard shortcuts</h3>
          <button type="button" className="nm-sheet-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="nm-sheet-lead">
          Sorting, density, the dock, the copy formats and the filter syntax all live
          in the command palette rather than each having a button — the header keeps
          only what you read constantly. Payloads render as <b>Tree</b>, <b>Table</b>,{" "}
          <b>JSON</b>, <b>YAML</b> or <b>Text</b>, and <b>Copy</b> gives you whichever
          one you are looking at.
        </div>

        <div className="nm-sheet-cols">
          {columns.map((groups, i) => (
            <div className="nm-sheet-col" key={i}>
              {groups.map((group) => (
                <div key={group.title}>
                  <div className="nm-sheet-group">{group.title}</div>
                  {group.items.map((item) => (
                    <div className="nm-sheet-row" key={item.desc}>
                      <span className="nm-sheet-key">{item.keys}</span>
                      <span className="nm-sheet-desc">{item.desc}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
