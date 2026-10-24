/**
 * Blix — HTTP capture entry point.
 *
 * Registers axios interceptors that feed the monitor store with plaintext
 * request/response data. Call once at module-init time, **after** your app's
 * own interceptors are registered:
 *
 * - axios runs request interceptors in reverse registration order (its
 *   default, `transitional.legacyInterceptorReqResOrdering: true`), so Blix's
 *   runs **first** — before any encryption — and sees the plaintext body;
 * - axios runs response interceptors in registration order, so Blix's runs
 *   **last** — after any decryption — and sees the decrypted body.
 *
 * Running first on the way out has a cost: the headers the host's interceptors
 * add — auth, tracing, signing — do not exist yet, and neither does axios's own
 * `Content-Type`. So request headers are captured twice: a snapshot when the
 * request starts, replaced at settle by a re-read of the config axios settled
 * with. See `settledRequestSide`.
 *
 * Typed structurally rather than against axios: axios is an optional peer, and
 * an app that only uses `fetch` must be able to type-check Blix without it.
 *
 * No-op when `process.env.NODE_ENV !== "development"`.
 */

import { readAuthorization } from "./monitorAuth";
import { linkToRequest } from "./errorOrigin";
import { asContext, captureError, isCapturedError, type CapturedError } from "./monitorError";
import { configureDbName, MONITOR_ENABLED, now } from "./monitorConfig";
import { getOwner, type CaptureOwner } from "./monitorContext";
import { flattenCapturedHeaders } from "./monitorSerialize";
import { stampAxiosFetchOptions, stampMonitorId } from "./monitorStamp";
import { expectAxiosTransport, releaseAxiosTransport } from "./monitorTransport";
import type { InitiatorFrame, MonitorEntry } from "./monitorTypes";
import {
  estimateBytes,
  networkMonitor,
  serializeBody,
  serializeHeaders,
} from "./networkMonitor";
import { startResourceTiming } from "./resourceTiming";

/**
 * The part of an axios interceptor manager Blix uses.
 *
 * The callbacks are typed `any`, and have to be: axios types them against its
 * own config and response types, and a callback's parameter is checked
 * contravariantly — `unknown` there would reject a real axios instance. `use`
 * and `eject` themselves use method syntax, whose parameters are checked
 * bivariantly, which is what lets `AxiosInterceptorManager<V>` satisfy this
 * for any `V`.
 */
interface InterceptorManagerLike {
  use(
    onFulfilled?: ((value: any) => any) | null,
    onRejected?: ((error: any) => any) | null,
    options?: { synchronous?: boolean; runWhen?: ((config: any) => boolean) | null },
  ): number;
  eject(id: number): void;
}

/**
 * What `attachHttpMonitor` needs from an axios instance: `interceptors`, and
 * nothing else. Structural, like `HttpClientLike` — Blix does not import
 * axios's types, so a fetch-only app never needs axios installed to type-check
 * against Blix, and a real `AxiosInstance` still passes with no cast.
 */
interface HttpMonitorTarget {
  interceptors: {
    request: InterceptorManagerLike;
    response: InterceptorManagerLike;
  };
  /** axios's own URL builder — see `urlOf`. */
  getUri?(config?: any): string;
}

/** The query or mutation that owns the entry `id`, as an owner. */
function ownerOfEntry(id: string | undefined): CaptureOwner | undefined {
  const entry = id ? networkMonitor.getById(id) : undefined;
  if (!entry?.ownerId || (entry.initiatorKind !== "query" && entry.initiatorKind !== "mutation")) return undefined;
  return { id: entry.ownerId, kind: entry.initiatorKind, label: "" };
}

/**
 * The request's URL with the query string axios will send.
 *
 * axios builds the query from `params` in its adapter, after every
 * interceptor has run, so `config.url` alone was missing it — the entry read
 * `/orders` for a request that went out as `/orders?page=2`. `getUri` is the
 * builder the adapter uses, on the same config, with the same
 * `paramsSerializer`; only its query string is taken, so `url` stays as the
 * app wrote it.
 */
