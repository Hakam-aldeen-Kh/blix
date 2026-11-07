# Roadmap

Where Blix is going, and the work anyone can pick up to get it there.

## Principles every item is held to

- **Exact or empty.** Blix never shows a guess as a fact. A feature that would
  need one is redesigned until it does not.
- **Gone from production.** Nothing may weaken the development check that
  removes Blix from production builds.
- **Never in the host's way.** No failure inside Blix may break the app it is
  mounted in.
- **Proven, not claimed.** Every change ships with the test that would have
  caught its absence. See the test layers in
  [CONTRIBUTING.md](CONTRIBUTING.md#checks).

## Now

| | |
| --- | --- |
| **0.14.0** · released 2026-11-07 | Exact linking across sources, verified against Chrome's own record; the full test suite (unit, package, browser, release check); the fixes it found. |
| **Next release** | Restoring the saved log no longer makes React redo the host's render, checked by an exact render count; `require()` documented; American spelling in the panel. |
| **A security pass** | Handled privately, per [SECURITY.md](SECURITY.md). Found something? Report it there, not in an issue. |

## Next — open for contributors

Sizes: **S** an afternoon, **M** a few days, **L** a design discussion first.

### Correctness and coverage

| Task | Size | Labels |
| --- | --- | --- |
| 01 · Replay repeats an instance's default `params` | S | `bug` `good first issue` |
| 02 · Run the panel E2E on React 18 | S | `tests` `good first issue` |
| 03 · Unit tests for persistence | M | `tests` `good first issue` |
| 05 · Compare realtime frames with the browser's record | M | `tests` `help wanted` |
| 06 · HTTP/2 in the official comparison | M | `tests` `help wanted` |

### Quality of the panel

| Task | Size | Labels |
| --- | --- | --- |
| 07 · Accessibility audit in the E2E | M | `a11y` `help wanted` |
| 08 · A performance budget for the panel | M | `performance` `help wanted` |
| 12 · Visual regression for the themes | M | `tests` `help wanted` |

### Reach

| Task | Size | Labels |
| --- | --- | --- |
| 04 · Arabic documentation | M | `docs` `good first issue` |
| 09 · Example apps: Next.js and Vite | M | `examples` `help wanted` |
| 10 · Firefox and WebKit | L | `tests` `help wanted` |
| 11 · Replay for `fetch` requests | L | `enhancement` `needs design` |

## Later — toward 1.0

1.0 means the API is stable and every promise in the docs is backed by a check:

- The public API reviewed and frozen; deprecations go through a minor first.
- Every capture source compared against an independent record (HTTP and
  realtime against the browser, Query and Redux against the library).
- Chromium, Firefox and WebKit in CI.
- Performance budgets for capture overhead and panel rendering, enforced.
- Documentation in more than one language.

## Picking up a task

1. Open an issue for the task, or comment on its issue if there is one, so
   two people do not take it.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md).
3. For an **L** task, post your approach on the issue before the code.
4. Open a PR with the tests and doc updates
   [CONTRIBUTING.md](CONTRIBUTING.md) asks for. One task per PR.

AI agents: follow [AGENTS.md](AGENTS.md).
