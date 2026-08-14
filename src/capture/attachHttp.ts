/**
 * Blix — HTTP capture entry point.
 *
 * Registers axios interceptors that feed the monitor store with plaintext
 * request/response data. Call once at module-init time, before your app's
 * encryption or auth interceptors, so this interceptor runs last in axios's
 * LIFO request stack and therefore sees the plaintext request body.
 *
 * No-op when `process.env.NODE_ENV !== "development"`.
 */

import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { configureDbName } from "./monitorConfig";
import { MONITOR_ENABLED, now } from "./monitorConfig";
import { getOwner } from "./monitorContext";
import { stampMonitorId } from "./monitorStamp";
import type { InitiatorFrame } from "./monitorTypes";
import {
  estimateBytes,
  networkMonitor,
  serializeBody,
  serializeHeaders,
} from "./networkMonitor";

type MonitoredConfig = InternalAxiosRequestConfig & {
  __monitorId?: string;
  __monitorReplayOf?: string;
  __monitorInitiator?: InitiatorFrame[];
  skipEncryption?: boolean;
};

/**
 * Attaches HTTP-capture interceptors to an axios instance.
 *
 * Call this at module init time (e.g. at the bottom of your `axios.ts`),
 * after registering any encryption interceptors so that the monitor sees the
 * plaintext body first.
 */
export function attachHttpMonitor(
  instance: AxiosInstance,
  options?: { dbName?: string },
): void {
  if (!MONITOR_ENABLED) return;
  if (options?.dbName) configureDbName(options.dbName);

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (networkMonitor.isPaused) return config;
    try {
      const id = networkMonitor.nextId();
      const monitored = config as MonitoredConfig;
      monitored.__monitorId = id;
      // Second, invisible stamp for `captureEncrypted`. Kept separate from
      // `__monitorId` rather than replacing it: this one has to survive being
      // read by the host's own interceptors without ever showing up in a
      // spread, a log line, or anything serialized towards the wire.
      stampMonitorId(config, id);

      const hadFormData =
        typeof FormData !== "undefined" && config.data instanceof FormData;
      const requestPayload = serializeBody(config.data);
      const owner = getOwner();

      networkMonitor.start({
        id,
        method: (config.method ?? "post").toUpperCase(),
        url: config.url ?? "",
        baseURL: config.baseURL,
        at: Date.now(),
        startTime: now(),
        requestPayload,
        requestHeaders: serializeHeaders(config.headers),
        sizeBytes: estimateBytes(requestPayload),
        skipEncryption: monitored.skipEncryption === true,
        hadFormData,
        replayOf: monitored.__monitorReplayOf,
        initiator: monitored.__monitorInitiator,
        ownerId: owner?.id,
        initiatorKind: owner?.kind,
      });
      if (owner) networkMonitor.linkChild(owner.id, id);
    } catch {
      /* capture must never break a request */
    }
    return config;
  });

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
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
    (error: AxiosError) => {
      const id = (error.config as MonitoredConfig | undefined)?.__monitorId;
      if (id) {
        try {
          const payload = error.response?.data ?? error.message;
          networkMonitor.update(id, {
            state: "error",
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
}
