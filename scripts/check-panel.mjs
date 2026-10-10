/**
 * Panel check. Needs no build: it bundles `src/ui` in memory and runs it in
 * jsdom.
 *
 * What the panel does to the page it is mounted in, and the few things about
 * its own chrome that can be asserted without a browser:
 *
 * - A docked panel reserves its side with inline padding on `<html>`. That
 *   element is the host's: the padding must be the host's again when the dock
 *   goes away, the `--blix-dock-*` variables must exist only while a side is
 *   reserved, nothing may be written once the panel has unmounted, and a host
 *   that saved Blix's value — a scroll-lock does — must not be able to hand it
 *   back to a page with no dock on it. Blix never writes in answer to somebody
 *   else's write: what cleans up after a release only removes its own value,
 *   once, and stops after 30 s, on the next dock and on unmount.
 * - The Close button is there at every panel width.
 * - "Copy response" copies the server's body, not Blix's description of the
 *   failure.
 * - The theme contrast report is opt-in.
 *
 * `node scripts/check-panel.mjs [srcDir]` — the directory defaults to `./src`,
 * and is an argument so the check can be pointed at a scratch copy.
 */

import { build } from "esbuild";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");
const from = (file) => JSON.stringify(posix(path.join(src, file)));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  // For requestAnimationFrame: a dock resize reserves once per frame.
  pretendToBeVisual: true,
});
for (const name of ["window", "document", "navigator"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name],
    configurable: true,
    writable: true,
  });
}
for (const name of ["requestAnimationFrame", "cancelAnimationFrame", "MutationObserver"]) {
  globalThis[name] = dom.window[name].bind?.(dom.window) ?? dom.window[name];
}
// The panel opens docked to the right at its default width. Read once, when
// the prefs store is first asked, so it has to be in place before the bundle.
dom.window.localStorage.setItem("blix:default:prefs", JSON.stringify({ mode: "right" }));

