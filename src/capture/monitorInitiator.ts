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

type ConfigWithInitiator = { __monitorInitiator?: InitiatorFrame[] };

type AnyMethod = (...args: unknown[]) => unknown;

/**
 * Wraps the axios instance so every call site records its own stack.
 *
 * Wraps the callable form (`apiClient(config)`), plus `request`, `get`, `post`,
 * `put`, `patch`, `delete` and `head`. Other entry points (`options`, the
 * `*Form` helpers) pass through unwrapped — requests made through them are
 * still captured, they just carry no initiator stack.
 *
 * Generic over the instance, so what the caller gets back is its own type —
 * an `AxiosInstance` stays an `AxiosInstance`, with `get<T>`, `defaults` and
 * `interceptors` intact — rather than the minimal shape it was checked against.
 */
export function withInitiatorCapture<T extends InitiatorCaptureTarget>(instance: T): T {
  if (!MONITOR_ENABLED) return instance;

  // Always called directly from a trap, and always calls `captureFrames`
  // directly — so the Blix frames above the caller are exactly two: `attach`
  // and the trap. See `captureFrames`.
  const attach = <C extends ConfigWithInitiator | undefined>(config: C): C => {
    if (!config) return config;
    if (!config.__monitorInitiator) config.__monitorInitiator = captureFrames(2);
    return config;
  };

  const proxy = new Proxy(instance, {
    apply(target, thisArg, args: unknown[]) {
      const [config] = args as [ConfigWithInitiator];
      return Reflect.apply(
        target as unknown as AnyMethod,
        thisArg,
        [attach(config)],
      );
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      if (prop === "request") {
        return (config: ConfigWithInitiator) =>
          (value as AnyMethod).call(target, attach(config));
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
