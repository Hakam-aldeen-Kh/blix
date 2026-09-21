# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-09-21

The panel, redesigned. One token layer, a row you can tell apart from its
neighbours, and columns you choose. Nothing about capture, storage or masking
changes.

### Added

- **A single token layer.** Sizes, type, spacing and radii live in
  `ui/styles/tokens.ts`; colour is 33 slots per theme in `ui/themes/bx.ts`,
  authored rather than derived. A dev-time check reports any theme missing a
  slot, and any theme whose `--bx-fg-2` or `--bx-fg-3` falls under 4.5:1
  against a ground it actually lands on. It reports; it never corrects — half
  of these palettes are published and their values are deliberate.
- **Column control.** Right-click the column head, or **Columns** in the
  overflow menu. Seven of the eight columns can be switched off and the choice
  persists; ROUTE cannot, because a row you cannot identify is not a row.
- **The Redux Diff tab is a unified diff.** Each changed path is a header;
  both sides are pretty-printed and diffed by line, with unchanged stretches
  collapsed and a per-path `+n −n`. It replaces one line per path, which was
  right for a scalar and useless for an object — `{"items":[…]}` on both sides
  told you nothing. **Copy** now yields a real unified diff.
- **Launcher corners** — Sharp, Soft or Pill, in the overflow menu. The
  launcher is the only surface that sits on the host app's page rather than
  inside the panel's own chrome, which makes it the one radius worth handing
  over.
- Clicking the status bar's pinned count **goes to** that entry, switching
  source if it is in another one, and cycles on repeat clicks.

### Changed

- **The row is nine tracks**: rail, pin, method, route, size, status, time,
  links, timing. ROUTE renders the whole route with the module dimmed and the
  identifier bright, so four rows against `getAll` are four different rows
  rather than one repeated four times. PIN and LINKS hold their width whether
  or not they have anything to show.
- **The list is an ARIA grid** with a roving tabindex, not a stack of divs
  carrying click handlers. Enter activates a row; Space stays with capture.
- Status codes and methods are monospace text. The coloured pills and badges
  are gone — here, and in the export menu, the appearance menu and the
  databases sheet.
- **Default density is the 26px step.** All three steps remain in the menu.
- The status bar degrades a segment at a time, each carrying its own
  separator, so a narrow panel no longer leaves a row of orphan slashes.
- Timing phases take the data colours rather than the four source-identity
  ones, and a phase that cost nothing recedes instead of competing.
- The collapsed sidebar shows sources and counts only. The session stats are
  hidden rather than shrunk: four numbers with their labels stripped off are
  four unattributed numbers.
- Dragging the launcher shows all four corner targets, each one named.
- The filter field shows `8 of 56` and a clear button in place of removable
  token chips.

### Fixed

- The shortcuts sheet and the command palette advertised `P`, `R`, `X`, `C`
  and `U` where the handlers are lower case, so those keys did nothing. Case
  is load-bearing — `c` copies the response, `⇧C` clears the log — so the
  documentation now prints what actually fires. The palette also offered `⇧D`
  for density, which has never had a binding at all.
- `c` was documented as copying the active format. It has always copied the
  response as JSON, and now says so.
- The list/detail split is clamped to what the panel can give it. A stored
  580px list inside a 580px panel left the detail pane 40px wide.
- The detail pane's format controls drop to a row of their own below 560px
  instead of sharing one 27px line with the tabs and squeezing the format
  labels to nothing.
- Selecting text in the filter field no longer reads as a second focus ring.
- The Headers, Connection and Query State tabs render as a key/value grid
  again rather than one item per line.

## [0.7.0] - 2026-09-20

The `Authorization` header, inspectable: what a JWT in it claims, and an opt-in
switch to show the value itself on screen. Plus a fix for an axios setup that
made **every request on the instance fail**.

### Added

- **JWT claims.** When an `Authorization` value is a compact JWS, Blix decodes
  it and keeps `alg`, `sub`, `iss`, `iat` and `exp` on the entry — never the
  token and never its signature, so nothing stored can be replayed. The **JWT**
  chip on the `Authorization` row opens them, counting down to `exp` and turning
  red once it has passed. It works with masking on, which is the default.
  Decoding is all-or-nothing about the token's shape: an opaque bearer token, a
  JWE, or a claim of the wrong type stores no claims at all rather than
  presenting a guess as a fact. The signature is never verified — Blix has no
  key, and a devtool that said "valid" would be claiming something it cannot
  know.
