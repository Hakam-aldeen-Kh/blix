/**
 * Network monitor — "who fired this request?"
 *
 * ## Why the stack is taken at the call site, not in the interceptor
 *
 * By the time the axios request interceptor runs, we are already inside axios's
 * promise chain: the interceptor callback executes in a microtask, so
 * `new Error().stack` taken there is `at Object.onFulfilled (axios)` plus a
 * microtask boundary. V8's async stack traces sometimes recover the real
 * caller, but not reliably, and never through React Query's internals.
 *
 * So `withInitiatorCapture` wraps the axios instance, takes the stack
 * synchronously in the caller's own frame, and stashes it on the config for
 * `beginMonitor` to read. The fetch wrapper needs no such proxy: it *is* the
 * call site, so it calls `captureFrames` directly.
 *
 * ## Why Blix's own frames are dropped by depth
 *
 * Both callers know exactly how many of their own frames sit above the caller's
 * code, and pass that as `skip`. The alternative — recognizing Blix's frames by
 * module name — does not survive bundling: the published package is a handful
 * of hashed `dist/chunk-*.js` files, none of them named after the source
 * module, so in a real install every Blix frame slipped through and the
 * Initiator column pointed at Blix itself. Do not add module-name rules for
 * Blix's own code to `NOISE`.
 *
 * The whole module is behind a statically-foldable `NODE_ENV` check at its call
 * site, so it is dead-code-eliminated from production builds.
 */

import { MONITOR_ENABLED } from "./monitorConfig";
import type { InitiatorFrame } from "./monitorTypes";

/** Frames that are never what the developer wants to see. */
const NOISE = [
  /[\\/]node_modules[\\/]axios[\\/]/,
  /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
  /[\\/]node_modules[\\/]@tanstack[\\/]/,
  /monitorInitiator|networkMonitor|monitorPersistence/,
  /[\\/]core[\\/]network[\\/]axios\.ts/,
  /node:internal|next[\\/]dist/,
  /^\s*at (?:Object\.)?(?:Promise|process|async)\b/,
];

const FRAME_RE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

/** Rewrites an absolute or bundler-mangled path to something repo-relative. */
function tidyPath(file: string): string {
  const cleaned = file
    .replace(/^webpack-internal:\/{3}\(.*?\)\/\.?/, "")
    .replace(/^rsc:\/{3}/, "")
    .replace(/\?.*$/, "");
  const at = cleaned.lastIndexOf("/src/");
  if (at >= 0) return cleaned.slice(at + 1);
  const backslash = cleaned.lastIndexOf("\\src\\");
  if (backslash >= 0) return cleaned.slice(backslash + 1).replace(/\\/g, "/");
  return cleaned;
}

const MAX_FRAMES = 8;

/**
 * Parses, filters and trims a raw `Error.stack` into displayable frames.
 *
 * `skipFrames` drops that many raw frames from the top — after the `Error`
 * header line, before any filtering — so a caller can remove its own frames by
 * position rather than by name.
 */
export function parseStack(
  stack: string | undefined,
  skipFrames = 0,
): InitiatorFrame[] {
  if (!stack) return [];
  const out: InitiatorFrame[] = [];

  for (const line of stack.split("\n").slice(1 + skipFrames)) {
    if (NOISE.some((re) => re.test(line))) continue;
    const match = FRAME_RE.exec(line);
    if (!match) continue;

    const [, fn, file, lineNo, col] = match;
    out.push({
      fn: fn?.trim() || undefined,
      file: tidyPath(file),
      line: Number(lineNo),
      col: Number(col),
    });
    if (out.length >= MAX_FRAMES) break;
  }

  return out;
}

/**
 * The one frame worth showing inline in the table's Initiator column: the first
 * that lives in the host app's own source. That heuristic lands on the hook or
 * component the developer cares about rather than on a service wrapper.
 */
