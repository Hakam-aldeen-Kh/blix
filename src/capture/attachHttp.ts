/**
 * Blix — HTTP capture entry point.
 *
 * Registers axios interceptors that feed the monitor store with plaintext
 * request/response data. Call once at module-init time, before your app's
 * encryption or auth interceptors, so this interceptor runs last in axios's
 * LIFO request stack and therefore sees the plaintext request body.
 *
 * Typed structurally rather than against axios: axios is an optional peer, and
 * an app that only uses `fetch` must be able to type-check Blix without it.
 *
 * No-op when `process.env.NODE_ENV !== "development"`.
 */

import { configureDbName, MONITOR_ENABLED, now } from "./monitorConfig";
import { getOwner } from "./monitorContext";
import { stampAxiosFetchOptions, stampMonitorId } from "./monitorStamp";
import type { InitiatorFrame } from "./monitorTypes";
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

      networkMonitor.start({
        id,
        client: "axios",
        method: (config.method ?? "post").toUpperCase(),
        url: config.url ?? "",
        baseURL: config.baseURL,
        at: Date.now(),
        startTime: now(),
        requestPayload,
        requestHeaders: serializeHeaders(config.headers),
        sizeBytes: estimateBytes(requestPayload),
        skipEncryption: config.skipEncryption === true,
        hadFormData,
        replayOf: config.__monitorReplayOf,
        initiator: config.__monitorInitiator,
        ownerId: owner?.id,
        initiatorKind: owner?.kind,
      });
      if (owner) networkMonitor.linkChild(owner.id, id);
    } catch {
      /* capture must never break a request */
    }
    return config;
  });

  const responseId = managers.response.use(
    (response: MonitoredResponse) => {
      const id = (response.config as MonitoredConfig).__monitorId;
      if (!id) return response;
      try {
        const payload = response.data;
        networkMonitor.update(id, {
          state: "success",
          status: response.status,
          endTime: now(),
          responsePayload: payload,
          responseHeaders: serializeHeaders(response.headers),
          sizeBytes: estimateBytes(payload),
        });
      } catch {
        /* noop */
      }
      return response;
    },
    (error: MonitoredError) => {
      const id = (error.config as MonitoredConfig | undefined)?.__monitorId;
      if (id) {
        try {
          const payload = error.response?.data ?? error.message;
          networkMonitor.update(id, {
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
        } catch {
          /* noop */
        }
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
