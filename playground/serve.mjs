/**
 * Playground dev server — bundles `main.tsx` straight from `src/` with esbuild
 * (already here as tsup's dependency) and serves a small mock API beside it,
 * so the panel has all four sources to show without a host app.
 *
 *   node playground/serve.mjs             →  http://localhost:5179
 *   node playground/serve.mjs --react18   →  http://localhost:5180
 *
 * `--react18` bundles against the React 18 installed in `playground/.react18`
 * instead of the project's own React, to check the panel on the older major.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// esbuild is tsup's dependency, not ours, and pnpm does not hoist it — so it
// is resolved from where tsup lives rather than from the project root.
const require = createRequire(import.meta.url);
const { context } = createRequire(require.resolve("tsup"))("esbuild");

const here = dirname(fileURLToPath(import.meta.url));
// Its own output directory and port, so both majors can be served side by side.
const REACT18 = process.argv.includes("--react18");
const out = REACT18 ? join(here, ".out", "react18") : join(here, ".out");
const PORT = Number(process.env.PORT) || (REACT18 ? 5180 : 5179);
const react18 = join(here, ".react18", "node_modules");

const ctx = await context({
  entryPoints: [join(here, "main.tsx")],
  outdir: out,
  bundle: true,
  format: "esm",
  splitting: true,
  sourcemap: true,
  jsx: "automatic",
  // Aliased for every importer, so react-query and the panel share one React.
  alias: REACT18
    ? { react: join(react18, "react"), "react-dom": join(react18, "react-dom") }
    : {},
  define: {
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_BLIX": '"false"',
  },
  logLevel: "info",
});
await ctx.watch();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json",
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** `/api/<module>/<action>?i=<n>` — the status and the delay are derived from
 * `i`, so a given request always behaves the same way. */
async function api(url, req, res) {
  const i = Number(url.searchParams.get("i")) || 0;
  const [, , mod = "misc", action = "getAll"] = url.pathname.split("/");
  // `?delay=` and `?status=` override the derived behaviour — the failure
  // buttons in the playground use them to produce a timeout or a 500 on demand.
  const delay = Number(url.searchParams.get("delay"));
  await wait(delay > 0 ? delay : i % 11 === 0 ? 1400 : 40 + ((i * 37) % 320));
  const forced = Number(url.searchParams.get("status"));
  const status = forced >= 100 ? forced : i % 13 === 5 ? 500 : i % 17 === 9 ? 404 : req.method === "POST" ? 201 : 200;
  const rows = Array.from({ length: status === 200 ? 4 + (i % 40) : 0 }, (_, n) => ({
    id: `${mod}-${i}-${n}`,
    title: `${mod} item ${n}`,
    owner: { id: n % 7, name: `Agent ${n % 7}`, online: n % 2 === 0 },
    tags: ["alpha", "beta", "gamma"].slice(0, (n % 3) + 1),
    updatedAt: new Date(Date.now() - n * 60_000).toISOString(),
  }));
  res.writeHead(status, {
    "content-type": "application/json",
    "x-request-id": `req-${i}`,
    // Made-up numbers, so the Timing tab has a backend breakdown to show.
    "server-timing": `db;dur=${12 + (i % 40)};desc="orders query", cache;desc=MISS, render;dur=${3 + (i % 9)}`,
  });
  res.end(
    JSON.stringify(
      status >= 400
        ? { error: status === 500 ? "Internal error" : "Not found", module: mod, action }
        : { module: mod, action, count: rows.length, rows },
    ),
  );
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) return api(url, req, res);
  const file =
    url.pathname === "/" ? join(here, "index.html") : join(out, url.pathname.replace(/^\/+/, ""));
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`blix playground → http://localhost:${PORT}`));