- `alg` is display-only and never withholds anything: a missing, empty or
  non-string `alg` still yields every other claim. The XML-DSig URIs .NET's
  `JsonWebTokenHandler` writes there —
  `http://www.w3.org/2001/04/xmldsig-more#hmac-sha256` and its HMAC, RSA,
  RSA-PSS and ECDSA siblings — are shown by name, as `HMAC-SHA256 (HS256)`,
  with the raw value in the tooltip and on a Copy chip; the entry, the database
  and the exports keep the raw value. An `alg` of `none`, in any letter case,
  is flagged as an unsigned token, reported as what was sent and what came back
  rather than as a verdict.
- The claims say where they were read: when a `fetch` call was made, from the
  headers an axios request settled with, or — for an axios request that never
  settled or used the `auth` option — when it started.
- **Showing `Authorization` in full**, off by default: command palette → **Show
  Authorization values in full**. It applies to requests captured after it is
  switched on; earlier entries were masked at capture and cannot be revealed,
  and their row says so. The raw value is held in memory beside the entries,
  never on them, so it cannot reach IndexedDB, a downloaded file or a copied
  snippet: **every** export and copy path — HAR, JSON, NDJSON, CSV, Markdown,
  the cURL script, Copy as cURL and Copy as fetch — still carries the masked
  value. The row's own Copy button is the one way to take it. Masking again
  discards every value held. `cookie`, `set-cookie`, `x-api-key` and realtime
  connect tokens stay masked regardless.
- While it is on, the status bar reads **UNMASKED Authorization**, second in
  the bar and never dropped at a breakpoint — of everything about a session, it
  is the one fact someone about to screenshot the panel needs to see. Every
  such row in the Headers tab is tagged `UNMASKED`.
