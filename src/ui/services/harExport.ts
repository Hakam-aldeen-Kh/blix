/**
 * Dev Tools — HAR 1.2 export.
 *
 * The JSON export is convenient but only this panel understands it. A `.har`
 * file imports into Chrome DevTools, Charles, Insomnia and Postman, which makes
 * it the right format for handing a repro to a backend engineer.
 *
 * The bodies written here are the **decrypted** ones, which is the whole point:
 * a HAR captured by the browser would contain nothing but ciphertext.
 */

import { errorBody } from "../../capture/monitorError";
import type { MonitorEntry } from "../../capture/networkMonitor";
import { BLIX_VERSION } from "../constants/about";
import { endOf, startOf } from "../helpers/waterfall";
import { downloadText, fileStamp } from "./download";
import { absoluteUrl } from "./snippets";

interface HarHeader {
  name: string;
  value: string;
}

function toHeaders(map: Record<string, string> | undefined): HarHeader[] {
  return Object.entries(map ?? {}).map(([name, value]) => ({ name, value }));
}

function bodyText(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A header's value, by name in any case. */
function headerOf(map: Record<string, string> | undefined, name: string): string | undefined {
  for (const [key, value] of Object.entries(map ?? {})) {
    if (key.toLowerCase() === name) return value;
  }
  return undefined;
}

/** The body's type as its own headers declare it — not "application/json"
 * for everything, which made a HAR viewer render HTML and images as JSON. */
function mimeTypeOf(headers: Record<string, string> | undefined, body: unknown): string {
  return headerOf(headers, "content-type") ?? (body !== null && typeof body === "object" ? "application/json" : "text/plain");
}

/** `nextHopProtocol` as HAR writes it: `h2` → `HTTP/2`. */
function httpVersionOf(entry: MonitorEntry): string {
  const protocol = entry.wire?.protocol?.toLowerCase();
  if (!protocol) return "HTTP/1.1";
  if (protocol === "h2") return "HTTP/2";
  if (protocol === "h3" || protocol.startsWith("h3-")) return "HTTP/3";
  return protocol.toUpperCase();
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

function queryString(url: string): { name: string; value: string }[] {
  const at = url.indexOf("?");
  if (at < 0) return [];
  return Array.from(new URLSearchParams(url.slice(at + 1))).map(
    ([name, value]) => ({ name, value }),
  );
}

function toEntry(entry: MonitorEntry) {
  const start = startOf(entry);
  const end = endOf(entry);
  const total = end != null ? Math.max(0, end - start) : -1;

  // HAR's timing model has no slot for application-level crypto, so encryption
  // is reported under `blocked` (before the wire) and decryption under
  // `receive` (after it), which is where the time genuinely goes.
  const blocked = entry.marks?.encryptMs ?? -1;
  const receive = entry.marks?.decryptMs ?? -1;
  const wait =
    total >= 0
      ? Math.max(0, total - Math.max(0, blocked) - Math.max(0, receive))
      : -1;

  const responseValue = entry.responsePayload ?? errorBody(entry.error);
  const requestBody = bodyText(entry.requestPayload);
  const responseBody = bodyText(responseValue);
  const httpVersion = httpVersionOf(entry);

  // What the browser measured, when it measured it: its phases, its total and
  // the real byte counts. Otherwise Blix's own clock, as before.
  const wire = entry.wire && !entry.wire.restricted ? entry.wire : undefined;
  const phase = (ms: number | undefined) => (ms === undefined ? -1 : ms);
  const timings = wire
    ? {
        blocked: phase(wire.queueMs),
        dns: phase(wire.dnsMs),
        // HAR counts TLS inside `connect`, and repeats it under `ssl`.
        connect: wire.connectMs === undefined && wire.tlsMs === undefined ? -1 : (wire.connectMs ?? 0) + (wire.tlsMs ?? 0),
        send: 0,
        wait: phase(wire.waitMs),
        receive: phase(wire.downloadMs),
        ssl: phase(wire.tlsMs),
      }
    : { blocked, dns: -1, connect: -1, send: 0, wait, receive, ssl: -1 };
  const errorStatusText = (entry.error as { statusText?: unknown } | undefined)?.statusText;

  return {
    startedDateTime: new Date(entry.at).toISOString(),
    time: wire ? wire.totalMs : total,
    request: {
      method: entry.method,
      url: absoluteUrl(entry),
      httpVersion,
      cookies: [],
      headers: toHeaders(entry.requestHeaders),
      queryString: queryString(entry.url),
      headersSize: -1,
      bodySize: requestBody ? utf8Length(requestBody) : 0,
      ...(requestBody
        ? {
            postData: {
              mimeType: mimeTypeOf(entry.requestHeaders, entry.requestPayload),
              text: requestBody,
            },
          }
        : {}),
    },
    response: {
      status: entry.status ?? 0,
      statusText: typeof errorStatusText === "string" ? errorStatusText : entry.state === "error" ? "Error" : "",
      httpVersion,
      cookies: [],
      headers: toHeaders(entry.responseHeaders),
      content: {
        size: wire?.decodedBodySize ?? utf8Length(responseBody),
        mimeType: mimeTypeOf(entry.responseHeaders, responseValue),
        text: responseBody,
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: wire?.encodedBodySize ?? -1,
    },
    cache: {},
    timings,
    // Non-standard but harmless, and preserved by tools that round-trip HAR.
    _initiator: entry.initiator?.[0]?.file,
    _replayOf: entry.replayOf,
    _pinned: entry.pinned || undefined,
  };
}

export function toHar(entries: MonitorEntry[]) {
  // WebSocket connections have no HTTP request/response pair to speak of, and
  // HAR has no standard representation for frames — they are skipped rather
  // than exported as malformed entries.
  const http = entries.filter((e) => (e.kind ?? "http") === "http");

  return {
    log: {
      version: "1.2",
      creator: { name: "blix", version: BLIX_VERSION },
      pages: [],
      entries: http
        .slice()
        .sort((a, b) => startOf(a) - startOf(b))
        .map(toEntry),
    },
  };
}

export function exportHar(entries: MonitorEntry[]): void {
  downloadText(
    `blix-${fileStamp()}.har`,
    "application/json",
    JSON.stringify(toHar(entries), null, 2),
  );
}
