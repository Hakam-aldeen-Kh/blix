# Architecture

How Blix is put together, for anyone about to change it. Using Blix is covered
at [blixjs.dev/docs](https://blixjs.dev/docs); getting the project running, at
[CONTRIBUTING.md](CONTRIBUTING.md). This page is the map in between: what the
parts are, how data moves through them, and the rules each part is built
around.

## The shape of it

```
 host app                       Blix
 ────────                       ────
 fetch / XHR / axios ──┐
 Redux store ──────────┤  capture layer          store                 panel (when idle)
 TanStack QueryClient ─┼─► src/capture/* ──► networkMonitor ──────► src/ui/*
 realtime adapter ─────┘   (no React)        (one log, pools,   useSyncExternalStore
                                              eviction)               │
                                                 │                    │
                                                 ▼                    │
                                           IndexedDB  ◄── persistence ┘
                                           (preserve log, prefs)
```

Two layers, one store between them:

- **Capture** (`src/capture/`, published as `@hakam-aldeen-kh/blix/capture`)
  watches what the app does and writes it to the store. It has no React in it,
  and imports none of the libraries it watches: axios, TanStack Query and Redux
  are typed *structurally*, so an app that uses only `fetch` type-checks
  without them installed.
- **The panel** (`src/ui/`) reads the store and draws it. It is loaded with a
  dynamic `import()`, behind the development check, so a production build
  never downloads it. It renders inside the host's React root, so it waits for
  the host: it mounts, and re-reads the store, only when the main thread is
  idle (see [The panel](#the-panel)).

Data flows one way: capture → store → panel. The panel acts back on the app
only through explicit actions the developer takes — Replay (through the
`apiClient` it was given), Re-dispatch (through the `store` it was given), and
the Query actions (invalidate, refetch, remove).

## Being gone from production

This is the product, not a detail. Everything rests on one expression:

```ts
// src/capture/monitorConfig.ts
export const MONITOR_ENABLED =
  (process.env.NODE_ENV === "development" || BLIX_OPT_IN) && typeof window !== "undefined";
```

- It must survive **our** build untouched — `tsup` must not define or replace
  `process.env.NODE_ENV` — so the **consumer's** bundler can fold it to `false`
  and drop every capture path and the panel's `import()`. CI checks the
  literal is still in `dist/` (`check:prod-guard`, and a grep in `ci.yml`).
- `NEXT_PUBLIC_BLIX=true` opts a non-development build in (a staging build).
- Every capture function returns early when `MONITOR_ENABLED` is false and
  hands back a no-op disposer, so an unguarded call costs nothing at runtime.

## The capture layer

| Module | Watches | How |
| --- | --- | --- |
| `attachFetch.ts` | `fetch` | Replaces `globalThis.fetch` with a wrapper. Reads request and response bodies from `clone()`s, through a byte counter, never past `maxBodyBytes`. |
| `attachXhr.ts` | raw `XMLHttpRequest` | Wraps `open`, `setRequestHeader`, `send` on the prototype. Not yet a public export. |
| `attachHttp.ts` | an axios instance | A request interceptor (registered last, so it runs **first**, before any encryption) and a response interceptor (runs **last**, after decryption). A *wire tap* on the first host response interceptor sees the raw outcome before the app reshapes it. |
| `queryCapture.ts` | a TanStack `QueryClient` | Subscribes to the query and mutation caches. One row per query key (or mutation), accumulating its whole history. |
| `reduxCapture.ts` | a Redux store | A middleware. Records the action and a bounded diff of the state it produced. |
| `realtimeCapture.ts` | a realtime adapter | A `Proxy` over the adapter's `connect / subscribe / onMessage / …`. One row per connection, frames appended to it. |
| `captureEncrypted.ts` | ciphertext | Lets an app that encrypts in its own interceptor show the encrypted form beside the plaintext. |

Shared modules:

| Module | Job |
| --- | --- |
| `networkMonitor.ts` | The store: an array of `MonitorEntry`, newest first, an id index, coalesced change notifications, per-source pools with eviction (pinned entries and open sockets are never evicted). |
| `monitorTypes.ts` | `MonitorEntry` and everything on it. Read this first. |
| `monitorSerialize.ts` | Headers flattened and **masked** (`authorization`, `cookie`, `set-cookie`, `x-api-key`), bodies serialized, sizes estimated. |
| `monitorTruncate.ts` | The bounded copy written to IndexedDB: byte budget, string and array caps, credential keys masked at any depth, errors reduced to name/message/code. |
| `monitorError.ts` | Anything thrown, as a `CapturedError` with a `kind` (`http`, `timeout`, `network`, `aborted`, `setup`, `unknown`). Reads named fields only — never copies an axios error's config. |
| `stateDiff.ts` | The Redux diff: reference-equality pruning (Immer's structural sharing makes it cheap), bounded on every axis, marked `truncated` whenever it is partial. |
| `resourceTiming.ts` | Pairs the browser's `PerformanceResourceTiming` entries with captured requests, for the Timing tab. |
| `monitorPersistence.ts`, `monitorStorage.ts`, `monitorDatabases.ts` | Preserve-log and preferences in IndexedDB (never `localStorage` — apps clear it on sign-out, exactly when the log is needed). |

## Links between entries: exact or nothing

Blix links things across sources — a request to the query that made it, a
failed mutation to the response it failed on, a timing entry to its request.
The rule for every link: **what the panel shows as a fact is a fact; what Blix
does not know, it leaves empty.** A devtool that answers confidently and wrong
is worse than one that says "unknown". Nothing is matched by status and time.

| Link | How it is made exactly |
| --- | --- |
| request → query/mutation that made it (`ownerId`, `causedIds`) | `monitorContext.ts` hooks the query's or mutation's `options` and holds the owner for the **synchronous** call of `queryFn` / `mutationFn` only. fetch and XHR read it at call time; axios reads it in `runWhen`, which axios calls synchronously inside `request()`. A request after an `await` gets no owner. |
| failed query/mutation → its request (`responseFrom`, `responseMatch`) | `errorOrigin.ts` remembers objects that came out of a request: the app's replacement for an axios error, a `fetch` `Response`. `"exact"` when the thrown error is, or carries (`response`, `cause`), one of those. `"caused"` when the attempt made exactly one request with the error's status. An object that came out of two requests (one shared `AbortError`) leads to neither. |
| an axios retry → the request it retries | A config that already carries Blix's stamp is being sent again: the retry is recorded as the successor, keeps the owner, and the app's final error is the retry's. |
| a timing entry → its request | By URL, then by the end: Blix hears of an end only after the browser has it, so the earliest end not before the browser's is the one. A timing waits until every request it could belong to has ended. |
| axios's own XHR / fetch → the axios entry | `monitorTransport.ts` and `monitorStamp.ts`: the axios entry claims the transport request, so it is not logged twice. |

`scripts/check-linking.mjs` and `scripts/check-adversarial.mjs` exist to break
these links on purpose; run them after touching any of it.

## The panel

| Path | What |
| --- | --- |
| `ui/Blix.tsx` | The public `<Blix />`. Renders nothing on the server or during hydration. After hydration it loads the panel's chunk from an effect, mounts it inside `BlixBoundary` when the main thread is idle, and never uses `lazy()` or `<Suspense>`. |
| `ui/BlixBoundary.tsx` | An error boundary: a crash inside the panel removes the panel, never the host app. |
| `ui/DevToolsPanel.tsx` | The panel itself: toolbar, sources rail, virtualized list, detail pane, keyboard, docking. |
| `ui/hooks/` | Layout and state: dock geometry, panel size, virtual rows, selection, the filtered list. |
| `ui/services/` | Logic with no rendering: the filter language, search index, exports (HAR, CSV, Markdown, NDJSON, cURL script), copy snippets, replay rules, keyboard mapping. |
| `ui/helpers/` | Pure formatting: sizes and times, YAML, JSON tree paths and folds, line diffs, tables, the waterfall. |
| `ui/themes/` | Fourteen themes and a contrast checker. |

The panel subscribes to `networkMonitor` with `useSyncExternalStore` through
`subscribeWhenIdle` (`ui/helpers/whenIdle.ts`). The store coalesces a burst
of captures into one notification per microtask, and the panel applies it
only when `requestIdleCallback` says the main thread is free. That is a rule,
not a tuning choice. The panel shares the host's React root, and any update
to it discards a render the host has in progress. Much of what is captured
happens during a host render (`useQuery` builds its query there), so
re-rendering the panel at once restarted that render, which captured the
same thing again. With `gcTime: 0`, a Next.js page never finished hydrating.
For the same reason:

- the panel never suspends (a Suspense fallback triggers React's 300 ms
  reveal throttle for the whole root), and
- the waterfall clock ticks only while the panel is open, and each tick also
  waits for idle.

`check:host` asserts that the host renders as fast with Blix as without it.

## Rules that hold everywhere

1. **The production guard is never weakened.** No defining, wrapping or
   replacing `process.env.NODE_ENV` in our build.
2. **The host app never breaks because of Blix.** Every capture path is in
   `try`; storage that throws, saved state of the wrong shape and render errors
   are contained. A request Blix cannot read is a request Blix does not record,
   never a failed request.
3. **The app's data is never consumed or changed.** Bodies are read from
   clones; nothing the caller passed is mutated, and no error is swallowed or
   replaced. The one write is Blix's own marker on the config **axios built**
   for a request — `__monitorId`, which a host's `{ ...config }` copy keeps,
   plus a non-enumerable symbol (`monitorStamp.ts`) — never on an object the
   app created.
4. **Exact or empty** (above).
5. **Credentials are masked at capture**, in the store, in IndexedDB and in
   every export and copy path.
6. **No runtime dependencies.** The published package has none. React is a
   peer; axios, Redux Toolkit and TanStack Query are *optional* peers, typed
   structurally so an app without them still type-checks.

## Testing

Each layer is described in [CONTRIBUTING.md](CONTRIBUTING.md#checks); in short:

| Layer | Where | Use it for |
| --- | --- | --- |
| Unit | `test/` (Vitest) | A module's logic and edge cases. |
| Scenarios | `scripts/check-*.mjs` | Modules together, in Node: redaction, isolation, hydration, linking, axios behind host interceptors… |
| Package | `scripts/check-package.mjs` | The tarball as npm ships it, in a fresh project. |
| Browser | `check-official`, `check-adversarial`, `check-host`, `check-e2e` | Against Chrome's own record, hard cases, a host render Blix must not hold back, and the panel driven by mouse and keyboard. |

`pnpm release:check` runs all of them.

## Adding a capture source

1. Write `src/capture/<name>Capture.ts`. Type the library structurally (see
   `queryCapture.ts`); never import it.
2. Return early when `!MONITOR_ENABLED`, and return a disposer.
3. Write entries with `networkMonitor.start / update / appendFrame`. Pick a
   `kind`, or reuse one; add its pool in `monitorConfig.ts` if it needs its
   own budget.
4. Put every line that touches app objects in `try`.
5. Export it from `src/capture/index.ts`.
6. Give it a section in the panel (`ui/helpers/entryLinks.ts` `sectionOf`,
   the sources rail), unit tests in `test/capture/`, and a scenario in the
   closest `scripts/check-*.mjs`.
7. Document it in `docs/en.md` and the CHANGELOG.
