"use client";

/**
 * Dev Tools — the popover menu primitive.
 *
 * Every menu in the panel (export, overflow, theme, row context menu) is the
 * same object: a `position: fixed` card anchored to a *measured viewport rect*,
 * rendered by the panel root rather than nested inside the button that opened
 * it — a fixed element inside the toolbar would resolve its offsets against
 * the viewport and fly to the corner of the screen.
 *
 * It exists mostly for the keyboard. A devtool is a keyboard instrument: `?`,
 * `/`, `j`/`k`, `1`–`4` are all bound, so a menu you can only reach with the
 * mouse is the odd one out. Arrow keys and Home/End move a roving focus over
 * the items; Escape is left to the panel, which already knows the order things
 * should close in (menu → sheet → panel).
 *
 * Focus lands on the *container*, not the first item, so opening a menu by
 * mouse looks exactly as it did before — no item lights up until an arrow key
 * is pressed.
 */

import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export interface MenuAnchor {
  top: number;
  right: number;
}

/** Enabled items, in DOM order — what the arrow keys walk. */
function itemsOf(root: HTMLElement | null): HTMLButtonElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button.nm-menu-item")).filter(
    (el) => !el.disabled,
  );
}

export function Menu({
  anchor,
  width,
  label,
  children,
}: {
  anchor: MenuAnchor;
  width: number;
  /** Accessible name — menus are opened by icon-only buttons. */
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = itemsOf(ref.current);
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const index = items.findIndex((el) => el === active);

    const focus = (next: number) => {
      e.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };

    switch (e.key) {
      case "ArrowDown":
        return focus(index + 1);
      case "ArrowUp":
        // From the container itself (index -1), Up should wrap to the last
        // item rather than to the second — hence the explicit branch.
        return focus(index < 0 ? items.length - 1 : index - 1);
      case "Home":
        return focus(0);
      case "End":
        return focus(items.length - 1);
      case "Tab":
        // A menu is a single stop: Tab moves within it and never escapes into
        // the host app's focus order behind the panel.
        return focus(e.shiftKey ? index - 1 : index + 1);
      default:
        return;
    }
  };

  return (
    <div
      ref={ref}
      className="nm-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ top: anchor.top, right: anchor.right, width }}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  hint,
  checked,
  disabled,
  danger,
  onSelect,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Short trailing note — a shortcut key, or the setting's current value. */
  hint?: React.ReactNode;
  /** Renders as a radio/checkbox rather than a plain command. */
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`nm-menu-item${danger ? " nm-menu-danger" : ""}${
        checked ? " nm-menu-on" : ""
      }`}
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
    >
      {icon}
      {children}
      {hint != null && <span className="nm-menu-hint">{hint}</span>}
      {checked && (
        <span className="nm-menu-check">
          <Icon name="check" size={12} />
        </span>
      )}
    </button>
  );
}
