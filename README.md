# @hakam-aldeen-kh/blix

An in-app dev-tools panel for React apps. Captures HTTP requests, Redux
actions, TanStack Query cache events and realtime traffic, and renders them in
a dockable panel with a waterfall, diffing, replay and HAR/cURL export.

The entire panel is eliminated from production builds — see
[Production elimination](#production-elimination).

---

## Install

The package is published to **GitHub Packages**, not the public npm registry,
so consumers need a registry mapping for the `@hakam-aldeen-kh` scope.

Add to your project's `.npmrc`:

```ini
@hakam-aldeen-kh:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` must be a personal access token with the `read:packages` scope.
Keep it in your environment, not in the committed `.npmrc`:

```bash
export GITHUB_TOKEN=ghp_yourtokenhere
```

Then:

```bash
pnpm add -D @hakam-aldeen-kh/blix
```

### Peer dependencies

`react` and `react-dom` (v19) are required. `axios`, `@reduxjs/toolkit` and
`@tanstack/react-query` are **optional** peers — you only need the ones whose
capture you actually use. The capture layer is structurally typed against each
of them and never imports any of them at runtime, so installing Blix does not
pull a data-fetching or state library into your tree.

---

## The module-init call-order contract

**This is the part that is easy to get wrong.** Capture functions must be
called where the thing they wrap is *constructed*, at module scope — not from
inside a component body or a `useEffect`.

If you call them from a component, capture only starts once React mounts, and
every request fired before that point — auth bootstrap, session restore,
prefetches, anything at module-eval time — is silently missed. The panel then
shows a log with a hole at the beginning, which is exactly when you most need
it.

| Function | Where to call it | Timing |
| --- | --- | --- |
| `attachHttpMonitor` | bottom of the module that creates your axios instance | module scope |
| `createReduxMonitorMiddleware` | in `configureStore`'s `middleware` callback | module scope |
| `tapRealtimeAdapter` | where the adapter singleton is constructed | module scope |
| `tapQueryClient` | a `useEffect` in your query provider | see below |

### HTTP — `attachHttpMonitor(instance, options?)`

Call it at the **bottom** of your axios module, after your own interceptors are
registered. Axios runs request interceptors in LIFO order, so registering last
makes Blix's interceptor run first on the way out — before any encryption or
serialization step — which is what lets it capture the plaintext body.

```ts
// src/network/axios.ts
import axios from "axios";
import { attachHttpMonitor, withInitiatorCapture } from "@hakam-aldeen-kh/blix/capture";

export const apiClient = axios.create({ baseURL: "/api" });

apiClient.interceptors.request.use(addAuthHeader);
apiClient.interceptors.request.use(encryptBody);

// Last, at module scope — NOT in a hook, NOT in a component.
attachHttpMonitor(apiClient);
```

`withInitiatorCapture(instance)` is optional and wraps the instance so each
request records the stack of its own call site, which the panel shows as the
"Initiator" of a row. Wrap once, export the wrapped instance:

```ts
export const apiClient = withInitiatorCapture(axios.create({ baseURL: "/api" }));
```

### Redux — `createReduxMonitorMiddleware(options?)`

```ts
// src/store.ts
import { configureStore } from "@reduxjs/toolkit";
import { createReduxMonitorMiddleware } from "@hakam-aldeen-kh/blix/capture";

export const store = configureStore({
  reducer,
  middleware: (getDefault) =>
    getDefault().concat(
      createReduxMonitorMiddleware({
        ignore: ["analytics/*", "some/noisyAction"],
      }),
    ),
});
```

Options: `ignore` (exact types or `"prefix/*"` globs), `coalesceMs` (repeat
dispatches of one type inside this window fold into a single row), and
`maxActionsPerSecond` (above this rate, capture drops to type + timing and
skips diffing). Outside development the factory returns a pure pass-through
middleware, so the `.concat()` costs nothing in production.

### Realtime — `tapRealtimeAdapter(adapter, transport)`

Returns the adapter wrapped; use the return value. `transport` is a free-form
label shown in the panel (`"pusher"`, `"socket.io"`, …).

```ts
// src/realtime/adapter.ts
import { tapRealtimeAdapter } from "@hakam-aldeen-kh/blix/capture";

export const realtime = tapRealtimeAdapter(new PusherAdapter(), "pusher");
```

Your adapter only needs to structurally satisfy `RealtimeAdapterLike`:
`connect`, `disconnect`, `subscribe`, `onMessage`, `onPresenceUpdate`. In
production the adapter is returned untouched.

### TanStack Query — `tapQueryClient(client)`

**`tapQueryClient` is the one exception to the module-scope rule.** Call it
from an effect in your query provider, *not* from the `useState` initializer
that creates the client:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { tapQueryClient } from "@hakam-aldeen-kh/blix/capture";
import { useEffect, useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());

  useEffect(() => tapQueryClient(client), [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Why the exception: React Strict Mode double-invokes `useState` initializers, so
tapping there taps a client that is immediately discarded. Installing from an
effect is correct and safe — the tap is idempotent, and because parent effects
run after child effects, it backfills from `getQueryCache().getAll()` on
install rather than starting blind. No early events are lost.

If you construct the `QueryClient` at module scope rather than in a component,
you can tap it at module scope too — the rule is "tap the client that actually
survives", which in the common React pattern means an effect.

---

## Mounting the panel

Render `<Blix />` **exactly once**, in your root layout. Mounting it more than
once gives you duplicate panels reading the same log.

```tsx
// app/layout.tsx  —  no "use client" needed here
import { Blix } from "@hakam-aldeen-kh/blix";
import { store } from "@/src/store";
import { apiClient } from "@/src/network/axios";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Blix store={store} apiClient={apiClient} />
      </body>
    </html>
  );
}
```

**The host layout does not need `"use client"`.** `Blix` carries its own
`"use client"` directive, so a server component can render it directly. Adding
`"use client"` to your root layout to accommodate it would pull your whole tree
into the client bundle for no reason.

### Props — all optional

| Prop | Effect when omitted |
| --- | --- |
| `store` | The **State** tab shows "Redux store not provided" and **Re-dispatch** is disabled with that reason. Everything else works. |
| `apiClient` | **Replay request** is disabled with "HTTP client not provided". Everything else works. |
| `dbName` | Defaults to `"nm-devtools"`. |

`store` and `apiClient` are structurally typed (`StoreLike` / `HttpClientLike`)
— they need `getState`/`subscribe`/`dispatch` and `request` respectively. A
redux-toolkit store and an axios instance satisfy them as-is.

Passing neither still gives you a fully working capture log; you only lose the
two features that need a live handle on the app.

### `dbName` — when you need it

The panel persists its log to IndexedDB so it survives a reload. IndexedDB is
scoped **per origin**, not per app — so two apps served from the same origin
(different ports in dev are different origins, but path-based routing,
multi-zone Next.js setups and anything behind one reverse proxy are not) both
open `nm-devtools` and interleave their logs into one database.

Give each app its own name to keep them separate:

```tsx
<Blix store={store} apiClient={apiClient} dbName="checkout-devtools" />
```

You can also set it from the capture side, which is useful when capture starts
before the panel mounts:

```ts
attachHttpMonitor(apiClient, { dbName: "checkout-devtools" });
```

Either call must happen before the database is first opened, which the panel
does on mount. If both are set, the `<Blix />` prop wins, since render runs
after module init.

---

## Production elimination

The panel is gated on a **literal** `process.env.NODE_ENV === "development"`
check that survives verbatim into the published `dist/`. Your bundler
substitutes it at *your* build time, folds the condition to `false`, and drops
the dynamic `import()` of the panel along with the whole branch — so no panel
code reaches your production bundle, and no chunk is emitted for it.

This is why the check is written inline rather than imported as a boolean
constant: cross-module constant propagation is not guaranteed by every
bundler, but a literal `process.env.NODE_ENV` comparison in the same file is
handled by all of them.

The capture layer is gated on the same condition, so `attachHttpMonitor` and
friends become no-ops in production even though their call sites remain.

---

## Entry points

| Import | Contents |
| --- | --- |
| `@hakam-aldeen-kh/blix` | `Blix` + everything below |
| `@hakam-aldeen-kh/blix/capture` | capture functions and types only — no React |

Import capture functions from `/capture` in modules that run during SSR or at
module-eval time; it pulls in no React code.

---

## License

Proprietary — all rights reserved. See [LICENSE](./LICENSE).
