# AGENTS.md

Instructions for AI coding agents working in this repository. People should
start with [CONTRIBUTING.md](CONTRIBUTING.md); this file is the same contract,
written for an agent that has to get it right without asking.

## What this is

Blix is an in-app dev-tools panel for React: it captures HTTP (`fetch`, XHR,
axios), Redux actions, TanStack Query cache events and realtime frames, and
shows them in a panel inside the page. It is a **development-only** library,
published to npm as `@hakam-aldeen-kh/blix` (ESM, no runtime dependencies).

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything under
`src/`. It explains the two layers, the store between them, and why each link
Blix draws between entries is exact.

## Commands

```bash
pnpm install              # pnpm only — the version is pinned in package.json
pnpm typecheck            # tsc --noEmit
pnpm test                 # Vitest unit tests (test/)
pnpm build                # tsup → dist/
pnpm check                # every scenario check in scripts/ (needs no build, except check:prod-guard)
pnpm check:package        # the packed tarball in a fresh project (build first)
pnpm check:browser        # official comparison, hard cases, host render, panel E2E — in the installed Chrome
pnpm release:check        # all of the above, in order
pnpm check:changes        # every .changes/ file parses (part of pnpm check)
pnpm release:prepare patch --dry-run  # the next CHANGELOG section from .changes/ (maintainer)
node playground/serve.mjs # the dev page at http://localhost:5179
```

Run a single check with `pnpm check:<name>`, a single test file with
`pnpm vitest run test/capture/stateDiff.test.ts`.

## Rules you must not break

1. **Do not touch the production guard.** `process.env.NODE_ENV ===
   "development"` must reach `dist/` as written. Never define, replace or wrap
   it in `tsup.config.ts` or anywhere else. `check:prod-guard` and CI fail if
   you do.
2. **Never break the host app.** Every line in `src/capture/` that touches an
   app object (a config, a response, an error, a store) is inside
   `try { … } catch { /* capture must never break a request */ }`. A capture
   failure means "not recorded", never a failed request or a thrown error.
3. **Never consume or mutate what the app passed.** Read bodies from
   `clone()`; do not reassign fields on the caller's objects; do not swallow,
   wrap or replace errors on their way to the app.
4. **Exact or empty.** Never link two entries by status, timing or "closest
   match". If a link cannot be proven from object identity or a call made
   synchronously inside the owner, leave it empty. See the linking table in
   ARCHITECTURE.md.
5. **Mask credentials.** `authorization`, `cookie`, `set-cookie` and
   `x-api-key` are masked at capture, in storage and in every export and copy
   path. Never add a path that writes the raw value.
6. **No new runtime dependencies**, and never import axios, Redux or TanStack
   Query from `src/capture/` — type them structurally, as the existing modules
   do.
7. **No HTML injection.** Never use `dangerouslySetInnerHTML`, `innerHTML` or
   `eval`. Captured bodies are untrusted and are rendered as text.

## How code is written here

- **Comments explain why**, in full sentences, at the top of a module and
  above anything non-obvious — usually the bug or case that made the code
  necessary. Match that: a new branch that handles an edge case gets a comment
  naming the case. Do not narrate what the code plainly does.
- Small, named helpers over clever one-liners. Structural types over imports.
- American spelling in prose: `behavior`, `color`, `canceled`, `initialize`.
  Older text may still use British spelling; when you edit a sentence, write
  it in American English, but do not respell whole files you are not
  otherwise changing.
- Keep diffs focused. Do not reformat files you did not need to touch.

## What every change needs

