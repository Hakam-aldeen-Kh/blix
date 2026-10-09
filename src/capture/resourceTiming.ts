/**
 * Blix — what the browser measured, attached to what the app sent.
 *
 * Everything Blix times itself is a pair of clock reads in JavaScript: from
 * the moment the code called the client to the moment it was handed an answer.
 * That is the number the app experiences, and it cannot say *where* the time
 * went — a slow DNS lookup, a cold TLS handshake, a backend that took a second
 * to send its first byte and a large body on a slow link are all one bar.
 *
 * The browser does know, and publishes it per request as a
 * `PerformanceResourceTiming` entry: the phases, the bytes that actually
 * crossed the wire, the protocol, and whatever the server put in a
 * `Server-Timing` header. This module listens for those entries and attaches
 * each to the monitor entry it belongs to.
 *
 * **What it cannot do.** For a cross-origin request the browser zeroes the
 * phases and the sizes unless the response carries `Timing-Allow-Origin`. Such
 * an entry is still attached, marked `restricted`, with the total — which is
 * the one thing the browser always reports.
 */

import { MONITOR_ENABLED } from "./monitorConfig";
import type { MonitorEntry, ServerTimingMetric, WireTiming } from "./monitorTypes";
import { networkMonitor } from "./networkMonitor";

/** Clock slack between Blix's `performance.now()` at call time and the
 * browser's own `startTime` for the same request, in ms. */
const START_SLACK_MS = 25;
/** How far back in the buffer a timing entry looks for its request. */
const SCAN_LIMIT = 300;

const round = (n: number): number => Math.round(n * 10) / 10;

/** A phase's length, or `undefined` when the browser withheld either end. */
function span(from: number, to: number): number | undefined {
  return from > 0 && to >= from ? round(to - from) : undefined;
}

/**
 * `Server-Timing: db;dur=53.2;desc="query", cache;desc=HIT` → metrics.
 *
 * Also the fallback for when the browser withholds `serverTiming` from the
 * timing entry but the header itself was readable on the response.
 */
export function parseServerTiming(header: string | undefined | null): ServerTimingMetric[] {
  if (!header) return [];
  const out: ServerTimingMetric[] = [];
  // Commas separate metrics, but a quoted description may contain one.
  for (const part of header.match(/(?:[^,"]|"[^"]*")+/g) ?? []) {
    const [rawName, ...params] = part.split(";").map((s) => s.trim());
    if (!rawName) continue;
    const metric: ServerTimingMetric = { name: rawName };
    for (const param of params) {
      const eq = param.indexOf("=");
      const key = (eq < 0 ? param : param.slice(0, eq)).trim().toLowerCase();
      const value = eq < 0 ? "" : param.slice(eq + 1).trim().replace(/^"|"$/g, "");
      if (key === "dur") {
        const ms = Number(value);
        if (Number.isFinite(ms)) metric.durationMs = ms;
      } else if (key === "desc" && value) {
        metric.description = value;
      }
    }
    out.push(metric);
  }
  return out;
}

/** The `Server-Timing` metrics of an entry: the browser's, else the header's. */
export function serverTimingOf(entry: MonitorEntry): ServerTimingMetric[] {
  if (entry.wire?.serverTiming?.length) return entry.wire.serverTiming;
  const headers = entry.responseHeaders;
  if (!headers) return [];
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === "server-timing") return parseServerTiming(headers[name]);
  }
  return [];
}

