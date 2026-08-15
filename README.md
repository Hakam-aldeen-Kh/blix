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

**Commit this file.** It is registry configuration, not a secret — the
`${GITHUB_TOKEN}` reference is expanded by npm/pnpm from the environment at
install time, so the token itself never enters the file or your git history.
An `.npmrc` in `.gitignore` breaks every environment that is not your laptop.

The variable name is yours to choose; it just has to match what you export.
If your CI already sets `NPM_TOKEN`, write `${NPM_TOKEN}` here instead. A
mismatch surfaces as a `401` at install time with no hint about the cause.

```bash
export GITHUB_TOKEN=ghp_yourtokenhere
```

The token must be a personal access token with the `read:packages` scope.

Then:

```bash
pnpm add -D @hakam-aldeen-kh/blix
```

### CI and containers

Every environment that runs an install needs the token, not just your machine.
Blix is a `devDependency`, so any install stage that does **not** set
`NODE_ENV=production` will try to fetch it. With a lockfile the resolution is
pinned to a `https://npm.pkg.github.com/download/…` tarball, so a missing token
is a hard failure — there is no fallback to the public registry.

In a multi-stage Dockerfile the trap is that the dependency stage usually
copies only the manifest files, and `.npmrc` is not one of them:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
# .npmrc must be copied HERE, not only in the later `COPY . .` of the build stage
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=secret,id=github_token \
    GITHUB_TOKEN="$(cat /run/secrets/github_token)" \
    pnpm install --frozen-lockfile
```

Build with `docker build --secret id=github_token,env=GITHUB_TOKEN .`. Using a
build secret rather than `ARG` keeps the token out of the image layers.

If you add `.npmrc` to `.dockerignore`, you must arrange for it to reach the
install stage some other way. If you would rather not give CI a token at all,
run that stage with `NODE_ENV=production` (or `pnpm install --prod`) so
devDependencies are skipped — but note the lockfile still records the
resolution, so any stage that does install dev deps will need the token.

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

> **Import capture from `@hakam-aldeen-kh/blix/capture`, not from the package
> root.** The root entry carries a `"use client"` directive so that `<Blix />`
> can be rendered from a server component, which means every module that
> imports from it lands inside a client boundary. Your axios module, your store
> and your realtime adapter generally also evaluate on the server — in the
> Next.js App Router they always do — where the root entry is at best dead
> weight and at worst a boundary violation. Keep the root import in the single
> client component that mounts the panel. See [Entry points](#entry-points).

| Function | Where to call it | Timing |
| --- | --- | --- |
| `attachHttpMonitor` | after your own interceptors are registered on the instance | module scope |
| `createReduxMonitorMiddleware` | in `configureStore`'s `middleware` callback | module scope |
| `tapRealtimeAdapter` | where the adapter singleton is constructed | module scope |
| `tapQueryClient` | a `useEffect` in your query provider | see below |
| `captureEncrypted` | inside your own encrypt/decrypt functions, on success paths only | per request — optional, see below |

Every one of these is a no-op in production, but the call sites still cost you
bytes unless you guard them. See
[Guard your call sites](#guard-your-call-sites) — it is one line per site and
it is the difference between shipping the capture runtime and not.

### HTTP — `attachHttpMonitor(instance, options?)`

Call it **after your own interceptors are registered**. That one placement is
what puts Blix on the plaintext side of *both* legs of the request, for two
different reasons:

- **On the way out**, axios runs request interceptors LIFO, so registering last
  makes Blix's interceptor run **first** — before any encryption or
  serialization step. It sees the plaintext body.
- **On the way back**, axios runs response interceptors FIFO, so registering
  last makes Blix's interceptor run **last** — after your decrypt interceptor.
  It sees the decrypted body.

The two orders are opposite, and they happen to agree on the same answer:
register last.

> **Registering earlier is a silent wrong reading, not an error.** If
> `attachHttpMonitor` runs before your decrypt interceptor, Blix's response
> interceptor runs before it too, and the **Response** tab fills with
> ciphertext presented as an ordinary response body. Nothing throws and nothing
> warns — the panel just shows you base64 where it should show you an object.
> On the request side the mirror-image mistake gives you a **Payload** tab full
> of ciphertext.

> **axios 1.19+ can invert the request-side half.** The request-interceptor
> LIFO order is now governed by the transitional flag
> `legacyInterceptorReqResOrdering`, which still defaults to `true`. If you set
> `transitional: { legacyInterceptorReqResOrdering: false }`, request
> interceptors become FIFO and the request-side rule flips to "register
> `attachHttpMonitor` **first**" — while the response-side rule still says
> last, so the two orders no longer agree and you must pick which leg matters
> more. Response-interceptor order is unaffected by the flag. Blix does not
> read this flag and cannot detect the situation.

```ts
// src/network/axios.ts
import axios from "axios";
import { attachHttpMonitor, withInitiatorCapture } from "@hakam-aldeen-kh/blix/capture";