function urlOf(instance: HttpMonitorTarget, config: MonitoredConfig): string {
  const url = config.url ?? "";
  if (config.params === undefined || config.params === null) return url;
  if (typeof instance.getUri !== "function") return url;
  try {
    const built = instance.getUri(config);
    const query = built.indexOf("?");
    if (query < 0) return url;
    const own = url.search(/[?#]/);
    return (own < 0 ? url : url.slice(0, own)) + built.slice(query);
  } catch {
    return url;
  }
}

/** The fields of an axios request config Blix reads or writes. */
type MonitoredConfig = {
  method?: string;
  url?: string;
  baseURL?: string;
  data?: unknown;
  headers?: unknown;
  params?: unknown;
  /** axios's basic-auth option — see `settledRequestSide`. */
  auth?: unknown;
  /** axios's own timeout, in ms; `0` or absent means none. */
  timeout?: unknown;
  transitional?: { legacyInterceptorReqResOrdering?: unknown };
  fetchOptions?: unknown;
  skipEncryption?: boolean;
  __monitorId?: string;
  __monitorReplayOf?: string;
  __monitorInitiator?: InitiatorFrame[];
};

type MonitoredResponse = {
  config?: unknown;
  status?: number;
  statusText?: unknown;
  data?: unknown;
  headers?: unknown;
};

type MonitoredError = {
  config?: unknown;
  response?: MonitoredResponse;
  message?: string;
  /** Set by axios's `CanceledError` — see the error handler. */
  __CANCEL__?: unknown;
};

/**
 * Interceptor sets already carrying Blix.
 *
 * Keyed on `interceptors` rather than on the instance: `withInitiatorCapture`
 * returns a Proxy whose `interceptors` *is* the underlying instance's, so
 * attaching to the wrapped and the unwrapped instance is one install, not two.
 */
const attached = new WeakSet<object>();

/**
 * The config carried by whatever a response or error handler received, or
 * `undefined`.
 *
 * Host interceptors registered before Blix hand it whatever they returned, and
 * that is routinely not a response: `(r) => r.data`, a normalised domain error,
 * `undefined`. Reading `.config` straight off that value used to throw inside
 * the response interceptor — which rejected every request on the instance.
 * Callers still wrap this in `try`: a getter on a host object can throw too.
 */
function configOf(value: unknown): MonitoredConfig | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const config = (value as { config?: unknown }).config;
  return config !== null && typeof config === "object"
    ? (config as MonitoredConfig)
    : undefined;
}

/** The entry id Blix stamped on `config`, if it is a config Blix saw. */
function monitorIdOf(config: MonitoredConfig | undefined): string | undefined {
  const id = config?.__monitorId;
  return typeof id === "string" && id !== "" ? id : undefined;
}

/**
 * The config of `value`, but only when it is one Blix stamped.
 *
 * A `config` key proves nothing by itself. Once a host interceptor unwraps
 * (`r => r.data`) or replaces an error, what reaches the tail is the host's
 * own object — a response body, a domain error — and those are ordinary data
 * that can perfectly well have a `config` of their own. Taking that for the
 * request config stored `body.data` as the response and `body.status` as the
 * status. Only the stamp says "this is the request Blix started".
 */
function stampedConfigOf(value: unknown): MonitoredConfig | undefined {
  const config = configOf(value);
  return monitorIdOf(config) !== undefined ? config : undefined;
}

function isAuthorizationHeader(name: string): boolean {
  return name.toLowerCase() === "authorization";
}

/**
 * The request's headers — and what its `Authorization` claims — re-read from
 * the config axios settled with.
 *
 * At settle `config.headers` is the same `AxiosHeaders` object Blix read when
 * the request started: axios builds it once, before any interceptor runs, and
 * every later interceptor writes into it. So it now carries what the host's
 * interceptors added and the `Content-Type` axios sets itself, and it is the
 * truth about the request in a way the request-time snapshot cannot be. The
 * claims are decoded from it for the same reason, and the raw value kept while
 * masking is off is replaced from it too — which means masking follows its
 * state *at settle*.
 *
 * **Except `Authorization` when `config.auth` is set.** The adapter turns
 * `auth` into `Authorization: Basic …` on its own copy of the config, so what
 * `config.headers` says here was never sent — a confident wrong answer, worse
 * than an incomplete one. That header keeps its request-time value, claims and
 * raw value; every other header still comes from settle.
 *
 * Headers the adapter adds that way — the XSRF header too — and headers the
 * browser manages itself are out of reach either way.
 *
 * The body is deliberately not re-read: by settle `config.data` is whatever the
 * host's encryption produced, serialized, and the plaintext captured at request
 * time is the point.
 */
function settledRequestSide(id: string, config: MonitoredConfig): Partial<MonitorEntry> {
  if (!config.headers || typeof config.headers !== "object") return {};
  const headers = flattenCapturedHeaders(config.headers);

  if (config.auth) {
    const others: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (!isAuthorizationHeader(name)) others[name] = value;
    }
    const requestHeaders = serializeHeaders(others);
    // Already masked — it is the stored request-time value.
    const early = networkMonitor.getById(id)?.requestHeaders ?? {};
    for (const [name, value] of Object.entries(early)) {
      if (isAuthorizationHeader(name)) requestHeaders[name] = value;
    }
    return { requestHeaders };
  }

  const auth = readAuthorization(headers, "axios-settle");
  networkMonitor.setAuthorization(id, auth.raw);
  // `authClaims` is written even when undefined: a settled request whose
  // Authorization is gone, or is no longer a JWT, has no claims.
  return { requestHeaders: serializeHeaders(headers), authClaims: auth.claims };
}