function toWireTiming(t: PerformanceResourceTiming): WireTiming {
  // `requestStart` is zero when the phases are withheld — but also for a
  // request that never got an answer (a timeout, a dead host), where there
  // are no phases to withhold. Only a cross-origin one is "restricted".
  let crossOrigin = false;
  try {
    crossOrigin = new URL(t.name).origin !== location.origin;
  } catch {
    /* an unparseable name is treated as same-origin */
  }
  const unanswered = t.requestStart === 0;
  const restricted = unanswered && crossOrigin;
  const wire: WireTiming = { totalMs: round(t.duration) };

  if (restricted) {
    wire.restricted = true;
  } else if (!unanswered) {
    const redirect = span(t.redirectStart, t.redirectEnd);
    if (redirect) wire.redirectMs = redirect;
    // Everything before DNS: waiting for a connection slot, the HTTP cache
    // lookup, a service worker starting up.
    const queue = span(t.startTime, t.domainLookupStart || t.fetchStart);
    if (queue !== undefined) wire.queueMs = queue;
    const dns = span(t.domainLookupStart, t.domainLookupEnd);
    if (dns !== undefined) wire.dnsMs = dns;
    // `secureConnectionStart` sits inside the connect span on HTTPS; split so
    // TCP and TLS are not reported as one number.
    const tls = span(t.secureConnectionStart, t.connectEnd);
    const connect = span(t.connectStart, tls !== undefined ? t.secureConnectionStart : t.connectEnd);
    if (connect !== undefined) wire.connectMs = connect;
    if (tls !== undefined) wire.tlsMs = tls;
    const wait = span(t.requestStart, t.responseStart);
    if (wait !== undefined) wire.waitMs = wait;
    const download = span(t.responseStart, t.responseEnd);
    if (download !== undefined) wire.downloadMs = download;

    wire.transferSize = t.transferSize;
    wire.encodedBodySize = t.encodedBodySize;
    wire.decodedBodySize = t.decodedBodySize;
    // Nothing crossed the wire, yet there was a body: it came from the cache.
    if (t.transferSize === 0 && t.decodedBodySize > 0) wire.fromCache = true;
  }

  if (t.nextHopProtocol) wire.protocol = t.nextHopProtocol;

  const server = t.serverTiming;
  if (server?.length) {
    wire.serverTiming = server.map((m) => ({
      name: m.name,
      ...(m.duration ? { durationMs: round(m.duration) } : {}),
      ...(m.description ? { description: m.description } : {}),
    }));
  }
  return wire;
}

/** Absolute URL of a monitor entry, with and without its query string. */
function addressOf(entry: MonitorEntry): { full: string; path: string } | null {
  try {
    const raw = `${entry.baseURL ?? ""}${entry.url}`;
    const resolved = new URL(raw, location.href);
    return { full: resolved.href, path: resolved.origin + resolved.pathname };
  } catch {
    return null;
  }
}

/**
 * The monitor entry a timing entry describes.
 *
 * By address and by time: the same URL, started within a few milliseconds of
 * when the browser says the request started. An exact URL match is preferred;
 * a path match covers axios, whose final query string (`params`) is built
 * after the interceptor that recorded the URL.
 */
function findEntry(t: PerformanceResourceTiming): MonitorEntry | undefined {
  let timingPath: string;
  try {
    const u = new URL(t.name);
    timingPath = u.origin + u.pathname;
  } catch {
    return undefined;
  }

  const entries = networkMonitor.getSnapshot();
  const loadId = entries[0]?.loadId;
  let best: MonitorEntry | undefined;
  let bestScore = Infinity;

  for (let i = 0; i < entries.length && i < SCAN_LIMIT; i += 1) {
    const entry = entries[i];
    if ((entry.kind ?? "http") !== "http" || entry.wire || entry.loadId !== loadId) continue;
    // The browser's clock starts at or after the call, never meaningfully before.
    const lead = t.startTime - entry.startTime;
    if (lead < -START_SLACK_MS) continue;
    if (entry.endTime !== undefined && t.startTime > entry.endTime + START_SLACK_MS) continue;

    const address = addressOf(entry);
    if (!address) continue;
    const exact = address.full === t.name;
    if (!exact && address.path !== timingPath) continue;

    // Closest start wins; an exact URL beats a path match at the same distance.
    const score = Math.abs(lead) + (exact ? 0 : 0.5);
    if (score < bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

function attach(t: PerformanceResourceTiming): void {
  if (t.initiatorType !== "fetch" && t.initiatorType !== "xmlhttprequest") return;
  const entry = findEntry(t);
  if (!entry) return;
  const wire = toWireTiming(t);
  networkMonitor.update(entry.id, {
    wire,
    // The size Blix shows until now is an estimate from the parsed body. The
    // browser's is the real decoded length, when it is willing to say.
    ...(wire.decodedBodySize ? { sizeBytes: wire.decodedBodySize } : {}),
  });
}

let observer: PerformanceObserver | null = null;

/**
 * Starts attaching the browser's resource timing to captured requests.
 * Idempotent, and a no-op where the API does not exist. Called by every
 * `attach*Monitor`; nothing needs to call it directly.
 */
export function startResourceTiming(): void {
  if (!MONITOR_ENABLED || observer) return;
  if (typeof PerformanceObserver === "undefined") return;
  try {
    observer = new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        try {
          attach(item as PerformanceResourceTiming);
        } catch {
          /* a timing entry Blix cannot read is one row without phases */
        }
      }
    });
    // Not buffered: an entry from before Blix was attached has no request in
    // the log to belong to.
    //
    // An observer, not `getEntriesByType`: the page's timing buffer holds 250
    // entries and then stops, and growing or clearing it would change what the
    // app's own code reads. An observer is handed every entry regardless.
    observer.observe({ type: "resource" });
  } catch {
    observer = null;
  }
}