export const apiClient = axios.create({ baseURL: "/api" });

apiClient.interceptors.request.use(addAuthHeader);
apiClient.interceptors.request.use(encryptBody);

// After your interceptors, at module scope — NOT in a hook, NOT in a component.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  attachHttpMonitor(apiClient);
}
```

#### Factory and lazy-singleton clients

The rule is **causal, not positional**. "Bottom of the module" is shorthand
that only holds when your interceptors are registered by statements physically
above the call. If your instance comes from a factory or a lazy singleton, the
interceptors are registered inside that factory, on first call — so what
matters is that *something has already triggered construction*:

```ts
// ApiClientFactory.getInstance() registers the interceptors on its first call.
export const apiClient = withInitiatorCapture(ApiClientFactory.getInstance());

// Safe: getInstance() ran on the line above, so the interceptors exist by now.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  attachHttpMonitor(apiClient);
}
```

If nothing above the call has constructed the instance, `attachHttpMonitor`
registers **first** rather than last, and you get the silent wrong reading
described above. There is no need for `queueMicrotask`, `setTimeout` or any
other deferral: Blix does not require one, and deferring only hides whether the
ordering is actually correct.

#### Failed requests and the shape of your rejection

Blix correlates a response — success **or** error — back to its entry through
`error.config`. If your response interceptor normalises errors into your own
domain type, a very common pattern, the value Blix receives is a plain object
with no `config` on it:

```ts
// ❌ Blix can no longer see the entry: no `.config` on the rejected value
instance.interceptors.response.use(undefined, (error) =>
  Promise.reject(error.response?.data ?? fallbackError),
);
```

The consequence is silent and total: **every non-2xx request stays `pending`
in the panel for the rest of the session.** No error, no warning, no Failed
filter. (The 30-second pending cap only bounds the width of the waterfall bar;
it does not resolve the entry.)

Two ways out, and you currently have to choose one:

1. **Keep the config on your normalised error** — attach `config` (or the
   original `AxiosError`) to the object you reject with. This preserves
   plaintext request capture and is the recommended fix.
2. **Register Blix before your normalising handler**, so it runs first on the
   response path:

   ```ts
   attachHttpMonitor(apiClient);      // first on the response path
   apiClient.interceptors.request.use(addAuth);
   apiClient.interceptors.response.use(undefined, normaliseError);
   ```

   This costs you plaintext request capture, because Blix's request interceptor
   now runs last — after encryption.

From a single `attachHttpMonitor` call you cannot currently have both plaintext
request bodies and correlated errors while also discarding the `AxiosError`.

#### Encrypted payloads — `captureEncrypted(config, payload)`

*Since 0.3.0.*

**Entirely optional.** An app that never calls it behaves exactly as it did
before this API existed, and its panel shows no Encrypted tab at all — the tab
appears only on entries that actually carry ciphertext.

Blix cannot capture the encrypted forms by itself. It has no knowledge of your
encryption scheme, and — by the design above — its interceptor deliberately
sits on the *plaintext* side, so at the moment Blix captures, the ciphertext
does not exist yet. `captureEncrypted` is the hand-off: you call it from inside
your own interceptors, where the ciphertext does exist, and pass back the same
config object Blix already saw.

Two calls, one on the way out and one on the way back:

```ts
// src/network/axios.ts
import { attachHttpMonitor, captureEncrypted } from "@hakam-aldeen-kh/blix/capture";

apiClient.interceptors.request.use((config) => {
  const encrypted = encryptBody(config.data);
  captureEncrypted(config, { request: encrypted });
  return { ...config, data: encrypted };
});

