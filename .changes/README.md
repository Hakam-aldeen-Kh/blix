# Change files

Every PR that changes something a user notices adds one file here. At
release, `pnpm release:prepare <patch|minor|major>` turns them into the
version's section of [CHANGELOG.md](../CHANGELOG.md) and deletes them.

Name the file after the change, like `restore-no-rerender.md`. Its content:

```md
---
type: Fixed
---
**Restoring the saved log no longer restarts your app's render.** Then why,
in full sentences, the way the CHANGELOG has always been written.
```

`type` is one of `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` or
`Security`: the group the line goes under. The text becomes one list item, so
it may run to several paragraphs.

A PR that changes `src/` without adding a file here fails the
`Change file` check, unless it is labeled `no changelog`: a refactor, a
comment, anything users won't notice. Docs, tests, scripts and CI need no
change file.

Why files and not a line under `## [Unreleased]`: every PR edited the same
lines of `CHANGELOG.md`, so open PRs conflicted with each other, and
blixjs.dev listed the pending section as a release. See
`scripts/changes.mjs`.
