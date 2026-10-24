/**
 * Official-tools comparison. Drives a real Chrome (or Edge), runs every
 * scenario in `scripts/official/page.ts`, and compares what Blix captured with
 * the ground truth for each source, field by field:
 *
 * - **Network** — the browser's own record over the DevTools protocol: the
 *   same events Chrome DevTools' Network panel is built from. Method, URL,
 *   status, headers as sent and received, bodies, sizes, phases, protocol,
 *   cache, failures and the initiator.
 * - **Query** — the TanStack cache itself, and a cache subscriber installed
 *   before Blix's.
 * - **Redux** — a middleware ahead of Blix's that records every action with
 *   the state before and after it. Blix's diff is applied to "before" and
 *   must give "after" exactly.
 *
 * Every difference is either a **mismatch** — Blix is wrong, and the check
 * fails — or **explained**: something a page cannot see by design (a cookie
 * header, a preflight, a cross-origin header that is not exposed), or a value
 * Blix deliberately shows differently (a masked credential, a body over the
 * capture cap). Each explained difference names its reason; nothing is waved
 * through by tolerance alone.
 *
 * `node scripts/check-official.mjs [--browser chrome|msedge] [--report file.md]`
 */

import { build } from "esbuild";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const BROWSER = arg("--browser", "chrome");
const REPORT = arg("--report", undefined);
const ONLY = arg("--only", undefined);
const DUMP = arg("--dump", undefined);
const PORT_A = 5191;
const PORT_B = 5192;
const ORIGIN_A = `http://localhost:${PORT_A}`;
const ORIGIN_B = `http://127.0.0.1:${PORT_B}`;

/* ───────────────────────────── the page ───────────────────────────── */