export function summarizeInitiator(frames: InitiatorFrame[]): string {
  if (frames.length === 0) return "";
  const own =
    frames.find((f) => /^src\/(features|shared|app)\//.test(f.file)) ??
    frames[0];
  const name = own.fn ? `${own.fn} · ` : "";
  const file = own.file.split("/").pop() ?? own.file;
  return `${name}${file}${own.line ? `:${own.line}` : ""}`;
}

/** Runtime opt-out, flipped from the panel's prefs. */
let captureEnabled = true;
export function setInitiatorCapture(on: boolean): void {
  captureEnabled = on;
}

/**
 * The call stack of whoever called into Blix, with Blix's own frames removed.
 *
 * `skip` is the number of frames *between this function and the caller's own
 * code* — the Blix frames that called it. It must be called directly from the
 * outermost of those frames: an extra helper in between silently shifts every
 * captured initiator by one.
 *
 * - the fetch wrapper calls it from its own body: `skip = 1`
 * - the axios proxy calls it from `attach`, called from a trap: `skip = 2`
 *
 * Exported for the fetch wrapper; not part of the public API.
 */
export function captureFrames(skip = 0): InitiatorFrame[] | undefined {
  if (!captureEnabled) return undefined;
  // Next's dev server installs a source-map-aware `prepareStackTrace` and
  // raises the frame limit; capping it is by far the biggest lever on the cost
  // of this call. Raised by the frames about to be skipped, so the caller still
  // gets the same budget of its own.
  const previousLimit = Error.stackTraceLimit;
  try {
    Error.stackTraceLimit = 24 + 1 + skip;
    const stack = new Error().stack;
    // Read `.stack` now and drop the Error: retaining the Error would retain
    // its entire closure scope, and 200 buffered entries holding one each is a
    // real leak. `1 +` is this function's own frame.
    return parseStack(stack, 1 + skip);
  } catch {
    return undefined;
  } finally {
    Error.stackTraceLimit = previousLimit;
  }
}

/**
 * What `withInitiatorCapture` needs from an HTTP client — declared
 * structurally, so axios's types are never imported and an app that only uses
 * `fetch` never needs axios installed to type-check against Blix.
 *
 * `request` is the one entry point every axios-style client has; the verb
 * helpers are wrapped when present. Method syntax on purpose: method parameters
 * are compared bivariantly, which is what lets axios's generic, config-typed
 * signatures satisfy these `unknown`-typed ones without a cast.
 */
interface InitiatorCaptureTarget {
  request(config: unknown): unknown;
  get?(url: string, config?: unknown): unknown;
  delete?(url: string, config?: unknown): unknown;
  head?(url: string, config?: unknown): unknown;
  post?(url: string, data?: unknown, config?: unknown): unknown;
  put?(url: string, data?: unknown, config?: unknown): unknown;
  patch?(url: string, data?: unknown, config?: unknown): unknown;
}

type ConfigWithInitiator = {
  __monitorInitiator?: InitiatorFrame[];
  /** Stamped by `attachHttpMonitor` on configs axios built — see `attach`. */
  __monitorId?: string;
};

type AnyMethod = (...args: unknown[]) => unknown;

/**
 * Stamp on the Proxy `withInitiatorCapture` returns, so a second wrap can be
 * detected. **Enumerable on purpose**, for the same reason as the fetch
 * wrapper's mark in `attachFetch.ts`: code that copies a client's properties
 * onto a new object keeps an enumerable symbol and silently drops a
 * non-enumerable one. Registry-global, so two copies of this package in one
 * tree see each other.
 *
 * Reported by the Proxy's traps rather than defined on it. A Proxy with no
 * `defineProperty` trap forwards a definition to its target, which would stamp
 * the axios instance itself — and make the *unwrapped* instance look wrapped.
 */
const WRAPPER_MARK = /* @__PURE__ */ Symbol.for("blix.initiatorCapture");

/**
 * Wraps the axios instance so every call site records its own stack.
 *
 * Wraps the callable form (`apiClient(config)`), plus `request`, `get`, `post`,
 * `put`, `patch`, `delete` and `head`. Other entry points (`options`, `query`,
 * the `*Form` helpers) pass through unwrapped — requests made through them are
 * still captured, they just carry no initiator stack.
 *
 * The stack is stashed on the config object in the callable form's and
 * `request`'s *first* argument, so two calls through wrapped methods also
 * carry no initiator stack:
 *
 * - **The string form** — `apiClient("/url")`, `apiClient("/url", config)`,
 *   `apiClient.request("/url", config)`. The string is passed to axios as
 *   given, never turned into a config, so axios runs the same overload it
 *   would unwrapped; the second argument is forwarded untouched.
 * - **A frozen, sealed or otherwise non-extensible config.** It is left
 *   alone rather than written to.
 *
 * The stash is an enumerable `__monitorInitiator` property on the caller's own
 * config object, so it appears in that object's `Object.keys` after the call.
 * Development only, and axios does not send unknown config keys.
 *
 * Wrapping a client that is already wrapped returns it unchanged, with a
 * development warning: the second wrapper would record Blix's own frames as
 * the caller.
 *
 * Generic over the instance, so what the caller gets back is its own type —
 * an `AxiosInstance` stays an `AxiosInstance`, with `get<T>`, `defaults` and
 * `interceptors` intact — rather than the minimal shape it was checked against.
 */
export function withInitiatorCapture<T extends InitiatorCaptureTarget>(instance: T): T {
  if (!MONITOR_ENABLED) return instance;

  if ((instance as unknown as { [WRAPPER_MARK]?: unknown })[WRAPPER_MARK] === true) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[blix] withInitiatorCapture was given a client it has already wrapped, " +
          "and returned it unchanged. Wrap the axios instance once and export " +
          "the wrapped one — a second wrapper would record Blix's own frames " +
          "as the caller of every request.",
      );
    }
    return instance;
  }

  // Always called directly from a trap, and always calls `captureFrames`
  // directly — so the Blix frames above the caller are exactly two: `attach`
  // and the trap. See `captureFrames`.
  //
  // Writes only to an extensible object. Anything else — a URL string, a
  // frozen config — is returned as given, and the request goes out with no
  // initiator. Checked up front rather than caught, so a write that fails for
  // any other reason still surfaces.
  //
  // Whether an existing stash is overwritten depends on who built the object,
  // and these are two different cases, not one rule applied twice:
  //
  // - **A config a caller wrote is always overwritten.** A module-level
  //   `const options = { … }` is the same object for every call that passes
  //   it, so a stash left by an earlier call is stale by definition; keeping it
  //   reported the first caller for every later request.
  // - **A config axios built is never overwritten.** A retry interceptor that
  //   calls `client(error.config)` hands back the config axios merged for the
  //   first attempt, which already carries that attempt's call site.
  //   Overwriting it would name the interceptor — true, and useless to anyone
  //   debugging an auth-refresh loop.
  //
  // `__monitorId` tells them apart exactly, not by heuristic. It is stamped by
  // `attachHttpMonitor`'s request interceptor, which only ever sees the object
  // axios's `mergeConfig` produced — never the one the caller passed in. So
  // its presence means axios built this config. Do not fold the two rules into
  // one "keep it if already set" check: that check is the stale-stack bug.
  //
  // Must stay an enumerable own property: do not move it to a WeakMap. axios's
  // verb helpers `mergeConfig` the caller's object into a new one, copying
  // enumerable own keys, and that copy is the only way the stack reaches the
  // interceptor `attachHttpMonitor` registers.
  const attach = <C>(config: C): C => {
    if (
      typeof config === "object" &&
      config !== null &&
      Object.isExtensible(config) &&
      (config as ConfigWithInitiator).__monitorId === undefined
    ) {
      (config as ConfigWithInitiator).__monitorInitiator = captureFrames(2);
    }
    return config;
  };

  const proxy = new Proxy(instance, {
    // The wrapper mark, reported as an enumerable own property of the proxy
    // alone — see `WRAPPER_MARK`. A property the target lacks may only be
    // reported while the target is extensible, so a non-extensible instance
    // goes without it in `ownKeys`; `get` still answers, and that is what the
    // double-wrap check reads.
    has(target, prop) {
      return prop === WRAPPER_MARK || Reflect.has(target, prop);
    },
    ownKeys(target) {
      const keys = Reflect.ownKeys(target);
      return Object.isExtensible(target) && !keys.includes(WRAPPER_MARK)
        ? [...keys, WRAPPER_MARK]
        : keys;
    },
    getOwnPropertyDescriptor(target, prop) {
      const own = Reflect.getOwnPropertyDescriptor(target, prop);
      if (prop === WRAPPER_MARK && !own && Object.isExtensible(target)) {
        return { value: true, enumerable: true, writable: false, configurable: true };
      }
      return own;
    },
    // Every argument is forwarded: axios accepts `apiClient(url, config)`, and
    // passing only the first would drop the config.
    apply(target, thisArg, args: unknown[]) {
      const [config, ...rest] = args;
      return Reflect.apply(
        target as unknown as AnyMethod,
        thisArg,
        [attach(config), ...rest],
      );
    },
    get(target, prop, receiver) {
      if (prop === WRAPPER_MARK) return true;
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      if (prop === "request") {
        // `request(url, config)` too — forwarded for the same reason.
        return (config: unknown, ...rest: unknown[]) =>
          (value as AnyMethod).call(target, attach(config), ...rest);
      }
      if (prop === "post" || prop === "put" || prop === "patch") {
        return (url: string, data?: unknown, config?: ConfigWithInitiator) =>
          (value as AnyMethod).call(target, url, data, attach(config ?? {}));
      }
      if (prop === "get" || prop === "delete" || prop === "head") {
        return (url: string, config?: ConfigWithInitiator) =>
          (value as AnyMethod).call(target, url, attach(config ?? {}));
      }

      return value.bind(target);
    },
  });

  return proxy;
}