- `JwtClaims` and `JwtClaimsSource` are exported from `@hakam-aldeen-kh/blix/capture`.
- A CI workflow: typecheck, build, and two guards on the published bundle —
  that `process.env.NODE_ENV` survived it (defined away, the panel would ship
  to every consumer's users) and that `"use client"` is still its first bytes
  (without it, a React Server Component rendering `<Blix />` fails in Next.js).

### Fixed

- **`attachHttpMonitor` made every request on the instance fail** when a
  response interceptor registered before it returned something other than a
  response — `(response) => response.data`, the usual unwrapping interceptor,
  or a rejection handler returning a normalised domain error. Blix read
  `.config` straight off that value, which threw inside its own interceptor and
  rejected the request. Present since 0.2.0. Such a response now passes through
  untouched; the entry stays `pending`, because Blix does not settle a request
  it cannot see settle. Register the unwrapping interceptor after
  `attachHttpMonitor` to get both.
- **Request headers are now the ones the request went out with.** Blix's
  request interceptor runs before the host's, so the headers they add — auth,
  tracing, signing, locale — and the `Content-Type` axios sets itself did not
  exist yet, and the panel showed a request without them. Headers are now
  re-read from the config axios settles with, and the request-time snapshot is
  kept only until then — and for good, for a request that never settles or
  whose rejection carries no `config`. The body is still the plaintext captured
  at request time, which is the point of running first.
  - `Authorization: Basic …` from axios's `auth` option is the exception: the
    adapter builds it on its own copy of the config, so the settled config
    shows something that was never sent. That header keeps its request-time
    value; every other header comes from settle.
- **`is:encrypted` matched every request** in an app that encrypts nothing: it
  tested `skipEncryption !== true`, which is unset on an ordinary request. It
  now requires ciphertext actually handed to `captureEncrypted`. The detail
  pane's **Encrypted** row followed the same broken rule and read "yes" for
  those requests; it now reports the evidence, or shows no row at all.
- The empty-state setup snippets named exports that do not exist —
  `attachHttp(apiClient)` for `attachHttpMonitor`, and a bare
  `tapRealtimeAdapter(...)` call that discards the wrapped adapter. Each
  snippet now compiles as written, with axios and `fetch` shown separately and
  `tapQueryClient` shown in the effect Strict Mode requires.

### Changed

- In development, Blix warns once when an axios instance sets
  `transitional.legacyInterceptorReqResOrdering: false`, which puts Blix's
  request interceptor last and means the Payload tab shows the body after the
  host's interceptors transformed it. Previously Blix could not detect this at
  all.
- The README documents which request headers the panel can and cannot show,
  and SECURITY.md notes that the raw `Authorization` never leaves memory.

## [0.6.1] - 2026-09-13

### Fixed

- `withInitiatorCapture`: a wrapped client threw
  `TypeError: Cannot create property '__monitorInitiator' on string` on every
  call that passed a URL string first — `client(url)`, `client(url, config)`,
  `client.request(url)` and `client.request(url, config)`. The wrapper threw
  before axios ran, so no promise was returned and a `.catch()` never saw it;
  only a surrounding `try` did. Present since 0.2.0. Those calls now reach
  axios as written, with no initiator stack. The wrapper also forwards every
  argument now — previously it passed on only the first, which is what keeps
  the `config` in `client(url, config)` now that the call no longer throws.
- `withInitiatorCapture`: a frozen, sealed or otherwise non-extensible config
  threw `TypeError: Cannot add property __monitorInitiator, object is not
  extensible`, through every wrapped method. The request now goes out with no
  initiator stack.
- `withInitiatorCapture`: a config object reused across calls, such as a
  module-level `const options`, reported the stack of the first call that used
  it for every later request. A config object you wrote now records the call
  site of each call that passes it.
- `withInitiatorCapture`: a config axios rebuilt for a retry keeps the original
  call site. When an auth-refresh or retry interceptor calls
  `client(error.config)`, the retried request's initiator is the call that made
  the first attempt, not the interceptor — as in 0.6.0. The previous fix tells
  the two cases apart by `__monitorId`, which `attachHttpMonitor` stamps only
  on configs axios built, so this holds when `attachHttpMonitor` is installed
  on the instance.
- `withInitiatorCapture`: wrapping a client that is already wrapped returns it
  unchanged, with a warning in development. Wrap the axios instance once and
  export the wrapped one.
- `attachFetchMonitor`: a request body read from a `Request` object, as in
  `fetch(new Request(url, { body }))`, never set the entry's size. The row
  showed 0 B while pending, and kept it when the response recorded no size of
  its own — event streams, opaque responses, network errors and aborts. The
  size now comes from the bytes read. For a body over `maxBodyBytes` it is the
  bytes counted before capture stopped, so a lower bound. A size the response
  has already recorded is never overwritten.

## [0.6.0] - 2026-09-13

Fetch capture, and storage scoped per project. No public function signature
narrows, but **the saved log and panel preferences do not carry over**: see
Upgrading.

### Upgrading

- Databases are now named `blix:<dbName>`, and `blix:default` when no `dbName`
  is given. The panel opens a new, empty database whether or not you already
  passed `dbName`. The old `nm-devtools` database is neither migrated nor
  deleted. It is listed under **Databases on this origin**, where you can peek
  at it and delete it.
- Panel preferences start once from the defaults. The unscoped `nm:prefs`
  `localStorage` key (and the older `nm:size`, `nm:pos`, `nm:corner`,
  `nm:listw`) are removed on first read rather than adopted, since on a shared
  origin they held whichever project wrote last.

### Added

- **`attachFetchMonitor(options?)`** in `/capture`, with the
  `FetchMonitorOptions` and `FetchIgnoreRule` types. It wraps
  `globalThis.fetch` on the client and records requests in the Network section
  in the same shape as axios requests, with the same header masking. It reads
  bodies from clones, so your code gets an untouched `Request` and `Response`.
  Bodies are capped at 5 MB (`maxBodyBytes`), counted as bytes arrive rather
  than trusted from `Content-Length`. Event streams, opaque responses and
  streaming uploads are recorded without a body, and the row says why.
  Next.js and webpack dev traffic is ignored by default; `ignore` replaces or
  extends that list. It returns a disposer, and installing it twice does
  nothing. With axios on its fetch adapter, each request is logged once, as
  the axios entry. Fetch rows cannot be replayed and do not support
  `captureEncrypted`.
- `client` on `MonitorEntry` (`"axios"` | `"fetch"`), shown as a **Client** row
  in the Headers tab and filterable with `client:fetch` / `client:axios`.
  Entries captured before this release have no `client` and match neither.
- **Databases on this origin**, from the command palette, **⋯ More actions** or
  the status bar. It lists every Blix database on the origin with its
  approximate size, **Peek** shows a read-only snapshot of a database's 50
  newest entries, and it deletes any database except the active one. In Firefox,
  which lacks `indexedDB.databases()`, the list comes from the names Blix has
  recorded and is labelled as possibly incomplete.
- The status bar names the active database, turning amber with a `shared` tag
  on `blix:default`.
- `attachHttpMonitor` returns a disposer that ejects both interceptors.
- When Replay is unavailable, the detail pane states the reason as text, and
  the palette's Replay row carries it as a note. A disabled button does not
  reliably show its tooltip.

### Changed

- The panel's `localStorage` preferences mirror is keyed per project
  (`blix:<dbName>:prefs`), so apps on one origin no longer share dock position,
  theme or the preserve-log toggle.
- Omitting `dbName` logs a console warning in development, once per mount.
- A `dbName` set after the database is open is ignored with a console warning.
  Previously it was accepted, so the live connection stayed on the old
  database and a later Purge deleted the new, unused name.
- `attachHttpMonitor` is idempotent per instance, and treats an instance and
  its `withInitiatorCapture` wrapper as one.
- An axios request cancelled through `AbortController` or `CancelToken` settles
  as **aborted** rather than as an error. Timeouts are still errors.
- The published type declarations no longer import axios.
  `attachHttpMonitor` and `withInitiatorCapture` accept structurally typed
  clients, and `withInitiatorCapture` now returns the type it was given, so an
  `AxiosInstance` stays an `AxiosInstance`. Fetch-only apps type-check without
  axios installed. axios is still an optional peer dependency.

### Fixed

- In the published package, the Initiator column pointed at Blix's own frames.
  They were filtered by source module name, which the bundled
  `dist/chunk-*.js` files do not carry. They are now dropped by stack depth.
- Calling `attachHttpMonitor` twice on one instance registered two interceptor
  pairs, so every request left a duplicate entry pending for the rest of the
  session.
- A purge blocked by another tab holding the database open was reported as
  done. The panel now shows the error.
- Request sizes for `Blob`, `File`, `ArrayBuffer`, typed arrays, `DataView` and
  `URLSearchParams` bodies. The first three and `URLSearchParams` were measured
  as 2 bytes, and typed arrays were walked element by element: about 340 ms
  for a 1 MB `Uint8Array`.

### Security

- Header masking now handles a `Headers` instance and `[name, value]` pairs.
  The first serialized as `{}`, and the second was walked by index, so
  `authorization` in either form would have gone through unmasked. Neither form
  reached the masker in earlier releases, because axios was the only capture
  path and it normalises headers before its interceptors run. `fetch` accepts
  both, so the fix ships with `attachFetchMonitor`.
- `attachFetchMonitor` captures every `fetch` on the page, including those made
  by third-party scripts. See the README's Security section.

## [0.5.0] - 2026-08-26

The panel is redesigned. **The runtime API is unchanged** — `<Blix />` and
every capture function keep their signatures and behaviour, so upgrading is a
version bump. The one breaking change is to an exported *type*: see Removed.

### Changed

- **Redesigned the panel.** The four sources moved from tabs in the toolbar to
  a rail down the left, which also carries the session totals; the header now
  holds only session-level controls, with a labelled capture pill and a filter
  field whose parsed tokens are removable chips inside the box. The detail
  pane's tabs and the payload format switch share one row, and the entry list
  is a fixed five-track row rather than a resizable column set.
- Row metadata that used to have its own column — size, initiator, transport,
  touched slices — folds into the identity column and gives up width before
  the name does. The waterfall column is replaced by a duration bar scaled
  against the slowest entry in view.
- Empty sections now carry their setup call and a Copy button, so the fact
  that capture must be installed where the adapter or store is *constructed*
  is stated where a developer discovers the problem.
- The Timing tab compares a request against the session's median and its
  slowest entry.
- Masked headers are labelled `MASKED` in the Headers tab rather than leaving
  the reader to infer it from an ellipsis. The stored value keeps its
  `(masked)` suffix, so every export path still carries the fact.
- Row density defaults are a few pixels taller (26 / 30 / 36) — the duration
  column now holds a number and its bar.
- The docked badge separates its identity from its counts and carries a grip,
  so what is draggable is visible before you drag it. The failing count is
  titled rather than only coloured.

### Added

- **Command palette** (`Ctrl/⌘ K`), reachable from the header, the rail and
  the status bar. It is the only affordance for sorting, density, dock
  position, the per-entry copy formats and the filter syntax.
- Two more ways to purge the saved log — **⋯ More actions** and the palette —
  alongside the status bar's arm-then-confirm label. Both delete on a single
  press, and both stay available with preserve-log off, so a log written
  earlier in the session can still be deleted after the toggle is switched
  back. They are disabled when nothing is on disk.
- **Linked events.** The correlations Blix already observed — the query behind
  a request, the requests a query caused, the original of a replay — are now
  symmetric, shown as a tick on the row and a strip of chips at the foot of
  the detail pane. They replace the one-directional "Caused by" notice and the
  "Requests caused" list inside the Query State tab.
- `railCollapsed` panel preference.

### Fixed

- The list rendered only the overscan window — eight rows and a blank column
  below them — when the panel was opened onto a buffer that had filled up
  before it was opened. The virtualizer's ResizeObserver never attached,
  because the scroller does not exist until the panel is open and nothing in
  its effect changed at that moment.
- `Pause capture` and the rail toggle performed a store write inside a
  `setState` updater, which React runs during the render phase — a setState
  from inside a render, warned about in the console.

### Removed

- Column resizing, and `columnWidths` from the exported `MonitorPrefs` type.
  The list has one elastic column now; the rest are fixed. **Breaking** for
  anyone who constructs a `MonitorPrefs` object or reads that field —
  `railCollapsed` is required in its place. Stored preferences carrying the old
  key still load; it is ignored.
- The filter-syntax hint row under the toolbar, and the state-filter bar. The
  filters moved into the list header; the syntax moved into the palette.

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