/* ───────────────────────── settling a request ─────────────────────────── */

/** The timeout a request runs under, in ms — axios's `0` means none. */
function timeoutOf(config: MonitoredConfig | undefined): number | undefined {
  const timeout = config?.timeout;
  return typeof timeout === "number" && timeout > 0 ? timeout : undefined;
}

/** An axios failure as Blix stores it — see `monitorError.ts`. */
function describeAxiosError(
  error: MonitoredError,
  config: MonitoredConfig | undefined,
): CapturedError {
  const response = error.response;
  return captureError(error, {
    hasResponse: response !== undefined && response !== null,
    status: response?.status,
    statusText: typeof response?.statusText === "string" ? response.statusText : undefined,
    response: response?.data,
    timeoutMs: timeoutOf(config),
  });
}

/** How long past its own timeout a request is given before Blix stops
 * believing an answer is coming. Generous: the timeout clock starts when the
 * request is dispatched, and async interceptors run before that. */
const WATCHDOG_GRACE_MS = 3000;

/**
 * The requests one instance has in the air.
 *
 * Three jobs, all in service of one rule — **a request that has ended must
 * not read `pending`**:
 *
 * 1. *Identity without a config.* A host interceptor may hand the next one
 *    `r.data`, or reject with an error of its own; neither carries the config
 *    Blix stamped. The objects the wire tap saw are remembered weakly, so the
 *    tail can still recognise the same response, body or error.
 * 2. *The watchdog.* A request with a timeout that is still pending well past
 *    it has ended somewhere Blix could not see. It is settled as a timeout
 *    that says so, and corrected if an answer does arrive after all.
 * 3. *The unclaimed failure.* An error with no config that nothing recognises
 *    came from before dispatch — an interceptor threw. With exactly one
 *    request in the air it can only be that one.
 */
class Flight {
  private readonly seen = new WeakMap<object, string>();
  private readonly wireErrors = new WeakSet<object>();
  /** Errors a request interceptor threw, already settled as `setup`. */
  private readonly setupErrors = new WeakSet<object>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Started and not yet seen on the wire or settled. */
  private readonly waiting = new Set<string>();

