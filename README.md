# @hakam-aldeen-kh/blix
[![npm](https://img.shields.io/npm/v/@hakam-aldeen-kh/blix)](https://www.npmjs.com/package/@hakam-aldeen-kh/blix)

An in-app dev-tools panel for React apps. Captures HTTP requests, Redux
actions, TanStack Query cache events and realtime traffic, and renders them in
a dockable panel with cross-source links, diffing, replay and HAR/cURL
export.

The entire panel is eliminated from production builds — see
[Production elimination](#production-elimination).

Release notes are in [CHANGELOG.md](https://github.com/Hakam-aldeen-Kh/blix/blob/main/CHANGELOG.md).

---

## Install

```bash
pnpm add -D @hakam-aldeen-kh/blix
```

Or with npm:

```bash
npm install -D @hakam-aldeen-kh/blix
```

It installs as a `devDependency`, but the mount component that renders
`<Blix />` imports it from your application code — so any build that drops
devDependencies *before* the build step (`npm ci --omit=dev`,
`pnpm install --prod`, the usual shape of a multi-stage Docker image) fails
while resolving that import. devDependencies have to be present at build time.
Dropping them from the final runtime image is fine: nothing from Blix reaches
the production output anyway.

The package ships **ESM only**. Both entry points declare `"types"` and
`"import"` in `exports`, with no `"require"` and no `"default"` fallback, so
`require("@hakam-aldeen-kh/blix")` and CJS-only tooling — an older Jest config
is the usual one — fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. That is by
design, not a packaging bug: a dev tool that is eliminated from production has
no reason to carry a second build output.

### Peer dependencies

`react` and `react-dom` (v19) are required. `axios`, `@reduxjs/toolkit` and
`@tanstack/react-query` are **optional** peers — you only need the ones whose
capture you actually use. The capture layer is structurally typed against each
of them and imports none of them — not at runtime, and not in its published
type declarations — so installing Blix does not pull a data-fetching or state
library into your tree, and your type-check never goes looking for one.

**axios is optional, and fetch-only apps are fully supported.** An app that
calls `fetch` directly — the default in a Next.js App Router project — captures
its HTTP traffic with
[`attachFetchMonitor`](#http-fetch--attachfetchmonitoroptions) and never needs
axios installed, not even for types.

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
| `attachFetchMonitor` | before the first `fetch` you want captured — client-side only | module scope |
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

`attachHttpMonitor` is idempotent per instance — a second call on the same
instance, or on its `withInitiatorCapture` wrapper, does nothing — and it
returns a disposer that ejects both interceptors, for HMR and tests. A request
cancelled through an `AbortController` or a `CancelToken` settles as
**aborted**, not as an error; a timeout is still an error.

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
filter. Nothing times the row out either: its duration keeps counting for as
long as the page stays open.

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

> **axios only.** Correlation works through the config object your own
> interceptor is holding, and `fetch` has no interceptor stage to hold one in,
> so `captureEncrypted` has no effect on requests captured by
> [`attachFetchMonitor`](#http-fetch--attachfetchmonitoroptions).

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

> **Redaction.** Blix masks sensitive *headers* — and the list is closed at
> exactly four, matched exactly: `authorization`, `cookie`, `set-cookie`,
> `x-api-key`. It does **not**, and cannot, redact anything inside the values
> you pass here — they are bodies, and Blix has no way to tell ciphertext from
> plaintext. If you pass an already-decrypted body as `response`, whatever
> secrets it contains are shown in the panel verbatim and written to IndexedDB
> when preserve-log is on. Pass the wire form, not the decrypted one. See
> [Security](#security) for the full picture.

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
captured but arrives with no initiator. Export the wrapped one and
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

> **Known limitation.** The initiator stack is produced by filtering your own
> HTTP wrapper's frames out of the captured stack, and that filter currently
> matches a fixed set of module paths rather than deriving them from where
> `withInitiatorCapture` was called. If your axios module does not sit at one
> of those paths, the top frame reported will be your own wrapper rather than
> the true call site. There is no option to extend the filter yet.

### HTTP (fetch) — `attachFetchMonitor(options?)`

For requests made with `fetch` directly rather than through axios. It wraps
`globalThis.fetch`, so it captures **every** `fetch` the page makes — your own
and any library's or third-party script's — into the same Network section, in
the same shape, with the same header masking and the same absence of body
redaction (see [Security](#security)). Its rows show **Client: fetch** in the
Headers tab, and `client:fetch` filters to them. Each row records the call
stack of the `fetch` call that made it; no `withInitiatorCapture` is needed.

```ts
// instrumentation-client.ts (Next.js 15.3+), or the first module your client bundle evaluates
import { attachFetchMonitor } from "@hakam-aldeen-kh/blix/capture";

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  attachFetchMonitor();
}
```

**Call it before the first `fetch` you want captured.** There are no
interceptors to order against, but anything fetched before the wrapper is
installed is simply not seen. In a Next.js App Router project,
`instrumentation-client.ts` runs on the client before your application code and
is the natural place; otherwise, the top of the first module your client bundle
evaluates.

**Client-side only.** It never patches `fetch` on the server, so Next.js's
server-side `fetch` and its data cache are untouched — and like every capture
function, it is a no-op in production.

It returns a **disposer** that restores the original `fetch`, and calling
`attachFetchMonitor` again while it is installed does nothing. The disposer
only restores `fetch` while Blix's wrapper is still the current one: if another
library has wrapped `fetch` since, restoring would silently remove that wrapper
too, so it leaves `fetch` alone and warns in development instead.

#### Bodies, streams and the size cap

Blix reads bodies from clones, so your code always receives an untouched
`Request` and `Response`. It never buffers without a limit:

| Situation | What is recorded |
| --- | --- |
| `Content-Type: text/event-stream` | status, headers, timing — body not captured, because the stream does not end |
| `Content-Length` over the cap | status, headers, timing — body not captured, reading never starts |
| body passes the cap while downloading | status, headers, timing — body not captured, reading abandoned |
| `no-cors` (opaque) response | status `0` — headers and body not captured, because the browser hides them |
| request body is a `ReadableStream` | request body not captured — reading it would consume the upload |

A skipped body is recorded as `«body not captured: …»` with the reason, so an
empty Response tab always means an empty response. The cap applies to request
and response bodies alike, defaults to **5 MB**, and is set with
`maxBodyBytes`:

```ts
attachFetchMonitor({ maxBodyBytes: 1024 * 1024 }); // 1 MB — 0 captures no bodies
```

The cap is enforced by **counting bytes as they arrive**, not by trusting
`Content-Length`. That header is the compressed size, and a small gzipped
response can decode to many times it; a declared length over the cap only lets
Blix skip without starting. A row's duration runs to the end of the body when
Blix read it, and to the response headers when it did not.

A non-2xx response is recorded as a failed request with its body under
**Error**, the same way an axios rejection is. An aborted request settles as
**aborted**; a network failure or an `AbortSignal.timeout()` settles as an
error. Either way the original rejection reaches your code untouched.

#### What is left out by default

A development server makes plenty of `fetch` calls of its own, and they would
bury your requests. These are **not captured by default**:

| Rule | Matches |
| --- | --- |
| `"/_next/"` | Next.js assets, HMR updates and Pages Router data requests |
| `"/__nextjs"` | the Next.js dev overlay — stack frames, source maps, open-in-editor |
| `/[?&]_rsc=/` | App Router navigations and `<Link>` prefetches |
| `".hot-update."` | webpack HMR update manifests and chunks |
| `"/__webpack_hmr"` | webpack-hot-middleware |

A string matches anywhere in the URL's path and query, a regular expression is
tested against the same string, and a function receives the resolved `URL`.
Pass an array to **replace** the defaults, or a function to **extend** them:

```ts
attachFetchMonitor({ ignore: (defaults) => [...defaults, "/api/health"] }); // extend
attachFetchMonitor({ ignore: [] });                                          // capture everything
```

**An ignored request is dropped silently** — no row records that it was
skipped. If a request you expected is missing, check it against this list
first.

#### Using it alongside axios

Installing both `attachFetchMonitor` and `attachHttpMonitor` is fine. axios's
default browser adapter is XHR, which the fetch wrapper never sees. If you
configure axios with `adapter: "fetch"`, one request passes through both — and
**the axios entry wins**. It was captured on the plaintext side of your
interceptors, keeps `captureEncrypted` and `withInitiatorCapture`, and can be
replayed; the fetch wrapper would only see the same request after encryption.
`attachHttpMonitor` marks each request on its way into axios's fetch adapter,
and the fetch wrapper skips anything carrying the mark, so every request is
logged exactly once. The order of the two calls does not matter.

#### What it does not do

- **No replay.** Fetch rows show Replay disabled, with the reason. Blix does
  not record a call's `credentials`, `mode` or `cache`, or a JSON body as the
  exact bytes that were sent, so a replay could not promise to be the same
  request.
- **No `captureEncrypted`** — see
  [Encrypted payloads](#encrypted-payloads--captureencryptedconfig-payload).
- **No timeout.** A request that never answers stays pending, exactly as an
  axios request does.

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

  useEffect(() => tapQueryClient(client), [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Why the effect at all: React Strict Mode double-invokes `useState`
initializers, so tapping there taps a client that is immediately discarded.
Installing from an effect is correct — because parent effects run after child
effects, the tap backfills from `getQueryCache().getAll()` on install rather
than starting blind, so no early events are lost.

Returning the disposer is fine: it unsubscribes from both caches and unmarks
the client, so the Strict Mode cycle — subscribe, dispose, subscribe again —
reinstalls cleanly and the second install backfills the same way the first did.

> **Fixed in 0.3.2.** In 0.3.1 and earlier the disposer unsubscribed but left
> the client marked as tapped, so the reinstall short-circuited on the tap's
> internal idempotency guard without resubscribing — leaving the Query tab
> empty for the whole session, with no error and no warning. On those versions
> the workaround is to call `tapQueryClient(client)` from the effect without
> returning its result.

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
  return <Blix store={store} apiClient={apiClient} dbName="my-app" />;
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
| `dbName` | Falls back to the shared database `blix:default`, and the panel warns in the console. See [`dbName`](#dbname--when-you-need-it). |

`store` and `apiClient` are structurally typed — they need
`getState`/`subscribe`/`dispatch` and `request` respectively. A redux-toolkit
store and an axios instance satisfy them as-is. (The interfaces are named
`StoreLike` and `HttpClientLike` in the source, but they are not exported from
the package; only `Blix` and `BlixProps` are. You never need to name them —
structural typing means you just pass your store and client.)

Passing neither still gives you a fully working capture log; you only lose the
two features that need a live handle on the app.

### Finding your way around

The panel is one header, one rail and two panes.

**The rail on the left is the four sources** — Network, Realtime, Redux,
Query. They are not filters over one table: each has its own columns and its
own notion of a row, so switching source switches the whole view. `1`–`4` jump
between them, and each keeps its own selection, so stepping to Redux and back
returns you to the request you were reading. Below the sources it carries the
session totals, and it collapses to icons — click the chevron, or let a narrow
dock do it for you.

**The header is the session**, not the entry: whether capture is running, what
is being filtered out, and where the panel lives. Filter tokens you have
already applied become chips *inside* the filter field, each removable on its
own, so `method:post status:5xx` is two things you can undo separately rather
than one string to re-edit. `.*` widens the search to request and response
bodies.

**`Ctrl/⌘ K` opens the command palette**, and for several things it is the only
way in — sort order, row density, dock position, the copy formats, the filter
syntax. The header spends its width on what you read constantly; everything you
reach for occasionally lives one keystroke away instead of costing a button
each. Every row shows its key binding where it has one, so the palette teaches
its own shortcuts. `?` still opens the full cheatsheet.

**Linked events tie the sources together.** When Blix can see that a query
caused a request, that a request came from a query, or that one entry is a
replay of another, the row grows a coloured tick and the foot of the detail
pane grows a chip you can click to step straight to the other side. The
relation is observed, never inferred: no tick means *not known*, not
*unrelated*.

### Viewing payloads

Every payload pane has a format switch. The choice is remembered, so you pick
it once rather than per request.

| Format | Answers |
| --- | --- |
| **Tree** | *What's in here?* Collapsible and searchable; a collapsed subtree costs one row, so it stays fast on multi-megabyte responses. |
| **Table** | *How do these records compare?* A grid, offered when the payload is a list of records or a keyed map. Sparse and surplus columns are hidden with a count. |
| **JSON** | *What exactly came back?* Raw and syntax-coloured, with a fold caret on every object and array — plus **Collapse all**, which leaves the top-level keys readable and their contents folded. |
| **YAML** | *What shape is this?* Indentation instead of punctuation, and multi-line strings — stack traces, SQL — shown as text rather than escapes. |
| **Text** | *It isn't JSON.* An HTML error page, a CSV body, a proxy's plain-text response. |

**Copy gives you what you're looking at**: Table copies CSV, YAML copies YAML.

The switch is on every payload pane — request and response bodies, realtime
frames, the encrypted envelope, Redux actions, and both Redux state views:

- **State** shows the live store, scoped by a **slice picker**. Slices the
  selected action wrote to are marked with a dot, so "what does `cart` look
  like now" is one click rather than a hunt through a collapsed root object.
- **Diff** keeps its `+ / − / ±` rows as the default view and adds the other
  five alongside. **Table** is the natural one — a diff *is* `path | op |
  before | after` — and Tree lets you open up a `before` that was an object,
  which the one-line rows could only ever summarise. Copying the rows view
  gives you a plain-text diff for a ticket, not JSON.

Right-click any request for **Copy as cURL** or **Copy as fetch** — the latter
pastes straight into the browser console, with the body as an editable object
literal rather than a pre-serialized string.

### Exporting the log

The **Export** button in the header offers six formats and a scope
toggle — **Shown** (what the current section and filters leave visible) or
**All**. It defaults to Shown, with both counts on the control, so an export
says what it will contain before you pick a format.

| | Format | For |
| --- | --- | --- |
| Tool | **HAR** | Chrome DevTools, Charles, Insomnia, Postman — with the decrypted bodies. HTTP entries only. |
| | **JSON** | Everything captured: frames, Redux diffs, timings. |
| | **NDJSON** | One entry per line — pipe it into `jq`. |
| Person | **Markdown** | A table plus failure bodies, copied to the clipboard for an issue, a PR or Slack. |
| | **CSV** | One row per entry, no bodies — sort and count in a spreadsheet. Opens as UTF-8 in Excel. |
| Shell | **cURL script** | Every request in order, runnable against another environment. |

Captured `Authorization` headers are masked, so cURL and fetch output carries a
placeholder rather than a working token — use **Replay** for a real re-run.
Every export and snippet stays masked even with Authorization shown in full in
the panel (see [What is redacted](#what-is-redacted)).

### Themes

Twelve themes, under the theme button in the header — it names the one
currently applied:

| | Theme | |
| --- | --- | --- |
| Dark | **Midnight** | Deep blue-black — the default |
| | **Carbon** | True black, high contrast; for OLED displays |
| | **Nord** | Muted arctic blues |
| | **Tokyo Night** | Deep indigo, soft neon |
| | **One Dark** | Atom's classic slate |
| | **Mocha** | Catppuccin — gentle pastels |
| | **Dracula** | Vivid purples and pinks |
| | **Gruvbox** | Warm retro browns and amber |
| Light | **Daylight** | Clean white — the light default |
| | **GitHub** | The light theme you already read all day |
| | **Latte** | Catppuccin — soft pastel light |
| | **Solar** | Warm paper, low blue light |

**Hovering a theme applies it to the panel behind the menu**, so you can see a
real payload in it before committing; moving away puts back the one you had.
Arrow keys preview the same way.

The default is **System**: the panel reads the light/dark class off `<html>`
and paints Midnight or Daylight to match, re-checking whenever your app's theme
changes. Picking a specific theme overrides that. The choice is stored with the
panel's other preferences and survives a reload.

The panel never inherits your app's styling — it portals outside every stacking
context and ships its own palettes, so nothing you do to your own theme can
distort it. Themes are complete rather than partial: every colour the panel
paints, down to the JSON syntax highlighting and the duration bars, comes from
the active theme. Each palette is checked against WCAG contrast targets — 4.5:1
for anything read as text, 3:1 for badges and quiet chrome — which is why a few
of the ported palettes differ by a shade from the originals in the slots used
for dense monospace.

There is no API for adding your own; a theme is ~20 colours in
`src/ui/themes/themes.ts` if you are working from source.

### `dbName` — when you need it

The panel can persist its log to IndexedDB so it survives a reload, but only
when you opt in: **preserve-log is off by default**, and while it is off
nothing is written to disk. See [Security](#security) for what the toggle does
and what lands there.

**All of Blix's storage is scoped to the origin, not to your app.** That is how
IndexedDB and `localStorage` both work, and it covers the captured log *and*
your panel preferences — dock position, theme, density, the preserve-log
toggle. Two apps served from the same origin (different ports in dev are
different origins, but path-based routing, multi-zone Next.js setups and
anything behind one reverse proxy are not) share every one of them: entries
from one project appear in the other's panel, and whichever you opened last
decides where the panel is docked.

`dbName` is how projects on one origin are kept apart. Give each app its own:

```tsx
<Blix store={store} apiClient={apiClient} dbName="checkout" />
```

You can also set it from the capture side, which is useful when capture starts
before the panel mounts:

```ts
attachHttpMonitor(apiClient, { dbName: "checkout" });
```

Either call must happen before the database is first opened, which the panel
does on mount. If both are set, the `<Blix />` prop wins, since render runs
after module init. A call that arrives after the database is open is ignored —
Blix does not switch databases at runtime — and says so in the console rather
than failing quietly.

The name you pass is prefixed: `dbName="checkout"` gives you the database
`blix:checkout` and the preferences key `blix:checkout:prefs`. Passing an
already-prefixed name is fine and does not double it. Omitting `dbName`
entirely gives you `blix:default`, shared with every other app on the origin
that also omits it — and in development the panel warns once per mount when
that happens, naming the fix.

Renaming is not a migration: the old database is left where it is rather than
moved or deleted, and the new one starts empty at default preferences.

#### Databases on this origin

The status bar always shows which database the panel is on. On the shared
default it turns amber and adds a `shared` tag, which is the visible form of
the console warning above — click it to open the screen below. The same screen
is in **⋯ More actions** and in the command palette.

Open the command palette (`Ctrl/⌘ K`) → **Databases on this origin** to see
every Blix database the origin holds — one per project, plus `nm-devtools`,
the single unprefixed database that all projects shared before names were
prefixed. Each row shows an approximate size and can be deleted; the one this
panel is using is marked and is not deletable from there, since it is open —
use **Purge saved log** for that.

**Peek** on a row lists the 50 newest entries in that database — time, method,
URL and status — so you can tell whose log it is before deleting it. It is a
read-only snapshot: Blix opens the database, reads, and closes it again, so the
list does not update and there is no detail pane, replay or export. The panel
itself always stays on its own database; to work with another project's log
properly, run that project and open the panel there.

The screen enumerates with `indexedDB.databases()`, which Firefox does not
implement. There it falls back to the databases Blix has itself opened in that
browser and labels the list as possibly incomplete.

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

## Security

Blix is a debugger, and it captures what a debugger has to capture: **full
request and response bodies, request and response headers, Redux action
payloads and state diffs, and realtime frames**. It captures them in
plaintext — the request body *before* your encryption interceptor runs, the
response body *after* your decryption interceptor. That is the whole point of
it, and it means the log holds whatever your traffic holds, credentials
included.

`attachFetchMonitor` widens that to **every `fetch` the page makes**, not only
your own: an analytics snippet, a chat widget or a library calling `fetch`
under the hood is captured the same way, bodies included. Use its `ignore`
option to keep a third party's traffic out of the log.

By default all of that is **in memory only**. Nothing is written to disk, and
a reload starts clean.

All of it is dev-only regardless. Capture is gated on
`process.env.NODE_ENV === "development" && typeof window !== "undefined"`, and
the database is opened only when the panel mounts — see
[Production elimination](#production-elimination).

### What reaches disk, and when

**Preserve-log** is the sole gate on disk writes. It is off by default, and
while it is off nothing Blix captures reaches IndexedDB — the store is
actively cleared on every panel mount.

Four ways to toggle it:

| Where | Note |
| --- | --- |
| Header button | Keeps its icon at every width; loses its label when the panel is narrow |
| **⋯ More actions** overflow menu | — |
| Command palette (`Ctrl/⌘ K`) | Listed as **Preserve log across reloads** / **Stop preserving the log** |
| `Shift+L` | — |

All four require the panel to be mounted.

**Turning it on is retroactive.** The toggle does not mean "from now on".
Switching it on writes every entry already sitting in the live buffer — the
session you have *already* captured — to disk immediately, along with
everything that follows. If you have just reproduced a login flow and then
reach for the toggle, you have written that login flow to disk. Read that
again before you assume otherwise; it is the one behaviour here that
reasonably surprises people.

With preserve-log on, this is what is kept:

| Captured | Persisted |
| --- | --- |
| HTTP entries — bodies, headers, timings | yes |
| Realtime frames | yes |
| The encrypted envelope, if you call `captureEncrypted` | yes |
| Panel preferences and budget totals | yes — preferences are also mirrored to `localStorage` under `blix:<dbName>:prefs` |
| Redux actions, payloads and diffs | only if you pin the row |
| Query cache rows | only if you pin the row |

One thing is written regardless of preserve-log: opening the database records
its name in the origin-wide `localStorage` key `blix:databases`, which is how
[Databases on this origin](#databases-on-this-origin) finds it in browsers
without `indexedDB.databases()`. It holds database names and nothing else.

### What is redacted

Exactly four header names, and nothing else:

| Header | Match |
| --- | --- |
| `authorization` | exact, case-insensitive |
| `cookie` | exact, case-insensitive |
| `set-cookie` | exact, case-insensitive |
| `x-api-key` | exact, case-insensitive |

The match is **exact on the full header name** — not a prefix, not a
substring, not a pattern. Near-miss names are *not* covered and are written in
the clear: `x-auth-token` and `api-key` are the two that most often catch
people out, and `proxy-authorization`, `x-csrf-token` and
`x-amz-security-token` are equally uncovered. If your auth travels in a header
that is not one of the four above, it is captured verbatim.

The same four are masked whichever client made the request, and whatever form
the headers were passed in: `AxiosHeaders`, a plain object, a `Headers`
instance or `[name, value]` pairs.

Masking is partial rather than total: for a value longer than 12 characters
the first 8 and last 4 survive, so you can still tell which token you sent.
Shorter values are replaced outright. The Headers tab tags every masked row
`MASKED` rather than leaving you to infer it from an ellipsis, and the stored
value keeps a `(masked)` suffix so every export path carries the fact too.

#### Showing `Authorization` in full

Blix is development-only, and a developer reading their own token on their own
screen is not the risk — the token leaving the machine is. So masking of
`authorization`, and only `authorization`, can be switched off: command palette
→ **Show Authorization values in full**, or **⋯ More actions** → **Show
Authorization in full**. It is a saved preference, off by default, and while it
is on the status bar reads **UNMASKED Authorization** and every such row in the
Headers tab is tagged `UNMASKED`.

- It applies to requests captured **after** it is switched on. Earlier entries
  were masked when they were captured — the full value was never kept — and
  the panel cannot reveal them; their row says so.
- The full value is held in memory only. It is **never** written to IndexedDB,
  and **every** export and copy path — HAR, JSON, NDJSON, CSV, Markdown, the
  cURL script, **Copy as cURL** and **Copy as fetch** — still carries the
  masked value. The row's own **Copy** button is the one way to take the full
  value.
- Masking again discards every full value held.
- `cookie`, `set-cookie`, `x-api-key` and realtime connect tokens stay masked
  regardless.

#### JWT claims

When an `Authorization` value is a JWT, Blix decodes it at capture and keeps
only `alg`, `sub`, `iss`, `iat` and `exp` — never the token or its signature.
The **JWT** chip on that row opens them, with the time left until `exp`, in red
once it has passed. This works with masking on. The signature is not verified,
and a value that is not a well-formed JWT stores no claims at all. The claims
are part of the entry, so — unlike the token — they are saved with
preserve-log on and included in the JSON and NDJSON exports.

**Nothing inside a body is redacted.** Request bodies, response bodies, error
payloads, the encrypted request/response values, Redux payloads and diffs, and
realtime frames all pass through a size-only walker — it truncates large
values and never once inspects a key name. A `password`, `ssn` or
`refreshToken` field is captured, and with preserve-log on written to disk,
exactly as it appears. Blix has no mechanism to do otherwise: it has no schema
for your payloads and no way to tell a secret from any other string.

### Retention and clearing

| Bound | Value |
| --- | --- |
| Records | 200 |
| Total size | 24 MB — HTTP entries only |
| Per payload field | 512 KB |
| Eviction | oldest first, once either bound is exceeded |
| Time-based expiry | none |

There is **no TTL of any kind**. A record leaves the database when 200 newer
records or 24 MB of newer traffic push it out, or when you clear it yourself.
On a low-traffic app with preserve-log left on, a captured token stays in the
browser profile indefinitely.

Three ways to purge:

| Where | Note |
| --- | --- |
| The persisted-size label in the status bar — the one reading `12 saved · 3.4 MB` | The label *is* the control, and it is the only one that asks twice: click once to arm it, at which point it changes to `Purge saved log?`, and click again. It disarms itself after three seconds. Rendered only while preserve-log is on |
| **⋯ More actions** → **Purge saved log** | Deletes on a single press, with no confirmation |
| Command palette (`Ctrl/⌘ K`) → **Purge the saved log** | Deletes on a single press, with no confirmation |

The menu and palette entries are disabled when nothing is on disk, but unlike
the status-bar label they do not depend on preserve-log being on — so a log
written earlier in the session can still be deleted after you have switched
the toggle off.

Switching preserve-log **off** also clears the stored entries, so turning it
off is itself a way to drop everything Blix has written.

A purge can be **blocked**: IndexedDB will not delete a database that another
tab still holds open. The panel reports that, naming the database, instead of
reporting the log purged while it is still on disk. Close the other tabs
running the app and purge again.

Other projects' databases on the same origin — and the legacy `nm-devtools`
database that 0.5.x and earlier wrote — are deleted from
[Databases on this origin](#databases-on-this-origin), not by Purge.

Every path clears the captured entries; Purge additionally deletes the
IndexedDB database itself. **Your panel preferences survive either way** —
they are mirrored to `localStorage`, and a fresh database is re-seeded from
that mirror on the next boot. Both the database and its mirror key are scoped
to this project's `dbName`, so a purge affects only the project that ran it and
cannot restore — or destroy — another project's preferences on the same origin.
There is no UI or API for clearing them, and no programmatic API for purging
either.

### Threat model

IndexedDB is scoped **per origin, not per app**, and it is not encrypted at
rest. Any script running on that origin can read Blix's database — including
browser extension content scripts with access to the origin. Whatever you
capture is readable by whatever you have installed.

A per-project `dbName` does not change that. It keeps projects from mixing
their logs; it does not isolate them. The panel itself can open another
project's database on the same origin — **Peek** in
[Databases on this origin](#databases-on-this-origin) lists its newest URLs,
methods and statuses — and so can any other script there.

Export and copy move captured data out of the browser entirely:

| Path | Carries |
| --- | --- |
| HAR export | Decrypted request and response bodies |
| JSON / NDJSON export | Everything captured — frames, Redux diffs, timings |
| **Copy as cURL** / **Copy as fetch** | Headers and bodies, with the four redacted headers masked — so the output is not a working request |

HAR is the one to watch. It is a plain JSON file carrying your decrypted
bodies, and it is the artifact most likely to end up attached to a ticket.

### If you handle sensitive data

- **Leave preserve-log off unless you actively need it.** It is off by
  default. In-memory capture already gives you the entire panel; the toggle
  buys you nothing but survival across a reload.
- **Clear the log after any session that captured an auth flow** —
  switching preserve-log off is enough; Purge additionally deletes the
  database, though neither removes your panel preferences.
- **Use the Redux `ignore` option** for action types that carry credentials or
  personal data, so they are never captured in the first place. See
  [Redux](#redux--createreduxmonitormiddlewareoptions).
- **Treat an exported HAR as a credential-bearing file.** Do not attach one to
  a public issue, and do not commit one.
- **After upgrading from 0.5.x or earlier, delete `nm-devtools`.** Blix no
  longer reads or writes that database, and it does not delete it for you:
  anything it holds stays on disk until you remove it from
  [Databases on this origin](#databases-on-this-origin).
- **Scope `attachFetchMonitor` with `ignore`** if third-party scripts on the
  page send data you do not want in the log.

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

The `/capture` entry exports `attachHttpMonitor`, `attachFetchMonitor`,
`captureEncrypted`, `createReduxMonitorMiddleware`, `tapQueryClient`,
`tapRealtimeAdapter`, `withInitiatorCapture`, and the supporting types
(`EncryptedPayload`, `FetchMonitorOptions`, `FetchIgnoreRule`,
`ReduxCaptureOptions`, `RealtimeAdapterLike`, `MonitorEntry`, …).

---

## License

MIT — see [LICENSE](https://github.com/Hakam-aldeen-Kh/blix/blob/main/LICENSE).