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
 * `beginMonitor` to read.
 *
 * The whole module is behind a statically-foldable `NODE_ENV` check at its call
 * site, so it is dead-code-eliminated from production builds.
 */

import type { AxiosInstance, AxiosRequestConfig } from "axios";
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

/** Parses, filters and trims a raw `Error.stack` into displayable frames. */
export function parseStack(stack: string | undefined): InitiatorFrame[] {
  if (!stack) return [];
  const out: InitiatorFrame[] = [];

  for (const line of stack.split("\n").slice(1)) {
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

function captureFrames(): InitiatorFrame[] | undefined {
  if (!captureEnabled) return undefined;
  // Next's dev server installs a source-map-aware `prepareStackTrace` and
  // raises the frame limit; capping it is by far the biggest lever on the cost
  // of this call.
  const previousLimit = Error.stackTraceLimit;
  try {
    Error.stackTraceLimit = 24;
    const stack = new Error().stack;
    // Read `.stack` now and drop the Error: retaining the Error would retain
    // its entire closure scope, and 200 buffered entries holding one each is a
    // real leak.
    return parseStack(stack);
  } catch {
    return undefined;
  } finally {
    Error.stackTraceLimit = previousLimit;
  }
}

type ConfigWithInitiator = AxiosRequestConfig & {
  __monitorInitiator?: InitiatorFrame[];
};

/**
 * Wraps the axios instance so every call site records its own stack.
 *
 * Wraps the callable form (`apiClient(config)`), plus `request`, `get`, `post`,
 * `put`, `patch`, `delete` and `head`. Other entry points (`options`, the
 * `*Form` helpers) pass through unwrapped — requests made through them are
 * still captured, they just carry no initiator stack.
 */
export function withInitiatorCapture(instance: AxiosInstance): AxiosInstance {
  if (!MONITOR_ENABLED) return instance;

  const attach = <T extends ConfigWithInitiator | undefined>(config: T): T => {
    if (!config) return config;
    if (!config.__monitorInitiator) config.__monitorInitiator = captureFrames();
    return config;
  };

  const proxy = new Proxy(instance, {
    apply(target, thisArg, args: unknown[]) {
      const [config] = args as [ConfigWithInitiator];
      return Reflect.apply(
        target as unknown as (...a: unknown[]) => unknown,
        thisArg,
        [attach(config)],
      );
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      if (prop === "request") {
        return (config: ConfigWithInitiator) =>
          (value as typeof instance.request).call(target, attach(config));
      }
      if (prop === "post" || prop === "put" || prop === "patch") {
        return (url: string, data?: unknown, config?: ConfigWithInitiator) =>
          (value as typeof instance.post).call(
            target,
            url,
            data,
            attach(config ?? {}),
          );
      }
      if (prop === "get" || prop === "delete" || prop === "head") {
        return (url: string, config?: ConfigWithInitiator) =>
          (value as typeof instance.get).call(target, url, attach(config ?? {}));
      }

      return value.bind(target);
    },
  });

  return proxy as AxiosInstance;
}
