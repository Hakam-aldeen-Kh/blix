"use client";

/**
 * Dev Tools — the command palette.
 *
 * Every panel this size eventually runs out of toolbar. The redesign spends
 * what it has on the things you read constantly — capture state, the filter,
 * the four sources — and moves everything you reach for *occasionally* here:
 * sort order, density, the per-entry copy formats, the dock, the shortcuts.
 *
 * So this is not a convenience layer over the buttons. For several commands it
 * is the only affordance there is, which is why all three entry points (the
 * header hint, the rail button, the status bar) spell out the same shortcut,
 * and why every row carries its key binding where it has one — the palette
 * teaches its own way out.
 *
 * Commands are supplied by the panel rather than assembled here: almost all of
 * them close over state the panel owns, and a palette that reached for that
 * state itself would be a second copy of the panel's wiring.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Section } from "../types/monitorUi";
import { Icon } from "./Icon";

export interface Command {
  id: string;
  label: string;
  /** What it will do, or what it currently is — "12 matches", "compact". */
  note?: string;
  /** Key binding, where the command has one. */
  key?: string;
  /** Colours the row's dot with a source identity. */
  accent?: Section | "danger" | "warn";
  disabled?: boolean;
  run: () => void;
}

export interface CommandGroup {
  name: string;
  items: Command[];
}

/** Substring match across the label, its note and its group — typing "curl"
 * should find "Copy as cURL" under SELECTED, and typing "selected" should
 * bring up everything under it. */
function match(command: Command, group: string, needle: string): boolean {
  if (!needle) return true;
  return `${group} ${command.label} ${command.note ?? ""}`
    .toLowerCase()
    .includes(needle);
}

export function CommandPalette({
  groups,
  onClose,
}: {
  groups: CommandGroup[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .map((g) => ({ name: g.name, items: g.items.filter((c) => match(c, g.name, needle)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  // One flat list of the runnable rows, which is what the arrow keys walk —
  // skipping the disabled ones, since stepping onto a row Enter cannot run is
  // a dead end the keyboard should never offer.
  const flat = useMemo(
    () => visible.flatMap((g) => g.items).filter((c) => !c.disabled),
    [visible],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Typing changes the list under the cursor; the highlight goes back to the
  // best match rather than staying on whatever index it happened to hold.
  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view while the arrows walk past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(".nm-palette-item.active")
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (command: Command) => {
    if (command.disabled) return;
    onClose();
    command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
        return;
      case "Enter": {
        e.preventDefault();
        const command = flat[active];
        if (command) run(command);
        return;
      }
      case "Escape":
        // Handled here as well as globally so the panel underneath never sees
        // it — Escape in a palette closes the palette, nothing else.
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
    }
  };

  let index = -1;

  return (
    <div
      className="nm-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Commands"
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="nm-palette-head">
        <span className="nm-palette-ico">
          <Icon name="search" size={15} />
        </span>
        <input
          ref={inputRef}
          className="nm-palette-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command…"
          spellCheck={false}
        />
        <kbd className="nm-kbd">esc</kbd>
      </div>

      <div className="nm-palette-list nm-scroll" ref={listRef}>
        {visible.length === 0 && (
          <div className="nm-palette-empty">No command matches “{query.trim()}”</div>
        )}
        {visible.map((group) => (
          <div key={group.name}>
            <div className="nm-palette-group">{group.name}</div>
            {group.items.map((command) => {
              // Bound per iteration, not read from the outer `let` at event
              // time — every row's handler would otherwise see the index of
              // the last row rendered.
              const at = command.disabled ? -1 : (index += 1);
              const on = at >= 0 && at === active;
              return (
                <button
                  key={command.id}
                  className={`nm-palette-item${on ? " active" : ""}`}
                  data-accent={command.accent}
                  disabled={command.disabled}
                  onClick={() => run(command)}
                  // Pointer, not click: the highlight should follow the mouse
                  // so Enter and a click never disagree about the target.
                  onPointerMove={() => {
                    if (at >= 0 && at !== active) setActive(at);
                  }}
                >
                  <span className="nm-palette-dot" />
                  <span className="nm-palette-label">{command.label}</span>
                  {command.note && <span className="nm-palette-note">{command.note}</span>}
                  {command.key && <kbd className="nm-palette-key">{command.key}</kbd>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
