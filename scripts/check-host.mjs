/**
 * Host scheduling check. Drives a real Chrome (or Edge) through
 * `scripts/host/page.tsx` and asserts that Blix never holds the host's own
 * rendering back.
 *
 * The panel renders inside the host's React root. An update to it interrupts
 * whatever lower-priority render the host has in progress, and when the update
 * was caused by that render — a query `useQuery` built during it — the host
 * never finished: a Next.js page with `gcTime: 0` queries sat un-hydrated, its
 * first request unsent, until a click. Here the host's page arrives in a long
 * transition that builds such a query; its effect and its `queryFn` have to
 * run, and about as soon as they do without Blix.
 *
 * Before the fix this page shows the loop as ~5.4 s rather than forever: React
 * expires a starved transition after 5 s and finishes it synchronously. The
 * Next.js page was starved at `OffscreenLane`, which never expires.
 *
 * Time alone could not tell a slow runner from a render thrown away: one
 * CI run read 806 ms against 441 ms and nothing said why. So the page also
 * counts its rows. One pass renders 400; React restarts a render it was
 * interrupted in, so anything more is work Blix made it redo. That count found
 * the saved log's restore — its "loading" and "ready" reached the panel at
 * once, mid-render, and every restore redid 40 to 400 rows. Scenario 4 starts
 * the page as the restore starts, so the restore always ends inside it.
 *
 * Needs a browser, not jsdom: what lets the panel wait is
 * `requestIdleCallback`, which jsdom does not have.
 *
 * `node scripts/check-host.mjs [srcDir] [--browser chrome|msedge] [--runs n]
 * [--throttle n]` — the directory defaults to `./src`, so the check can be
 * pointed at a scratch copy (an older one, to see it fail). `--throttle 4`
 * slows the CPU four times over, as a busy CI runner does.
 */

