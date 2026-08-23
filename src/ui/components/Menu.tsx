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
 * is pressed. On close it goes back where it came from, so dismissing a menu
 * with Escape leaves you on the button you opened it with rather than on
 * `<body>` with nothing selected.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Where a menu attaches, as viewport coordinates measured from its trigger.
 *
 * Both vertical edges are carried because a menu may open either way: `top` is
 * where its top edge sits when it drops down, `bottom` where its bottom edge
 * sits when it flips up. Measuring both at open time is cheaper and steadier
 * than re-measuring the trigger after the menu has rendered.
 */
export interface MenuAnchor {
  /** Distance from the viewport top to the trigger's bottom edge, plus a gap. */
  top: number;
  /** Distance from the viewport bottom to the trigger's top edge, plus a gap. */
  bottom: number;
  right: number;
}

/** Gap kept between a menu's outer edge and the viewport's. */
const VIEWPORT_GAP = 12;

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
  onPointerLeave,
  children,
}: {
  anchor: MenuAnchor;
  width: number;
  /** Accessible name — menus are opened by icon-only buttons. */
  label: string;
  /** Fires when the pointer leaves the whole menu — used to end a hover
   * preview once, rather than per item. */
  onPointerLeave?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Dropping down is the default and is what nearly every menu here does. The
  // theme list is tall enough to matter, though, and the panel's default dock
  // is the *bottom* edge — so its toolbar sits low and there is often more
  // room above than below. Measured rather than guessed, in a layout effect so
  // the decision is made before the browser paints and nothing jumps.
  const [placement, setPlacement] = useState<"below" | "above">("below");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const below = window.innerHeight - anchor.top - VIEWPORT_GAP;
    const above = window.innerHeight - anchor.bottom - VIEWPORT_GAP;
    setPlacement(el.scrollHeight > below && above > below ? "above" : "below");
  }, [anchor.top, anchor.bottom]);

  useEffect(() => {
    // Captured before the menu takes focus, so it can be handed back on close.
    // Read at effect time rather than during render: the trigger is still the
    // active element here, and `document` is off-limits during render anyway.
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });

    return () => {
      // Only if focus is still inside the menu. If the developer clicked
      // somewhere else entirely, that click owns the focus and yanking it back
      // to a button that is no longer on screen would be worse than doing
      // nothing.
      const active = document.activeElement;
      const inside = active === ref.current || ref.current?.contains(active as Node);
      if (inside && opener?.isConnected) opener.focus({ preventScroll: true });
    };
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
      className="nm-menu nm-scroll"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerLeave={onPointerLeave}
      style={{
        right: anchor.right,
        width,
        // Whichever way it opens, the menu stops at the viewport edge and
        // scrolls rather than running off it.
        ...(placement === "above"
          ? {
              bottom: anchor.bottom,
              maxHeight: `calc(100vh - ${anchor.bottom + VIEWPORT_GAP}px)`,
            }
          : {
              top: anchor.top,
              maxHeight: `calc(100vh - ${anchor.top + VIEWPORT_GAP}px)`,
            }),
      }}
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
  onPreview,
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
  /**
   * "You are about to pick this." Fired on hover *and* on keyboard focus, so
   * arrowing through a menu previews exactly what pointing at it does — the
   * theme picker's live preview would otherwise be mouse-only.
   */
  onPreview?: () => void;
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
      onPointerEnter={onPreview}
      onFocus={onPreview}
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
