# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.2] - 2026-08-25

Documentation and packaging only — no code change.

### Changed

- Corrected the Security section on clearing: switching preserve-log off
  already clears the stored entries, and panel preferences survive both that
  and a Purge, since they are mirrored to `localStorage`.
- Scoped the 24 MB retention cap to HTTP entries. Realtime frames are stored
  untruncated and under-counted against the byte budget, so the cap does not
  bound them.
- Clarified header masking: values of 12 characters or fewer are replaced
  entirely rather than partially masked.
- Noted that panel preferences are mirrored to `localStorage` in addition to
  IndexedDB.
- The preserve-log toggles all require the panel to be mounted.
- CHANGELOG and LICENSE links in the README are now absolute, so they resolve
  from the npm package page.
- `CHANGELOG.md` is no longer included in the published package. The README
  links to it on GitHub instead.

## [0.4.1] - 2026-08-25

### Changed

- Documentation only — no code change.
- Added a Security section documenting what Blix captures, what reaches
  IndexedDB and when, the four redacted header names, retention limits and
  how to purge.
- Documented `preserve-log`: its default, the three toggles, and that
  switching it on writes the session already in the buffer.
- Corrected the `dbName` section, which claimed the log persists across a
  reload by default. It does not — persistence is opt-in.
- Noted that the package is ESM-only.
- Added `SECURITY.md`.

## [0.4.0] - 2026-08-24

Identical in code to 0.3.3. It exists only to correct the version number: 0.3.3
was a feature release with a type-level break and should never have been a patch
bump. 0.3.3 is deprecated on npm in favour of this release. Everything below is
new relative to 0.3.2, not to 0.3.3.

### Added

- Twelve panel themes, behind a new toolbar button. Dark: Midnight (default),
  Carbon, Nord, Tokyo Night, One Dark, Mocha, Dracula, Gruvbox. Light: Daylight,
  GitHub, Latte, Solar. Hovering or arrow-keying an entry applies it to the panel
  behind the menu; moving away restores the previous one. The default preference
  is `auto`, which follows the host app's light/dark class on `<html>`. The
  choice is persisted with the panel's other preferences.
- A format switch on every payload pane — Tree, Table, JSON, YAML, Text. It
  applies to request and response bodies, realtime frames, the encrypted
  envelope, Redux actions and both Redux state views. Copy returns whichever
  format is on screen (Table copies CSV, YAML copies YAML). The choice is
  persisted.
- Folding in the JSON view, with a **Collapse all** action; Alt-click in the Tree
  expands or collapses an entire subtree.
- Keyboard navigation in the payload tree (arrow keys to move, expand, collapse
  and step in/out; Enter to toggle) and in menus (arrows, Home/End, Enter, and
  Esc to close and return focus to the button that opened it). The `?` cheatsheet
  documents both, plus the theme picker and the formats.
- An export menu with six formats — HAR, JSON, NDJSON, Markdown table (to the
  clipboard), CSV and a cURL script — and a **Shown** / **All** scope toggle that
  shows both counts. Export previously always took the unfiltered buffer,
  whatever the list was showing; Shown is now the default. CSV is written with a
  UTF-8 BOM so Excel reads non-ASCII correctly.
- A store slice picker on the Redux **State** tab. It opens on the slice the
  selected action wrote to when the action touched exactly one, marks every slice
  the action changed, and keeps `root` selectable.
- **Copy as fetch** in the row context menu, alongside Copy as cURL.
- Horizontal scrolling for the tab row and the slice picker when they overflow,
  with edge fades, wheel support and arrow buttons.
- Accessible names and pressed/expanded state on the toolbar controls, and
  tab/tablist roles on the tab and slice strips.

### Changed

- The **Preview** and **Response** tabs are merged into a single **Response**
  tab. Both previously rendered the same field — one as a tree, one as raw JSON —
  so the rendering is now chosen with the format switch instead of by picking a
  tab.
- `MonitorPrefs`, exported from `@hakam-aldeen-kh/blix/capture`, gained two
  required fields: `theme: string` and `dataFormat: string`. This is a
  compile-time break for anyone constructing a `MonitorPrefs` object literal.
  `BlixProps` and every function signature in `/capture` are unchanged.
- HAR download filename: `network-<timestamp>.har` → `blix-<timestamp>.har`.
  Every other export uses the same `blix-<timestamp>.<ext>` form.
- A press anywhere outside an open menu now dismisses it, including inside the
  panel; previously only a press outside the panel root did, so a menu left open
  over the panel could only be closed with Esc or its own button. The press is
  not swallowed — it still selects the row or activates the button underneath.
- The status bar and the detail pane's empty states name what a row is in the
  active section — requests, connections, actions or queries — instead of calling
  every row a "request".
- Every colour the panel paints now comes from the active theme's tokens: status
  colours, method and section accents, waterfall bars, timing segments and JSON
  syntax highlighting. The previous split, with a light palette in CSS and a
  duplicate dark one in JS, is gone.
- WebSocket, Redux and Query rows take their section's accent colour rather than
  the shared fallback that HTTP verbs fell through to.
- The docked badge reads "Blix" rather than "Dev", and the toolbar shows a BLIX
  wordmark beside the status dot.

### Fixed

- Generated downloads revoke their object URL on the next task instead of
  immediately after the click, which could race the browser's read of the blob
  and save an empty file in Safari.

## [0.3.3] - 2026-08-24 — DEPRECATED

Released in error as a patch bump: it was a feature release that also added two
required fields to the publicly exported `MonitorPrefs` type. Superseded by
0.4.0, which is identical in code. Deprecated on npm — use 0.4.0. Its contents
are listed under 0.4.0.

## [0.3.2] - 2026-08-19

### Added

- `./package.json` as an export subpath, a top-level `types` field, `engines`
  declaring Node >= 18, and package metadata (repository, homepage, bugs,
  keywords).

### Changed

- `peerDependencies` narrowed from `*` to `axios ^1.0.0`,
  `@reduxjs/toolkit ^2.0.0` and `@tanstack/react-query ^5.0.0`. Narrowing a peer
  range is breaking by convention and this shipped as a patch — though 0.3.2 was
  the first version on the public npm registry, so no npm consumer could have
  been affected.
- License: `UNLICENSED` → MIT.
- Published to the public npm registry instead of GitHub Packages.

### Fixed

- `tapQueryClient`'s disposer now clears the client's internal tapped mark. A
  dispose-then-reinstall cycle — exactly what React Strict Mode does to an effect
  returning this disposer — hit the idempotency guard and became a permanent
  no-op, leaving the Query tab silently empty for the rest of the session.

Versions before 0.3.2 were published to GitHub Packages and are not available on the public npm registry.
