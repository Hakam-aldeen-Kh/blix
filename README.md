# Blix

An in-app dev-tools panel for React developers: every HTTP request, Redux action, TanStack Query cache event and realtime frame your app produces, in one place, while you build.

[![npm](https://img.shields.io/npm/v/@hakam-aldeen-kh/blix)](https://www.npmjs.com/package/@hakam-aldeen-kh/blix) [![CI](https://github.com/Hakam-aldeen-Kh/blix/actions/workflows/ci.yml/badge.svg)](https://github.com/Hakam-aldeen-Kh/blix/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@hakam-aldeen-kh/blix)](https://github.com/Hakam-aldeen-Kh/blix/blob/main/LICENSE)

## Why Blix

- **Four sources, one panel.** HTTP through `fetch` and axios, Redux actions with their state diffs, TanStack Query cache events, and realtime frames. The panel floats or docks to any edge of the page.
- **Linked across sources.** When a query caused a request, or one entry is a replay of another, the row links to the other side. One click instead of matching timestamps by hand.
- **Plaintext on both legs.** Attached after your own axios interceptors, Blix records the request body before you encrypt it and the response after you decrypt it.
- **Replay and export.** Re-send an axios request or re-dispatch a Redux action. Copy any request as cURL or `fetch`, or export the log as HAR, JSON, NDJSON, Markdown, CSV or a cURL script. `Authorization`, `Cookie`, `Set-Cookie` and `X-API-Key` values are masked in every one of them.
- **Gone from production builds.** The panel sits behind a literal `process.env.NODE_ENV === "development"` check, so it never loads in production. Capture calls become no-ops, and a one-line guard at the call site removes them from the bundle too. In Next.js, also set `NEXT_PUBLIC_BLIX=false` in your production env, or the panel's unused chunk is still emitted.

## Quick start

```bash
npm install -D @hakam-aldeen-kh/blix
```

Requires React 18 or 19. The package is ESM only.

```tsx
// app/BlixMount.tsx
"use client";

import { Blix } from "@hakam-aldeen-kh/blix";
import { attachFetchMonitor } from "@hakam-aldeen-kh/blix/capture";

// Module scope, not an effect: requests made before React mounts are captured too.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  attachFetchMonitor();
}

export default function BlixMount() {
  return <Blix dbName="my-app" />;
}
```

Render `<BlixMount />` once, in your root layout. Run the dev server and the panel's launcher appears on the page; Ctrl/⌘ + backtick toggles the panel.

Using axios? Call `attachHttpMonitor(apiClient)` in the module that creates the instance, after your own interceptors are registered. Redux, TanStack Query and realtime each take one call as well.

## Documentation

**[Full documentation → DOCS_SITE_URL/docs](DOCS_SITE_URL/docs)**

- [Install](DOCS_SITE_URL/docs/install): peer dependencies and build setup
- [Capture](DOCS_SITE_URL/docs/capture): where each capture call goes, and why the order matters
- [Mounting the panel](DOCS_SITE_URL/docs/mounting-the-panel): props, shortcuts, filtering, export, themes
- [Production elimination](DOCS_SITE_URL/docs/production-elimination): how it is removed, and how to keep it on a staging build
- [Upgrading](DOCS_SITE_URL/docs/upgrading): what changed for projects coming from 0.10

---

[Changelog](https://github.com/Hakam-aldeen-Kh/blix/blob/main/CHANGELOG.md) · [Security](https://github.com/Hakam-aldeen-Kh/blix/blob/main/SECURITY.md) · [MIT License](https://github.com/Hakam-aldeen-Kh/blix/blob/main/LICENSE) · Made by [Hakam aldeen Alkhadraa](https://www.hakam-aldeen.com)