| You changed | Also do |
| --- | --- |
| Logic anywhere | A unit test in `test/` beside the module's others — one that fails without your change. |
| Capture or linking | Extend the closest `scripts/check-*.mjs`; run `pnpm check:linking` and `pnpm check:adversarial`. |
| The panel | Run `pnpm check:e2e`; extend it if you added a control. Find elements by role and accessible name. |
| An export, copy or snippet | Assert the output still masks credentials (`check:redaction`, `check:snippets`, `test/ui/exports.test.ts`). |
| Anything a user notices | A change file in `.changes/` (see its README; never edit `CHANGELOG.md` directly), and `docs/en.md` (it is what blixjs.dev/docs shows). |
| Public API or exports | `docs/en.md`, the types, and `pnpm check:package`. |

## Documentation is part of the change

This is required, not optional. A change is not done until every Markdown file
it makes wrong or incomplete is updated, in the same PR. Before you finish,
search the `.md` files for what you changed (the module, function, prop,
option, command or behavior) and fix every place that no longer holds.

| You changed | Update |
| --- | --- |
| Anything a user notices | A change file in `.changes/`, and `docs/en.md`. |
| Public API, props, options or exports | `docs/en.md`, and `README.md` where it shows them. |
| A module's job, the data flow, how a link is made, or a rule | `ARCHITECTURE.md`. |
| A command, script, check or CI step | `AGENTS.md` (Commands), `CONTRIBUTING.md` (Checks), `ARCHITECTURE.md` (Testing). |
| How people or agents are expected to work | `AGENTS.md` and `CONTRIBUTING.md`, together, so they never disagree. |
| Masking, storage, or what reaches disk | The Security section of `docs/en.md`, and `SECURITY.md` if reporting changes. |

A PR that changes code and leaves a document describing the old behavior is
incomplete. Say in the PR which documents you updated, or why none needed it.

Before you say you are done: `pnpm typecheck && pnpm test && pnpm check`, and
the browser checks if you touched capture or the panel. Report what you ran
and what it printed. Do not claim a check passed that you did not run.

## Commits and pull requests

- Conventional Commits, as the history uses: `fix(capture): …`,
  `feat(ui): …`, `test: …`, `docs: …`, `ci: …`. One logical change per commit;
  the body says why.
- Branch from `main`. One change per PR. Fill in the PR template's checklist
  truthfully.
- Do not add tool attribution lines to commits or PR descriptions.

## Never

- Never post a security problem in a public issue, PR or commit message.
  Follow [SECURITY.md](SECURITY.md).
- Never commit a captured log, HAR file or real credential — not in tests,
  fixtures or descriptions. Use made-up values.
- Never weaken a check to make it pass. A check that fails is reporting
  something; find out what.

## Practical notes

- The browser checks drive the Chrome or Edge already installed through
  `playwright-core`; nothing is downloaded. `--browser msedge` picks Edge.
- `check:official` uses ports 5191–5192 and `check:adversarial` 5193; the E2E
  picks a free port. A server left over from a killed run can hold a fixed
  port.
- `check:official --dump file.json --report file.md` writes every request's
  browser record beside Blix's; CI keeps both as the `official-comparison`
  artifact, even when the step fails. Read it before touching a comparison.
- `check:host --runs 6 --throttle 4` repeats the check and slows the CPU four
  times over, the way a busy CI runner does. Its row count is exact (400 per
  pass); trust it over the timings.
- Building needs Node.js 22.18 or later (tsup 9); apps using Blix need 18.
- On Windows, Git may warn about LF/CRLF conversion; that is expected.
- `playground/` is the quickest way to see a change: it bundles straight from
  `src/` and rebuilds on save.

## Where to look

| For | Start at |
| --- | --- |
| What an entry holds | `src/capture/monitorTypes.ts` |
| The store | `src/capture/networkMonitor.ts` |
| axios capture and its interceptor tricks | `src/capture/attachHttp.ts` (long; read its header comments first) |
| fetch capture | `src/capture/attachFetch.ts` |
| Query/mutation rows and failure linking | `src/capture/queryCapture.ts`, `errorOrigin.ts`, `monitorContext.ts` |
| The panel shell | `src/ui/DevToolsPanel.tsx` |
| Filter language | `src/ui/services/filterQuery.ts` |
