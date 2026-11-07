# Contributing to Blix

Thanks for wanting to help. Bug reports, docs fixes and pull requests are all
welcome. How to use Blix is covered at [blixjs.dev/docs](https://blixjs.dev/docs). This page covers how to get the project running, what a pull request
needs, and where things live.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Bugs:** search the [issues](https://github.com/Hakam-aldeen-Kh/blix/issues)
  first, then open one with the bug report form.
- **Features and larger changes:** open an issue before writing the code, so we
  can agree on the shape of it. A PR that arrives without one may be a lot of
  work for something that does not fit.
- **Security problems:** do not open a public issue. Follow
  [SECURITY.md](SECURITY.md).
- **Never attach a captured log or HAR export** to an issue or PR. It holds
  decrypted request and response bodies, and often credentials. Cut it down to
  the few fields that show the problem, with the values replaced.

## Setup

You need Node.js 22.18 or later (CI runs 22) and pnpm: the build tool, tsup,
needs it. Apps that use Blix still need only Node.js 18. The pnpm version is
pinned in `package.json` under `packageManager`; `corepack enable` picks it up.

```bash
git clone https://github.com/Hakam-aldeen-Kh/blix.git
cd blix
pnpm install
```

## Running it

The playground bundles the panel straight from `src/` and serves a small mock
API beside it, so all four sources have something to show:

```bash
node playground/serve.mjs
```

Open <http://localhost:5179>. Rebuilds happen on save; reload the page.

`node playground/serve.mjs --react18` serves it against React 18 on port 5180.
It expects React 18 installed in `playground/.react18`:

```bash
npm install --prefix playground/.react18 react@18 react-dom@18
```

To try a change inside a real app, `pnpm build` and then `pnpm pack`, and
install the `.tgz` in that app.

## Checks

Everything CI runs, you can run locally. Before a release, one command runs
all of it:

```bash
pnpm release:check
```

It is these layers, fastest first:

| Layer | Command | What it covers |
| --- | --- | --- |
| Unit | `pnpm test` (`pnpm test:watch` while you work, `pnpm test:coverage` for a report) | One module at a time — its logic and its edge cases. In `test/`. |
| Scenarios | `pnpm check` | Modules together, in Node: the production guard, redaction, isolation from the host, snippets, the keyboard, hydration, axios behind host interceptors, storage, the panel's footprint, request linking. |
| Package | `pnpm check:package` | The tarball npm would publish, installed into a fresh project: contents, `import` and `require`, a consumer's types, the size budget. Reads `dist/`, so build first. |
| Browser | `pnpm check:browser` | In Chrome (or `--browser msedge`): every request compared with the browser's own record (`check:official`), hard cases built to break the linking (`check:adversarial`), a host render that Blix must not hold back (`check:host`), and the panel driven by mouse and keyboard (`check:e2e`). |

Each `scripts/check-*.mjs` starts with a comment saying what it guards and
why; run one on its own with `pnpm check:<name>`. `check:prod-guard` and
`check:package` read `dist/`, so build first. The browser checks use the
Chrome or Edge already installed — nothing is downloaded.

In CI, `check:official` also writes its report and a per-request dump of
the browser's and Blix's timings (`--report`, `--dump`); both are kept as the
run's `official-comparison` artifact, even when the step fails.

`check:host` counts the rows its page renders as well as timing them: one pass
is exactly 400, and anything more is a render Blix made React redo. To push it
the way a busy CI runner does, run `node scripts/check-host.mjs --runs 6
--throttle 4`; the count stays exact when the timings swing.

If your change touches logic, add a unit test beside the module's others in
`test/`. If it touches something a check covers (the production guard,
redaction, what is stored, the host page), extend that check. If it adds
behavior no check covers and it can break silently, add an assertion to the
closest one, or a new `scripts/check-<name>.mjs` with a `check:<name>` script
and a step in `.github/workflows/ci.yml`.

## Where things live

| Path | What |
| --- | --- |
| `src/capture/` | The capture layer: fetch, axios, Redux, TanStack Query and realtime. No React. Exported as `@hakam-aldeen-kh/blix/capture`. |
| `src/ui/` | The panel, loaded lazily behind the development check. |
| `src/index.ts` | The package entry point. |
| `scripts/` | The checks CI runs. |
| `playground/` | The local dev page and mock API. |
| `docs/en.md` | The full documentation. [blixjs.dev/docs](https://blixjs.dev/docs) is built from it, so an edit here shows up on the site. |

Two rules matter more than the rest:

- **The production guard is the product.** The literal
  `process.env.NODE_ENV === "development"` check has to survive our build so
  the consumer's bundler can remove the panel. Do not define, replace or
  wrap it.
- **The panel must never break the host app.** Blocked storage, bad saved
  state and render errors inside the panel are caught and contained.

## Pull requests

1. Branch from `main`.
2. Keep each PR to one change. Unrelated fixes go in their own PR.
3. Write commits in the [Conventional Commits](https://www.conventionalcommits.org/)
   style the history already uses: `feat(ui): …`, `fix(capture): …`,
   `docs: …`, `chore: …`.
4. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for
   anything a user would notice. Create that heading at the top if it is not
   there.
5. Update every Markdown file your change makes wrong or incomplete, in the
   same PR. This is required. `docs/en.md` when behavior, options or exports
   change (it is what [blixjs.dev/docs](https://blixjs.dev/docs) shows),
   `ARCHITECTURE.md` when a module's job or the data flow changes, this file
   and `AGENTS.md` when a command or check changes. The full table is in
   [AGENTS.md](AGENTS.md#documentation-is-part-of-the-change).
6. Write prose in American English (`behavior`, `color`).
7. Make sure `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check` pass.

Releases are cut by the maintainer: a version bump, the changelog section,
and a `v*` tag, which publishes to npm.

## Translations

Docs translations go in `docs/<language-code>.md`. See
[docs/README.md](docs/README.md) for the rules.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
