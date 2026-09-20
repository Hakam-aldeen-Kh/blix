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
import { configureDbName, MONITOR_ENABLED, now } from "./monitorConfig";
import { getOwner } from "./monitorContext";
import { flattenCapturedHeaders } from "./monitorSerialize";
import { stampAxiosFetchOptions, stampMonitorId } from "./monitorStamp";
import type { InitiatorFrame, MonitorEntry } from "./monitorTypes";
import {
  estimateBytes,
  networkMonitor,
  serializeBody,
  serializeHeaders,
} from "./networkMonitor";

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
}

/** The fields of an axios request config Blix reads or writes. */
type MonitoredConfig = {
  method?: string;
  url?: string;
  baseURL?: string;
  data?: unknown;
  headers?: unknown;
  /** axios's basic-auth option — see `settledRequestSide`. */
  auth?: unknown;
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

  const requestId = managers.request.use((config: MonitoredConfig) => {
    if (networkMonitor.isPaused) return config;
    try {
      warnIfInterceptorOrderFlipped(config);

      const id = networkMonitor.nextId();
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
      const owner = getOwner();
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
          url: config.url ?? "",
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
    } catch {
      /* capture must never break a request */
    }
    return config;
  });

  // Both handlers hand on exactly what they received, and everything they read
  // happens inside `try`. A value with no Blix config on it — an unwrapped
  // `r.data`, a normalised error — leaves the entry as it is: pending, rather
  // than settled by guesswork.
  const responseId = managers.response.use(
    (response: MonitoredResponse) => {
      try {
        const config = configOf(response);
        const id = monitorIdOf(config);
        if (config && id) {
          const payload = response.data;
          networkMonitor.update(id, {
            ...settledRequestSide(id, config),
            state: "success",
            status: response.status,
            endTime: now(),
            responsePayload: payload,
            responseHeaders: serializeHeaders(response.headers),
            sizeBytes: estimateBytes(payload),
          });
        }
      } catch {
        /* capture must never break a request */
      }
      return response;
    },
    (error: MonitoredError) => {
      try {
        const config = configOf(error);
        const id = monitorIdOf(config);
        if (config && id) {
          const payload = error.response?.data ?? error.message;
          networkMonitor.update(id, {
            ...settledRequestSide(id, config),
            // axios's own `isCancel` is exactly `!!value.__CANCEL__`, set by
            // `CanceledError` for `AbortController` and `CancelToken`
            // cancellation alike — duck-typed because Blix never imports axios
            // at runtime. A timeout is not a cancel, and stays "error".
            state: error.__CANCEL__ ? "aborted" : "error",
            status: error.response?.status,
            endTime: now(),
            error: payload,
            responseHeaders: serializeHeaders(error.response?.headers),
            sizeBytes: estimateBytes(payload),
          });
        }
      } catch {
        /* capture must never break a request */
      }
      return Promise.reject(error);
    },
  );

  return () => {
    managers.request.eject(requestId);
    managers.response.eject(responseId);
    // Unmark, or the guard above turns a dispose-then-reattach — Strict Mode,
    // HMR — into a silent permanent no-op. Same reasoning as `tapQueryClient`.
    attached.delete(managers);
  };
}
