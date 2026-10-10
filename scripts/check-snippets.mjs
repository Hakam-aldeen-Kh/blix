/**
 * Snippet check. Needs no build: it bundles `src/` in memory.
 *
 * "Copy as cURL" produces text a developer pastes into a shell, built from
 * what a page sent — and the fetch and XHR wrappers record a method and a
 * header name before the browser validates them, so both can be any string a
 * script on the page chose. This builds a request made of shell injection
 * attempts, *runs* the generated snippet in bash with `curl` replaced by a
 * function that only prints its arguments, and asserts two things: no
 * injected command ran, and curl received exactly the arguments captured.
 *
 * `node scripts/check-snippets.mjs [srcDir]` — the directory defaults to
 * `./src`, and is an argument so the check can be pointed at a scratch copy.
 * Nothing is written in the repo; the marker lives in an OS temp directory
 * that is removed afterwards.
 */

import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const from = (file) => JSON.stringify(posix(path.join(src, file)));

/* ───────────────────────────── bash, or skip ──────────────────────────── */

const probe = spawnSync("bash", ["-c", 'printf "%s" "$BLIX_PROBE"'], {
  env: { ...process.env, BLIX_PROBE: "ok" },
  encoding: "utf8",
});
if (probe.error || probe.status !== 0 || probe.stdout !== "ok") {
  const why = probe.error ? probe.error.message : `exit ${probe.status}`;
  console.log(
    `– skipped: no usable \`bash\` on PATH (${why}). The cURL snippet is checked by running it, so this needs bash.`,
  );
  // A skipped security check must not read as a pass where it gates a merge.
  process.exit(process.env.CI ? 1 : 0);
}

/* ─────────────────────────────── fixtures ─────────────────────────────── */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blix-snippets-"));
const marker = posix(path.join(tmp, "pwned"));

// Each field is an attempt to get a command run by the shell that the snippet
// is pasted into. Every one of them tries to create the marker file.
const hostile = {
  method: 'GET; touch "$BLIX_MARKER"; echo',
  headerName: `x'; touch "$BLIX_MARKER"; echo '`,
  headerValue: `v'$(touch "$BLIX_MARKER")'\n\`touch "$BLIX_MARKER"\``,
  url: `https://example.test/p?a='$(touch "$BLIX_MARKER")'`,
  body: `{"a":"'; touch \\"$BLIX_MARKER\\"; echo '"}`,
};
const hostileEntry = {
  id: "h1",
  seq: 1,
  kind: "http",
  state: "success",
  method: hostile.method,
  url: hostile.url,
  requestHeaders: { [hostile.headerName]: hostile.headerValue },
  requestPayload: hostile.body,
};
const hostileHeader = `${hostile.headerName}: ${hostile.headerValue.replace(/[\r\n]+/g, " ")}`;

// A header as Blix stores it: `Authorization` already masked at capture.
const normalEntry = {
  id: "n1",
  seq: 2,
  kind: "http",
  state: "success",
  status: 200,
  durationMs: 42,
  method: "GET",
  baseURL: "https://api.example.test",
  url: "/v1/orders?page=2",
  requestHeaders: {
    Authorization: "Bearer e…abcd (masked)",
    "Content-Type": "application/json",
  },
  requestPayload: { name: "O'Brien", tags: ["a", "b"] },
};

/* ──────────────────────────────── helpers ─────────────────────────────── */