const bundle = await build({
  entryPoints: [path.join(root, "scripts", "official", "page.ts")],
  bundle: true,
  write: false,
  format: "esm",
  sourcemap: false,
  logLevel: "silent",
  define: {
    "process.env.NODE_ENV": '"development"',
    ORIGIN_B: JSON.stringify(ORIGIN_B),
  },
});
const pageJs = bundle.outputFiles[0].text;
const pageLines = pageJs.split("\n");
const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>blix official</title></head><body><script type="module" src="/page.js"></script></body></html>`;

/* ───────────────────────────── the servers ────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
);

function handler(crossOrigin) {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const q = url.searchParams;
    const cors = crossOrigin && !q.has("nocors")
      ? {
          "access-control-allow-origin": ORIGIN_A,
          "access-control-allow-credentials": "true",
          ...(q.has("expose") ? { "access-control-expose-headers": "x-request-id, server-timing" } : {}),
        }
      : {};
    const tao = q.has("tao") ? { "timing-allow-origin": "*" } : {};
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...cors,
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE",
        "access-control-allow-headers": "content-type, x-custom, authorization",
        "access-control-max-age": "0",
      });
      return res.end();
    }
    if (!crossOrigin && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(HTML);
    }
    if (!crossOrigin && url.pathname === "/page.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      return res.end(pageJs);
    }
    const delay = Number(q.get("delay")) || Number(req.headers["x-delay"]) || 0;
    if (delay) await sleep(delay);
    const t = q.get("t") ?? "";
    const base = { ...cors, ...tao, "x-request-id": `rid-${t}` };

    switch (url.pathname) {
      case "/x/json": {
        const status = Number(q.get("status")) || 200;
        const n = Number(q.get("n")) || 0;
        const body = JSON.stringify(
          status >= 400
            ? { error: `failed with ${status}`, t }
            : { t, rows: Array.from({ length: n }, (_, k) => ({ id: k, label: `row ${k}`, ok: k % 2 === 0 })) },
        );
        res.writeHead(status, {
          ...base,
          "content-type": "application/json; charset=utf-8",
          ...(q.has("st") ? { "server-timing": 'db;dur=12.5;desc="orders", cache;desc=HIT, app;dur=3' } : {}),
        });
        return res.end(req.method === "HEAD" ? undefined : body);
      }
      case "/x/echo": {
        const body = await readBody(req);
        res.writeHead(200, { ...base, "content-type": "application/json" });
        return res.end(JSON.stringify({ method: req.method, contentType: req.headers["content-type"] ?? null, body }));
      }
      case "/x/empty":
        res.writeHead(204, base);
        return res.end();
      case "/x/html":
        res.writeHead(200, { ...base, "content-type": "text/html; charset=utf-8" });
        return res.end("<!doctype html><p>hello <b>world</b></p>");
      case "/x/binary":
        res.writeHead(200, { ...base, "content-type": "image/png", "content-length": String(PNG.length) });
        return res.end(PNG);
      case "/x/gzip": {
        const json = JSON.stringify({ t, rows: Array.from({ length: 200 }, (_, k) => ({ id: k, text: "compressible ".repeat(4) })) });
        const zipped = gzipSync(json);
        res.writeHead(200, { ...base, "content-type": "application/json", "content-encoding": "gzip", "content-length": String(zipped.length) });
        return res.end(zipped);
      }
      case "/x/big": {
        const mb = Number(q.get("mb")) || 6;
        const text = "x".repeat(mb * 1024 * 1024);
        res.writeHead(200, { ...base, "content-type": "text/plain", "content-length": String(text.length) });
        return res.end(text);
      }
      case "/x/redirect": {
        const code = Number(q.get("code")) || 302;
        const to = code === 307 ? `/x/echo?t=${t}&redirected=1` : `/x/json?n=1&t=${t}&redirected=1`;
        res.writeHead(code, { ...base, location: to });
        return res.end();
      }
      case "/x/cached":
        res.writeHead(200, { ...base, "content-type": "text/plain", "cache-control": "max-age=60" });
        return res.end(`cached ${t}`);
      case "/x/etag":
        if (req.headers["if-none-match"] === '"v1"') {
          res.writeHead(304, { ...base, etag: '"v1"', "cache-control": "no-cache" });
          return res.end();
        }
        res.writeHead(200, { ...base, "content-type": "text/plain", etag: '"v1"', "cache-control": "no-cache" });
        return res.end(`etag body ${t}`);
      case "/x/cookie":
        res.writeHead(200, { ...base, "content-type": "text/plain", "set-cookie": "blixtest=1; Path=/; SameSite=Lax" });
        return res.end("cookie set");
      case "/x/sse":
        res.writeHead(200, { ...base, "content-type": "text/event-stream", "cache-control": "no-cache" });
        res.write("data: one\n\n");
        await sleep(50);
        res.write("data: two\n\n");
        await sleep(50);
        return res.end();
      default:
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("not found");
    }
  };
}

const servers = [
  createServer(handler(false)).listen(PORT_A),
  createServer(handler(true)).listen(PORT_B),
];

/* ───────────────────────────── the browser ────────────────────────── */

const browser = await chromium.launch({ channel: BROWSER, headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable", { maxPostDataSize: 1024 * 1024 });

/** requestId → what the browser recorded. */
const net = new Map();
const rec = (id) => {
  if (!net.has(id)) net.set(id, { id, hops: [], dataLength: 0 });
  return net.get(id);
};
cdp.on("Network.requestWillBeSent", (e) => {
  const r = rec(e.requestId);
  if (e.redirectResponse) {
    r.hops.push({ url: r.url, status: e.redirectResponse.status, headers: e.redirectResponse.headers });
  } else {
    r.firstUrl = e.request.url;
    r.method = e.request.method;
    r.start = e.timestamp;
    r.wallTime = e.wallTime;
    r.initiator = e.initiator;
    r.type = e.type;
    r.postData = e.request.postData;
    r.hasPostData = e.request.hasPostData;
  }
  r.url = e.request.url;
  r.requestHeaders = e.request.headers;
});
cdp.on("Network.requestWillBeSentExtraInfo", (e) => {
  rec(e.requestId).wireHeaders = e.headers;
});
cdp.on("Network.requestServedFromCache", (e) => {
  rec(e.requestId).servedFromCache = true;
});
cdp.on("Network.responseReceived", (e) => {
  const r = rec(e.requestId);
  r.type = e.type;
  r.response = e.response;
});
cdp.on("Network.responseReceivedExtraInfo", (e) => {
  const r = rec(e.requestId);
  r.wireResponseHeaders = e.headers;
  r.wireStatus = e.statusCode;
});
cdp.on("Network.dataReceived", (e) => {
  rec(e.requestId).dataLength += e.dataLength;
});
cdp.on("Network.loadingFinished", async (e) => {
  const r = rec(e.requestId);
  r.end = e.timestamp;
  r.encodedDataLength = e.encodedDataLength;
  try {
    const body = await cdp.send("Network.getResponseBody", { requestId: e.requestId });
    r.body = body.base64Encoded ? { base64: body.body } : { text: body.body };
  } catch {
    r.body = null;
  }
  if (r.hasPostData && r.postData === undefined) {
    try {
      r.postData = (await cdp.send("Network.getRequestPostData", { requestId: e.requestId })).postData;
    } catch {
      /* none */
    }
  }
});
cdp.on("Network.loadingFailed", (e) => {
  const r = rec(e.requestId);
  r.end = e.timestamp;
  r.failed = { errorText: e.errorText, canceled: e.canceled, blockedReason: e.blockedReason, corsError: e.corsErrorStatus?.corsError };
});

await page.goto(`${ORIGIN_A}/`);
await page.waitForFunction(() => !!window.H);
const scenarioNames = (await page.evaluate(() => window.H.scenarios)).filter((n) => !ONLY || ONLY.split(",").includes(n));
const runs = {};
for (const name of scenarioNames) {
  runs[name] = await page.evaluate((n) => window.H.run(n), name);
  // Long enough for every body read, timing entry and watchdog-free settle.
  await sleep(name.includes("timeout") || name.includes("big") ? 900 : 350);
}
await sleep(1200);

const blix = await page.evaluate(() => window.H.blix());
const queries = await page.evaluate(() => window.H.queries());
const redux = await page.evaluate(() => window.H.redux());

/* ───────────────────────────── comparing ──────────────────────────── */

/** Every comparison made: `{ scenario, tag, field, verdict, detail }`. */
const results = [];
const note = (scenario, tag, field, verdict, detail = "") => results.push({ scenario, tag, field, verdict, detail });
const scenarioOf = (tag) => tag.split(".")[0];

const tagOfUrl = (raw, base = ORIGIN_A) => {
  try {
    return new URL(raw, base).searchParams.get("t");
  } catch {
    return null;
  }
};

const lower = (headers = {}) => Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
const MASK_SUFFIX = " (masked)";

/** Headers the browser manages itself: a page never sets, sees or sends them
 * through the fetch/XHR API. */
const BROWSER_REQUEST_HEADERS = new Set([
  "host", "connection", "user-agent", "accept", "accept-encoding", "accept-language", "origin", "referer",
  "cookie", "content-length", "pragma", "cache-control", "if-none-match", "if-modified-since",
  "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-fetch-dest", "sec-fetch-mode",
  "sec-fetch-site", "sec-fetch-user", "priority",
]);

const http = blix.filter((e) => (e.kind ?? "http") === "http");
const pairs = [];

// Fetch/XHR/EventSource the page made; preflights are the browser's own.
const pageRequests = [...net.values()].filter((r) => r.type === "Fetch" || r.type === "XHR" || r.type === "EventSource");
const preflights = [...net.values()].filter((r) => r.type === "Preflight" || r.method === "OPTIONS");
for (const p of preflights) {
  const tag = tagOfUrl(p.firstUrl);
  if (tag) note(scenarioOf(tag), tag, "preflight", "explained", "CORS preflight: sent by the browser, invisible to page scripts");
}

const byTag = (list, key) => {
  const map = new Map();
  for (const item of list) {
    const tag = key(item);
    if (!tag) continue;
    if (!map.has(tag)) map.set(tag, []);
    map.get(tag).push(item);
  }
  return map;
};
const cdpByTag = byTag(pageRequests, (r) => tagOfUrl(r.firstUrl));
const blixUrl = (e) => `${e.baseURL ?? ""}${e.url}`;
const blixByTag = byTag(http, (e) => tagOfUrl(blixUrl(e)));

// axios builds its query string from `params` after Blix's interceptor ran:
// such an entry has no `t` in its URL. Paired by scenario, and its URL checked.
const untaggedBlix = http.filter((e) => !tagOfUrl(blixUrl(e)));

for (const [tag, cdpList] of cdpByTag) {
  const blixList = (blixByTag.get(tag) ?? []).slice().sort((a, b) => a.startAbs - b.startAbs);
  cdpList.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cdpList.length; i += 1) {
    let entry = blixList[i];
    if (!entry) {
      const path = new URL(cdpList[i].firstUrl).pathname;
      const at = untaggedBlix.findIndex((e) => new URL(blixUrl(e), ORIGIN_A).pathname === path && e.method === cdpList[i].method);
      if (at >= 0) [entry] = untaggedBlix.splice(at, 1);
    }
    if (!entry) note(scenarioOf(tag), tag, "captured", "mismatch", `the browser made ${cdpList[i].method} ${cdpList[i].firstUrl}; Blix has no entry`);
    else pairs.push({ tag, cdp: cdpList[i], blix: entry });
  }
  for (let i = cdpList.length; i < blixList.length; i += 1) {
    note(scenarioOf(tag), tag, "captured", "mismatch", `Blix has an extra entry ${blixList[i].method} ${blixUrl(blixList[i])}`);
  }
}
for (const e of untaggedBlix) note("?", "?", "captured", "mismatch", `unpaired Blix entry ${e.method} ${blixUrl(e)}`);

const parse = (text) => {
  try {
    return { json: JSON.parse(text) };
  } catch {
    return { text };
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, tol) => a !== undefined && b !== undefined && Math.abs(a - b) <= tol;

for (const { tag, cdp: c, blix: b } of pairs) {
  const s = scenarioOf(tag);
  const failure = c.failed;
  const err = b.error && typeof b.error === "object" ? b.error : undefined;

  // method
  note(s, tag, "method", c.method === b.method ? "match" : "mismatch", `${c.method} vs ${b.method}`);

  // url: what the page asked for
  const blixFull = new URL(blixUrl(b), ORIGIN_A).href;
  if (blixFull === c.firstUrl) note(s, tag, "url", "match");
  else if (new URL(blixFull).pathname === new URL(c.firstUrl).pathname && b.client === "axios")
    note(s, tag, "url", "mismatch", `axios params missing: Blix ${blixFull}, browser ${c.firstUrl}`);
  else note(s, tag, "url", "mismatch", `Blix ${blixFull}, browser ${c.firstUrl}`);
  if (c.hops.length) note(s, tag, "redirects", "explained", `${c.hops.map((h) => h.status).join(" → ")} → ${c.url}: fetch/XHR follow redirects inside the browser; the page sees only the final response`);

  // outcome
  if (failure && c.response && s === "fetch-no-cors") {
    note(s, tag, "outcome", b.status === 0 ? "explained" : "mismatch", `no-cors: the browser reports ${failure.errorText} for the opaque body nobody may read; the page got status 0 (Blix ${b.status})`);
    continue;
  }
  if (failure) {
    const kind = err?.kind;
    const expected = failure.canceled
      ? s.includes("timeout")
        ? ["timeout"]
        : ["aborted"]
      : failure.corsError || failure.blockedReason
        ? ["network"]
        : ["network", "timeout"];
    note(s, tag, "failure kind", expected.includes(kind) ? "match" : "mismatch", `browser ${failure.errorText}${failure.canceled ? " (canceled)" : ""}${failure.corsError ? ` ${failure.corsError}` : ""}, Blix ${kind}`);
    if (b.status !== undefined && b.status !== 0) note(s, tag, "status", "mismatch", `failed request has status ${b.status} in Blix`);
    continue;
  }
  if (!c.response) {
    note(s, tag, "response", "mismatch", "browser has no response and no failure");
    continue;
  }
  const r = c.response;
  const opaque = s === "fetch-no-cors";

  // status
  const revalidated = c.wireStatus === 304;
  if (revalidated && b.status === 200) note(s, tag, "status", "explained", "304 revalidation: the browser hands the page the cached 200");
  else if (r.status === b.status) note(s, tag, "status", "match", String(r.status));
  else if (r.status === 304 && b.status === 200) note(s, tag, "status", "explained", "304 revalidation: the browser hands the page the cached 200");
  else if (opaque && b.status === 0) note(s, tag, "status", "explained", `no-cors: the page sees status 0 for the browser's ${r.status}`);
  else note(s, tag, "status", "mismatch", `browser ${r.status}, Blix ${b.status}`);

  // response headers
  const wireRes = lower(c.wireResponseHeaders ?? r.headers);
  const blixRes = lower(b.responseHeaders);
  if (opaque) {
    note(s, tag, "response headers", "explained", "no-cors: response headers are hidden from the page");
  } else {
    for (const [name, value] of Object.entries(blixRes)) {
      if (wireRes[name] === undefined && revalidated) note(s, tag, `response header ${name}`, "explained", "from the cached response the 304 revalidated");
      else if (wireRes[name] === undefined) note(s, tag, `response header ${name}`, "mismatch", `Blix shows ${name}: ${value}, not on the wire`);
      else if (value.endsWith(MASK_SUFFIX)) {
        const [head, tail] = value.slice(0, -MASK_SUFFIX.length).split("…");
        note(s, tag, `response header ${name}`, wireRes[name].startsWith(head) && wireRes[name].endsWith(tail) ? "match" : "mismatch", "masked");
      } else note(s, tag, `response header ${name}`, wireRes[name] === value ? "match" : "mismatch", `${wireRes[name]} vs ${value}`);
    }
    const crossOrigin = new URL(c.url).origin !== ORIGIN_A;
    const SAFE = new Set(["cache-control", "content-language", "content-length", "content-type", "expires", "last-modified", "pragma"]);
    const exposed = new Set((wireRes["access-control-expose-headers"] ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
    for (const name of Object.keys(wireRes)) {
      if (blixRes[name] !== undefined) continue;
      if (name === "set-cookie" || name === "set-cookie2") note(s, tag, `response header ${name}`, "explained", "Set-Cookie is never readable by page scripts");
      else if (crossOrigin && !SAFE.has(name) && !exposed.has(name)) note(s, tag, `response header ${name}`, "explained", "cross-origin header not listed in Access-Control-Expose-Headers");
      else if (revalidated) note(s, tag, `response header ${name}`, "explained", "on the 304 only; the page sees the cached response's headers");
      else note(s, tag, `response header ${name}`, "mismatch", `on the wire (${wireRes[name]}), missing in Blix`);
    }
  }

  // request headers as sent
  const wireReq = lower(c.wireHeaders ?? c.requestHeaders);
  const blixReq = lower(b.requestHeaders);
  for (const [name, value] of Object.entries(blixReq)) {
    if (wireReq[name] === undefined) note(s, tag, `request header ${name}`, "mismatch", `Blix shows ${name}: ${value}, never sent`);
    else if (value.endsWith(MASK_SUFFIX)) {
      const [head, tail] = value.slice(0, -MASK_SUFFIX.length).split("…");
      note(s, tag, `request header ${name}`, wireReq[name].startsWith(head) && wireReq[name].endsWith(tail) ? "match" : "mismatch", "masked");
    } else if (name === "content-type" && value === "multipart/form-data; boundary=(chosen by the browser)") {
      note(s, tag, `request header ${name}`, wireReq[name].startsWith("multipart/form-data; boundary=") ? "explained" : "mismatch", "the multipart boundary is chosen by the browser at send time, never shown to the page");
    } else note(s, tag, `request header ${name}`, wireReq[name] === value ? "match" : "mismatch", `sent ${wireReq[name]}, Blix ${value}`);
  }
  for (const name of Object.keys(wireReq)) {
    if (blixReq[name] !== undefined) continue;
    if (BROWSER_REQUEST_HEADERS.has(name) || name.startsWith("sec-")) note(s, tag, `request header ${name}`, "explained", "added by the browser, after the page's code");
    else note(s, tag, `request header ${name}`, "mismatch", `sent (${wireReq[name]}), missing in Blix`);
  }

  // request body
  if (c.postData !== undefined) {
    const payload = b.requestPayload;
    const sent = parse(c.postData);
    if (s === "fetch-multipart") {
      note(s, tag, "request body", payload && typeof payload === "object" ? "explained" : "mismatch", "multipart: Blix lists the FormData fields, the wire has the encoded parts");
    } else if (same(sent.json ?? sent.text, payload)) note(s, tag, "request body", "match");
    else if (typeof payload === "string" && payload === c.postData) note(s, tag, "request body", "match");
    else note(s, tag, "request body", "mismatch", `sent ${c.postData.slice(0, 120)}, Blix ${JSON.stringify(payload)?.slice(0, 120)}`);
  }

  // response body
  const bodyOfBlix = err && "response" in err ? err.response : b.responsePayload;
  if (opaque) note(s, tag, "response body", "explained", "no-cors: the body is hidden from the page");
  else if (c.body === null || c.body === undefined) note(s, tag, "response body", bodyOfBlix === undefined ? "match" : "explained", "browser kept no body");
  else if (c.body.base64 !== undefined) {
    const bytes = Buffer.from(c.body.base64, "base64").length;
    note(s, tag, "response body", typeof bodyOfBlix === "string" && bodyOfBlix.startsWith("«binary body:") && bodyOfBlix.includes(`${bytes} bytes`) ? "explained" : "mismatch", `binary, ${bytes} bytes: Blix keeps a summary, not the bytes (${bodyOfBlix})`);
  } else {
    const got = parse(c.body.text);
    if (c.body.text === "" && (bodyOfBlix === undefined || bodyOfBlix === "")) note(s, tag, "response body", "match", "empty");
    else if (same(got.json ?? got.text, bodyOfBlix) || bodyOfBlix === c.body.text) note(s, tag, "response body", "match");
    else if (typeof bodyOfBlix === "string" && bodyOfBlix.startsWith("«body not captured:") && bodyOfBlix.includes("capture limit")) note(s, tag, "response body", c.body.text.length > 5 * 1024 * 1024 ? "explained" : "mismatch", `over the 5 MB capture cap (${c.body.text.length} bytes): ${bodyOfBlix}`);
    else if (s === "fetch-sse") note(s, tag, "response body", "explained", `event stream: not read by design (${JSON.stringify(bodyOfBlix)?.slice(0, 60)})`);
    else if (s === "fetch-unread-body" && bodyOfBlix === undefined) note(s, tag, "response body", "mismatch", "body not captured when the app never read it");
    else note(s, tag, "response body", "mismatch", `browser ${c.body.text.slice(0, 100)}, Blix ${JSON.stringify(bodyOfBlix)?.slice(0, 100)}`);
  }

  // sizes
  const w = b.wire;
  if (w && !w.restricted && !opaque) {
    if (w.decodedBodySize !== undefined && !c.servedFromCache && r.status !== 304)
      note(s, tag, "decoded size", w.decodedBodySize === c.dataLength ? "match" : "mismatch", `browser ${c.dataLength}, Blix ${w.decodedBodySize}`);
    // The bytes that crossed the wire: the declared length when the server
    // sent one, else — with no content-encoding — the body itself.
    const declared = wireRes["content-length"] !== undefined ? Number(wireRes["content-length"]) : undefined;
    const encodedTruth = declared ?? (wireRes["content-encoding"] ? undefined : c.dataLength);
    if (w.encodedBodySize !== undefined && encodedTruth !== undefined && !c.servedFromCache && !revalidated)
      note(s, tag, "encoded size", w.encodedBodySize === encodedTruth ? "match" : "mismatch", `wire ${encodedTruth}, Blix ${w.encodedBodySize}`);
  }
  if (b.sizeBytes !== undefined && c.body?.text !== undefined && !opaque && !(typeof bodyOfBlix === "string" && bodyOfBlix.startsWith("«body not captured:"))) {
    const decoded = Buffer.byteLength(c.body.text, "utf8");
    if (!c.servedFromCache && r.status !== 304 && s !== "fetch-sse") note(s, tag, "size", b.sizeBytes === decoded ? "match" : "mismatch", `body ${decoded} B, Blix ${b.sizeBytes} B`);
  }

  // protocol, cache
  if (w?.protocol) note(s, tag, "protocol", w.protocol === r.protocol ? "match" : "mismatch", `${r.protocol} vs ${w.protocol}`);
  const fromCache = !!(r.fromDiskCache || r.fromMemoryCache || c.servedFromCache);
  if (w) note(s, tag, "from cache", !!w.fromCache === fromCache ? "match" : "mismatch", `browser ${fromCache}, Blix ${!!w.fromCache}`);

  // phases: CDP's timing is the same load timing ResourceTiming is cut from
  const tm = r.timing;
  if (!w) {
    note(s, tag, "wire timing", fromCache || opaque ? "explained" : "mismatch", fromCache ? "served from cache: no timing entry" : opaque ? "no-cors" : "no browser timing attached");
  } else if (w.restricted) {
    note(s, tag, "wire timing", new URL(c.url).origin !== ORIGIN_A && !wireRes["timing-allow-origin"] ? "explained" : "mismatch", "phases withheld: cross-origin without Timing-Allow-Origin");
  } else if (tm) {
    const phase = (from, to) => (tm[from] >= 0 && tm[to] >= tm[from] ? tm[to] - tm[from] : undefined);
    const dns = phase("dnsStart", "dnsEnd");
    const tls = phase("sslStart", "sslEnd");
    const connect = tm.connectStart >= 0 ? (tls !== undefined ? tm.sslStart : tm.connectEnd) - tm.connectStart : undefined;
    const headersAt = tm.receiveHeadersStart >= 0 ? tm.receiveHeadersStart : tm.receiveHeadersEnd;
    const wait = headersAt - tm.sendStart;
    const checks = [
      ["dns", dns, w.dnsMs],
      ["connect", connect, w.connectMs],
      ["tls", tls, w.tlsMs],
      ["wait (TTFB)", wait, w.waitMs],
    ];
    for (const [name, truth, got] of checks) {
      if (truth === undefined && got === undefined) continue;
      if ((truth ?? 0) < 0.05 && (got ?? 0) < 0.05) continue;
      note(s, tag, `phase ${name}`, near(truth ?? 0, got ?? 0, 1) ? "match" : "mismatch", `browser ${truth?.toFixed(1)} ms, Blix ${got}`);
    }
    if (c.end !== undefined && c.start !== undefined) {
      const total = (c.end - c.start) * 1000;
      note(s, tag, "total", near(total, w.totalMs, 3) ? "match" : "mismatch", `browser ${total.toFixed(1)} ms, Blix ${w.totalMs}`);
    }
  }

  // server timing
  if (wireRes["server-timing"] && w?.serverTiming) {
    note(s, tag, "server-timing", w.serverTiming.length === wireRes["server-timing"].split(",").length ? "match" : "mismatch", JSON.stringify(w.serverTiming));
  }

  // duration as the app experienced it: never shorter than the network
  if (b.durationMs !== undefined && c.end !== undefined) {
    const total = (c.end - c.start) * 1000;
    const unread = typeof bodyOfBlix === "string" && bodyOfBlix.startsWith("«body not captured:");
    if (unread) note(s, tag, "duration ≥ network", "explained", `body not read by Blix, so its duration ends at the headers (network ${total.toFixed(0)} ms, Blix ${b.durationMs} ms)`);
    else note(s, tag, "duration ≥ network", b.durationMs + 2 >= total || fromCache ? "match" : "mismatch", `network ${total.toFixed(0)} ms, Blix ${b.durationMs} ms`);
  }

  // initiator: Blix's top frame must be on the browser's own call stack
  const frames = [];
  for (let st = c.initiator?.stack; st; st = st.parent) frames.push(...st.callFrames);
  const top = b.initiator?.[0];
  if (top && frames.length) {
    const onStack = frames.some((f) => f.lineNumber + 1 === top.line);
    // The browser's async stack is cut short inside axios, so the caller is
    // checked in the source too: the line Blix names must make the call.
    const line = pageLines[top.line - 1] ?? "";
    const makesCall = /\bapi\.(?:get|post|put|patch|delete|head|request)\(|\bfetch\(|\bxhr\(/.test(line);
    note(s, tag, "initiator", onStack || makesCall ? "match" : "mismatch", `Blix ${top.fn ?? ""}@${top.line}, browser ${frames.slice(0, 3).map((f) => `${f.functionName || "?"}@${f.lineNumber + 1}`).join(" < ")}`);
  }
}

/* ── Query ── */

const queryRows = blix.filter((e) => e.kind === "query" && e.query?.sub === "query");
for (const q of queries.queries) {
  const row = queryRows.find((e) => e.query.hash === q.hash);
  const tag = q.hash;
  if (!row) {
    note("query", tag, "row", "mismatch", "no Blix row");
    continue;
  }
  const m = row.query;
  note("query", tag, "status", m.status === q.status ? "match" : "mismatch", `${q.status} vs ${m.status}`);
  note("query", tag, "fetchStatus", m.fetchStatus === q.fetchStatus ? "match" : "mismatch", `${q.fetchStatus} vs ${m.fetchStatus}`);
  note("query", tag, "dataUpdatedAt", m.dataUpdatedAt === q.dataUpdatedAt ? "match" : "mismatch", `${q.dataUpdatedAt} vs ${m.dataUpdatedAt}`);
  note("query", tag, "errorUpdatedAt", (m.errorUpdatedAt ?? 0) === (q.errorUpdatedAt ?? 0) ? "match" : "mismatch", `${q.errorUpdatedAt} vs ${m.errorUpdatedAt}`);
  note("query", tag, "failureCount", (m.failureCount ?? 0) === (q.failureCount ?? 0) ? "match" : "mismatch", `${q.failureCount} vs ${m.failureCount}`);
  note("query", tag, "isInvalidated", !!m.isInvalidated === !!q.isInvalidated ? "match" : "mismatch", `${q.isInvalidated} vs ${m.isInvalidated}`);
  note("query", tag, "fetch count", (m.fetchCount ?? 0) === (queries.fetches[q.hash] ?? 0) ? "match" : "mismatch", `cache ${queries.fetches[q.hash]} vs Blix ${m.fetchCount}`);
  if (q.status === "success") note("query", tag, "data", same(row.responsePayload, q.data) ? "match" : "mismatch", `${JSON.stringify(q.data)?.slice(0, 80)} vs ${JSON.stringify(row.responsePayload)?.slice(0, 80)}`);
  if (q.status === "error") note("query", tag, "error message", row.error?.message === q.errorMessage ? "match" : "mismatch", `${q.errorMessage} vs ${row.error?.message}`);
  // linked requests: every one Blix lists must be one this query started
  for (const id of m.causedIds ?? []) {
    const child = http.find((e) => e.id === id);
    const t = child && tagOfUrl(blixUrl(child));
    note("query", tag, "linked request", child && t && t.startsWith(`query-${q.key[1]}`) ? "match" : "mismatch", `${t ?? id}`);
  }
  if (!(m.causedIds ?? []).length && q.key[0] === "q") note("query", tag, "linked request", "mismatch", "none linked");
  if (q.status === "error" && row.error?.responseFrom) {
    const src = http.find((e) => e.id === row.error.responseFrom);
    note("query", tag, "failure source", src && tagOfUrl(blixUrl(src))?.startsWith(`query-${q.key[1]}`) ? "match" : "mismatch", `${row.error.responseMatch} ${src && tagOfUrl(blixUrl(src))}`);
  }
}
const mutationRows = blix.filter((e) => e.kind === "query" && e.query?.sub === "mutation");
for (const mu of queries.mutations) {
  const row = mutationRows.find((e) => e.query.hash === String(mu.id));
  const tag = `mutation #${mu.id}`;
  if (!row) {
    note("mutation", tag, "row", "mismatch", "no Blix row");
    continue;
  }
  note("mutation", tag, "status", row.query.status === mu.status ? "match" : "mismatch", `${mu.status} vs ${row.query.status}`);
  note("mutation", tag, "variables", same(row.requestPayload, mu.variables) ? "match" : "mismatch", `${JSON.stringify(mu.variables)} vs ${JSON.stringify(row.requestPayload)}`);
  if (mu.status === "success") note("mutation", tag, "data", same(row.responsePayload, mu.data) ? "match" : "mismatch");
  if (mu.status === "error") {
    note("mutation", tag, "error message", row.error?.message === mu.errorMessage ? "match" : "mismatch");
    const src = http.find((e) => e.id === row.error?.responseFrom);
    note("mutation", tag, "failure source", src && tagOfUrl(blixUrl(src))?.startsWith("mutation-error") ? "match" : "mismatch", `${row.error?.responseMatch} ${src && tagOfUrl(blixUrl(src))}, body ${JSON.stringify(row.error?.response)}`);
  }
}

/* ── Redux ── */

const reduxRows = blix.filter((e) => e.kind === "redux").sort((a, b) => a.seq - b.seq);
// Coalesced rows stand for several dispatches of one type.
const expanded = reduxRows.flatMap((e) => Array.from({ length: e.redux.batchCount ?? 1 }, () => e));
note("redux", "all", "action count", expanded.length === redux.length ? "match" : "mismatch", `recorded ${redux.length}, Blix ${expanded.length} in ${reduxRows.length} rows`);

function applyDiff(before, changes) {
  const out = structuredClone(before);
  for (const c of changes) {
    const parts = c.path.match(/[^.[\]]+/g) ?? [];
    const last = parts.pop();
    const parent = parts.reduce((o, k) => o[k], out);
    if (c.op === "remove") {
      if (Array.isArray(parent)) parent.splice(Number(last), 1);
      else delete parent[last];
    } else parent[last] = structuredClone(c.after);
  }
  return out;
}
// Row by row: a coalesced row stands for `batchCount` consecutive dispatches,
// all of which must be the same action, and its diff must take the state from
// before the first to after the last.
let at = 0;
for (const row of reduxRows) {
  const n = row.redux.batchCount ?? 1;
  const group = redux.slice(at, at + n);
  at += n;
  const truth = group[0];
  if (!truth) break;
  const tag = `${at - n + 1}${n > 1 ? `–${at}` : ""}. ${truth.type}`;
  note("redux", tag, "type / order", group.every((g) => g.type === row.redux.type) ? "match" : "mismatch", `${group.map((g) => g.type)} vs ${row.redux.type}`);
  const payload = row.redux.payload ?? {};
  const stored = { payload: payload.payload, meta: payload.meta };
  // RTK puts a requestId and timing on a thunk's meta; compared whole.
  const allSame = group.every((g) => same(stored, { payload: g.payload, meta: g.meta }));
  note("redux", tag, n > 1 ? "payload + meta (every coalesced dispatch)" : "payload + meta", allSame ? "match" : "mismatch", `${JSON.stringify(group.map((g) => ({ payload: g.payload, meta: g.meta }))).slice(0, 120)} vs ${JSON.stringify(stored).slice(0, 100)}`);
  const before = group[0].before;
  const after = group[group.length - 1].after;
  if (same(before, after)) {
    note("redux", tag, "diff", row.redux.diff === undefined || row.redux.diff.changes.length === 0 ? "match" : "mismatch", "state unchanged");
    continue;
  }
  if (!row.redux.diff) {
    note("redux", tag, "diff", "mismatch", "state changed, no diff");
    continue;
  }
  if (row.redux.diff.truncated) {
    note("redux", tag, "diff", "explained", "diff marked truncated by its ceilings");
    continue;
  }
  let rebuilt;
  try {
    rebuilt = applyDiff(before, row.redux.diff.changes);
  } catch (error) {
    rebuilt = `apply failed: ${error}`;
  }
  note("redux", tag, "diff reproduces the state", same(rebuilt, after) ? "match" : "mismatch", same(rebuilt, after) ? `${row.redux.diff.changes.length} changes` : `${JSON.stringify(row.redux.diff.changes).slice(0, 160)}`);
  const slices = Object.keys(after).filter((k) => !same(before[k], after[k]));
  note("redux", tag, "changed slices", same([...row.redux.diff.slices].sort(), slices.sort()) ? "match" : "mismatch", `${slices} vs ${row.redux.diff.slices}`);
}

if (DUMP) {
  await writeFile(
    DUMP,
    JSON.stringify(
      pairs.map(({ tag, cdp: c, blix: b }) => ({
        tag,
        cdp: { start: c.start, end: c.end, timing: c.response?.timing, wallTime: c.wallTime },
        blix: { startTime: b.startTime, endTime: b.endTime, at: b.at, wire: b.wire, headers: b.requestHeaders },
      })),
      null,
      1,
    ),
  );
}

/* ───────────────────────────── the report ─────────────────────────── */

await browser.close();
for (const server of servers) server.close();

const count = (v) => results.filter((r) => r.verdict === v).length;
const mismatches = results.filter((r) => r.verdict === "mismatch");
const explained = results.filter((r) => r.verdict === "explained");
const lines = [];
lines.push(`# Blix vs the browser's own record — ${new Date().toISOString().slice(0, 10)}`, "");
lines.push(`Browser: ${BROWSER} ${browser.version?.() ?? ""}. Scenarios: ${scenarioNames.length}. Requests paired: ${pairs.length}.`, "");
lines.push(`| | |`, `| --- | --- |`, `| match | ${count("match")} |`, `| explained | ${count("explained")} |`, `| **mismatch** | **${count("mismatch")}** |`, "");
const failedRuns = Object.entries(runs).filter(([, v]) => v !== "ok");
if (failedRuns.length) lines.push("Scenarios that threw:", ...failedRuns.map(([k, v]) => `- ${k}: ${v}`), "");
lines.push("## Mismatches", "");
lines.push(mismatches.length ? "| Scenario | Request | Field | Detail |\n| --- | --- | --- | --- |" : "None.");
for (const m of mismatches) lines.push(`| ${m.scenario} | ${m.tag} | ${m.field} | ${String(m.detail).replace(/\|/g, "\\|")} |`);
lines.push("", "## Explained differences", "");
const grouped = new Map();
for (const e of explained) {
  const key = `${e.field.replace(/ header .*/, " header")} — ${e.detail.replace(/\(.*?\)/g, "").replace(/\d+/g, "#")}`;
  grouped.set(key, (grouped.get(key) ?? 0) + 1);
}
lines.push("| Difference | Times |", "| --- | --- |");
for (const [k, n] of grouped) lines.push(`| ${k.replace(/\|/g, "\\|")} | ${n} |`);
const report = lines.join("\n");
if (REPORT) await writeFile(REPORT, report + "\n");
console.log(report);
process.exit(mismatches.length ? 1 : 0);
