/**
 * Network monitor — realtime (WebSocket / ActionCable) capture.
 *
 * Realtime traffic routed through an adapter is typically invisible: the
 * browser's own Network tab shows the socket but not the decoded envelope, and
 * an app's own logging goes to the console where it is drowned by everything
 * else.
 *
 * ## Shape of the capture
 *
 * A connection is one long-lived `MonitorEntry` (`kind: "ws"`) that accumulates
 * frames, rather than one entry per frame. That is how Chrome models it — the
 * connection is a row, its traffic lives in a Messages tab — and it stops a
 * chatty channel from burying every HTTP request in the table.
 *
 * ## Why a structural adapter type
 *
 * The host's adapter interface lives in the host, and this package must not
 * import from it. The adapter shape is therefore restated structurally here,
 * so the tap stays a one-line change at the call site with no dependency
 * pointing the wrong way — any object with the right methods satisfies it.
 */

import { LOAD_ID, MONITOR_ENABLED, TIME_ORIGIN, now } from "./monitorConfig";
import { estimateBytes } from "./monitorSerialize";
import type { FrameDirection, WsFrame } from "./monitorTypes";
import { networkMonitor } from "./networkMonitor";

/** The subset of the realtime adapter contract this tap needs. */
export interface RealtimeAdapterLike {
  connect(token: string, url: string): void;
  disconnect(): void;
  subscribe(channelName: string): void;
  onMessage(callback: (payload: { event: string; data: unknown }) => void): void;
  onPresenceUpdate(callback: (status: string) => void): void;
}

let frameCounter = 0;

function makeFrame(
  direction: FrameDirection,
  event: string,
  data: unknown,
): WsFrame {
  frameCounter += 1;
  return {
    id: `f${frameCounter}`,
    at: Date.now(),
    direction,
    event,
    data,
    sizeBytes: estimateBytes(data),
  };
}

/**
 * Wraps a realtime adapter so its lifecycle and traffic appear in the monitor.
 *
 * Returns the adapter untouched in production, where `MONITOR_ENABLED` is a
 * constant `false` and the whole wrapper folds away.
 */
export function tapRealtimeAdapter<T extends RealtimeAdapterLike>(
  adapter: T,
  transport: string,
): T {
  if (!MONITOR_ENABLED) return adapter;

  /** Id of the connection entry currently open, if any. */
  let connectionId: string | null = null;

  const frame = (direction: FrameDirection, event: string, data: unknown) => {
    if (!connectionId) return;
    try {
      networkMonitor.appendFrame(connectionId, makeFrame(direction, event, data));
    } catch {
      /* capture must never break realtime */
    }
  };

  const openConnection = (url: string) => {
    try {
      const id = networkMonitor.nextId();
      connectionId = id;
      const startTime = now();
      networkMonitor.start({
        id,
        kind: "ws",
        transport,
        method: "WS",
        // Strip the token from the query string — it is a credential, and the
        // panel already masks the equivalent HTTP header.
        url: redactUrl(url),
        at: Date.now(),
        startTime,
        // A connection has no response body; size accrues from its frames.
        sizeBytes: 0,
        frames: [],
      });
      return id;
    } catch {
      connectionId = null;
      return null;
    }
  };

  const closeConnection = (state: "success" | "error", reason?: string) => {
    if (!connectionId) return;
    try {
      networkMonitor.update(connectionId, {
        state,
        endTime: now(),
        responsePayload: { closed: reason ?? "disconnected" },
      });
    } catch {
      /* noop */
    }
    connectionId = null;
  };

  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      if (prop === "connect") {
        return (token: string, url: string) => {
          openConnection(url);
          frame("system", "connect", { url: redactUrl(url), transport });
          return (value as T["connect"]).call(target, token, url);
        };
      }

      if (prop === "disconnect") {
        return () => {
          frame("system", "disconnect", null);
          const result = (value as T["disconnect"]).call(target);
          closeConnection("success", "client disconnect");
          return result;
        };
      }

      if (prop === "subscribe") {
        return (channelName: string) => {
          // The only genuinely outbound frame the adapter contract exposes.
          frame("out", `subscribe:${channelName}`, { channel: channelName });
          return (value as T["subscribe"]).call(target, channelName);
        };
      }

      if (prop === "onMessage") {
        return (cb: (payload: { event: string; data: unknown }) => void) =>
          (value as T["onMessage"]).call(target, (payload) => {
            frame("in", payload?.event ?? "message", payload?.data);
            cb(payload);
          });
      }

      if (prop === "onPresenceUpdate") {
        return (cb: (status: string) => void) =>
          (value as T["onPresenceUpdate"]).call(target, (status) => {
            frame("system", `presence:${status}`, { status });
            // An offline transition is the connection dying, not a frame.
            if (status === "offline") closeConnection("error", "transport offline");
            cb(status);
          });
      }

      return value.bind(target);
    },
  }) as T;
}

/** Removes credentials from a socket URL before it is displayed or persisted. */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url, "http://local");
    for (const key of ["token", "access_token", "accessToken", "auth"]) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "•••");
    }
    return url.startsWith("/") ? parsed.pathname + parsed.search : parsed.toString();
  } catch {
    return url.replace(/([?&](?:token|access_token|accessToken|auth)=)[^&]*/gi, "$1•••");
  }
}

/** Re-exported so the panel can label frames without importing the tap. */
export { TIME_ORIGIN, LOAD_ID };
