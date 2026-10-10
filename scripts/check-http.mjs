/**
 * Axios capture check. Needs no build: it bundles `src/capture` in memory.
 *
 * Blix registers last in an instance's response chain, downstream of whatever
 * the host's own interceptors did to a response or an error. Two things a host
 * routinely does there must not change which request an answer is recorded
 * against, or what is recorded:
 *
 * - **Unwrapping** (`r => r.data`). What reaches Blix is then the body itself,
 *   and a body is ordinary data — it can have a `config` key, a `status`, a
 *   `headers`. Only a config Blix stamped says "this is an axios response".
 * - **Replacing errors** (`Promise.reject(new ApiError())`) with nothing that
 *   links back to the original. Such an error belongs to the request that just
 *   failed on the wire, never to another one that happens to be in flight.
 *
 * Runs real axios with a stub adapter, so nothing touches the network.
 *
 * `node scripts/check-http.mjs [srcDir]` — the directory defaults to `./src`,
 * and is an argument so the check can be pointed at a scratch copy.
 */

import axios, { AxiosError } from "axios";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const from = (file) => JSON.stringify(posix(path.join(src, "capture", file)));

async function loadCapture() {
  const result = await build({
    stdin: {
      contents: `
        export { attachHttpMonitor } from ${from("attachHttp.ts")};
        export { networkMonitor } from ${from("networkMonitor.ts")};
      `,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
    external: ["axios"],
    define: { "process.env.NODE_ENV": '"development"' },
    banner: { js: "globalThis.window ??= globalThis;" },
  });
  const code = Buffer.from(result.outputFiles[0].text).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}

const { attachHttpMonitor, networkMonitor } = await loadCapture();

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const entryFor = (url) => {
  const entry = networkMonitor.getSnapshot().find((e) => e.url === url);
  expect(entry, `no entry was captured for ${url}`);
  return entry;
};

/**
 * An instance whose adapter answers from `routes`: `{ status, data, delay }`
 * per URL. A status of 400 or more rejects the way axios's own adapters do.
 */
function instanceWith(routes) {
  return axios.create({
    adapter: async (config) => {
      const route = routes[config.url];
      if (route.delay) await wait(route.delay);
      const response = {
        data: route.data,
        status: route.status,
        statusText: route.status === 200 ? "OK" : "Error",
        headers: { "content-type": "application/json" },
        config,
      };
      if (route.status >= 400) {
        throw new AxiosError(
          `Request failed with status code ${route.status}`,
          AxiosError.ERR_BAD_RESPONSE,
          config,
          {},
          response,
        );
      }
      return response;
    },
  });
}

class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiError";
  }
}

const BODY_WITH_CONFIG = { config: { a: 1 }, items: [1], status: "active" };

