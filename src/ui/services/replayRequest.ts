/**
 * Dev Tools — re-fire a captured request.
 *
 * apiClient is received as a parameter (sourced from BlixContext at the call
 * site) rather than imported directly, keeping this module free of any
 * app-specific singleton dependency.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import type { HttpClientLike } from "../BlixContext";
import { classifyReplay, REPLAY_HEADER_ALLOWLIST } from "../constants/replay";

export interface ReplayCheck {
  can: boolean;
  reason?: string;
  needsConfirm: boolean;
}

/**
 * Whether `entry` can be re-fired, and why not if it can't.
 *
 * Takes `apiClient` so a host that didn't pass one to `<Blix />` gets a
 * disabled button with a reason rather than one that looks live and silently
 * does nothing — mirroring `canRedispatch`'s handling of a missing store.
 */
export function canReplay(
  entry: MonitorEntry,
  apiClient?: HttpClientLike,
): ReplayCheck {
  // Checked first, so a fetch entry gives its real reason rather than a
  // misleading "HTTP client not provided". Replaying through `fetch` is not a
  // plumbing problem — Blix doesn't record the call's `credentials`, `mode` or
  // `cache`, and keeps a JSON body parsed rather than as the bytes that were
  // sent — so a replay could not promise to be the same request.
  if (entry.client === "fetch") {
    return {
      can: false,
      reason:
        "Fetch requests can't be replayed yet — Blix doesn't capture enough of the original call to repeat it faithfully",
      needsConfirm: false,
    };
  }

  if (!apiClient) {
    return { can: false, reason: "HTTP client not provided", needsConfirm: false };
  }

  if (entry.hadFormData) {
    return {
      can: false,
      reason: "Multipart requests can't be replayed — file contents aren't captured",
      needsConfirm: false,
    };
  }

  const verdict = classifyReplay(entry.url);
  if (verdict === "blocked") {
    return {
      can: false,
      reason: "Session endpoints can't be replayed — it would rotate or end your session",
      needsConfirm: false,
    };
  }

  // The URL decides, as the policy says — except that a method which can only
  // write is never taken for a read: `DELETE /orders/5/details` ends in a
  // read-shaped segment and replayed on one click. It only ever adds a
  // confirmation, never removes one.
  const writesByMethod = /^(?:PUT|PATCH|DELETE)$/i.test(entry.method);
  return { can: true, needsConfirm: verdict === "write" || writesByMethod };
}

/** Strips the fields the request interceptor re-derives, so a stale captured
 * value can't win over the current one. */
function cleanBody(payload: unknown): unknown {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const rest = { ...(payload as Record<string, unknown>) };
  delete rest.accessToken;
  delete rest.encData;
  delete rest.aesKey;
  return rest;
}

function replayHeaders(entry: MonitorEntry): Record<string, string> {
  const source = entry.requestHeaders ?? {};
  const out: Record<string, string> = {};
  for (const name of REPLAY_HEADER_ALLOWLIST) {
    const hit = Object.keys(source).find(
      (k) => k.toLowerCase() === name.toLowerCase(),
    );
    if (hit && source[hit]) out[name] = source[hit];
  }
  return out;
}

/**
 * Re-fires the request through the provided apiClient, so the replay flows
 * through the normal interceptor chain and is captured as an ordinary entry.
 */
export async function replayEntry(
  entry: MonitorEntry,
  apiClient: HttpClientLike,
): Promise<void> {
  const check = canReplay(entry, apiClient);
  if (!check.can) throw new Error(check.reason ?? "Not replayable");

  await apiClient.request({
    url: entry.url,
    method: (entry.method || "POST").toLowerCase(),
    baseURL: entry.baseURL,
    headers: replayHeaders(entry),
    data: cleanBody(entry.requestPayload),
    skipEncryption: entry.skipEncryption,
    _retry: true,
    __monitorReplayOf: entry.id,
  });
}

/** What `requestReplay` did with the request it was handed. */
export type ReplayOutcome =
  /** Not replayable — see `canReplay` for the reason. */
  | "blocked"
  /** A write, not yet confirmed: nothing was sent. Ask again to send it. */
  | "armed"
  | "sent";

/**
 * The one way the panel replays a request — the head's Replay button, the `r`
 * shortcut and the palette's command all come through here.
 *
 * A write is never sent on the first ask: it reports `"armed"`, the caller
 * shows that it is waiting, and the *second* ask (`confirmed`) sends it. The
 * shortcut used to call `replayEntry` directly, which re-ran a write on a
 * single keypress while the button beside it wanted two clicks.
 *
 * A failed replay is captured as its own error row, which is the useful place
 * to read it — nothing is surfaced here.
 */
export function requestReplay(
  entry: MonitorEntry,
  apiClient: HttpClientLike | undefined,
  confirmed: boolean,
): ReplayOutcome {
  const check = canReplay(entry, apiClient);
  if (!check.can || !apiClient) return "blocked";
  if (check.needsConfirm && !confirmed) return "armed";
  void replayEntry(entry, apiClient).catch(() => {});
  return "sent";
}
