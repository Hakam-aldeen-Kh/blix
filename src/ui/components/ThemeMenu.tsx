"use client";

/**
 * Dev Tools — the theme picker.
 *
 * "System" sits alone at the top because it is not a theme but a *rule*: it
 * follows the host app's light/dark choice and picks this panel's default for
 * that side, which is what most developers want and what the panel did before
 * themes existed. It shows which theme it currently resolves to, so choosing
 * it is never a leap in the dark.
 *
 * Each row previews the theme it selects rather than the theme in force — the
 * swatch is painted from that palette's literal colours, the one place in the
 * panel where an inline colour is correct rather than a token.
 */

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
import { Menu, MenuItem, type MenuAnchor } from "./Menu";

/** Three chips is enough to tell six themes apart: the surface you would read
 * a payload on, the accent, and one identity colour. */
function Swatch({ theme }: { theme: ThemeDef }) {
  const p = theme.palette;
  return (
    <span className="nm-swatch" aria-hidden>
      <span className="nm-swatch-chip" style={{ background: p.surface }} />
      <span className="nm-swatch-chip" style={{ background: p.accent }} />
      <span className="nm-swatch-chip" style={{ background: p.query }} />
    </span>
  );
}

/** System's swatch shows the two surfaces it chooses between, with the one it
 * would land on right now in the middle — so the row reads as "either of
 * these, currently that" and still lines up with the themes below it. */
function AutoSwatch({ resolved }: { resolved: ThemeDef }) {
  return (
    <span className="nm-swatch" aria-hidden>
      <span
        className="nm-swatch-chip"
        style={{ background: themeById(DEFAULT_LIGHT).palette.surface }}
      />
      <span
        className="nm-swatch-chip"
        style={{ background: resolved.palette.accent }}
      />
      <span
        className="nm-swatch-chip"
        style={{ background: themeById(DEFAULT_DARK).palette.surface }}
      />
    </span>
  );
}

function ThemeItem({
  theme,
  selected,
  onSelect,
}: {
  theme: ThemeDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <MenuItem icon={<Swatch theme={theme} />} checked={selected} onSelect={onSelect}>
      <span className="nm-theme-row">
        <span className="nm-theme-name">{theme.label}</span>
        <span className="nm-theme-hint">{theme.hint}</span>
      </span>
    </MenuItem>
  );
}

export function ThemeMenu({
  anchor,
  pref,
  host,
  onPick,
}: {
  anchor: MenuAnchor;
  /** What is stored — `"auto"` or a specific theme. */
  pref: ThemePref;
  /** The host app's current light/dark choice, so "System" can say where it
   * would land right now. */
  host: ThemeBase;
  onPick: (pref: ThemePref) => void;
}) {
  const autoTarget: ThemeId = host === "light" ? DEFAULT_LIGHT : DEFAULT_DARK;
  const darks = THEMES.filter((t) => t.base === "dark");
  const lights = THEMES.filter((t) => t.base === "light");

  return (
    <Menu anchor={anchor} width={252} label="Theme">
      <div className="nm-menu-head">Appearance</div>

      <MenuItem
        icon={<AutoSwatch resolved={themeById(autoTarget)} />}
        checked={pref === "auto"}
        onSelect={() => onPick("auto")}
      >
        <span className="nm-theme-row">
          <span className="nm-theme-name">System</span>
          <span className="nm-theme-hint">
            Follows the app — now {themeById(autoTarget).label}
          </span>
        </span>
      </MenuItem>

      <div className="nm-menu-group">Dark</div>
      {darks.map((t) => (
        <ThemeItem
          key={t.id}
          theme={t}
          selected={pref === t.id}
          onSelect={() => onPick(t.id)}
        />
      ))}

      <div className="nm-menu-group">Light</div>
      {lights.map((t) => (
        <ThemeItem
          key={t.id}
          theme={t}
          selected={pref === t.id}
          onSelect={() => onPick(t.id)}
        />
      ))}
    </Menu>
  );
}