const scenarios = [
  {
    name: "1. unwrapped body with its own `config` key is stored whole, with the HTTP status",
    run: async () => {
      const api = instanceWith({ "/flags": { status: 200, data: BODY_WITH_CONFIG } });
      api.interceptors.response.use((r) => r.data);
      attachHttpMonitor(api);
      const body = await api.get("/flags");
      expect(body === BODY_WITH_CONFIG, "the host did not receive its body unchanged");
      const entry = entryFor("/flags");
      expect(
        JSON.stringify(entry.responsePayload) === JSON.stringify(BODY_WITH_CONFIG),
        `stored response is ${JSON.stringify(entry.responsePayload)}`,
      );
      expect(entry.status === 200, `stored status is ${JSON.stringify(entry.status)}`);
      expect(entry.state === "success", `state is ${entry.state}`);
    },
  },
  {
    name: "2. …and a body with `config.headers` does not replace the request headers",
    run: async () => {
      const data = { config: { headers: { "x-from-body": "1" } }, headers: { nope: "1" } };
      const api = instanceWith({ "/settings": { status: 200, data } });
      api.interceptors.response.use((r) => r.data);
      attachHttpMonitor(api);
      await api.get("/settings", { headers: { "x-sent": "yes" } });
      const entry = entryFor("/settings");
      expect(entry.requestHeaders?.["x-sent"] === "yes", "the sent header is gone");
      expect(
        !("x-from-body" in (entry.requestHeaders ?? {})),
        "a header from the response body was stored as a request header",
      );
      expect(
        JSON.stringify(entry.responsePayload) === JSON.stringify(data),
        `stored response is ${JSON.stringify(entry.responsePayload)}`,
      );
    },
  },
  {
    name: "3. an unwrapped body without a `config` key is still stored (control)",
    run: async () => {
      const api = instanceWith({ "/plain": { status: 200, data: { rows: [1, 2] } } });
      api.interceptors.response.use((r) => r.data);
      attachHttpMonitor(api);
      await api.get("/plain");
      const entry = entryFor("/plain");
      expect(JSON.stringify(entry.responsePayload) === '{"rows":[1,2]}', "body not stored");
      expect(entry.status === 200, `status is ${entry.status}`);
    },
  },
  {
    name: "4. a host error object carrying its own `config` keeps the wire failure it replaced",
    run: async () => {
      const api = instanceWith({ "/fail-config": { status: 500, data: { error: "boom" } } });
      api.interceptors.response.use(undefined, (error) =>
        Promise.reject(
          Object.assign(new ApiError("normalised"), {
            config: { retry: false },
            cause: error,
          }),
        ),
      );
      attachHttpMonitor(api);
      await api.get("/fail-config").catch(() => {});
      const entry = entryFor("/fail-config");
      expect(entry.state === "error" && entry.status === 500, `state ${entry.state}, status ${entry.status}`);
      expect(entry.error?.kind === "http", `error kind is ${entry.error?.kind}`);
      expect(
        JSON.stringify(entry.error?.response) === '{"error":"boom"}',
        `the response body was lost: ${JSON.stringify(entry.error)}`,
      );
    },
  },
  {
    name: "5. an unlinked host error never marks another in-flight request as failed",
    run: async () => {
      const api = instanceWith({
        "/slow-a": { status: 200, data: { ok: true }, delay: 250 },
        "/fail-b": { status: 500, data: { error: "boom" } },
      });
      api.interceptors.response.use(
        (r) => r,
        () => Promise.reject(new ApiError("normalised: 500")),
      );
      attachHttpMonitor(api);
      const a = api.get("/slow-a");
      await api.get("/fail-b").catch(() => {});
      await wait(20);
      const during = entryFor("/slow-a");
      expect(
        during.state === "pending" && during.error === undefined,
        `A is ${during.state} with ${JSON.stringify(during.error)} while still in flight`,
      );
      const b = entryFor("/fail-b");
      expect(b.state === "error" && b.status === 500, `B is ${b.state} ${b.status}`);
      await a;
      const after = entryFor("/slow-a");
      expect(after.state === "success" && after.status === 200, `A ended ${after.state}`);
    },
  },
  {
    name: "6. a request interceptor that throws is still settled as a setup failure",
    run: async () => {
      const api = instanceWith({ "/never-sent": { status: 200, data: {} } });
      // Something ahead of Blix in the response chain, so the wire tap exists.
      api.interceptors.response.use((r) => r);
      // Registered before Blix's, so it runs after it: the entry has started.
      api.interceptors.request.use(() => {
        throw new Error("refused to sign");
      });
      attachHttpMonitor(api);
      await api.get("/never-sent").catch(() => {});
      const entry = entryFor("/never-sent");
      expect(entry.state === "error", `state is ${entry.state}`);
      expect(entry.error?.kind === "setup", `kind is ${entry.error?.kind}`);
    },
  },
  {
    name: "7. …and with nothing of the host's ahead of Blix, the tail still claims it",
    run: async () => {
      const api = instanceWith({ "/never-sent-2": { status: 200, data: {} } });
      api.interceptors.request.use(() => {
        throw new Error("refused to sign");
      });
      attachHttpMonitor(api);
      await api.get("/never-sent-2").catch(() => {});
      const entry = entryFor("/never-sent-2");
      expect(entry.state === "error", `state is ${entry.state}`);
      expect(entry.error?.kind === "setup", `kind is ${entry.error?.kind}`);
    },
  },
];

let failed = 0;
for (const scenario of scenarios) {
  try {
    await scenario.run();
    console.log(`✓ ${scenario.name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${scenario.name}\n    ${message.split("\n")[0].slice(0, 240)}`);
  }
}

console.log(
  `\n${failed === 0 ? "All" : `${failed} of`} ${scenarios.length} scenarios ${failed === 0 ? "passed" : "failed"} — ${posix(src)}`,
);
process.exit(failed === 0 ? 0 : 1);
