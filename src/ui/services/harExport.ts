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

import type { MonitorEntry } from "../../capture/networkMonitor";
import { endOf, startOf } from "../helpers/waterfall";

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

  const requestBody = bodyText(entry.requestPayload);
  const responseBody = bodyText(entry.responsePayload ?? entry.error);

  return {
    startedDateTime: new Date(entry.at).toISOString(),
    time: total,
    request: {
      method: entry.method,
      url: `${entry.baseURL ?? ""}${entry.url}`,
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: toHeaders(entry.requestHeaders),
      queryString: queryString(entry.url),
      headersSize: -1,
      bodySize: requestBody.length,
      ...(requestBody
        ? {
            postData: {
              mimeType: "application/json",
              text: requestBody,
            },
          }
        : {}),
    },
    response: {
      status: entry.status ?? 0,
      statusText: entry.state === "error" ? "Error" : "",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: toHeaders(entry.responseHeaders),
      content: {
        size: responseBody.length,
        mimeType: "application/json",
        text: responseBody,
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: responseBody.length,
    },
    cache: {},
    timings: { blocked, dns: -1, connect: -1, send: 0, wait, receive, ssl: -1 },
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
      creator: { name: "customer-support-web dev tools", version: "2.0" },
      pages: [],
      entries: http
        .slice()
        .sort((a, b) => startOf(a) - startOf(b))
        .map(toEntry),
    },
  };
}

export function exportHar(entries: MonitorEntry[]): void {
  try {
    const blob = new Blob([JSON.stringify(toHar(entries), null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `network-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/:/g, "-")}.har`;
    a.click();
    URL.revokeObjectURL(href);
  } catch {
    /* download blocked — ignore */
  }
}
