"use client";

/** Dev Tools — keyboard cheatsheet, opened with `?`. */

import { Icon } from "./Icon";

export const SHORTCUT_GROUPS: {
  title: string;
  items: { keys: string[]; desc: string }[];
}[] = [
  {
    title: "Panel",
    items: [
      { keys: ["Ctrl", "`"], desc: "Open / close the monitor" },
      { keys: ["Esc"], desc: "Close the panel" },
      { keys: ["?"], desc: "Show this cheatsheet" },
      { keys: ["1"], desc: "Network section" },
      { keys: ["2"], desc: "Realtime section" },
      { keys: ["3"], desc: "Redux section" },
      { keys: ["4"], desc: "Query section" },
    ],
  },
  {
    title: "List",
    items: [
      { keys: ["↑", "↓"], desc: "Move through requests" },
      { keys: ["j", "k"], desc: "Move down / up (vim style)" },
      { keys: ["/"], desc: "Focus the filter box" },
      { keys: ["g"], desc: "Jump to the newest request" },
      { keys: ["Shift", "G"], desc: "Jump to the oldest request" },
    ],
  },
  {
    title: "Selected request",
    items: [
      { keys: ["p"], desc: "Pin — survives Clear and eviction" },
      { keys: ["r"], desc: "Replay through axios" },
      { keys: ["c"], desc: "Copy the response" },
      { keys: ["u"], desc: "Copy the URL" },
      { keys: ["x"], desc: "Clear the selection" },
    ],
  },
  {
    title: "Capture",
    items: [
      { keys: ["Space"], desc: "Pause / resume capturing" },
      { keys: ["Shift", "L"], desc: "Toggle Preserve log" },
      { keys: ["Shift", "C"], desc: "Clear the log" },
    ],
  },
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="nm-sheet-scrim" onClick={onClose} />
      <div
        className="nm-sheet"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="nm-iconbtn nm-iconbtn-sq nm-sheet-close"
          onClick={onClose}
          title="Close"
        >
          <Icon name="close" size={13} />
        </button>
        <h3>Keyboard shortcuts</h3>
        <div className="nm-sheet-grid">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} style={{ display: "contents" }}>
              <div className="nm-sheet-group">{group.title}</div>
              {group.items.map((item) => (
                <div key={item.desc} style={{ display: "contents" }}>
                  <div>
                    {item.keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className="nm-sheet-desc"> + </span>}
                        <kbd className="nm-kbd">{k}</kbd>
                      </span>
                    ))}
                  </div>
                  <div className="nm-sheet-desc">{item.desc}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
