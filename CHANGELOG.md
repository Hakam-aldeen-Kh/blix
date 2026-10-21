# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **A failed mutation finds its request exactly.** When your axios response
  interceptor replaces the client's error with its own, Blix records the
  replacement against its request, so a failed query or mutation holding it —
  or holding an error that carries it as `cause` — shows that request's body
  with no status needed and no guessing. `responseMatch` says whether the
  request was found this way (`"exact"`) or by status and time (`"guess"`),
  and the network row records what the caller received as `handledAs`.

### Changed

- **"In progress" is a clear blue.** In Blix, Blix Light, Nord and Gruvbox the
  colour of 1xx, 3xx and pending requests was a grey-blue too close to the grey
  of a 304 or a cancelled request to tell apart. It is now a distinct blue (in
  Nord, the grey is darker instead), still holding 4.5:1 as text.
- **The filter docs list what `method:` matches in each source** — `ws`, a
  Redux slice, `query` or `mutate` — and the accepted alternative spellings.

### Fixed

- **A floating panel stays on screen when the window shrinks.** One that had
  fitted was left hanging off the bottom, and reopening it did not help.
- **Every failed request has a square status dot.** A 404 is amber, for
  severity, but was round like a success, so by shape alone it read as one.
- **The filter field shows its count and clear button** while a filter is on.
  They were visible only for a moment while typing.
- **Timing accounts for waiting for a connection slot.** On a reused
  connection that wait was in no phase, so a request's phases could add up to a
  fraction of its total. It is now part of **Queued**.
- **Redux: Dispatched by shows a call stack.** The middleware never captured
  one, so the tab was always empty.
- **Redux: the Action tab shows the action as dispatched**, `type` included,
  without a `meta: undefined` on every plain action.
- **Redux: the Diff tab opens on its `+ / − / ±` rows**, and remembers its own
  format apart from the other payload panes.
- **Query rows show their size**, not 0 B, and **their fetch time is the
  latest fetch's**, not the time since the key was first seen.
- **A settled mutation stays settled.** Later cache events kept moving its
  end time. Mutations now have a timeline: `mutate`, then `success` or
  `error`.
- **The request menu works from the keyboard.** It opens beside what opened
  it rather than in the corner, and has menu roles, focus and arrow keys.
- **A request without a body says so** — "no request body" rather than "not
  captured".

## [0.13.2] - 2026-10-21

### Fixed

- **A failed query or mutation shows the server's full response.** When an app
  replaced axios's error with its own, the row showed only
  `{ kind: "unknown", message, status }`. It now takes the body from the HTTP
  request it failed on (`responseFrom` names that request), including a failure
  raised on a 2xx envelope. The body is shown ahead of the stack trace.
- **An error class's own fields are kept.** Fields such as `result`, `errors` or
  a numeric `code` on the app's error are stored under `details`, masked like
  any other stored value.
- **A mutation's variables are recorded.** They arrive after the row is
  created, and were never shown.

## [0.13.1] - 2026-10-21

### Fixed

- **Report an issue** in About Blix opens GitHub's template chooser instead of
  a blank issue, so a report starts from the bug report or feature request
  form, and security problems go to a private advisory.

## [0.13.0] - 2026-10-21