apiClient.interceptors.response.use((response) => {
  captureEncrypted(response.config, { response: response.data });
  return { ...response, data: decryptBody(response.data) };
});
```

Both calls work on the *copies* those interceptors return, not on the objects
axios created — see [How correlation works](#how-correlation-works) for why
that still resolves. On the response side it is `response.config` that has to
carry the stamp, and it does: axios threads the object returned by the last
request interceptor straight through to `response.config`, so the
`{ ...config, data: encrypted }` above is literally the object you get back.

##### Dropping it into an interceptor you already have

The example above builds a fresh interceptor that returns a spread copy. Most
real pipelines have one large multi-step interceptor that mutates `config.data`
in place. `captureEncrypted` needs no restructuring for that — it is two lines:

```ts
private static async encryptRequest(config) {
  const encrypted = await encryptionService.encryptApiPayload(
    JSON.stringify(config.data),
    key,
  );
  captureEncrypted(config, { request: encrypted });   // ← add
  config.data = encrypted;
  return config;
}

private static async decryptResponse(response) {
  captureEncrypted(response.config, { response: response.data });  // ← add, BEFORE decrypting
  return { ...response, data: await encryptionService.decryptApiResponse(response) };
}
```

Note the placement on the response side: call it **before** you decrypt, so the
value you hand over is the wire form. Calling it after decryption puts your
plaintext response — secrets included — under a tab labelled Encrypted, which
is both wrong and a disclosure. See the redaction note below.

##### Call it only where encryption actually happened

The examples above call `captureEncrypted` unconditionally, which is only
correct because they have no path that skips encryption. Real pipelines do: an
endpoint on an exclusion list, an explicit `skipEncryption` flag, a missing or
not-yet-derived session key, a `FormData` body carrying only file parts, an
encryption failure the interceptor swallows so the request can still go out.

On any of those paths the value you would hand over is **plaintext**, and Blix
has no way to know that — it labels whatever you pass as the encrypted wire
form and shows it under the Encrypted tab. The result is a reading that looks
authoritative and is wrong, which is worse than no reading at all.

So put the call on the **success path, inside the function that encrypts** —
next to the line that produced the ciphertext, where it cannot outlive the
condition that made it true — rather than in the interceptor after the
function returns:

```ts
// Inside your encryption module, not in the interceptor.
function encryptBody(config) {
  if (shouldSkip(config)) return config;          // no call — nothing encrypted
  const key = sessionKey();
  if (!key) return config;                        // no call — nothing encrypted

  try {
    const encrypted = seal(config.data, key);
    captureEncrypted(config, { request: encrypted }); // only here
    config.data = encrypted;
  } catch {
    // Encryption failed and we're sending plaintext — deliberately no call.
  }
  return config;
}
```

The same rule governs the response side: call it only where you know the body
you are holding is the pre-decryption wire form.

##### How correlation works

Requests and responses are correlated by the **identity of the config object**,
never by URL or timing, so two concurrent calls to the same endpoint stay
correctly apart. Pass the object axios handed you; a `{ ...config }` copy made
by your own interceptor resolves too.

The copy resolves because there are two stamps, not one:

| Stamp | Visibility | Survives `{ ...config }` |
| --- | --- | --- |
| a registry-global `Symbol`, non-enumerable | invisible to `Object.keys`, `JSON.stringify`, `Object.entries` | **no** — spread copies only enumerable own properties |
| `__monitorId`, a plain enumerable string property | shows up in `Object.keys` and a `JSON.stringify` of the *config* | **yes** |

The symbol is the primary; `__monitorId` is what the resolver falls back to,
and it is the same property `attachHttpMonitor` has set since 0.2.1 for its own
response interceptor. A third fallback, a `WeakMap`, covers only a frozen or
sealed config that rejects `defineProperty`.

Two consequences worth being explicit about. **Neither stamp reaches the
wire** — they live on the axios config, and axios serializes only `data`. But
`__monitorId` *is* enumerable, so it will appear if you log or stringify the
config object itself; only the symbol is fully invisible. And a copy that
enumerates fields **explicitly** — `{ url, method, data: encrypted }` rather
than a spread — carries neither stamp and will not resolve, making the call a
silent no-op. Spread, or mutate in place.

The two calls are independent and order-free: the request-side ciphertext is
produced early and the response-side arrives late, possibly after Blix has
already finalized the entry. Either way it merges into the existing entry —
never creating one of its own — and the panel updates.

It is a **silent no-op** — never a throw, never a console warning — in every
one of these:

- outside development (`process.env.NODE_ENV !== "development"`);
- **outside the browser** — the gate is also `typeof window !== "undefined"`,
  so every call made while rendering on the server does nothing, by design (see
  [Production elimination](#production-elimination));
- when `attachHttpMonitor` was never called on the instance;
- when the config carries no stamp — a retry that built a fresh config, a
  config assembled field-by-field rather than spread, or a request that started
  while capture was **paused** from the panel's toolbar;
- when `payload` is missing, or both `request` and `response` on it are
  `null`/`undefined` (a bare `{ request }` will not blank a `response` captured
  by an earlier call);
- when the entry has already been evicted from the buffer.

In production it is eliminated entirely, along with the rest of capture.

Values may be a string, a plain object, or an `ArrayBuffer`/typed array (kept
as a bounded hex preview plus byte length). They go through the same
serialization and truncation rules as the plaintext bodies, both in the panel
and in IndexedDB, so a multi-megabyte ciphertext cannot blow out the log.

> **Redaction.** Blix masks sensitive *headers* (`authorization`, `cookie`, …).
> It does **not**, and cannot, redact anything inside the values you pass here
> — they are bodies, and Blix has no way to tell ciphertext from plaintext. If
> you pass an already-decrypted body as `response`, whatever secrets it
> contains are shown in the panel verbatim and written to IndexedDB when
> preserve-log is on. Pass the wire form, not the decrypted one.

#### `withInitiatorCapture(instance)`

Optional. Wraps the instance in a `Proxy` so each request records the stack of
its own call site, which the panel shows as the "Initiator" of a row. Wrap
once, export the wrapped instance:

```ts
export const apiClient = withInitiatorCapture(axios.create({ baseURL: "/api" }));
```

**It does not matter which of the two you hand to `attachHttpMonitor`.** The
proxy forwards property reads to the underlying instance, and `interceptors` is
not a function, so it comes back untouched — `wrapped.interceptors` and
`original.interceptors` are the same object. Registering on either registers on
both. There is no wrong choice here and no silent failure.

What *does* matter is which one your app calls through. Only the proxy's traps
record a stack, so every request made against the unwrapped instance is still
captured but arrives with an empty Initiator column. Export the wrapped one and
keep the original private:

```ts
const client = axios.create({ baseURL: "/api" });
client.interceptors.request.use(encryptBody);
attachHttpMonitor(client);                          // either one works