import { build } from "esbuild";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const positional = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const src = path.resolve(positional ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const BROWSER = arg("--browser", "chrome");
const THROTTLE = Number(arg("--throttle", "1"));

/** The page imports `../../src/…`; this sends those imports to `src`. */
const srcDir = {
  name: "src-dir",
  setup(b) {
    b.onResolve({ filter: /^\.\.\/\.\.\/src\// }, (args) => {
      const base = path.join(src, args.path.slice("../../src/".length));
      const file = ["", ".ts", ".tsx"].map((ext) => base + ext).find((f) => existsSync(f) && !f.endsWith(path.sep));
      return file ? { path: file } : { errors: [{ text: `not in ${src}: ${args.path}` }] };
    });
  },
};

const bundle = await build({
  entryPoints: [path.join(root, "scripts", "host", "page.tsx")],
  bundle: true,
  write: false,
  format: "esm",
  jsx: "automatic",
  logLevel: "silent",
  plugins: [srcDir],
  // So a `src` outside the repo still resolves `react`.
  nodePaths: [path.join(root, "node_modules")],
  define: { "process.env.NODE_ENV": '"development"' },
});
const pageJs = bundle.outputFiles[0].text;

const server = createServer((req, res) => {
  if (req.url?.startsWith("/page.js")) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    return res.end(pageJs);
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module" src="/page.js"></script>');
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}/`;

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: BROWSER });

/** Loads the page, asks it for the host's page, and reports how long the
 * page's effect and its query took to start. */
async function measure(query) {
  const page = await browser.newPage();
  if (THROTTLE > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  }
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(base + query);
    if (query.includes("onRestore=1")) {
      // The page asks for itself the moment Blix starts restoring its log.
      await page.waitForFunction(() => window.__host.askedAt !== undefined, null, { timeout: 10_000 });
    } else {
      if (!query.includes("blix=0")) {
        await page.waitForFunction(() => window.__host.panel, null, { timeout: 10_000 });
      }
      await page.waitForFunction(() => typeof window.__showPage === "function");
      await page.evaluate(() => window.__showPage());
    }
    // No input of any kind from here on: a click would force the render
    // through, which is the very thing that hid the bug.
    await page
      .waitForFunction(() => window.__host.effectAt && window.__host.queryFnAt, null, { timeout: 6_000 })
      .catch(() => {});
    const host = await page.evaluate(() => window.__host);
    expect(errors.length === 0, `the page threw: ${errors[0]}`);
    return {
      effect: host.effectAt ? host.effectAt - host.askedAt : null,
      queryFn: host.queryFnAt ? host.queryFnAt - host.askedAt : null,
      rows: host.rowsAtQueryFn ?? host.rows,
      restored: host.restoredAt === undefined ? null : host.restoredAt - host.askedAt,
    };
  } finally {
    await page.close();
  }
}

const ms = (value) => (value == null ? "never" : `${Math.round(value)} ms`);
const runs = Number(arg("--runs", "3"));
const results = { without: [], with: [], restoring: [] };
for (let i = 0; i < runs; i += 1) {
  results.without.push(await measure("?blix=0"));
  results.with.push(await measure(""));
  results.restoring.push(await measure("?onRestore=1"));
}
/** One uninterrupted pass over the page: `Slow` renders 400 rows. */
const ONE_PASS = 400;
const worst = (list, key) => Math.max(...list.map((r) => r[key] ?? Infinity));

const scenarios = [
  {
    name: "1. with Blix mounted, the host's page effect runs and its query starts — no input needed",
    run: () => {
      for (const r of results.with) {
        expect(r.effect != null, "the page's effect never ran");
        expect(r.queryFn != null, "the page's queryFn was never called");
      }
    },
  },
  {
    name: "2. …and no later than without Blix, give or take a scheduling slice",
    run: () => {
      // The page's own render is ~400 ms of main thread; what Blix may add is
      // its own small catch-up, never another pass over the host's work.
      const allowed = worst(results.without, "queryFn") + 250;
      expect(
        worst(results.with, "queryFn") <= allowed,
        `queryFn after ${ms(worst(results.with, "queryFn"))} with Blix, ${ms(worst(results.without, "queryFn"))} without`,
      );
    },
  },
  {
    name: "3. the host's page renders once with Blix mounted — no render thrown away and redone",
    run: () => {
      // Exact, where 2 is a margin: React restarts a render it was
      // interrupted in, so every row it had already rendered is rendered
      // again. Without Blix the count is the page's own, every time.
      for (const r of results.without) expect(r.rows === ONE_PASS, `${r.rows} rows rendered without Blix — the page itself changed`);
      for (const r of results.with) expect(r.rows === ONE_PASS, `${r.rows} rows rendered for a page of ${ONE_PASS}: Blix interrupted it`);
    },
  },
  {
    name: "4. …and once while Blix restores its saved log in the middle of it",
    run: () => {
      // The restore's status reached the panel synchronously and restarted the
      // host's render — the 806 ms CI run. Its end has to land inside the
      // render for this to prove anything, so that is checked first.
      for (const r of results.restoring) {
        expect(
          r.restored != null && r.queryFn != null && r.restored < r.queryFn,
          `the restore ended at ${ms(r.restored)}, not inside the page's render (queryFn at ${ms(r.queryFn)})`,
        );
        expect(r.rows === ONE_PASS, `${r.rows} rows rendered for a page of ${ONE_PASS}: the restore interrupted it`);
      }
    },
  },
];

console.log(
  `without Blix: queryFn after ${results.without.map((r) => ms(r.queryFn)).join(", ")}\n` +
    `with Blix:    queryFn after ${results.with.map((r) => ms(r.queryFn)).join(", ")}\n` +
    `restoring:    queryFn after ${results.restoring.map((r) => ms(r.queryFn)).join(", ")} (restore ended at ${results.restoring.map((r) => ms(r.restored)).join(", ")})\n` +
    `rows rendered — without: ${results.without.map((r) => r.rows).join(", ")}; with: ${results.with.map((r) => r.rows).join(", ")}; restoring: ${results.restoring.map((r) => r.rows).join(", ")}\n`,
);

let failed = 0;
for (const scenario of scenarios) {
  try {
    scenario.run();
    console.log(`✓ ${scenario.name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${scenario.name}\n    ${message.split("\n")[0]}`);
  }
}

await browser.close();
server.close();
console.log(
  `\n${failed === 0 ? "All" : `${failed} of`} ${scenarios.length} scenarios ${failed === 0 ? "passed" : "failed"} — ${posix(src)}`,
);
process.exit(failed === 0 ? 0 : 1);
