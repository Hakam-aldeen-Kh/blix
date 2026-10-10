# @hakam-aldeen-kh/blix
[![npm](https://img.shields.io/npm/v/@hakam-aldeen-kh/blix)](https://www.npmjs.com/package/@hakam-aldeen-kh/blix)

An in-app dev-tools panel for React apps. It captures HTTP requests, Redux
actions, TanStack Query cache events and realtime traffic, shows them in a
dockable panel, and is eliminated from production builds.

**[Full documentation → https://DOCS_SITE_URL/docs](https://DOCS_SITE_URL/docs)**

## Install

```bash
pnpm add -D @hakam-aldeen-kh/blix
```

## Example

```tsx
// app/BlixMount.tsx
"use client";

import { Blix } from "@hakam-aldeen-kh/blix";
import { attachFetchMonitor } from "@hakam-aldeen-kh/blix/capture";

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  attachFetchMonitor();
}

export default function BlixMount() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Blix dbName="my-app" />;
}
```

Render `<BlixMount />` once, in your root layout. The documentation covers
axios, Redux, TanStack Query and realtime capture.

## Changelog

Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
