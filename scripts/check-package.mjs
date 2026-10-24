/**
 * Package check: the tarball as npm would publish it, installed into a fresh
 * project and used from there — not the repo's own `dist/`, which hides a
 * missing file or a broken `exports` map.
 *
 * - **Contents.** What ships and what must not (sources, tests, scripts).
 * - **Resolution.** `import` of both entry points, under development and
 *   production, with no `window` (a server render or a test runner); and
 *   `require`, which Node ≥ 22 supports for ESM when `exports` allows it.
 * - **Types.** A consumer written against the real axios, TanStack Query and
 *   Redux Toolkit type-checks with `moduleResolution` `bundler` and `node16`.
 * - **Size.** The gzipped entry points stay inside a budget.
 *
 * Run after `pnpm build`. `node scripts/check-package.mjs`
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const work = mkdtempSync(path.join(tmpdir(), "blix-package-"));

let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`✗ ${name}\n    ${String(error?.message ?? error).split("\n").slice(0, 6).join("\n    ")}`);
  }
};
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

if (!existsSync(path.join(root, "dist", "index.js"))) {
  console.log("✗ dist/ is missing — run pnpm build first");
  process.exit(1);
}

/* ── pack and install ───────────────────────────────────────────────── */

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packed = JSON.parse(
  execFileSync(npm, ["pack", "--json", "--pack-destination", work], { cwd: root, encoding: "utf8", shell: process.platform === "win32" }),
)[0];
const files = packed.files.map((f) => f.path);

const app = path.join(work, "app");
const installed = path.join(app, "node_modules", ...pkg.name.split("/"));
const scope = path.dirname(installed);
mkdirSync(scope, { recursive: true });
// Relative paths, run from the work directory: GNU tar reads "C:" in an
// absolute Windows path as a remote host.
execFileSync("tar", ["-xzf", packed.filename, "-C", path.relative(work, scope).split(path.sep).join("/")], { cwd: work });
// npm's tarball unpacks to `package/`.
renameSync(path.join(scope, "package"), installed);

// The peers, from the repo's own install — a junction, so nothing is copied.
for (const dep of ["react", "react-dom", "axios", "@tanstack/react-query", "@tanstack/query-core", "@reduxjs/toolkit", "redux", "@types/react", "@types/react-dom", "typescript"]) {
  const from = path.join(root, "node_modules", ...dep.split("/"));
  if (!existsSync(from)) continue;
  const to = path.join(app, "node_modules", ...dep.split("/"));
  mkdirSync(path.dirname(to), { recursive: true });
  symlinkSync(from, to, "junction");
}
writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));

/* ── contents ───────────────────────────────────────────────────────── */

