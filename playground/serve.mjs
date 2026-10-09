/**
 * Playground dev server — bundles `main.tsx` straight from `src/` with esbuild
 * (already here as tsup's dependency) and serves a small mock API beside it,
 * so the panel has all four sources to show without a host app.
 *
 *   node playground/serve.mjs   →  http://localhost:5179
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
const out = join(here, ".out");
const PORT = Number(process.env.PORT) || 5179;

const ctx = await context({
  entryPoints: [join(here, "main.tsx")],
  outdir: out,
  bundle: true,
  format: "esm",
  splitting: true,
  sourcemap: true,
  jsx: "automatic",
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
  await wait(i % 11 === 0 ? 1400 : 40 + ((i * 37) % 320));
  const status = i % 13 === 5 ? 500 : i % 17 === 9 ? 404 : req.method === "POST" ? 201 : 200;
  const rows = Array.from({ length: status === 200 ? 4 + (i % 40) : 0 }, (_, n) => ({
    id: `${mod}-${i}-${n}`,
    title: `${mod} item ${n}`,
    owner: { id: n % 7, name: `Agent ${n % 7}`, online: n % 2 === 0 },
    tags: ["alpha", "beta", "gamma"].slice(0, (n % 3) + 1),
    updatedAt: new Date(Date.now() - n * 60_000).toISOString(),
  }));
  res.writeHead(status, { "content-type": "application/json", "x-request-id": `req-${i}` });
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
