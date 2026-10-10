/**
 * Redaction check. Needs no build: it bundles `src/capture` in memory.
 *
 * An `AxiosError` carries its request config as an enumerable property, and
 * that config's headers are the unmasked `Authorization` and `Cookie` that
 * were sent. Any path that copies an error structurally instead of describing
 * it puts those on a stored entry — which is exactly what the query, mutation
 * and Redux paths once did. This builds a real `AxiosError` holding five
 * secrets and asserts none of them survives, by any route, into what Blix
 * keeps.
 *
 * `node scripts/check-redaction.mjs [srcDir]` — the directory defaults to
 * `./src`, and is an argument so the check can be pointed at a scratch copy.
 * Nothing is written to disk.
 */

import { AxiosError, AxiosHeaders } from "axios";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const from = (file) => JSON.stringify(posix(path.join(src, "capture", file)));

const SECRETS = [
  "SECRET_TOKEN_123",
  "SECRET_COOKIE",
  "SECRET_KEY_456",
  "SECRET_BODY",
  "SECRET_SETCOOKIE",
];
const MAX = 32768;

/** The capture layer, bundled from source and loaded from memory. */
async function loadCapture() {
  const result = await build({
    stdin: {
      contents: `
        export { describeError } from ${from("monitorError.ts")};
        export { truncateForPersist } from ${from("monitorTruncate.ts")};
        export { tapQueryClient } from ${from("queryCapture.ts")};
        export { createReduxMonitorMiddleware } from ${from("reduxCapture.ts")};
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
    // Capture is on only in development and only in a browser; the banner is
    // the least that makes this process look like one.
    define: { "process.env.NODE_ENV": '"development"' },
    banner: { js: "globalThis.window ??= globalThis;" },
  });
  const code = Buffer.from(result.outputFiles[0].text).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}

/** A real AxiosError, as a failed request leaves one: config, headers, body
 * and response all attached. `data` is the response body. */
function axiosError(data = { error: "boom" }) {
  const config = {
    url: "/api/orders",
    method: "post",
    headers: new AxiosHeaders({
      Authorization: "Bearer SECRET_TOKEN_123",
      Cookie: "sid=SECRET_COOKIE",
      "x-api-key": "SECRET_KEY_456",
    }),
    data: JSON.stringify({ password: "SECRET_BODY" }),
  };
  const response = {
    status: 500,
    statusText: "Internal Server Error",
    data,
    headers: { "set-cookie": "SECRET_SETCOOKIE" },
    config,
  };
  return new AxiosError(
    "Request failed with status code 500",
    AxiosError.ERR_BAD_RESPONSE,
    config,
    {},
    response,
  );
}

const leaked = (value) => {
  const text = JSON.stringify(value) ?? "";
  return SECRETS.filter((secret) => text.includes(secret));
};
const noSecrets = (value) => {
  const found = leaked(value);
  if (found.length) throw new Error(`leaked ${found.join(", ")}`);
};
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const capture = await loadCapture();
const { describeError, truncateForPersist, networkMonitor } = capture;

/** The entry the store holds for the newest row matching `match`. */
const entryWhere = (match) => {
  const entry = networkMonitor.getSnapshot().find(match);
  expect(entry, "no entry was captured");
  return entry;
};

// The sanity check everything below rests on: the fixture really does hold
// the secrets where a structural copy would find them.
expect(
  leaked({ ...axiosError() }).length === SECRETS.length,
  "the AxiosError fixture does not expose all five secrets — the check proves nothing",
);

const scenarios = [
  {
    name: "1. describeError(AxiosError) contains none of the five secrets",
    run: () => noSecrets(describeError(axiosError(), MAX)),
  },
  {
    name: '2. …and is kind "http", status 500, with the response body',
    run: () => {
      const out = describeError(axiosError(), MAX);
      expect(out.kind === "http", `kind is ${JSON.stringify(out.kind)}`);
      expect(out.status === 500, `status is ${JSON.stringify(out.status)}`);
      expect(out.response?.error === "boom", "response.error is not \"boom\"");
    },
  },
  {
    name: '3. a 500 with an empty body is still kind "http"',
    run: () => {
      const out = describeError(axiosError(undefined), MAX);
      expect(out.kind === "http", `kind is ${JSON.stringify(out.kind)}`);
      expect(out.status === 500, `status is ${JSON.stringify(out.status)}`);
    },
  },
  {
    name: "4. truncateForPersist({ nested: { err } }) contains no secret",
    run: () => noSecrets(truncateForPersist({ nested: { err: axiosError() } }, MAX).value),
  },
  {
    name: "5. truncateForPersist masks an Authorization key at depth",
    run: () => {
      const out = truncateForPersist(
        { headers: { Authorization: "Bearer SECRET_TOKEN_123" } },
        MAX,
      ).value;
      noSecrets(out);
      expect(typeof out.headers.Authorization === "string", "the key was dropped, not masked");
    },
  },
  {
    name: "6. a plain object keeps its own fields through describeError",
    run: () => {
      const out = describeError(
        { message: "Validation failed", errors: [{ field: "phone" }] },
        MAX,
      );
      expect(out.errors?.[0]?.field === "phone", "errors[0].field was lost");
      expect(out.message === "Validation failed", "message was lost");
    },
  },
  {
    name: "7. a described error survives truncateForPersist whole (the copy written to IndexedDB)",
    run: () => {
      const described = describeError(axiosError(), MAX);
      const out = truncateForPersist(described, MAX).value;
      expect(out.kind === "http" && out.status === 500, "kind/status were lost");
      expect(out.response?.error === "boom", "the response body was lost");
      expect(Array.isArray(out.stack) === Array.isArray(described.stack), "the stack was lost");
    },
  },
  // The same guarantee, asserted where it matters: on the entry each capture
  // path actually stores.
  {
    name: "8. a failed query's stored entry contains no secret",
    run: () => {
      let emit = () => {};
      const cache = { subscribe: (fn) => ((emit = fn), () => {}), getAll: () => [] };
      const idle = { subscribe: () => () => {}, getAll: () => [] };
      capture.tapQueryClient({ getQueryCache: () => cache, getMutationCache: () => idle });
      emit({
        type: "updated",
        action: { type: "error" },
        query: {
          queryHash: '["orders"]',
          queryKey: ["orders"],
          state: { status: "error", error: axiosError() },
        },
      });
      const entry = entryWhere((e) => e.kind === "query" && e.method === "QUERY");
      noSecrets(entry);
      expect(entry.error?.kind === "http", "the stored error is not a described error");
    },
  },
  {
    name: "9. a failed mutation's stored entry contains no secret",
    run: () => {
      let emit = () => {};
      const cache = { subscribe: (fn) => ((emit = fn), () => {}), getAll: () => [] };
      const idle = { subscribe: () => () => {}, getAll: () => [] };
      capture.tapQueryClient({ getQueryCache: () => idle, getMutationCache: () => cache });
      emit({ type: "added", mutation: { mutationId: 1, state: { status: "idle" } } });
      emit({
        type: "updated",
        mutation: { mutationId: 1, state: { status: "error", error: axiosError() } },
      });
      const entry = entryWhere((e) => e.kind === "query" && e.method === "MUTATE");
      noSecrets(entry);
      expect(entry.error?.kind === "http", "the stored error is not a described error");
    },
  },
  {
    name: "10. a Redux action whose payload is an AxiosError stores no secret, and is not replayable",
    run: () => {
      const dispatch = capture.createReduxMonitorMiddleware()({ getState: () => ({}) })(
        (action) => action,
      );
      dispatch({ type: "orders/create/rejected", payload: axiosError(), error: true });
      const entry = entryWhere((e) => e.kind === "redux");
      noSecrets(entry);
      expect(entry.redux?.replayable === false, "the entry is still marked replayable");
      expect(entry.redux?.payload?.payload?.kind === "http", "the payload was not described");
    },
  },
  // An error is recognized by what it is, never by what its keys are called.
  // `config` and `stack` are the marks of an AxiosError — and of ordinary data.
  ...[
    { payload: { config: { theme: "dark" }, items: [1, 2, 3] } },
    { data: { user: { id: 1 }, config: { a: 1 } } },
    { stack: "react,node", team: "core" },
  ].map((value, i) => ({
    name: `${11 + i}. plain data ${JSON.stringify(value)} round-trips unchanged`,
    run: () => {
      const out = truncateForPersist(value, MAX);
      expect(
        JSON.stringify(out.value) === JSON.stringify(value),
        `stored as ${JSON.stringify(out.value)}`,
      );
      expect(out.truncated === false, "it was flagged as truncated");
      const described = describeError(value, MAX);
      expect(
        JSON.stringify(described) === JSON.stringify(value),
        `describeError stored it as ${JSON.stringify(described)}`,
      );
    },
  })),
  {
    name: "14. a Redux action with payload { config: { theme } } is stored as data, and stays replayable",
    run: () => {
      const dispatch = capture.createReduxMonitorMiddleware()({ getState: () => ({}) })(
        (action) => action,
      );
      dispatch({ type: "settings/loaded", payload: { config: { theme: "dark" } } });
      const entry = entryWhere((e) => e.kind === "redux" && e.url === "settings/loaded");
      const stored = entry.redux?.payload?.payload;
      expect(
        JSON.stringify(stored) === JSON.stringify({ config: { theme: "dark" } }),
        `payload stored as ${JSON.stringify(stored)}`,
      );
      expect(entry.redux?.replayable === true, "the entry is not replayable");
      expect(entry.state === "success", `the entry's state is ${entry.state}`);
    },
  },
  {
    name: "15. a plain object's config is kept, with the Authorization inside it masked by key",
    run: () => {
      const out = truncateForPersist(
        { config: { headers: { Authorization: "Bearer SECRET_TOKEN_123" }, retries: 2 } },
        MAX,
      ).value;
      noSecrets(out);
      expect(out.config?.retries === 2, "config was not kept");
      expect(typeof out.config?.headers?.Authorization === "string", "the key was dropped");
    },
  },
  {
    name: "15b. non-string values under credential-named keys are data: stored exactly, nothing flagged",
    run: () => {
      const value = {
        cookie: { accepted: true, version: 2 },
        authorization: { role: "admin" },
        "x-api-key": 7,
        "set-cookie": false,
        note: "ok",
      };
      const out = truncateForPersist(value, MAX);
      expect(
        JSON.stringify(out.value) === JSON.stringify(value),
        `stored as ${JSON.stringify(out.value)}`,
      );
      expect(out.truncated === false, "flagged as truncated although nothing was masked");
    },
  },
  {
    name: "15c. …and a Redux action carrying them stays replayable",
    run: () => {
      const payload = { cookie: { accepted: true, version: 2 }, authorization: { role: "admin" }, note: "ok" };
      const middleware = capture.createReduxMonitorMiddleware();
      middleware({ getState: () => ({}), dispatch: () => {} })((a) => a)({ type: "consent/set", payload });
      const entry = entryWhere((e) => e.kind === "redux" && e.url === "consent/set");
      expect(
        JSON.stringify(entry.redux.payload.payload) === JSON.stringify(payload),
        `stored as ${JSON.stringify(entry.redux.payload)}`,
      );
      expect(entry.redux.replayable === true, "the action is not replayable");
    },
  },
  {
    name: "15d. a credential string is still masked — at depth, inside such an object, and in a list",
    run: () => {
      const out = truncateForPersist(
        {
          authorization: "Bearer SECRET_TOKEN_123",
          cookie: { accepted: true, authorization: "Bearer SECRET_TOKEN_123" },
          "set-cookie": ["sid=SECRET_SETCOOKIE; Path=/", "theme=SECRET_COOKIE_VALUE_LONG"],
          nested: { Cookie: "sid=SECRET_COOKIE", "X-Api-Key": "SECRET_KEY_456" },
        },
        MAX,
      );
      noSecrets(out.value);
      expect(!JSON.stringify(out.value).includes("SECRET_COOKIE_VALUE_LONG"), "a set-cookie list item leaked");
      expect(out.value.cookie.accepted === true, "the object under `cookie` was not kept");
      expect(out.truncated === true, "masking a string was not flagged");
    },
  },
  {
    name: "16. an error from another realm is still recognized as an error",
    run: () => {
      const foreign = vm.runInNewContext("new Error('x')");
      expect(!(foreign instanceof Error), "the fixture is not from another realm");
      const described = describeError(foreign, MAX);
      expect(
        described?.message === "x" && typeof described.kind === "string",
        `described as ${JSON.stringify(described)}`,
      );
      const copied = truncateForPersist({ nested: foreign }, MAX);
      expect(copied.value.nested?.message === "x", "truncateForPersist did not collapse it");
      expect(copied.truncated === true, "the collapse was not flagged");
    },
  },
  {
    name: "17. an error from a second copy of axios (isAxiosError, not this realm's class) is recognized",
    run: () => {
      // What a duplicate axios in the bundle produces: the brand, the config,
      // and a prototype that is not this realm's Error.
      const real = axiosError();
      const foreign = Object.assign(Object.create(null), {
        isAxiosError: true,
        message: real.message,
        code: real.code,
        config: real.config,
        response: real.response,
      });
      noSecrets(describeError(foreign, MAX));
      noSecrets(truncateForPersist({ nested: foreign }, MAX).value);
    },
  },
];

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

console.log(
  `\n${failed === 0 ? "All" : `${failed} of`} ${scenarios.length} scenarios ${failed === 0 ? "passed" : "failed"} — ${posix(src)}`,
);
process.exit(failed === 0 ? 0 : 1);
