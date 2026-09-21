"use client";

/**
 * Dev Tools — the appearance menu.
 *
 * "System" sits alone at the top because it is not a theme but a *rule*: it
 * follows the host app's light/dark choice and picks this panel's default for
 * that side. It names the theme it currently resolves to, so choosing it is
 * never a leap in the dark.
 *
 * **Hovering a row paints the whole panel in that theme.** A swatch cannot
 * tell you what a payload will look like in Gruvbox; the panel itself can, and
 * a devtool is one of the few places where the thing being themed is already
 * on screen behind the menu. Moving away restores the committed theme.
 *
 * **Four bands, not two.** Ground, bar, text, accent, at 34/26/22/18% — because
 * a two-tone chip cannot tell you whether a theme's text has contrast against
 * its own ground, which is the only thing you need to know before trying one
 * on. The bands are painted from the palette's literal colours: the one place
 * in the panel where an inline colour is correct rather than a token, because
 * the subject *is* the colour.
 */

import { Fragment, useRef } from "react";
import { BX_PALETTES } from "../themes/bx";
import {
  DEFAULT_DARK,
  DEFAULT_LIGHT,
  THEMES,
  themeById,
  type ThemeBase,
  type ThemeDef,
  type ThemeId,
  type ThemePref,
} from "../themes/themes";
import { Icon } from "./Icon";
import { Menu, type MenuAnchor } from "./Menu";

function Swatch({ theme }: { theme: ThemeDef }) {
  const p = BX_PALETTES[theme.id];
  return (
    <span className="nm-swatch" aria-hidden>
      <span style={{ width: "34%", background: p.bg }} />
      <span style={{ width: "26%", background: p.raise }} />
      <span style={{ width: "22%", background: p.fg }} />
      <span style={{ width: "18%", background: p.accent }} />
    </span>
  );
}

/** System shows the two grounds it chooses between. */
function AutoSwatch() {
  return (
    <span className="nm-swatch" aria-hidden>
      <span style={{ width: "50%", background: BX_PALETTES[DEFAULT_LIGHT].bg }} />
      <span style={{ width: "50%", background: BX_PALETTES[DEFAULT_DARK].bg }} />
    </span>
  );
}

export function ThemeMenu({
  anchor,
  pref,
  host,
  onPick,
  onPreview,
}: {
  anchor: MenuAnchor;
  /** What is stored — `"auto"` or a specific theme. */
  pref: ThemePref;
  /** The host app's current light/dark choice, so "System" can say where it
   * would land right now. */
  host: ThemeBase;
  onPick: (pref: ThemePref) => void;
  /** Paint this theme without committing to it; `null` restores the stored
   * one. Owned by the panel, since the panel is what gets repainted. */
  onPreview: (pref: ThemePref | null) => void;
}) {
  /**
   * Hover previews a theme — but a pointer that is over a row because the list
   * moved under it is not hovering, it is scrolling. Without this, dragging
   * down the twelve themes strobes the whole panel through every one of them.
   * The flag clears shortly after the last scroll event, so a deliberate hover
   * right after scrolling still works. It is set from the wheel as well as the
   * scroll: Chromium dispatches the boundary pointerenter for the row that
   * arrived under the cursor *before* the scroll event that moved it there.
   */
  const scrolling = useRef(0);
  const previewIfPointing = (pref: ThemePref) => {
    if (Date.now() < scrolling.current) return;
    onPreview(pref);
  };

  const autoTarget: ThemeId = host === "light" ? DEFAULT_LIGHT : DEFAULT_DARK;
  const groups: [string, ThemeDef[]][] = [
    ["DARK", THEMES.filter((t) => t.base === "dark")],
    ["LIGHT", THEMES.filter((t) => t.base === "light")],
  ];

  return (
    <Menu
      anchor={anchor}
      width={380}
      label="Appearance"
      // One handler on the container rather than an `onPointerLeave` per row:
      // moving between two adjacent rows would otherwise fire leave-then-enter
      // and flash the committed theme for a frame between them.
      onPointerLeave={() => onPreview(null)}
      onScroll={() => {
        scrolling.current = Date.now() + 140;
      }}
    >
      <div className="nm-menu-head">
        <span>Appearance</span>
        <span className="nm-menu-count">{THEMES.length} themes</span>
      </div>

      <button
        type="button"
        role="menuitem"
        className="nm-theme-item nm-theme-sys"
        onClick={() => onPick("auto")}
        onPointerEnter={() => previewIfPointing("auto")}
        onFocus={() => onPreview("auto")}
      >
        <AutoSwatch />
        <span className="nm-theme-name">
          System
          <span className="nm-theme-sub">
            Follows the app — {themeById(autoTarget).label} right now
          </span>
        </span>
        {pref === "auto" && (
          <span className="nm-theme-check" aria-hidden>
            <Icon name="check" size={12} />
          </span>
        )}
      </button>

      {groups.map(([title, themes]) => (
        <Fragment key={title}>
          <div className="nm-menu-group">
            <span>{title}</span>
            <span className="nm-menu-count">{themes.length}</span>
          </div>
          {themes.map((t) => (
            <button
              type="button"
              role="menuitem"
              key={t.id}
              className={`nm-theme-item${pref === t.id ? " active" : ""}`}
              onClick={() => onPick(t.id)}
              onPointerEnter={() => previewIfPointing(t.id)}
              onFocus={() => onPreview(t.id)}
            >
              <Swatch theme={t} />
              <span className="nm-theme-name">{t.label}</span>
              {(t.id === DEFAULT_DARK || t.id === DEFAULT_LIGHT) && (
                <span className="nm-theme-note">default</span>
              )}
              {pref === t.id && (
                <span className="nm-theme-check" aria-hidden>
                  <Icon name="check" size={12} />
                </span>
              )}
            </button>
          ))}
        </Fragment>
      ))}

      <div className="nm-menu-foot">
        <span>Hover to try one on · Enter keeps it</span>
      </div>
    </Menu>
  );
}
