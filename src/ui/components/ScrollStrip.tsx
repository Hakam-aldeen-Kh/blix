"use client";

/**
 * Dev Tools — a horizontally scrolling row of chips (the tab row, the store
 * slice picker).
 *
 * The panel is often docked narrow, so both strips overflow routinely: eight
 * tabs at 320px, or a twenty-reducer store at any width. This wraps the
 * scroller with the affordances that make an overflowing row usable rather
 * than merely functional — measured edge fades, wheel support, and arrows for
 * the pointer users a fade alone leaves stranded (see `useStripScroll`).
 *
 * The arrows are `aria-hidden` and untabbable on purpose: they duplicate
 * navigation that the keyboard already has (Tab, or arrow keys where the strip
 * is a tablist), and a screen reader announcing "scroll right" between the
 * tabs and their panel is noise, not help.
 */

import { useStripScroll } from "../hooks/useStripScroll";
import { Icon } from "./Icon";

export function ScrollStrip({
  className,
  wrapClassName,
  activeKey,
  children,
  role,
  label,
  onKeyDown,
}: {
  /** Class for the scroller itself; the wrapper keeps its own. */
  className: string;
  /** Chrome that belongs to the row rather than to its scrolling contents —
   * a border, say, which would otherwise fade out with the chips it frames. */
  wrapClassName?: string;
  /** Changing it scrolls the chip marked `data-strip-active` back into view. */
  activeKey?: string | number | null;
  children: React.ReactNode;
  role?: string;
  label?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const { ref, edges, page } = useStripScroll<HTMLDivElement>(activeKey);

  return (
    <div
      className={`nm-strip${wrapClassName ? ` ${wrapClassName}` : ""}${
        edges.start ? " nm-strip-s" : ""
      }${edges.end ? " nm-strip-e" : ""}`}
    >
      <button
        className="nm-strip-nav nm-strip-nav-s"
        aria-hidden
        tabIndex={-1}
        onClick={() => page(-1)}
      >
        <Icon name="chevron" size={13} />
      </button>
      <div
        ref={ref}
        className={`nm-strip-scroll ${className}`}
        role={role}
        aria-label={label}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
      <button
        className="nm-strip-nav nm-strip-nav-e"
        aria-hidden
        tabIndex={-1}
        onClick={() => page(1)}
      >
        <Icon name="chevron" size={13} />
      </button>
    </div>
  );
}
