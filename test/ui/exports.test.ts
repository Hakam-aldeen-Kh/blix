import { describe, expect, test } from "vitest";
import type { MonitorEntry } from "../../src/capture/monitorTypes";
import { toCsv, toCurlScript, toMarkdown, toNdjson } from "../../src/ui/services/exportFormats";
import { toHar } from "../../src/ui/services/harExport";
import { absoluteUrl, toCurl, toFetch } from "../../src/ui/services/snippets";

let seq = 0;
const entry = (patch: Partial<MonitorEntry> = {}): MonitorEntry =>
  ({
    id: `e${++seq}`,
    seq,
    rev: 0,
    method: "GET",
    url: "/api/orders?page=2",
    at: Date.UTC(2026, 0, 1),
    startTime: 10,
    endTime: 60,
    durationMs: 50,
    timeOrigin: 1000,
    startAbs: 1010,
    endAbs: 1060,
    loadId: "l",
    state: "success",
    status: 200,
    ...patch,
  }) as MonitorEntry;

/** RFC 4180, enough to read back what toCsv writes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(cell), (cell = "");
    else if (c === "\r" && text[i + 1] === "\n") row.push(cell), rows.push(row), (row = []), (cell = ""), i++;
    else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

describe("CSV", () => {
  test("a header and one row per entry, quotes and line breaks survive", () => {
    const rows = parseCsv(toCsv([entry({ url: '/a?q="x",y\nz' })]));
    expect(rows[0][0]).toBe("time");
    expect(rows).toHaveLength(2);
    expect(rows[1][4]).toBe('/a?q="x",y\nz');
  });

  test.each(["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)"])("a cell starting %s is not a formula", (name) => {
    const rows = parseCsv(toCsv([entry({ kind: "redux", url: name, method: "x" })]));
    expect(rows[1][3]).toBe(`'${name}`);
  });
});

describe("Markdown", () => {
  test("pipes and line breaks do not break the table, backticks do not break code", () => {
    const md = toMarkdown([entry({ kind: "redux", url: "a|b`c``d\ne", method: "m" })]);
    const row = md.split("\n").find((l) => l.startsWith("| 1 |"))!;
    expect(row.split(/(?<!\\)\|/).length).toBe(8);
    expect(row).toContain("```a\\|b`c``d e```");
  });

  test("failures are listed with their error", () => {
    const md = toMarkdown([entry({ state: "error", status: 500, error: { kind: "http", message: "boom" } })]);
    expect(md).toContain("**1** failed");
    expect(md).toContain('"message": "boom"');
  });
});

describe("NDJSON", () => {
  test("one parseable line per entry", () => {
    const lines = toNdjson([entry(), entry({ url: "/b" })]).split("\n");
    expect(lines.map((l) => JSON.parse(l).url)).toEqual(["/api/orders?page=2", "/b"]);
  });
});

describe("HAR", () => {
  const har = (e: MonitorEntry) => toHar([e]).log.entries[0];

  test("is a HAR 1.2 log of HTTP entries only, in start order", () => {
    const log = toHar([entry({ startAbs: 2000, url: "/late" }), entry({ kind: "ws", url: "/ws" }), entry({ startAbs: 1500, url: "/early" })]).log;
    expect(log.version).toBe("1.2");
    expect(log.entries.map((e) => new URL(e.request.url).pathname)).toEqual(["/early", "/late"]);
  });

  test("types come from the headers, not 'application/json' for everything", () => {
    const e = har(
      entry({
        method: "POST",
        requestPayload: "a=1",
        requestHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
        responsePayload: "<p>hi</p>",
        responseHeaders: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    expect(e.request.postData?.mimeType).toBe("application/x-www-form-urlencoded");
    expect(e.response.content.mimeType).toBe("text/html; charset=utf-8");
  });

  test("the browser's phases, protocol and byte counts are used when measured", () => {
    const e = har(
      entry({
        wire: { totalMs: 120, queueMs: 2, dnsMs: 5, connectMs: 10, tlsMs: 8, waitMs: 80, downloadMs: 15, protocol: "h2", decodedBodySize: 900, encodedBodySize: 300 },
        responsePayload: { a: 1 },
      }),
    );
    expect(e.time).toBe(120);
    expect(e.timings).toEqual({ blocked: 2, dns: 5, connect: 18, send: 0, wait: 80, receive: 15, ssl: 8 });
    expect(e.request.httpVersion).toBe("HTTP/2");
    expect(e.response.content.size).toBe(900);
    expect(e.response.bodySize).toBe(300);
  });

  test("without browser timing, Blix's own clock and unknown phases", () => {
    const e = har(entry());
    expect(e.time).toBe(50);
    expect(e.timings.dns).toBe(-1);
    expect(e.request.httpVersion).toBe("HTTP/1.1");
  });

  test("sizes are bytes, not characters", () => {
    expect(har(entry({ responsePayload: "مرحبا" })).response.content.size).toBe(10);
  });

  test("a failure's body and status text come from its error", () => {
    const e = har(entry({ state: "error", status: 404, error: { kind: "http", message: "x", statusText: "Not Found", response: { e: 1 } } }));
    expect(e.response.statusText).toBe("Not Found");
    expect(JSON.parse(e.response.content.text)).toEqual({ e: 1 });
  });

  test("the query string is listed", () => {
    expect(har(entry({ url: "/s?a=1&b=two%20words" })).request.queryString).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "two words" },
    ]);
  });
});

describe("snippets", () => {
  test("absolute URL from baseURL and url", () => {
    expect(absoluteUrl(entry({ baseURL: "https://api.test", url: "/v1/x" }))).toBe("https://api.test/v1/x");
  });

  test("cURL quotes everything it is given", () => {
    const curl = toCurl(entry({ method: "POST", url: "/x?a='b'", requestHeaders: { "X-A": "it's" }, requestPayload: { q: "a'b" } }));
    // The URL is normalized the way the browser sends it: ' is %27.
    expect(curl).toContain(`curl '${location.origin}/x?a=%27b%27'`);
    expect(curl).toContain(`-H 'X-A: it'\\''s'`);
    expect(curl).toContain(`--data-raw '{"q":"a'\\''b"}'`);
  });

  test("a hostile method falls back to GET", () => {
    expect(toCurl(entry({ method: "GET; rm -rf /" }))).toContain("-X 'GET'");
  });

  test("a multipart request is rebuilt as form fields, without the browser's boundary", () => {
    const e = entry({
      method: "POST",
      hadFormData: true,
      requestHeaders: { "content-type": "multipart/form-data; boundary=(chosen by the browser)" },
      requestPayload: { name: "Ada", avatar: "«File: a b.png — 5 bytes»", trick: "@/etc/passwd" },
    });
    const curl = toCurl(e);
    expect(curl).not.toContain("boundary");
    expect(curl).toContain(`--form-string 'name=Ada'`);
    expect(curl).toContain(`-F 'avatar=@"a b.png"'`);
    // A text value starting with @ must never be read as a file.
    expect(curl).toContain(`--form-string 'trick=@/etc/passwd'`);
    const fetchSnippet = toFetch(e);
    expect(fetchSnippet).toContain(`body.append("name", "Ada");`);
    expect(fetchSnippet).toContain("  body,");
    expect(fetchSnippet).not.toContain("boundary");
  });

  test("fetch snippet warns only when a credential was masked", () => {
    expect(toFetch(entry())).not.toContain("masked");
    expect(toFetch(entry({ requestHeaders: { Authorization: "Bearer a…zzzz (masked)" } }))).toContain("masked at capture");
  });

  test("the cURL script runs requests in the order they were made, comments on one line", () => {
    const script = toCurlScript([entry({ seq: 2, url: "/second" }), entry({ seq: 1, url: "/first", durationMs: "1\nrm -rf /" as never })]);
    expect(script.indexOf("/first")).toBeLessThan(script.indexOf("/second"));
    expect(script.split("\n").filter((l) => l.startsWith("rm "))).toHaveLength(0);
  });
});
