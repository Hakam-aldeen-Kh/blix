/**
 * Isolation check. Needs no build: it bundles `src/` in memory.
 *
 * Blix is mounted inside somebody else's app, so the one thing it must never
 * do is take that app down with it. Three ways it could, each asserted here:
 * web storage that throws on access, a stored preference of a shape this build
 * does not expect, and an error thrown while the panel renders.
 *
 * `node scripts/check-isolation.mjs [srcDir]` — the directory defaults to
 * `./src`, and is an argument so the check can be pointed at a scratch copy.
 * Nothing is written to disk.
 */

import { build } from "esbuild";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const from = (file) => JSON.stringify(posix(path.join(src, file)));

// A browser-shaped global, in place before React and the capture layer are
// evaluated: both decide what they are running in at module load.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
// `navigator` is a getter-only global in Node, hence defineProperty for all.
for (const name of ["window", "document", "navigator"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name],
    configurable: true,
    writable: true,
  });
}

/** Blix and React, bundled together from source and loaded from memory — one
 * React for the boundary and for the renderer. */
async function load() {
  const result = await build({
    stdin: {
      contents: `
        export { BlixBoundary } from ${from("ui/BlixBoundary.tsx")};
        export {
          DEFAULT_PREFS,
          readPrefsSync,
          sanitizePrefs,
          savePrefs,
        } from ${from("capture/monitorPersistence.ts")};
        export { createElement, Fragment } from "react";
        export { createRoot } from "react-dom/client";
        export { flushSync } from "react-dom";
      `,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    logLevel: "silent",
    // So a `src` outside the repo still resolves `react`.
    nodePaths: [path.join(root, "node_modules")],
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const code = Buffer.from(result.outputFiles[0].text).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
/** Structural equality, whatever order the keys were written in. */
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v,
  );
const same = (a, b) => canonical(a) === canonical(b);

const blix = await load();
const { DEFAULT_PREFS, sanitizePrefs } = blix;

/** Runs `fn` with `window.localStorage` replaced, then puts it back. */
function withStorage(descriptor, fn) {
  const original = Object.getOwnPropertyDescriptor(dom.window, "localStorage");
  Object.defineProperty(dom.window, "localStorage", { configurable: true, ...descriptor });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(dom.window, "localStorage", original);
    else delete dom.window.localStorage;
  }
}
const securityError = () => {
  throw new dom.window.DOMException("The operation is insecure.", "SecurityError");
};

const scenarios = [
  {
    name: "1a. localStorage.getItem/setItem throwing SecurityError: prefs are the defaults, nothing throws",
    run: () =>
      withStorage(
        { value: { getItem: securityError, setItem: securityError, removeItem: securityError } },
        () => {
          expect(same(blix.readPrefsSync(), DEFAULT_PREFS), "prefs are not the defaults");
          blix.savePrefs({ density: "normal" });
        },
      ),
  },
  {
    name: "1b. the localStorage property itself throwing (sandboxed iframe): same",
    run: () =>
      withStorage({ get: securityError }, () => {
        expect(same(blix.readPrefsSync(), DEFAULT_PREFS), "prefs are not the defaults");
        blix.savePrefs({ density: "compact" });
      }),
  },
  {
    name: "2. sanitizePrefs keeps the valid field and drops the three invalid ones",
    run: () => {
      // The brief's { mode, float, width, height } with the last two under the
      // names the prefs actually use — `width`/`height` are not preferences.
      const out = sanitizePrefs({ mode: "diagonal", float: null, bottomH: "abc", rightW: 300 });
      expect(same(out, { rightW: 300 }), `got ${JSON.stringify(out)}`);
    },
  },
  {
    name: "2b. …drops keys that are not preferences, and merges to a complete, valid set",
    run: () => {
      const out = sanitizePrefs({ width: "abc", height: 300, mode: "left", topH: -5, leftW: 640 });
      expect(same(out, { mode: "left", leftW: 640 }), `got ${JSON.stringify(out)}`);
      const merged = { ...DEFAULT_PREFS, ...out };
      expect(merged.topH === DEFAULT_PREFS.topH, "an invalid field did not fall back");
      expect(merged.float.size.w > 0, "float geometry is not usable");
    },
  },
  {
    name: "2c. …keeps every default unchanged (a valid value is never dropped)",
    run: () => expect(same(sanitizePrefs(DEFAULT_PREFS), DEFAULT_PREFS), "a default was dropped"),
  },
  {
    name: '3. sanitizePrefs("garbage"), (null), ([]) → {}',
    run: () => {
      for (const raw of ["garbage", null, [], 42, undefined]) {
        expect(same(sanitizePrefs(raw), {}), `sanitizePrefs(${JSON.stringify(raw)}) is not {}`);
      }
    },
  },
  {
    name: "3b. a corrupt mirror in localStorage reads back as valid prefs",
    run: () => {
      for (const stored of ['{"float":null,"mode":7,"density":"huge"}', "{not json", '"a string"', "[]"]) {
        dom.window.localStorage.setItem("blix:default:prefs", stored);
        const prefs = blix.readPrefsSync();
        expect(same(prefs, DEFAULT_PREFS), `${stored} produced ${JSON.stringify(prefs)}`);
      }
      dom.window.localStorage.clear();
    },
  },
  {
    name: "4. an error thrown inside <BlixBoundary> leaves its sibling rendered, with one [blix] error",
    run: () => {
      const { createElement: h, Fragment, BlixBoundary, createRoot, flushSync } = blix;
      const Sibling = () => h("p", { id: "host" }, "host app");
      const Thrower = () => {
        throw new Error("panel exploded");
      };
      const container = dom.window.document.createElement("div");
      dom.window.document.body.appendChild(container);

      const logged = [];
      const original = console.error;
      console.error = (...args) => logged.push(args);
      let thrown = null;
      const uncaught = [];
      // Without a boundary React 19 reports the error here rather than
      // throwing from render(), so this is where "reached the host" shows.
      const root = createRoot(container, { onUncaughtError: (error) => uncaught.push(error) });
      try {
        flushSync(() =>
          root.render(h(Fragment, null, h(Sibling), h(BlixBoundary, null, h(Thrower)))),
        );
      } catch (error) {
        thrown = error;
      } finally {
        console.error = original;
      }
      const html = container.innerHTML;
      flushSync(() => root.unmount());
      container.remove();

      expect(thrown === null, `render threw to the caller: ${thrown?.message}`);
      expect(uncaught.length === 0, `the error escaped the boundary: ${uncaught[0]?.message}`);
      expect(html.includes("host app"), `the sibling is gone — rendered ${JSON.stringify(html)}`);
      const ours = logged.filter((args) => typeof args[0] === "string" && args[0].startsWith("[blix]"));
      expect(ours.length === 1, `${ours.length} [blix] console.error calls, expected exactly 1`);
      expect(ours[0][1]?.message === "panel exploded", "the logged error is not the thrown one");
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
// `savePrefs` leaves a write timer pending; nothing here needs to wait for it.
process.exit(failed === 0 ? 0 : 1);