An About sheet that answers the first question on every bug report, and docs
that now live at [blixjs.dev](https://blixjs.dev).

### Added

- **About Blix**, opened from the command palette, the overflow menu and the
  foot of the shortcuts sheet. It shows the version, links to the docs and the
  release notes, and two short tables: the environment (Blix and React
  versions, browser, origin, database) and the sources (whether fetch is
  attached, a query client tapped, `apiClient` and `store` passed, and how many
  entries each source holds).
- **Copy debug info** copies the same facts as plain `key: value` lines, ready
  for a bug report. It carries the page's origin and nothing else from the
  log: no URLs, headers or payloads.
- **Report an issue** copies the debug info and opens a new GitHub issue. When
  the browser refuses the clipboard, the text is shown selected instead, so
  Ctrl/⌘ + C is the one step left.

### Fixed

- HAR exports carry the installed Blix version in `creator.version`. They
  said `0.11.0` whatever the version.

### Changed

- The README, `homepage` and security policy point at
  [blixjs.dev](https://blixjs.dev) for the docs and the changelog.

## [0.12.0] - 2026-10-16

The panel on the new Blix identity: graphite grounds, grey that carries, and
green and red only where something is happening.

### Changed

- New default themes, `blix` and `blix-light`. A panel on the "auto"
  appearance switches to them on upgrade; one where a theme was chosen
  explicitly — Midnight included — keeps it. The other twelve themes are
  unchanged and still in the Appearance menu.
- The launcher and header carry the Blix mark: the docked edge's blade is
  green, and a red dot shows while capture is running. A paused panel shows
  no dot. Failures never appear on the mark.
- The capture chip reads RECORDING or PAUSED, with the same red dot and an
  amber square.
- Request rows lead with a status dot: round when the request worked, square
  when it failed, hollow while in flight. Failing rows are tinted; a selected
  failure stays red. 2xx status codes are grey.
- Waterfall bars are one neutral colour — green on the selected row, red on
  failures — so they compare as lengths.
- The state filters are pills, and only the error count is coloured.
- The sidebar has new line icons for the four sources, in each source's
  colour, and shows how many entries failed beside each source's count.
- The detail pane colours the status code only; Replay, Pin and cURL are
  plain outline buttons; the active tab is underlined in the text colour.
- Menus and the command palette mark the selected item with a background
  step instead of the accent colour, and group labels are mono capitals.
- Empty sources show the idle mark and "Nothing captured on Network yet."
  The setup snippets stay.
- While dragging the launcher, each corner shows the slot it would land in,
  and the one under the pointer is outlined in green.
- Transitions use one easing curve: 120ms for hovers, 200ms for panels and
  menus. With reduced motion requested, nothing in the panel animates.

### Fixed

- Panels docked to the top or bottom no longer extend under the page's
  scrollbar, which hid the close button and the right edge of the panel.

### Removed

- The Redux and TanStack Query logos in the sidebar and launcher, replaced by
  the new source icons. This also makes the bundle slightly smaller.

## [0.11.0] - 2026-10-10

Failures recorded whole, the browser's own timing on every request, docks on
every edge — and three credential leaks closed.

### Breaking

- `entry.error` for a failed HTTP request is now a `CapturedError` object
  (`kind`, `name`, `code`, `message`, `status`, `statusText`, `timeoutMs`,
  `response`, `cause`, `stack`) instead of the response body or a string. The
  body is on `error.response`. HAR export still writes the body.
- The stored error for query and mutation rows has the same shape, rather than
  a copy of the thrown object.
- Persisted logs from earlier versions are discarded once on upgrade. Panel
  preferences are kept.
- Docked panels reserve their side of the screen with inline padding on
  `<html>` — the page is pushed over instead of covered — and no longer close
  on an outside click. A developer whose panel was already docked sees their
  page re-laid-out the first time they open it after upgrading.
- Single-key shortcuts apply only while focus is in the panel.
- `MonitorPrefs` gains required `topH` and `leftW`; `DockMode` gains `"top"`
  and `"left"`.

### Security

- Query and mutation errors, and Redux actions whose payload is an error, no
  longer store the axios request config, which exposed unmasked
  `Authorization` and `Cookie` headers in the panel, in exports and in
  persisted logs. Upgrade, and treat any log exported from an earlier version
  as holding live credentials.
- String values under `authorization`, `cookie`, `set-cookie` and `x-api-key`
  keys are masked at any depth in data Blix copies — Redux payloads and diffs,
  query data, and everything written to IndexedDB.
- "Copy as cURL", and the exported cURL script, now quote the method, header
  names and every other value as single shell arguments. A request recorded
  with a crafted method or header name could previously run commands when the
  snippet was pasted into a shell. "Copy as fetch" serializes every value with
  `JSON.stringify`.

### Added

- `entry.wire`: the browser's `PerformanceResourceTiming` for each request —
  queue, DNS, connect, TLS, wait (TTFB) and download, bytes transferred,
  encoded and decoded size, protocol, and whether it came from the cache. A
  cross-origin response without `Timing-Allow-Origin` keeps its total only and
  is marked `restricted`. No setup: every `attach*Monitor` starts it.
- React 18 is supported: the `react` and `react-dom` peer range is now
  `^18.0.0 || ^19.0.0`.
- The Timing tab gains "On the wire" and "Server-Timing" sections.
- `CapturedError`, `FailureKind`, `WireTiming` and `ServerTimingMetric` types,
  exported from both entry points.
- `top` and `left` dock modes, beside `bottom` and `right` — each with its own
  saved size, and in the header's dock switcher and "Cycle dock position".
- `--blix-dock-top`, `--blix-dock-right`, `--blix-dock-bottom` and
  `--blix-dock-left` CSS variables on `<html>`: the docked panel's size on that
  side, `0px` on the others. For `position: fixed`/`sticky` elements, which
  the reserved space does not move by itself. Set only while a panel is
  docked, so read them with a fallback: `var(--blix-dock-right, 0px)`.
- Each source has its own icon and colour, in the sidebar, the launcher and
  the detail pane's active tab.

### Changed

- The status column reads `timeout` or `network` instead of `ERR` when there
  was no response, and the detail head shows the failure's own message.
- The size column uses the browser's decoded size when it reports one.
- A stacked panel too short for two panes shows one at a time, with a Back
  button; the header, sidebar and payload bar degrade in steps at small sizes.
- Top and bottom docks respect the safe-area insets.
- Shortcuts ignore Ctrl/⌘/Alt combinations, `contenteditable`, `<select>` and
  IME input. Ctrl/⌘ + backtick still toggles the panel from anywhere.
- All shortcuts, including the toggle and Ctrl/⌘+K, work on non-Latin keyboard
  layouts: they follow the physical key, so nothing needs a layout switch.
- Escape only closes Blix when focus is inside it, and an Escape Blix handles
  no longer reaches the host app.
- A Redux action whose payload is an error, or holds a masked key, cannot be
  re-dispatched: what is stored is no longer what was dispatched.
- While another tab on the same origin is still running an earlier version of
  Blix, the saved log cannot be upgraded. The status bar says that nothing is
  being saved, and saving starts by itself — with what was captured meanwhile
  — once that tab is closed or reloaded.
- The theme contrast report is no longer printed to the console on every
  mount. Set `globalThis.__BLIX_DEBUG__ = true` before the panel mounts to see
  it.

### Fixed

- axios requests no longer stay `pending` when the app's own interceptors
  reject with their own error, unwrap `r => r.data`, or retry under the same
  config: the outcome is recorded before any app interceptor runs.
- A request with a timeout that is still pending 3 s past it is settled as a
  timeout, and corrected if an answer arrives later.
- An error thrown by a request interceptor is attributed to its request.
- A crash in the payload viewer that tore down the host app's tree when a
  payload arrived after the pane mounted.
- The Headers, Initiator and Query State tabs now fill the pane and scroll.
- Menus no longer show a scrollbar; Copy is no longer clipped in a narrow pane.
- Restoring a preserved log no longer drops pinned rows, open realtime
  connections, or entries beyond 200 when other pools are busy: hydration now
  applies the same per-source limits as live capture.
- Pinned rows already saved in a preserved log are no longer dropped when the
  log is trimmed to 200 records on load. Saving is still bounded: a pin older
  than the newest ~200 saved requests is evicted from storage like any other
  record, and does not come back after a reload.
- The panel is wrapped in an error boundary, so a failure inside Blix can no
  longer take down the host app: the panel is removed until reload and the
  error is logged once as `[blix] the panel crashed`. A panel chunk that fails
  to load is caught the same way.
- Blocked web storage — a sandboxed iframe, strict privacy settings — no
  longer throws; Blix runs with default preferences instead.
- Invalid or outdated stored preferences fall back to their defaults field by
  field instead of crashing the panel.
- The `r` shortcut asks for the same confirmation as the Replay button before
  re-sending write requests. The palette's "Replay request" does too.
- The Close button is shown at every panel width. Below 620px — every side
  dock at its default width — the header had none.
- The status bar no longer reports entries as saved when IndexedDB is
  unavailable and nothing was written; it says storage is unavailable.
- Reading `NEXT_PUBLIC_BLIX` no longer throws "process is not defined" in
  production builds on bundlers without a process polyfill (Vite, esbuild,
  Rollup).

## [0.10.0] - 2026-09-30

A launcher that says what it holds, and exporting one entry on its own.

### Added

- **Export the selected entry.** The export menu's scope has a third option,
  **Selected**, beside Shown and All: the one entry open in the detail pane —
  a request, a Redux action or a query — in any of the six formats. It is
  disabled while nothing is selected, and a remembered Selected scope falls
  back to Shown rather than opening with every format disabled.
- **Per-source counts on the launcher badge.** The single total is replaced by
  one segment per source that has captured anything — Network, Realtime,
  Redux, Query — each with the rail's icon and colour, and its failing count
  in red beside it. Empty sources are left out.
- **Icons in the overflow menu**, one per option. Purge has its own glyph, so
  it no longer reads as the same action as Clear.

### Fixed

- The launcher's failing count and its in-flight pulse only counted the source
  last open in the panel, so an error in Network did not show while Redux was
  the saved source. Both now span every source.

## [0.9.0] - 2026-09-30

Blix on a staging server, a clear button scoped to one source, and no more
hydration warning in Next.js.

### Added

- **`NEXT_PUBLIC_BLIX=true` keeps Blix in a production build**, for staging
  and test servers. Since Next.js 16, `next build` runs on Turbopack and
  inlines `NODE_ENV` as `"production"` whatever the environment says, so a
  staging build made with `NODE_ENV=development` — which kept the panel under
  webpack — silently lost it. The panel and the capture layer both check the
  new variable next to `NODE_ENV`. Set it to `false` in the production env
  file: left unset, the check stays in the bundle at runtime and the panel's
  chunk is emitted into the build (it never loads). Your own mount component
  and call-site guards need the variable too.
- **A red clear button beside Export** empties the source you are reading and
  leaves the other three alone. Pinned entries survive it, and it is disabled
  when the source has nothing to clear. **Clear log** in the overflow menu and
  `⇧C` still empty every source.

### Changed

- **The panel opens floating by default**, instead of docked to the bottom.
  Only the default changes: a dock position you already chose is kept.

### Fixed

- **Hydration mismatch in SSR hosts.** `<Blix />` branched on
  `typeof window`, so the server rendered nothing and the client's first pass
  rendered a `<Suspense>`, and Next.js reported a mismatch on every load. It
  now renders nothing until hydration has finished, and the panel mounts on the
  render after.

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