check("the tarball holds dist, the readme and the licence — and no sources, tests or scripts", () => {
  for (const must of ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/index.d.ts", "dist/capture/index.js", "dist/capture/index.d.ts"]) {
    expect(files.includes(must), `missing ${must}`);
  }
  const stray = files.filter((f) => /^(src|test|scripts|playground|qa|coverage)\//.test(f) || /\.(test|spec)\./.test(f));
  expect(stray.length === 0, `should not ship: ${stray.join(", ")}`);
});

check("every file the exports map points to is in the tarball", () => {
  const targets = [];
  const walk = (node) => (typeof node === "string" ? targets.push(node.replace(/^\.\//, "")) : Object.values(node ?? {}).forEach(walk));
  walk(pkg.exports);
  for (const t of targets) expect(files.includes(t), `exports points to ${t}, not shipped`);
});

check('dist/index.js starts with "use client" and keeps the NODE_ENV guard', () => {
  const js = readFileSync(path.join(installed, "dist", "index.js"), "utf8");
  expect(js.startsWith('"use client"'), 'no "use client" at the top');
  const all = readdirSync(path.join(installed, "dist")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(path.join(installed, "dist", f), "utf8")).join("\n");
  expect(all.includes("process.env.NODE_ENV"), "the NODE_ENV guard was compiled away");
});

/* ── resolution ─────────────────────────────────────────────────────── */

const run = (file, source, env) => {
  writeFileSync(path.join(app, file), source);
  const result = spawnSync(process.execPath, [file], { cwd: app, env: { ...process.env, ...env }, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim());
  return result.stdout.trim();
};

for (const env of ["development", "production"]) {
  check(`import of both entry points works with no window (NODE_ENV=${env})`, () => {
    const out = run(
      `esm-${env}.mjs`,
      `import * as blix from "${pkg.name}";
       import * as capture from "${pkg.name}/capture";
       const need = ["attachHttpMonitor", "attachFetchMonitor", "tapQueryClient", "createReduxMonitorMiddleware", "tapRealtimeAdapter", "withInitiatorCapture", "captureEncrypted"];
       const missing = need.filter((n) => typeof capture[n] !== "function" || typeof blix[n] !== "function");
       if (missing.length) throw new Error("missing exports: " + missing);
       // Off without a window: every attach is a no-op that returns a disposer.
       const dispose = capture.attachFetchMonitor();
       if (typeof dispose !== "function") throw new Error("attachFetchMonitor did not return a disposer");
       const mw = capture.createReduxMonitorMiddleware();
       const passed = mw({ getState: () => ({}) })((a) => a)({ type: "t" });
       if (passed?.type !== "t") throw new Error("the middleware did not pass the action through");
       console.log("ok");`,
      { NODE_ENV: env },
    );
    expect(out === "ok", out);
  });
}

const [major, minor] = process.versions.node.split(".").map(Number);
const canRequireEsm = major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19);
check(`require() of both entry points (Node ${process.versions.node})`, () => {
  if (!canRequireEsm) return;
  const out = run(
    "cjs.cjs",
    `const blix = require("${pkg.name}");
     const capture = require("${pkg.name}/capture");
     if (typeof capture.attachHttpMonitor !== "function" || typeof blix.tapQueryClient !== "function") throw new Error("missing exports");
     console.log("ok");`,
    { NODE_ENV: "development" },
  );
  expect(out === "ok", out);
});

/* ── types ──────────────────────────────────────────────────────────── */

writeFileSync(
  path.join(app, "app.tsx"),
  `import { Blix, attachHttpMonitor, attachFetchMonitor, tapQueryClient, createReduxMonitorMiddleware, withInitiatorCapture, tapRealtimeAdapter, captureEncrypted } from "${pkg.name}";
import type { CapturedError, FailureKind } from "${pkg.name}/capture";
import axios from "axios";
import { QueryClient } from "@tanstack/react-query";
import { configureStore, createSlice } from "@reduxjs/toolkit";

const api = withInitiatorCapture(axios.create({ baseURL: "/api" }));
const disposeHttp: () => void = attachHttpMonitor(api);
const disposeFetch: () => void = attachFetchMonitor({ maxBodyBytes: 1024, ignore: ["/health", /\\.png$/] });
const client = new QueryClient();
const untap: () => void = tapQueryClient(client);
const slice = createSlice({ name: "s", initialState: { n: 0 }, reducers: { inc: (s) => void (s.n += 1) } });
const store = configureStore({ reducer: { s: slice.reducer }, middleware: (d) => d().concat(createReduxMonitorMiddleware({ ignore: ["s/inc"] })) });
api.interceptors.request.use((config) => {
  captureEncrypted(config, { request: "cipher" });
  return config;
});
const socket = tapRealtimeAdapter({ connect() {}, disconnect() {}, subscribe() {}, onMessage() {}, onPresenceUpdate() {} }, "ws");
const kind: FailureKind = "timeout";
const failure: CapturedError = { kind, message: "x" };
export const element = <Blix store={store} />;
void [disposeHttp, disposeFetch, untap, socket, failure, api.get<{ id: number }>("/x")];
`,
);
for (const resolution of ["bundler", "node16"]) {
  check(`a consumer type-checks (moduleResolution: ${resolution})`, () => {
    writeFileSync(
      path.join(app, `tsconfig.${resolution}.json`),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          jsx: "react-jsx",
          target: "ES2022",
          module: resolution === "bundler" ? "ESNext" : "Node16",
          moduleResolution: resolution,
          skipLibCheck: false,
          types: [],
        },
        files: ["app.tsx"],
      }),
    );
    const result = spawnSync(process.execPath, [path.join(app, "node_modules", "typescript", "bin", "tsc"), "-p", `tsconfig.${resolution}.json`], {
      cwd: app,
      encoding: "utf8",
    });
    // Errors from the peers' own .d.ts are theirs; only Blix's and ours count.
    const ours = (result.stdout + result.stderr).split("\n").filter((l) => /error TS/.test(l) && !/node_modules[\\/](?!@hakam)/.test(l));
    expect(ours.length === 0, ours.join("\n"));
  });
}

/* ── size ───────────────────────────────────────────────────────────── */

/** Gzipped bytes allowed per entry point, with the chunks each one loads at
 * once. Raised on purpose, never by accident. */
const BUDGET = { "dist/index.js": 36_000, "dist/capture/index.js": 35_000 };
check("the entry points stay inside their size budget (gzipped, static imports included)", () => {
  const over = [];
  for (const [entry, limit] of Object.entries(BUDGET)) {
    const seen = new Set();
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      for (const [, spec] of text.matchAll(/^import[^"']*["'](\.[^"']+)["']/gm)) walk(path.resolve(path.dirname(file), spec));
    };
    walk(path.join(installed, entry));
    const bytes = [...seen].reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);
    console.log(`    ${entry}: ${(bytes / 1024).toFixed(1)} KB gzipped (budget ${(limit / 1024).toFixed(0)} KB)`);
    if (bytes > limit) over.push(`${entry} ${bytes} > ${limit}`);
  }
  expect(over.length === 0, over.join("; "));
});

rmSync(work, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} check(s) failed` : "All package checks passed"} — ${pkg.name}@${pkg.version}, ${(packed.size / 1024).toFixed(1)} KB packed`);
process.exit(failed ? 1 : 0);
