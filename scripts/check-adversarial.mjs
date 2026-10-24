/**
 * Adversarial check. Drives a real Chrome (or Edge) through the hard cases in
 * `scripts/adversarial/page.ts` — nested and retried queries, mutations with
 * several failing requests, one URL hit ten times on a blocked main thread,
 * reused XHRs, 401 retry chains, interceptors that refuse, and Redux dispatches
 * that fold or nest — and checks each against what is known for certain.
 *
 * `node scripts/check-adversarial.mjs [--browser chrome|msedge] [--only name,…]`
 */

import { build } from "esbuild";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const BROWSER = arg("--browser", "chrome");
const ONLY = arg("--only", undefined);
const PORT = 5193;

const bundle = await build({
  entryPoints: [path.join(root, "scripts", "adversarial", "page.ts")],
  bundle: true,
  write: false,
  format: "esm",
  logLevel: "silent",
  define: { "process.env.NODE_ENV": '"development"' },
});
const pageJs = bundle.outputFiles[0].text;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** `/x/auth`: per tag, the first `fail` calls answer 401, then `then` (200). */
const authCalls = new Map();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const q = url.searchParams;
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end('<!doctype html><meta charset="utf-8"><script type="module" src="/page.js"></script>');
  }
  if (url.pathname === "/page.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    return res.end(pageJs);
  }
  const t = q.get("t") ?? req.headers["x-tag"] ?? "";
  const delay = Number(q.get("delay")) || Number(req.headers["x-delay"]) || 0;
  if (delay) await sleep(delay);
  let status = Number(q.get("status")) || 200;
  if (url.pathname === "/x/auth") {
    const n = (authCalls.get(t) ?? 0) + 1;
    authCalls.set(t, n);
    status = n <= Number(q.get("fail") ?? 1) ? 401 : Number(q.get("then")) || 200;
  } else if (url.pathname !== "/x/json") {
    res.writeHead(404).end();
    return;
  }
  const n = Number(q.get("n")) || 0;
  // The tag rides on the browser's own timing entry for this response: a
  // timing paired with the wrong request carries the wrong tag.
  res.writeHead(status, { "content-type": "application/json", "server-timing": `tag;desc="${t}"` });
  res.end(JSON.stringify({ t, status, rows: Array.from({ length: n }, (_, k) => ({ k })) }));
}).listen(PORT);

const browser = await chromium.launch({ channel: BROWSER, headless: true });
const page = await (await browser.newContext()).newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`);
await page.waitForFunction(() => !!window.H);

const names = (await page.evaluate(() => window.H.names)).filter((n) => !ONLY || ONLY.split(",").some((o) => n.startsWith(o)));
let failed = 0;
let checks = 0;
for (const name of names) {
  const ran = await page.evaluate((n) => window.H.run(n), name);
  await sleep(450);
  const results = await page.evaluate((n) => window.H.verify(n), name);
  const bad = results.filter(([, ok]) => !ok);
  checks += results.length;
  failed += bad.length;
  console.log(`${bad.length ? "✗" : "✓"} ${name}${ran !== "ok" ? `  (${ran})` : ""}`);
  for (const [label, ok, detail] of results) {
    if (!ok) console.log(`    ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
if (pageErrors.length) console.log(`\npage errors:\n  ${pageErrors.join("\n  ")}`);
console.log(`\n${failed ? `${failed} of ${checks} checks failed` : `All ${checks} checks passed`} in ${names.length} scenarios — ${BROWSER}`);

await browser.close();
server.close();
process.exit(failed || pageErrors.length ? 1 : 0);