export const apiClient = withInitiatorCapture(client); // this is what callers use
```

The traps cover the callable form (`apiClient(config)`) plus `request`, `get`,
`post`, `put`, `patch`, `delete` and `head`. Other entry points — `options`,
the `*Form` helpers — pass through unwrapped: still captured, just with no
initiator stack.

> **Known limitation.** The Initiator column is produced by filtering your own
> HTTP wrapper's frames out of the captured stack, and that filter currently
> matches a fixed set of module paths rather than deriving them from where
> `withInitiatorCapture` was called. If your axios module does not sit at one
> of those paths, the top frame reported will be your own wrapper rather than
> the true call site. There is no option to extend the filter yet.

### Redux — `createReduxMonitorMiddleware(options?)`

```ts
// src/store.ts
import { configureStore } from "@reduxjs/toolkit";
import { createReduxMonitorMiddleware } from "@hakam-aldeen-kh/blix/capture";

const devMiddleware =
  process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? createReduxMonitorMiddleware({
        ignore: ["analytics/*", "some/noisyAction"],
      })
    : undefined;

export const store = configureStore({
  reducer,
  middleware: (getDefault) =>
    devMiddleware ? getDefault().concat(devMiddleware) : getDefault(),
});
```

Options: `ignore` (exact types or `"prefix/*"` globs), `coalesceMs` (repeat
dispatches of one type inside this window fold into a single row), and
`maxActionsPerSecond` (above this rate, capture drops to type + timing and
skips diffing). Outside development the factory returns a pure pass-through
middleware, so calling it unguarded is *behaviourally* free — but see
[Guard your call sites](#guard-your-call-sites) for why the guard above is
still worth the extra three lines.

### Realtime — `tapRealtimeAdapter(adapter, transport)`

Returns the adapter wrapped; use the return value. `transport` is a free-form
label shown in the panel (`"pusher"`, `"socket.io"`, …).

```ts
// src/realtime/adapter.ts
import { tapRealtimeAdapter } from "@hakam-aldeen-kh/blix/capture";