async function load() {
  const result = await build({
    stdin: {
      contents: `
        export { useDockGeometry } from ${from("ui/hooks/useDockGeometry.ts")};
        export { MonitorToolbar } from ${from("ui/components/MonitorToolbar.tsx")};
        export * as format from ${from("ui/helpers/format.ts")};
        export { assertThemes } from ${from("ui/themes/check.ts")};
        export { createElement, useRef } from "react";
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
    nodePaths: [path.join(root, "node_modules")],
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const code = Buffer.from(result.outputFiles[0].text).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}

const blix = await load();
const { createElement: h, createRoot, flushSync, useRef, useDockGeometry } = blix;

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
/** Long enough for effects, the style observer and a frame. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
const html = dom.window.document.documentElement;
const styleAttr = () => html.getAttribute("style") ?? "";
const prop = (name) => html.style.getPropertyValue(name);

/**
 * A panel reduced to what touches `<html>`: the dock hook, a node for it to
 * size, and the grip that resizes it. `dock` is the hook's latest result.
 */
let dock = null;
function Panel({ open }) {
  const panelRef = useRef(null);
  dock = useDockGeometry(open, panelRef);
  return open
    ? h("div", { ref: panelRef }, h("div", { id: "grip", onPointerDown: dock.startDockResize }))
    : null;
}

async function mount(open) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const reactRoot = createRoot(container);
  const render = async (next) => {
    flushSync(() => reactRoot.render(h(Panel, { open: next })));
    await settle();
  };
  await render(open);
  return {
    render,
    setMode: async (mode) => {
      flushSync(() => dock.setMode(mode));
      await settle();
    },
    unmount: async () => {
      flushSync(() => reactRoot.unmount());
      container.remove();
      await settle();
    },
  };
}

const pointer = (type, target, clientX) =>
  target.dispatchEvent(
    new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 300 }),
  );

const TOOLBAR_PROPS = {
  query: "",
  onQuery() {},
  searchRef: { current: null },
  deepSearch: false,
  onDeepSearch() {},
  searching: false,
  shown: 0,
  total: 0,
  paused: false,
  onTogglePause() {},
  preserveLog: false,
  onTogglePreserve() {},
  onExportMenu() {},
  exportOpen: false,
  exportDisabled: true,
  onClearSection() {},
  clearDisabled: true,
  sectionLabel: "Network",
  onThemeMenu() {},
  themeOpen: false,
  themeLabel: "Daylight",
  onMoreMenu() {},
  moreOpen: false,
  onOpenPalette() {},
  mode: "right",
  onMode() {},
  maximized: false,
  onToggleMaximize() {},
  onClose() {},
  onPointerDown() {},
};

const HTTP_FAILURE = {
  kind: "http",
  name: "AxiosError",
  message: "Request failed with status code 500",
  status: 500,
  response: { error: "boom", detail: "from the server" },
};

const scenarios = [
  {
    name: "1. a mounted, closed panel writes nothing to <html>",
    run: async () => {
      const panel = await mount(false);
      const closed = styleAttr();
      await panel.unmount();
      expect(closed === "", `<html style> is ${JSON.stringify(closed)} before any dock opened`);
    },
  },
  {
    name: "2. the --blix-dock-* variables exist only while a side is reserved",
    run: async () => {
      const panel = await mount(true);
      expect(prop("--blix-dock-right") === "520px", `docked right: ${JSON.stringify(styleAttr())}`);
      expect(prop("--blix-dock-left") === "0px", "the other sides are not 0px while docked");
      expect(prop("padding-right") === "520px", `padding-right is ${prop("padding-right")}`);
      await panel.setMode("bottom");
      expect(
        prop("--nm-dock-h") === prop("--blix-dock-bottom") && prop("--nm-dock-h") !== "",
        `bottom: --nm-dock-h is ${JSON.stringify(prop("--nm-dock-h"))}`,
      );
      expect(prop("padding-right") === "", "the right side was not given back on switching");
      await panel.setMode("float");
      const floating = styleAttr();
      await panel.setMode("right");
      await panel.render(false);
      const closed = styleAttr();
      await panel.unmount();
      expect(floating === "", `floating leaves ${JSON.stringify(floating)}`);
      expect(closed === "", `closing leaves ${JSON.stringify(closed)}`);
    },
  },
  {
    name: "3. a host inline padding is added to while docked and restored exactly",
    run: async () => {
      html.style.setProperty("padding-right", "13px", "important");
      const panel = await mount(true);
      const docked = prop("padding-right");
      await panel.render(false);
      const after = [prop("padding-right"), html.style.getPropertyPriority("padding-right")];
      await panel.unmount();
      html.removeAttribute("style");
      expect(docked !== "13px" && docked !== "", `docked padding is ${JSON.stringify(docked)}`);
      expect(after[0] === "13px" && after[1] === "important", `restored as ${JSON.stringify(after)}`);
    },
  },
  {
    name: "4. a host scroll-lock that saved the dock's padding cannot leave it behind",
    run: async () => {
      const panel = await mount(true);
      // The lock: save what is there — the dock's 520px — and set its own.
      const saved = html.style.paddingRight;
      html.style.paddingRight = "17px";
      await settle();
      await panel.render(false);
      const afterClose = prop("padding-right");
      // The lock ends and puts back what it saved.
      html.style.paddingRight = saved;
      await settle();
      const final = prop("padding-right");
      await panel.unmount();
      html.removeAttribute("style");
      expect(saved === "520px", `the fixture saved ${JSON.stringify(saved)}, not the dock's value`);
      expect(afterClose === "17px", `closing changed the host's own value to ${JSON.stringify(afterClose)}`);
      expect(final === "", `padding-right is stuck at ${JSON.stringify(final)} with no dock open`);
    },
  },
  {
    name: "5. a host write under the dock stands: Blix does not write in answer to it",
    run: async () => {
      html.style.paddingRight = "17px";
      const panel = await mount(true);
      const docked = prop("padding-right");
      // The host takes its padding away while the panel is docked.
      html.style.paddingRight = "";
      await settle();
      const during = prop("padding-right");
      // …and a resize does not write over what the host left there either.
      const grip = dom.window.document.getElementById("grip");
      pointer("pointerdown", grip, 500);
      pointer("pointermove", dom.window, 420);
      pointer("pointerup", dom.window, 420);
      await settle();
      const resized = [prop("padding-right"), prop("--blix-dock-right")];
      pointer("pointerdown", dom.window.document.getElementById("grip"), 420);
      pointer("pointermove", dom.window, 500);
      pointer("pointerup", dom.window, 500);
      await settle();
      await panel.render(false);
      const final = styleAttr();
      await panel.unmount();
      html.removeAttribute("style");
      expect(docked !== "17px" && docked !== "", `docked padding is ${JSON.stringify(docked)}`);
      expect(during === "", `Blix wrote ${JSON.stringify(during)} back after the host cleared the padding`);
      expect(resized[0] === "", `a resize wrote ${JSON.stringify(resized[0])} over the host's value`);
      expect(resized[1] === "600px", `the variable did not follow the resize: ${JSON.stringify(resized[1])}`);
      expect(final === "", `closing leaves ${JSON.stringify(final)}`);
    },
  },
  {
    name: "6. nothing is written to <html> after unmounting in the middle of a dock resize",
    run: async () => {
      const panel = await mount(true);
      const grip = dom.window.document.getElementById("grip");
      pointer("pointerdown", grip, 500);
      // 80px towards the page: the right dock grows, and a frame is scheduled.
      pointer("pointermove", dom.window, 420);
      await panel.unmount();
      const atUnmount = styleAttr();
      pointer("pointermove", dom.window, 380);
      await settle();
      pointer("pointerup", dom.window, 380);
      await settle();
      const final = styleAttr();
      html.removeAttribute("style");
      expect(atUnmount === "", `unmount left ${JSON.stringify(atUnmount)}`);
      expect(final === "", `written after unmount: ${JSON.stringify(final)}`);
    },
  },
  {
    name: "7. …nor after closing the panel in the middle of one",
    run: async () => {
      const panel = await mount(true);
      const grip = dom.window.document.getElementById("grip");
      pointer("pointerdown", grip, 500);
      pointer("pointermove", dom.window, 420);
      await panel.render(false);
      pointer("pointermove", dom.window, 380);
      await settle();
      pointer("pointerup", dom.window, 380);
      await settle();
      const final = styleAttr();
      await panel.unmount();
      html.removeAttribute("style");
      expect(final === "", `written after close: ${JSON.stringify(final)}`);
    },
  },
  {
    name: "8. a completed dock resize still reserves the new size",
    run: async () => {
      const panel = await mount(true);
      const grip = dom.window.document.getElementById("grip");
      pointer("pointerdown", grip, 500);
      pointer("pointermove", dom.window, 420);
      pointer("pointerup", dom.window, 420);
      await settle();
      const resized = prop("padding-right");
      // Back to the default, so the stored width does not leak into later runs.
      pointer("pointerdown", dom.window.document.getElementById("grip"), 420);
      pointer("pointermove", dom.window, 500);
      pointer("pointerup", dom.window, 500);
      await settle();
      const back = prop("padding-right");
      await panel.unmount();
      html.removeAttribute("style");
      expect(resized === "600px", `after dragging 80px the padding is ${JSON.stringify(resized)}`);
      expect(back === "520px", `after dragging back it is ${JSON.stringify(back)}`);
    },
  },
  {
    name: "9. the Close button is rendered at every toolbar width",
    run: () => {
      for (const [label, width] of [
        ["wide", { compact: false, tiny: false }],
        ["compact", { compact: true, tiny: false }],
        ["tiny", { compact: true, tiny: true }],
      ]) {
        const container = dom.window.document.createElement("div");
        const reactRoot = createRoot(container);
        flushSync(() => reactRoot.render(h(blix.MonitorToolbar, { ...TOOLBAR_PROPS, ...width })));
        const count = container.querySelectorAll('button[aria-label="Close the panel"]').length;
        flushSync(() => reactRoot.unmount());
        expect(count === 1, `${label} toolbar renders ${count} Close buttons`);
      }
    },
  },
  {
    name: "10. Copy response on a failed request copies the server's body",
    run: () => {
      const copy = blix.format.responseCopyText;
      expect(typeof copy === "function", "there is no responseCopyText — each copy path builds its own");
      const failed = copy({ id: "a", url: "/x", method: "GET", state: "error", error: HTTP_FAILURE });
      expect(
        failed === JSON.stringify(HTTP_FAILURE.response, null, 2),
        `copied ${failed.replace(/\s+/g, " ").slice(0, 120)}`,
      );
      const ok = copy({ id: "b", url: "/x", method: "GET", state: "success", responsePayload: { rows: [1] } });
      expect(ok === JSON.stringify({ rows: [1] }, null, 2), "a successful response is not copied as is");
      const network = { kind: "network", name: "AxiosError", message: "Network Error" };
      const offline = copy({ id: "c", url: "/x", method: "GET", state: "error", error: network });
      expect(offline.includes("Network Error"), "a failure with no body copies nothing useful");
      const legacy = copy({ id: "d", url: "/x", method: "GET", state: "error", error: { error: "old" } });
      expect(legacy === JSON.stringify({ error: "old" }, null, 2), "a pre-0.11 stored error body is not copied as is");
    },
  },
  {
    name: "11. the theme contrast report is silent unless globalThis.__BLIX_DEBUG__ is true",
    run: () => {
      const original = console.warn;
      const warned = [];
      console.warn = (...args) => warned.push(String(args[0]));
      try {
        blix.assertThemes();
        const byDefault = warned.length;
        globalThis.__BLIX_DEBUG__ = true;
        blix.assertThemes();
        expect(byDefault === 0, `${byDefault} warning(s) by default, e.g. ${warned[0]?.slice(0, 80)}`);
        expect(
          warned.length > 0 && warned.every((line) => line.startsWith("[blix]")),
          "with the flag set the report did not run",
        );
      } finally {
        console.warn = original;
        delete globalThis.__BLIX_DEBUG__;
      }
    },
  },
  {
    name: "12. a second writer of <html> padding is not answered: no write loop",
    run: async () => {
      // A host that puts its own padding back whenever it is changed.
      html.style.paddingRight = "15px";
      let hostWrites = 0;
      const host = new dom.window.MutationObserver(() => {
        if (html.style.paddingRight !== "15px") {
          hostWrites += 1;
          html.style.paddingRight = "15px";
        }
      });
      host.observe(html, { attributes: true, attributeFilter: ["style"] });
      const panel = await mount(true);
      await settle();
      const during = prop("padding-right");
      await panel.render(false);
      await settle();
      host.disconnect();
      const final = prop("padding-right");
      await panel.unmount();
      html.removeAttribute("style");
      expect(hostWrites <= 2, `the host had to re-assert its padding ${hostWrites} times`);
      expect(during === "15px" && final === "15px", `host padding is ${JSON.stringify([during, final])}`);

      // Two panels docked to the same side.
      let writes = 0;
      const counter = new dom.window.MutationObserver((records) => (writes += records.length));
      counter.observe(html, { attributes: true, attributeFilter: ["style"] });
      const one = await mount(true);
      const two = await mount(true);
      await settle();
      await two.unmount();
      await one.unmount();
      await settle();
      counter.disconnect();
      const left = styleAttr();
      html.removeAttribute("style");
      expect(writes < 60, `two docked panels wrote <html> style ${writes} times`);
      expect(left === "", `two panels, unmounted in reverse order, leave ${JSON.stringify(left)}`);
    },
  },
  {
    name: "13. the cleanup after a release only ever removes Blix's own value, once",
    run: async () => {
      const panel = await mount(true);
      html.style.paddingRight = "17px"; // the lock
      await settle();
      await panel.render(false);
      // Other host values are none of its business.
      html.style.paddingRight = "30px";
      await settle();
      const other = prop("padding-right");
      html.style.paddingLeft = "520px";
      await settle();
      const otherSide = prop("padding-left");
      // Blix's own value, handed back: removed, not replaced.
      html.style.paddingRight = "520px";
      await settle();
      const handedBack = styleAttr();
      // It has stopped: the same value a second time is the host's.
      html.style.paddingRight = "520px";
      await settle();
      const second = prop("padding-right");
      await panel.unmount();
      html.removeAttribute("style");
      expect(other === "30px", `a host value was changed to ${JSON.stringify(other)}`);
      expect(otherSide === "520px", `another side's value was changed to ${JSON.stringify(otherSide)}`);
      expect(handedBack === "padding-left: 520px;", `after the hand-back <html style> is ${JSON.stringify(handedBack)}`);
      expect(second === "520px", `still acting after it had acted once: ${JSON.stringify(second)}`);
    },
  },
  {
    name: "14. …and stops after 30 s",
    run: async () => {
      const realSetTimeout = globalThis.setTimeout;
      const long = [];
      globalThis.setTimeout = (fn, ms, ...rest) => {
        if (ms >= 10_000) {
          long.push({ fn, ms });
          return realSetTimeout(() => {}, 0);
        }
        return realSetTimeout(fn, ms, ...rest);
      };
      let stillWatching;
      let afterDeadline;
      let deadlines;
      const panel = await mount(true);
      try {
        html.style.paddingRight = "17px";
        await settle();
        await panel.render(false);
        deadlines = long.map((t) => t.ms);
        // Before the deadline it is still waiting…
        html.style.paddingRight = "520px";
        await settle();
        stillWatching = prop("padding-right");
        // …so set the same stage again and let the deadline pass first.
        await panel.render(true);
        html.style.paddingRight = "17px";
        await settle();
        await panel.render(false);
        for (const t of long.splice(0)) t.fn();
        html.style.paddingRight = "520px";
        await settle();
        afterDeadline = prop("padding-right");
      } finally {
        globalThis.setTimeout = realSetTimeout;
        await panel.unmount();
        html.removeAttribute("style");
      }
      expect(deadlines.length === 1 && deadlines[0] === 30_000, `deadline timers: ${JSON.stringify(deadlines)}`);
      expect(stillWatching === "", `before the deadline the hand-back left ${JSON.stringify(stillWatching)}`);
      expect(afterDeadline === "520px", `after 30 s it still acted: ${JSON.stringify(afterDeadline)}`);
    },
  },
  {
    name: "15. …and when a side is docked again",
    run: async () => {
      const panel = await mount(true);
      html.style.paddingRight = "17px";
      await settle();
      await panel.render(false);
      await panel.render(true);
      const docked = prop("padding-right");
      // Docked again: nothing watches, so the host's write simply stands.
      html.style.paddingRight = "520px";
      await settle();
      const during = prop("padding-right");
      html.style.paddingRight = "17px";
      await settle();
      await panel.unmount();
      const final = styleAttr();
      html.removeAttribute("style");
      expect(docked.startsWith("calc("), `docked again on 17px: ${JSON.stringify(docked)}`);
      expect(during === "520px", `a write under the dock was changed to ${JSON.stringify(during)}`);
      expect(final === "padding-right: 17px;", `unmount changed the host's value: ${JSON.stringify(final)}`);
    },
  },
  {
    name: "16. …and when the panel unmounts",
    run: async () => {
      const panel = await mount(true);
      html.style.paddingRight = "17px";
      await settle();
      await panel.render(false);
      await panel.unmount();
      html.style.paddingRight = "520px";
      await settle();
      const final = prop("padding-right");
      html.removeAttribute("style");
      expect(final === "520px", `something still acted after unmount: ${JSON.stringify(final)}`);
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
    html.removeAttribute("style");
  }
}

console.log(
  `\n${failed === 0 ? "All" : `${failed} of`} ${scenarios.length} scenarios ${failed === 0 ? "passed" : "failed"} — ${posix(src)}`,
);
// `savePrefs` leaves a write timer pending; nothing here needs to wait for it.
process.exit(failed === 0 ? 0 : 1);