  begin(id: string, timeoutMs: number | undefined): void {
    this.waiting.add(id);
    if (!timeoutMs) return;
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.waiting.delete(id);
        try {
          if (networkMonitor.getById(id)?.state !== "pending") return;
          const error: CapturedError = {
            kind: "timeout",
            name: "BlixWatchdog",
            message:
              `No response or error reached Blix within ${timeoutMs} ms plus a ` +
              `${WATCHDOG_GRACE_MS} ms grace. The request ended somewhere Blix ` +
              "could not observe — most often an interceptor that swallowed the " +
              "failure or never resolved.",
            timeoutMs,
          };
          networkMonitor.update(id, { state: "error", endTime: now(), error });
        } catch {
          /* capture must never throw from a timer */
        }
      }, timeoutMs + WATCHDOG_GRACE_MS),
    );
  }

  /** Remembers `value` as belonging to `id`. Objects only: a primitive body
   * has no identity to recognise later. */
  remember(id: string, ...values: unknown[]): void {
    for (const value of values) {
      if (value !== null && typeof value === "object") this.seen.set(value, id);
    }
  }

  rememberError(id: string, error: unknown): void {
    if (error !== null && typeof error === "object") {
      this.wireErrors.add(error);
      this.remember(id, error, (error as MonitoredError).response);
    }
  }

  isWireError(error: unknown): boolean {
    return error !== null && typeof error === "object" && this.wireErrors.has(error);
  }

  /** The entry a config-less value belongs to: the value itself, or what it
   * wraps — a host's error usually keeps the original on `cause` or
   * `response`. */
  idOf(value: unknown): string | undefined {
    if (value === null || typeof value !== "object") return undefined;
    const direct = this.seen.get(value);
    if (direct) return direct;
    for (const key of ["response", "cause", "originalError", "error", "data"]) {
      let inner: unknown;
      try {
        inner = (value as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (inner !== null && typeof inner === "object") {
        const id = this.seen.get(inner);
        if (id) return id;
      }
    }
    return undefined;
  }

  /** The request reached the wire: it is no longer a candidate for an
   * unclaimed pre-dispatch failure, and no transport is still to carry it.
   * Released here and not only at settle: a request the app retries is never
   * settled by the tail — the retry is — and its hand-off, left behind, took
   * the next plain XHR to the same path for itself. */
  onWire(id: string): void {
    this.waiting.delete(id);
    releaseAxiosTransport(id);
  }

  /** Request id → the request sent again under its config (a retry). */
  private readonly retries = new Map<string, string>();

  /** `next` was sent with the config `previous` went out with. */
  retriedAs(previous: string, next: string): void {
    this.retries.set(previous, next);
    if (this.retries.size > 500) this.retries.delete(this.retries.keys().next().value as string);
  }

  /** The last request in `id`'s chain of retries — `id` itself if none. */
  latest(id: string): string {
    let current = id;
    for (let hops = 0; hops < 20; hops += 1) {
      const next = this.retries.get(current);
      if (next === undefined) return current;
      current = next;
    }
    return current;
  }

  settled(id: string): void {
    this.waiting.delete(id);
    releaseAxiosTransport(id);
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /**
   * A request interceptor of the host's threw or rejected while handling
   * `config`: the request never left. Settled as `setup` at once, on the
   * request whose config it was holding — no counting of what else is in the
   * air, and no waiting for the watchdog.
   */
  setupFailed(config: MonitoredConfig | undefined, error: unknown): void {
    const id = monitorIdOf(config);
    if (!id || networkMonitor.getById(id)?.state !== "pending") return;
    if (error !== null && typeof error === "object") this.setupErrors.add(error);
    this.remember(id, error);
    linkToRequest(error, id);
    // An interceptor that cancels on purpose (`CanceledError`) aborted it.
    const aborted =
      error !== null && typeof error === "object" && !!(error as MonitoredError).__CANCEL__;
    networkMonitor.update(id, {
      state: aborted ? "aborted" : "error",
      endTime: now(),
      error: captureError(error, { kind: aborted ? "aborted" : "setup" }),
    });
    this.settled(id);
  }

  isSetupError(error: unknown): boolean {
    return error !== null && typeof error === "object" && this.setupErrors.has(error);
  }

  /** A failure nothing could attribute. Settles the one waiting request, if
   * there is exactly one; with several in the air it is a guess, and a wrong
   * answer on the wrong row is worse than a row the watchdog settles later. */
  unclaimed(error: unknown): void {
    if (this.waiting.size !== 1) return;
    const [id] = this.waiting;
    if (networkMonitor.getById(id)?.state !== "pending") return;
    networkMonitor.update(id, {
      state: "error",
      endTime: now(),
      error: captureError(error, { kind: "setup" }),
    });
    this.settled(id);
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.waiting.clear();
  }
}

/* ─────────────────────────────── wire tap ─────────────────────────────── */

const WIRE_TAP = Symbol.for("blix.wireTap");
const REQUEST_TAP = Symbol.for("blix.requestTap");

/**
 * One registered interceptor, as axios's `InterceptorManager` stores it.
 *
 * Internal to axios, and unchanged in shape since 0.x: `handlers` is an array
 * of these (or `null` once ejected), indexed by the id `use()` returned.
 * Everything that touches it checks the shape first and does nothing when it
 * does not match — a future axios that stores them differently loses the wire
 * tap and keeps the tail and the watchdog.
 */
interface StoredHandler {
  fulfilled?: ((value: any) => any) | null;
  rejected?: ((error: any) => any) | null;
  [WIRE_TAP]?: { fulfilled: StoredHandler["fulfilled"]; rejected: StoredHandler["rejected"] };
  [REQUEST_TAP]?: StoredHandler["fulfilled"];
}

function handlersOf(manager: InterceptorManagerLike): (StoredHandler | null)[] | undefined {
  const handlers = (manager as unknown as { handlers?: unknown }).handlers;
  return Array.isArray(handlers) ? (handlers as (StoredHandler | null)[]) : undefined;
}

function handlerAt(manager: InterceptorManagerLike, id: number): StoredHandler | undefined {
  const handler = handlersOf(manager)?.[id];
  return handler !== null && typeof handler === "object" ? handler : undefined;
}

/**
 * Hooks the *first* response interceptor, so Blix sees what the adapter
 * produced before any of the app's interceptors can change it.
 *
 * Blix registers last on purpose — that is where the decrypted body is. But
 * last is also downstream of everything the app does to a response, and an app
 * that normalises its errors (`Promise.reject(new ApiError(…))`), unwraps its
 * responses (`r => r.data`), or retries a 401 under the same config leaves the
 * tail nothing it can tie back to a request. Those entries read `pending` for
 * the rest of the session, after the request had long since failed.
 *
 * The first handler is wrapped in place rather than a new one inserted ahead
 * of it: `eject(id)` is an array index, and shifting the array would make
 * every id the app is holding eject its neighbour.
 */
function installWireTap(
  managers: HttpMonitorTarget["interceptors"],
  own: StoredHandler | undefined,
  flight: Flight,
): void {
  try {
    const first = handlersOf(managers.response)?.find(
      (handler): handler is StoredHandler => handler !== null && typeof handler === "object",
    );
    // Nothing ahead of Blix: its own handler is the wire.
    if (!first || first === own || first[WIRE_TAP]) return;

    const { fulfilled, rejected } = first;
    first[WIRE_TAP] = { fulfilled, rejected };

    first.fulfilled = function (this: unknown, response: MonitoredResponse) {
      try {
        const config = configOf(response);
        const id = monitorIdOf(config);
        if (config && id) {
          flight.onWire(id);
          flight.remember(id, response, response.data);
          networkMonitor.update(id, {
            ...settledRequestSide(id, config),
            state: "success",
            status: response.status,
            endTime: now(),
            responsePayload: response.data,
            responseHeaders: serializeHeaders(response.headers),
            sizeBytes: estimateBytes(response.data),
          });
        }
      } catch {
        /* capture must never break a request */
      }
      return typeof fulfilled === "function" ? fulfilled.call(this, response) : response;
    };

    first.rejected = function (this: unknown, error: MonitoredError) {
      let id: string | undefined;
      try {
        const config = configOf(error);
        id = monitorIdOf(config);
        if (config && id) {
          flight.onWire(id);
          flight.rememberError(id, error);
          linkToRequest(error, id);
          const captured = describeAxiosError(error, config);
          networkMonitor.update(id, {
            ...settledRequestSide(id, config),
            state: captured.kind === "aborted" ? "aborted" : "error",
            status: error.response?.status,
            endTime: now(),
            error: captured,
            responseHeaders: serializeHeaders(error.response?.headers),
            sizeBytes: estimateBytes(captured.response ?? captured.message),
          });
        } else {
          // No config this early means it never reached the adapter: a request
          // interceptor threw. Normally settled already, by the request tap;
          // otherwise claimed here, while it is still the error that was
          // thrown and not what the app's handlers turn it into.
          id = flight.idOf(error);
          if (!id) flight.unclaimed(error);
        }
      } catch {
        /* capture must never break a request */
      }
      if (typeof rejected !== "function") return Promise.reject(error);
      if (!id) return rejected.call(this, error);
      return linkReplacement(() => rejected.call(this, error), id, flight);
    };
  } catch {
    /* no tap: the tail and the watchdog still settle what they can */
  }
}

/**
 * Runs the host's error handler for request `id`, and records whatever it
 * rejects or throws with against that request — the app's own error, which
 * carries nothing that leads back to it. See `errorOrigin.ts`.
 *
 * The outcome is handed on unchanged: the same value, the same rejection
 * reason, a synchronous throw still thrown. A handler that recovers (resolves)
 * is left alone.
 */
function linkReplacement(run: () => unknown, id: string, flight: Flight): unknown {
  const link = (replaced: unknown) => {
    try {
      // A handler that retried (`api(error.config)`) rejects with what the
      // retry ended in: that failure is the retry's, not the one it replaced.
      const target = flight.latest(id);
      linkToRequest(replaced, target);
      // So the tail recognises it too, and records it as `handledAs`.
      flight.remember(target, replaced);
    } catch {
      /* capture must never break a request */
    }
  };
  let result: unknown;
  try {
    result = run();
  } catch (thrown) {
    link(thrown);
    throw thrown;
  }
  if (result !== null && typeof result === "object" && typeof (result as Promise<unknown>).then === "function") {
    return (result as Promise<unknown>).then(undefined, (replaced: unknown) => {
      link(replaced);
      throw replaced;
    });
  }
  return result;
}

/**
 * Wraps a host request interceptor so that, if it throws or rejects, the
 * request whose config it was handling is settled as `setup` there and then.
 *
 * Without it, that error reaches the response chain with no config, and with
 * another request in the air there is no telling which one it belonged to: the
 * failed request stayed `pending` until the watchdog called it a timeout. Here
 * the config is still in hand, so nothing has to be told apart.
 *
 * Wrapped in place, like the wire tap, so `eject` ids stay what they were. The
 * outcome is handed on unchanged.
 */
function tapRequestHandler(
  handler: StoredHandler | undefined,
  own: StoredHandler | undefined,
  flight: Flight,
): void {
  if (!handler || handler === own || handler[REQUEST_TAP] !== undefined) return;
  const fulfilled = handler.fulfilled;
  if (typeof fulfilled !== "function") return;
  handler[REQUEST_TAP] = fulfilled;
  handler.fulfilled = function (this: unknown, config: MonitoredConfig) {
    const fail = (error: unknown) => {
      try {
        flight.setupFailed(config, error);
      } catch {
        /* capture must never break a request */
      }
    };
    let result: unknown;
    try {
      result = fulfilled.call(this, config);
    } catch (error) {
      fail(error);
      throw error;
    }
    if (result !== null && typeof result === "object" && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(undefined, (error: unknown) => {
        fail(error);
        throw error;
      });
    }
    return result;
  };
}

/**
 * Taps every host request interceptor: the ones there now, and — by hooking
 * `use` on this manager — every one registered later, at registration, so not
 * even the first request through a late one goes untapped. Returns the undo.
 */
function installRequestTaps(
  manager: InterceptorManagerLike,
  own: StoredHandler | undefined,
  flight: Flight,
): () => void {
  try {
    for (const handler of handlersOf(manager) ?? []) {
      if (handler !== null && typeof handler === "object") tapRequestHandler(handler, own, flight);
    }
  } catch {
    /* untapped: the unclaimed failure and the watchdog remain */
  }
  const hadOwnUse = Object.prototype.hasOwnProperty.call(manager, "use");
  const use = manager.use;
  try {
    manager.use = function (
      this: InterceptorManagerLike,
      ...args: Parameters<InterceptorManagerLike["use"]>
    ) {
      const id = use.apply(this, args);
      try {
        tapRequestHandler(handlerAt(manager, id), own, flight);
      } catch {
        /* capture must never break a registration */
      }
      return id;
    };
  } catch {
    /* a sealed manager: later interceptors go untapped */
  }
  return () => {
    try {
      if (hadOwnUse) manager.use = use;
      else delete (manager as Partial<InterceptorManagerLike>).use;
      for (const handler of handlersOf(manager) ?? []) {
        const original = handler?.[REQUEST_TAP];
        if (!handler || !original) continue;
        handler.fulfilled = original;
        delete handler[REQUEST_TAP];
      }
    } catch {
      /* nothing to restore */
    }
  };
}

/** Whether a host handler ahead of Blix currently carries the wire tap. */
function hasWireTap(managers: HttpMonitorTarget["interceptors"]): boolean {
  try {
    return (handlersOf(managers.response) ?? []).some((handler) => !!handler?.[WIRE_TAP]);
  } catch {
    return false;
  }
}

function removeWireTap(managers: HttpMonitorTarget["interceptors"]): void {
  try {
    for (const handler of handlersOf(managers.response) ?? []) {
      const original = handler?.[WIRE_TAP];
      if (!handler || !original) continue;
      handler.fulfilled = original.fulfilled;
      handler.rejected = original.rejected;
      delete handler[WIRE_TAP];
    }
  } catch {
    /* nothing to restore */
  }
}

/** Warned at most once per page: it describes how an instance is configured,
 * not anything about one request. */
let warnedInterceptorOrder = false;

/**
 * Says so, once, when the host has switched axios to running request
 * interceptors in registration order — which puts Blix's last.
 *
 * Only an explicit `false` counts, and that is exact rather than a guess:
 * axios merges `transitional` key by key over its defaults, so the value on the
 * config is the one it built the interceptor chain from, and an axios version
 * that predates the flag reports `undefined` and keeps the reverse order.
 */
function warnIfInterceptorOrderFlipped(config: MonitoredConfig): void {
  if (warnedInterceptorOrder || process.env.NODE_ENV !== "development") return;
  if (config.transitional?.legacyInterceptorReqResOrdering !== false) return;
  warnedInterceptorOrder = true;
  console.warn(
    "[blix] This axios instance sets transitional.legacyInterceptorReqResOrdering: " +
      "false, so request interceptors run in registration order and Blix's — " +
      "registered after yours — now runs last.\n" +
      "The Payload tab shows the request body after your interceptors have " +
      "transformed it (ciphertext, if you encrypt), and captureEncrypted calls " +
      "made from your request interceptors are ignored. See attachHttpMonitor " +
      "in the README.",
  );
}

/**
 * Attaches HTTP-capture interceptors to an axios instance.
 *
 * Call this at module init time (e.g. at the bottom of your `axios.ts`),
 * after registering any encryption interceptors so that the monitor sees the
 * plaintext body first.
 *
 * Idempotent per instance, and returns a disposer that ejects both
 * interceptors. A second install used to register a second pair: every request
 * then started two entries, both response interceptors settled the second, and
 * the first stayed pending for the rest of the session.
 */
export function attachHttpMonitor(
  instance: HttpMonitorTarget,
  options?: { dbName?: string },
): () => void {
  if (!MONITOR_ENABLED) return () => {};

  const managers = instance.interceptors;
  if (attached.has(managers)) return () => {};
  attached.add(managers);

  if (options?.dbName) configureDbName(options.dbName);
  startResourceTiming();

  const flight = new Flight();
  // Filled in once Blix's own response interceptor is registered, below.
  let ownResponse: StoredHandler | undefined;
  /** The query or mutation each config was created under — see `runWhen`. */
  const owners = new WeakMap<object, CaptureOwner>();

  const requestId = managers.request.use((config: MonitoredConfig) => {
    if (networkMonitor.isPaused) return config;
    try {
      warnIfInterceptorOrderFlipped(config);
      // Re-checked per request, because the handler it is hung on can be
      // ejected and a host can register its first interceptor after Blix.
      installWireTap(managers, ownResponse, flight);

      const id = networkMonitor.nextId();
      // A stamp already there means axios built this config for an earlier
      // request: the app is sending that request again (a 401 refresh-retry,
      // `api(error.config)`). Recorded, so what the retry ends in is the
      // retry's, and so it keeps the earlier request's owner.
      const previous = monitorIdOf(config);
      if (previous) flight.retriedAs(previous, id);
      config.__monitorId = id;
      // Second, invisible stamp for `captureEncrypted`. Kept separate from
      // `__monitorId` rather than replacing it: this one has to survive being
      // read by the host's own interceptors without ever showing up in a
      // spread, a log line, or anything serialized towards the wire.
      stampMonitorId(config, id);
      // Third, for `attachFetchMonitor`. When this instance runs on axios's
      // fetch adapter, the same request reaches `globalThis.fetch` next; this
      // is how the fetch wrapper knows it was already captured here, and steps
      // aside. See `monitorStamp.ts` for why the axios entry wins.
      stampAxiosFetchOptions(config, id);

      const hadFormData =
        typeof FormData !== "undefined" && config.data instanceof FormData;
      const requestPayload = serializeBody(config.data);
      const owner = owners.get(config) ?? ownerOfEntry(previous);
      // The request-time snapshot: all a request that never settles will ever
      // show. Flattened once and unmasked, so `Authorization` can be read before
      // `serializeHeaders` masks it for storage.
      const headers = flattenCapturedHeaders(config.headers);
      const auth = readAuthorization(headers, "axios-request");

      networkMonitor.start(
        {
          id,
          client: "axios",
          method: (config.method ?? "post").toUpperCase(),
          url: urlOf(instance, config),
          baseURL: config.baseURL,
          at: Date.now(),
          startTime: now(),
          requestPayload,
          requestHeaders: serializeHeaders(headers),
          sizeBytes: estimateBytes(requestPayload),
          skipEncryption: config.skipEncryption === true,
          hadFormData,
          replayOf: config.__monitorReplayOf,
          initiator: config.__monitorInitiator,
          ownerId: owner?.id,
          initiatorKind: owner?.kind,
          ...(auth.claims ? { authClaims: auth.claims } : {}),
        },
        { authorization: auth.raw },
      );
      if (owner) networkMonitor.linkChild(owner.id, id);
      flight.begin(id, timeoutOf(config));
      // So `attachXhrMonitor`, if installed, knows the XHR axios is about to
      // open is this request and does not log it a second time.
      expectAxiosTransport(id, config.method ?? "post", config.url ?? "", config.baseURL);
    } catch {
      /* capture must never break a request */
    }
    return config;
  }, undefined, {
    // The one moment Blix is inside the caller's call: axios asks `runWhen`
    // while it builds the interceptor chain, synchronously in `request()`.
    // The interceptor above runs a microtask later, after the `queryFn` that
    // made the call has returned — too late to read who made it.
    runWhen(config: unknown) {
      try {
        const owner = getOwner();
        if (owner && config !== null && typeof config === "object") owners.set(config, owner);
      } catch {
        /* capture must never break a request */
      }
      return true;
    },
  });
  const removeRequestTaps = installRequestTaps(
    managers.request,
    handlerAt(managers.request, requestId),
    flight,
  );

  // The tail: last in the response chain, so it sees what the caller will —
  // the decrypted body, or the error the app turned the failure into. By the
  // time it runs the wire tap has normally settled the entry already; this
  // upgrades the payload, and is the only settle there is when the tap could
  // not be installed.
  //
  // Both handlers hand on exactly what they received, and everything they read
  // happens inside `try`.
  const responseId = managers.response.use(
    (response: MonitoredResponse) => {
      try {
        const config = stampedConfigOf(response);
        const id = monitorIdOf(config) ?? flight.idOf(response);
        if (id) {
          // A host interceptor that returns `r.data` hands the body itself
          // down the chain; it is still the body. Decided by Blix's stamp and
          // nothing else — see `stampedConfigOf`.
          const unwrapped = !config;
          const payload = unwrapped ? response : response.data;
          const known = networkMonitor.getById(id);
          networkMonitor.update(id, {
            ...(config ? settledRequestSide(id, config) : {}),
            state: "success",
            ...(unwrapped ? {} : { status: response.status }),
            endTime: now(),
            responsePayload: payload,
            ...(unwrapped
              ? {}
              : { responseHeaders: serializeHeaders(response.headers) }),
            sizeBytes: estimateBytes(payload),
            // A failure the watchdog guessed at leaves no error behind once
            // the real answer arrives.
            ...(known?.error !== undefined ? { error: undefined } : {}),
          });
          flight.settled(id);
        }
      } catch {
        /* capture must never break a request */
      }
      return response;
    },
    (error: MonitoredError) => {
      // Settled when it was thrown, by the request tap.
      if (flight.isSetupError(error)) return Promise.reject(error);
      try {
        const config = stampedConfigOf(error);
        const id = monitorIdOf(config) ?? flight.idOf(error);
        if (id) {
          // What the caller is about to receive, recorded against its request.
          linkToRequest(error, id);
          const known = networkMonitor.getById(id);
          const wire = isCapturedError(known?.error) ? known.error : undefined;
          // The app's own error, standing where the client's used to be: the
          // wire tap recorded the real failure, and this is what the caller
          // was handed instead.
          const replaced = wire !== undefined && !config && !flight.isWireError(error);
          let captured: CapturedError;
          if (replaced) {
            captured = { ...wire, handledAs: asContext(captureError(error, { kind: "unknown" })) };
          } else {
            captured = describeAxiosError(error, config);
          }
          networkMonitor.update(id, {
            ...(config ? settledRequestSide(id, config) : {}),
            state: captured.kind === "aborted" ? "aborted" : "error",
            ...(captured.status !== undefined ? { status: captured.status } : {}),
            endTime: now(),
            error: captured,
            ...(error.response
              ? { responseHeaders: serializeHeaders(error.response.headers) }
              : {}),
            sizeBytes: estimateBytes(captured.response ?? captured.message),
          });
          flight.settled(id);
        } else if (!hasWireTap(managers)) {
          // Only when this handler *is* the wire — nothing of the host's ahead
          // of it. With a tap installed, a failure that never reached the
          // adapter was already claimed there, as the error that was thrown;
          // what arrives here unrecognised is then the host's replacement for
          // a failure the tap has settled, and handing it to "the one request
          // still waiting" marked an unrelated in-flight request as failed.
          flight.unclaimed(error);
        }
      } catch {
        /* capture must never break a request */
      }
      return Promise.reject(error);
    },
  );
  ownResponse = handlerAt(managers.response, responseId);
  installWireTap(managers, ownResponse, flight);

  return () => {
    managers.request.eject(requestId);
    managers.response.eject(responseId);
    removeWireTap(managers);
    removeRequestTaps();
    flight.dispose();
    // Unmark, or the guard above turns a dispose-then-reattach — Strict Mode,
    // HMR — into a silent permanent no-op. Same reasoning as `tapQueryClient`.
    attached.delete(managers);
  };
}
