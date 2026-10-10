/**
 * Production-guard check. Run after `pnpm build`.
 *
 * Bundles the published `dist/` the way a consuming app would for production
 * and asserts two things the source cannot show by itself:
 *
 * 1. **It evaluates where there is no `process`.** Only Next.js inlines
 *    `NEXT_PUBLIC_BLIX`; on any other bundler the read survives to runtime,
 *    and a browser has no `process` global. The bundle is run in a `node:vm`
 *    context that has none.
 * 2. **The opt-in decides whether the panel ships.** `"false"` must remove it
 *    from the root entry; `"true"` must keep it.
 *
 * `node scripts/check-prod-guard.mjs [distDir]` — the directory defaults to
 * `./dist`, and is an argument so the check can be pointed at a scratch copy.
 */

import { build } from "esbuild";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.argv[2] ?? path.join(root, "dist"));

/** Blix's own code left in a build that opted out: the `Blix` shell and
 * nothing else. React is bundled, and not counted. */
const OPT_OUT_MAX_BYTES = 2048;
/** The panel's root class — present exactly when the panel's code is. */
const PANEL_MARK = "nm-root";

const posix = (p) => p.split(path.sep).join("/");

/**
 * One production bundle of `source`, as a consuming app would make it.
 * React is bundled rather than external, so the output is self-contained and
 * can be evaluated with no module loader.
 */
async function bundle(source, define = {}) {
  const result = await build({
    stdin: { contents: source, resolveDir: root, loader: "js" },
    bundle: true,
    write: false,
    format: "iife",
    minify: true,
    metafile: true,
    platform: "browser",
    logLevel: "silent",
    // So a `dist` outside the repo still resolves `react`.
    nodePaths: [path.join(root, "node_modules")],
    define: { "process.env.NODE_ENV": '"production"', ...define },
  });
  const [file] = result.outputFiles;
  const [meta] = Object.values(result.metafile.outputs);
  // What Blix itself contributes, leaving out React and esbuild's runtime.
  const distPrefix = posix(path.relative(root, dist));
  const distAbs = posix(dist);
  let ownBytes = 0;
  for (const [input, { bytesInOutput }] of Object.entries(meta.inputs)) {
    const at = posix(input);
    if (at.startsWith(`${distPrefix}/`) || at.startsWith(`${distAbs}/`)) ownBytes += bytesInOutput;
  }
  return { code: file.text, ownBytes };
}

const entryPath = (file) => JSON.stringify(posix(path.join(dist, file)));

/**
 * Evaluates a whole entry point — every export kept, so every module's
 * top-level code runs — in a context with a `window` and **no `process`**.
 */
async function evaluatesWithoutProcess(file) {
  const { code } = await bundle(
    `import * as blix from ${entryPath(file)}; globalThis.__blix = blix;`,
  );
  // The minimum a browser-shaped global needs for the bundle to evaluate.
  // Never add `process` here: its absence is the point.
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {};
  const context = vm.createContext(sandbox);
  if (vm.runInContext("typeof process", context) !== "undefined") {
    throw new Error("the sandbox has a `process` global — the check proves nothing");
  }
  vm.runInContext(code, context, { filename: `${file} (production bundle)` });

  const exported = sandbox.__blix;
  if (!exported || typeof exported.attachHttpMonitor !== "function") {
    throw new Error("the bundle evaluated but exported no attachHttpMonitor");
  }
  // Off in production: attaching must be a no-op that touches nothing.
  const target = new Proxy({}, { get: () => { throw new Error("capture ran in a production build"); } });
  exported.attachHttpMonitor(target)();
}

const onlyBlix = () => `import { Blix } from ${entryPath("index.js")}; globalThis.__Blix = Blix;`;

const scenarios = [
  {
    name: "dist/index.js evaluates with NODE_ENV=production and no `process` global",
    run: () => evaluatesWithoutProcess("index.js"),
  },
  {
    name: "dist/capture/index.js evaluates with NODE_ENV=production and no `process` global",
    run: () => evaluatesWithoutProcess("capture/index.js"),
  },
  {
    name: `opt-out: NEXT_PUBLIC_BLIX="false" removes the panel from dist/index.js`,
    run: async () => {
      const { code, ownBytes } = await bundle(onlyBlix(), {
        "process.env.NEXT_PUBLIC_BLIX": '"false"',
      });
      if (code.includes(PANEL_MARK)) throw new Error(`the output still contains "${PANEL_MARK}"`);
      if (ownBytes >= OPT_OUT_MAX_BYTES) {
        throw new Error(`Blix contributes ${ownBytes} B, over the ${OPT_OUT_MAX_BYTES} B limit`);
      }
      return `${ownBytes} B of Blix`;
    },
  },
  {
    name: `opt-in: NEXT_PUBLIC_BLIX="true" keeps the panel in dist/index.js`,
    run: async () => {
      const { code, ownBytes } = await bundle(onlyBlix(), {
        "process.env.NEXT_PUBLIC_BLIX": '"true"',
      });
      if (!code.includes(PANEL_MARK)) throw new Error(`the output does not contain "${PANEL_MARK}"`);
      return `${ownBytes} B of Blix`;
    },
  },
];

if (!existsSync(path.join(dist, "index.js"))) {
  console.error(`✗ ${posix(dist)}/index.js not found — run \`pnpm build\` first`);
  process.exit(1);
}

let failed = 0;
for (const scenario of scenarios) {
  try {
    const note = await scenario.run();
    console.log(`✓ ${scenario.name}${note ? ` (${note})` : ""}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${scenario.name}\n    ${message.split("\n")[0]}`);
  }
}

console.log(
  `
${failed === 0 ? "All" : `${failed} of`} ${scenarios.length} scenarios ${failed === 0 ? "passed" : "failed"} — ${posix(dist)}`,
);
process.exit(failed === 0 ? 0 : 1);