async function load() {
  const result = await build({
    stdin: {
      contents: `
        export { toCurl, toFetch } from ${from("ui/services/snippets.ts")};
        export { toCurlScript } from ${from("ui/services/exportFormats.ts")};
      `,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
    nodePaths: [path.join(root, "node_modules")],
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const code = Buffer.from(result.outputFiles[0].text).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const markerExists = () => fs.existsSync(marker);
const clearMarker = () => fs.rmSync(marker, { force: true });

/**
 * Runs shell text in bash with `curl` replaced by a function that prints each
 * of its arguments followed by NUL — so nothing reaches the network, and what
 * comes back is exactly the argument list curl would have been given.
 */
function runInBash(snippet) {
  clearMarker();
  const result = spawnSync("bash", ["-c", `curl(){ printf '%s\\0' "$@"; }\n${snippet}`], {
    env: { ...process.env, BLIX_MARKER: marker },
    encoding: "utf8",
  });
  const args = (result.stdout ?? "").split("\0");
  args.pop(); // the empty string after the final NUL
  return { status: result.status, stderr: result.stderr ?? "", args };
}

const sameArgs = (got, want) => {
  expect(
    got.length === want.length && got.every((arg, i) => arg === want[i]),
    `curl received ${got.length} argument(s), expected ${want.length}:\n` +
      `      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`,
  );
};

/** Runs a fetch snippet against a stub and returns what it was called with. */
async function runFetchSnippet(snippet) {
  const calls = [];
  const sandbox = {
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve({ json: () => null });
    },
    JSON,
  };
  // Compiles first, on its own: a snippet that is not valid JavaScript is a
  // failure whatever it would have done.
  const script = new vm.Script(`(async () => {\n${snippet}\n})()`);
  await script.runInNewContext(sandbox);
  expect(calls.length === 1, `fetch was called ${calls.length} time(s)`);
  return calls[0];
}

/* ─────────────────────────────── scenarios ────────────────────────────── */

const { toCurl, toFetch, toCurlScript } = await load();

const scenarios = [
  {
    name: "1. hostile cURL snippet runs in bash without executing anything injected",
    run: () => {
      const out = runInBash(toCurl(hostileEntry));
      expect(!markerExists(), "an injected command ran: the marker file was created");
      expect(out.status === 0, `bash exited ${out.status}: ${out.stderr.trim().split("\n")[0]}`);
    },
  },
  {
    name: "2. …and curl receives exactly the captured values, each as one argument",
    run: () => {
      const out = runInBash(toCurl(hostileEntry));
      sameArgs(out.args, [
        hostile.url,
        "-X",
        "GET",
        "-H",
        hostileHeader,
        "--data-raw",
        hostile.body,
      ]);
    },
  },
  {
    name: "3. a normal request round-trips to the expected curl arguments",
    run: () => {
      const out = runInBash(toCurl(normalEntry));
      expect(out.status === 0 && !markerExists(), `bash exited ${out.status}`);
      sameArgs(out.args, [
        "https://api.example.test/v1/orders?page=2",
        "-X",
        "GET",
        "-H",
        "Authorization: Bearer e…abcd (masked)",
        "-H",
        "Content-Type: application/json",
        "--data-raw",
        `{"name":"O'Brien","tags":["a","b"]}`,
      ]);
    },
  },
  {
    name: "4. the exported cURL script runs both requests and nothing else",
    run: () => {
      // A status and a duration as a tampered stored record could hold them:
      // the script's comment line is the one place that is not a curl argument.
      const tampered = {
        ...hostileEntry,
        status: '200\ntouch "$BLIX_MARKER"',
        durationMs: '1\ntouch "$BLIX_MARKER"',
      };
      const out = runInBash(toCurlScript([tampered, normalEntry]));
      expect(!markerExists(), "an injected command ran: the marker file was created");
      expect(out.status === 0, `bash exited ${out.status}: ${out.stderr.trim().split("\n")[0]}`);
      expect(out.args.length === 7 + 9, `curl received ${out.args.length} arguments, expected 16`);
    },
  },
  {
    name: "5. hostile fetch snippet compiles, and calls fetch with exactly the captured values",
    run: async () => {
      clearMarker();
      const call = await runFetchSnippet(toFetch(hostileEntry));
      expect(!markerExists(), "the marker file was created");
      expect(call.url === hostile.url, `url is ${JSON.stringify(call.url)}`);
      expect(call.init.method === "GET", `method is ${JSON.stringify(call.init.method)}`);
      const names = Object.keys(call.init.headers);
      expect(
        names.length === 1 && names[0] === hostile.headerName,
        `header names are ${JSON.stringify(names)}`,
      );
      expect(call.init.headers[hostile.headerName] === hostile.headerValue, "header value differs");
      expect(call.init.body === hostile.body, `body is ${JSON.stringify(call.init.body)}`);
    },
  },
  {
    name: "6. a normal fetch snippet sends the captured method, headers and JSON body",
    run: async () => {
      const call = await runFetchSnippet(toFetch(normalEntry));
      expect(call.url === "https://api.example.test/v1/orders?page=2", "url differs");
      expect(call.init.method === "GET", "method differs");
      expect(call.init.headers["Content-Type"] === "application/json", "headers differ");
      expect(call.init.body === `{"name":"O'Brien","tags":["a","b"]}`, "body differs");
    },
  },
];

let failed = 0;
try {
  for (const scenario of scenarios) {
    try {
      await scenario.run();
      console.log(`✓ ${scenario.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`✗ ${scenario.name}\n    ${message}`);
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(
  `\n${failed === 0 ? "All" : `${failed} of`} ${scenarios.length} scenarios ${failed === 0 ? "passed" : "failed"} — ${posix(src)}`,
);
process.exit(failed === 0 ? 0 : 1);
