# Contributing to Blix

Thanks for wanting to help. Bug reports, docs fixes and pull requests are all
welcome. This page covers how to get the project running, what a pull request
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

You need Node.js 18 or later (CI runs 22) and pnpm. The pnpm version is pinned
in `package.json` under `packageManager`; `corepack enable` picks it up.

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

Everything CI runs, you can run locally:

```bash
pnpm typecheck
pnpm build
pnpm check
```

`pnpm check` runs every `scripts/check-*.mjs`. Each one starts with a comment
saying what it guards and why; run one on its own with `pnpm check:<name>`.
`check:prod-guard` reads `dist/`, so build first.

If your change touches something a check covers (the production guard,
redaction, what is stored, the host page), extend that check. If it adds
behaviour no check covers and it can break silently, add an assertion to the
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
| `docs/en.md` | The full documentation, and the source of truth for it. |

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
5. Update `docs/en.md` when behaviour, options or exports change.
6. Make sure `pnpm typecheck`, `pnpm build` and `pnpm check` pass.

Releases are cut by the maintainer: a version bump, the changelog section,
and a `v*` tag, which publishes to npm.

## Translations

Docs translations go in `docs/<language-code>.md`. See
[docs/README.md](docs/README.md) for the rules.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