const adapter = new PusherAdapter();

export const realtime =
  process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? tapRealtimeAdapter(adapter, "pusher")
    : adapter;
```

Your adapter only needs to structurally satisfy `RealtimeAdapterLike`:
`connect`, `disconnect`, `subscribe`, `onMessage`, `onPresenceUpdate`. In
production the adapter is returned untouched.

**The tap is transparent, not narrowing.** It returns a `Proxy` typed as your
adapter's own type, so class-based adapters keep working through it:

- methods **outside** `RealtimeAdapterLike` pass straight through — the proxy's
  fallback binds and forwards any property that is not one of the tapped
  methods;
- `instanceof` still works against your concrete class, because the proxy has
  no `getPrototypeOf` trap and forwards to the target.

```ts
// Both of these still work through the tap.
if (this.adapter instanceof ActionCableAdapter) {
  this.adapter.setSubscriptionContext({ accountId, userId }); // not in RealtimeAdapterLike
}
```

You do not need to keep a second reference to the untapped adapter.

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

  // Do NOT return the disposer. Under Strict Mode the first run subscribes,
  // the cleanup unsubscribes, and the second run short-circuits on the tap's
  // internal idempotency guard without resubscribing — leaving the Query tab
  // empty for the whole session, with no error and no warning.
  useEffect(() => {
    tapQueryClient(client);
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Why the effect at all: React Strict Mode double-invokes `useState`
initializers, so tapping there taps a client that is immediately discarded.
Installing from an effect is correct — because parent effects run after child
effects, the tap backfills from `getQueryCache().getAll()` on install rather
than starting blind, so no early events are lost.

Why not the disposer: the tap is idempotent, and it releases nothing on
dispose. Those two properties are safe apart and destructive together —
`useEffect(() => tapQueryClient(client), [client])` subscribes, unsubscribes,
and then declines to resubscribe. `tapQueryClient` does return a disposer, for
callers that genuinely own the client's lifetime (a module-scope client, a
test). In a React provider under Strict Mode, discard it: the tap should live
as long as the client, which is this provider's lifetime anyway.

If you construct the `QueryClient` at module scope rather than in a component,
you can tap it at module scope too — the rule is "tap the client that actually
survives", which in the common React pattern means an effect.

---

## Mounting the panel

Render `<Blix />` **exactly once**. Mounting it more than once gives you
duplicate panels reading the same log.

Mount it from a small client component of its own, and import that component —
and nothing else Blix-related — from your layout:

```tsx
// app/BlixMount.tsx
"use client";

import { Blix } from "@hakam-aldeen-kh/blix";
import { apiClient } from "@/src/network/axios";
import { store } from "@/src/store";

