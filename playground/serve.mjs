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
  // `x-delay` and `x-tag` do the same without changing the URL: the stress
  // tests send identical URLs, each with its own delay, and read the tag back
  // to know which response is whose.
  const delay = Number(url.searchParams.get("delay")) || Number(req.headers["x-delay"]);
  const tag = req.headers["x-tag"];
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
        ? { error: status === 500 ? "Internal error" : "Not found", module: mod, action, i, ...(tag ? { tag } : {}) }
        : { module: mod, action, count: rows.length, ...(tag ? { tag } : {}), rows },
    ),
  );
}

/**
 * `/errors/<shape>` — one failure per shape, each the way some real backend
 * answers: the playground's error lab runs every one through axios, fetch and
 * a mutation, to see what the panel makes of it.
 */
const ERROR_SHAPES = {
  // A result envelope with the server's exception attached.
  "envelope-409": () => [
    409,
    "application/json",
    {
      result: 1042,
      succeeded: false,
      data: null,
      message: "The record cannot be deleted because other records reference it.",
      exception: {
        type: "App.Domain.ConflictException",
        message: "Failure 1042.",
        stackTrace:
          "   at App.Domain.Orders.OrderService.DeleteAsync(Int64 id) in /src/OrderService.cs:line 88\n" +
          "   at App.Api.Endpoints.OrderEndpoints.DeleteAsync(Int64 id) in /src/OrderEndpoints.cs:line 42",
        innerException: null,
      },
    },
  ],
  "problem-400": () => [
    400,
    "application/problem+json",
    {
      type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
      title: "One or more validation errors occurred.",
      status: 400,
      traceId: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      errors: { Email: ["The Email field is required."], Phone: ["Invalid phone number.", "Too short."] },
    },
  ],
  "validation-422": () => [
    422,
    "application/json",
    { message: "The given data was invalid.", errors: [{ field: "amount", code: "min", message: "Must be at least 1" }] },
  ],
  "nested-403": () => [
    403,
    "application/json",
    { error: { code: "FORBIDDEN", message: "Missing permission orders.delete", details: [{ permission: "orders.delete", scope: "team:3" }] } },
  ],
  "auth-401": () => [401, "application/json", { error: "invalid_token", error_description: "The access token expired" }],
  "rate-429": () => [429, "application/json", { message: "Too many requests", retryAfterSeconds: 30 }],
  "array-400": () => [400, "application/json", ["Name is required", "Date is in the past"]],
  "string-json-400": () => [400, "application/json", "Account is locked"],
  "html-500": () => [
    500,
    "text/html; charset=utf-8",
    "<!doctype html><html><body><h1>500 Internal Server Error</h1><p>nginx</p></body></html>",
    true,
  ],
  "text-503": () => [503, "text/plain", "Service Unavailable — upstream timed out", true],
  "empty-500": () => [500, undefined, undefined],
  "bad-json-500": () => [500, "application/json", '{"message": "truncated', true],
  "big-500": () => [
    500,
    "application/json",
    {
      message: "Unhandled exception",
      exception: {
        type: "System.NullReferenceException",
        stackTrace: Array.from({ length: 200 }, (_, n) => `   at Frame${n}.Method() in /src/File${n}.cs:line ${n}`).join("\n"),
      },
    },
  ],
  // An HTTP success that is a failure by the envelope's own account.
  "soft-200": () => [200, "application/json", { result: 2001, succeeded: false, data: null, message: "Account is suspended" }],
};

function errorShape(url, res) {
  const shape = ERROR_SHAPES[url.pathname.split("/")[2]];
  if (!shape) return res.writeHead(404, { "content-type": "text/plain" }).end("no such shape");
  // `raw` bodies are sent as written — HTML, text, JSON that does not parse.
  const [status, type, body, raw] = shape();
  res.writeHead(status, {
    ...(type ? { "content-type": type } : {}),
    ...(status === 429 ? { "retry-after": "30" } : {}),
    ...(status === 401 ? { "www-authenticate": 'Bearer error="invalid_token"' } : {}),
  });
  res.end(body === undefined ? undefined : raw ? body : JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) return api(url, req, res);
  if (url.pathname.startsWith("/errors/")) return errorShape(url, res);
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