// This file is the client boundary on purpose. `apiClient` and `store` are
// module-scope singletons that build themselves during module evaluation —
// importing them from a Server Component pulls axios, cookie access, your
// encryption service and any "use client" helpers they touch into the RSC
// module graph, which fails the production build. Importing them here keeps
// that evaluation on the client side of the boundary.
export default function BlixMount() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Blix store={store} apiClient={apiClient} dbName="my-app-devtools" />;
}
```

```tsx
// app/layout.tsx — stays a Server Component; imports only the mount
import BlixMount from "./BlixMount";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BlixMount />
      </body>
    </html>
  );
}
```

**The client boundary is a leaf.** It does not make your layout or your
children client components — only this one file and what it imports. There is
no bundle cost to isolating it this way, and it is what keeps your store and
HTTP client out of the server graph.

`<Blix />` itself carries a `"use client"` directive and can be rendered from a
server component directly. That is not the reason for the wrapper file: the
directive governs Blix's own module, not the modules *you* import alongside it.
Importing `store` and `apiClient` into `app/layout.tsx` is what breaks the
build, and it breaks it with an opaque module-resolution error from
`next build`, far from the mount site.

The directive on the root entry also means **everything** re-exported from
`@hakam-aldeen-kh/blix` — capture functions included — is inside that client
boundary. That is the reason for the split entry point: import capture from
`@hakam-aldeen-kh/blix/capture` in any module that runs on the server. See
[Entry points](#entry-points).

### Props — all optional

| Prop | Effect when omitted |
| --- | --- |
| `store` | The **State** tab renders `— Redux store not provided —`, and **Re-dispatch** is disabled with the reason `Redux store not provided`. Everything else works. |
| `apiClient` | **Replay request** is disabled with the reason `HTTP client not provided`. Everything else works. |
| `dbName` | Defaults to `"nm-devtools"`. |

`store` and `apiClient` are structurally typed — they need
`getState`/`subscribe`/`dispatch` and `request` respectively. A redux-toolkit
store and an axios instance satisfy them as-is. (The interfaces are named
`StoreLike` and `HttpClientLike` in the source, but they are not exported from
the package; only `Blix` and `BlixProps` are. You never need to name them —
structural typing means you just pass your store and client.)

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

The capture layer is gated on the same condition **plus a
`typeof window !== "undefined"` check**, so `attachHttpMonitor` and friends
become no-ops in production even though their call sites remain — and also
during SSR, in the same dev build where they are live in the browser.

That second half is not a bundling concern but a correctness one. The capture
module is reachable from your HTTP-client module, which typically also runs on
the server, and the monitor's buffer is a module-level singleton: on a
long-lived Node process it would otherwise accumulate every user's request
payloads for the lifetime of the server. Keeping the server-side singleton
permanently empty is the point.

Practically: a `captureEncrypted` call that runs during SSR does nothing, and
`<Blix />` returns `null` there — it checks `typeof window` alongside
`NODE_ENV` before touching the panel import.

### Guard your call sites

**No-op is not the same as eliminated.** The argument above works for the
panel because the literal check lives in the file that makes the dynamic
import. It does *not* carry over to the capture layer, and the reason is the
same one that motivated writing the check inline in the first place.

Every capture function tests a single internal constant inside its own body,
and that constant lives in Blix's module, not yours. Your bundler folds the
constant to `false` — but it keeps the function bodies that reference it,
because your call site still imports them. The result is tens of kilobytes of
capture runtime in a production bundle where every entry point is dead.

To drop it, write the same literal check in the file that makes the call,
exactly as Blix does internally:

```ts
// ✅ folded away in production — the whole capture chunk is dropped
export const apiClient =
  process.env.NODE_ENV === "development"
    ? withInitiatorCapture(createClient())
    : createClient();

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  attachHttpMonitor(apiClient);
}
```

```ts
// ❌ works, but keeps the capture runtime in your production bundle
export const apiClient = withInitiatorCapture(createClient());
attachHttpMonitor(apiClient);
```

Two rules for writing the guard:

- **Write the condition out literally, in the file that makes the call.**
  Hoisting it into a shared `const IS_DEV` defeats the folding, for the same
  reason Blix writes it inline in its own source.
- **Include `typeof window !== "undefined"`** when the module also evaluates on
  the server, which in the Next.js App Router it generally does. It is
  redundant with Blix's internal guard, but it keeps the folded branch
  unambiguous for the bundler and matches the condition Blix uses internally.

`createReduxMonitorMiddleware` needs the middleware callback restructured
rather than a one-line guard — see the [Redux](#redux--createreduxmonitormiddlewareoptions)
example above, which is written in the guarded form.

---

## Entry points

| Import | Contents | `"use client"` |
| --- | --- | --- |
| `@hakam-aldeen-kh/blix` | `Blix`, `BlixProps` + everything below | **yes** |
| `@hakam-aldeen-kh/blix/capture` | capture functions and types only — no React | no |

Import capture functions from `/capture` in modules that run during SSR or at
module-eval time. It pulls in no React code and carries no `"use client"`
directive, so it stays usable from a server module — which the root entry, by
virtue of the directive that lets `<Blix />` be rendered from a server
component, is not.

The `/capture` entry exports `attachHttpMonitor`, `captureEncrypted`,
`createReduxMonitorMiddleware`, `tapQueryClient`, `tapRealtimeAdapter`,
`withInitiatorCapture`, and the supporting types (`EncryptedPayload`,
`ReduxCaptureOptions`, `RealtimeAdapterLike`, `MonitorEntry`, …).

---

## License

Proprietary — all rights reserved. See [LICENSE](./LICENSE).