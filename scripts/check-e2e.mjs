/**
 * Panel end-to-end check. Starts the playground, drives the panel in a real
 * Chrome (or Edge) the way a person does — mouse and keyboard, by role and
 * accessible name — and asserts what each step should show. Any error thrown
 * in the page fails the run.
 *
 * `node scripts/check-e2e.mjs [--browser chrome|msedge] [--headed]`
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const BROWSER = arg("--browser", "chrome");
/** A port nothing else holds, so a server left over from a killed run can
 * never block this one. */
const PORT = await new Promise((resolve) => {
  const probe = createServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

/* ── the playground ─────────────────────────────────────────────────── */

const server = spawn(process.execPath, [path.join(root, "playground", "serve.mjs")], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
// However this run ends, the server goes with it: one left behind holds the
// port and the next run cannot start.
process.on("exit", () => server.kill());
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill();
    process.exit(130);
  });
}
let serverErrors = "";
server.stderr.on("data", (chunk) => (serverErrors += chunk));
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("the playground did not start")), 60_000);
  server.stdout.on("data", (chunk) => {
    if (String(chunk).includes(`localhost:${PORT}`)) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`the playground exited (${code}): ${serverErrors.trim()}`)));
});

const browser = await chromium.launch({ channel: BROWSER, headless: !process.argv.includes("--headed") });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(8_000);
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("crash", () => pageErrors.push("the page crashed"));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) pageErrors.push(m.text());
});

/* ── helpers ────────────────────────────────────────────────────────── */

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`✗ ${name}\n    ${String(error?.message ?? error).split("\n").slice(0, 3).join("\n    ")}`);
    await page.keyboard.press("Escape").catch(() => {});
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

const closeButton = () => page.getByRole("button", { name: "Close the panel" });
const launcher = () => page.getByRole("button", { name: /^Blix — / });
/** A source tab: its short name with the sidebar open, its long one when it
 * is collapsed to icons. */
const SOURCES = {
  network: /^(Network|HTTP requests)/,
  realtime: /^(Realtime|WebSocket)/,
  redux: /^Redux/,
  query: /^(Query|TanStack Query)/,
};
const tab = (source) => page.getByRole("tab", { name: SOURCES[source] }).first();
/** Data rows — the header row holds column headers. */
const rows = () => page.locator('[role="row"]:not(:has([role="columnheader"]))');
const row = (text) => rows().filter({ hasText: text }).first();
const textOf = async (locator) => (await locator.innerText()).replace(/\s+/g, " ").trim();
/** "N of M requests" while a filter is on, "M requests" when not. */
async function counts() {
  const text = await textOf(page.locator(".nm-statusbar").first());
  const of = /(\d+) of (\d+)/.exec(text);
  if (of) return { shown: Number(of[1]), total: Number(of[2]) };
  const all = /(\d+) (?:requests?|actions?|quer(?:y|ies)|connections?|entries)/.exec(text);
  if (!all) throw new Error(`no count in the status bar: "${text}"`);
  return { shown: Number(all[1]), total: Number(all[1]) };
}
async function ensureOpen() {
  if (!(await closeButton().isVisible())) await launcher().click();
  await closeButton().waitFor();
}

/* ── steps ──────────────────────────────────────────────────────────── */

await page.goto(`http://localhost:${PORT}/`);
await page.waitForLoadState("networkidle");

await step("the launcher shows what was captured and opens the panel", async () => {
  await launcher().waitFor({ timeout: 15_000 });
  expect(/\d+ captured/.test((await launcher().getAttribute("aria-label")) ?? ""), "the launcher has no count");
  await launcher().click();
  await closeButton().waitFor();
});

await step("the network list shows the page's requests", async () => {
  await tab("network").click();
  await rows().nth(5).waitFor();
  const { total } = await counts();
  expect(total >= 50, `only ${total} requests listed`);
});

await step("a filter narrows the list, its complement is the rest, and clearing restores it", async () => {
  const box = page.getByRole("textbox", { name: "Filter requests" });
  const before = await counts();
  await box.fill("status:2xx");
  await page.waitForTimeout(400);
  const ok = await counts();
  expect(ok.shown > 0 && ok.shown < before.shown, `status:2xx shows ${ok.shown} of ${before.shown}`);
  await box.fill("-status:2xx");
  await page.waitForTimeout(400);
  const rest = await counts();
  expect(rest.shown + ok.shown === before.shown, `${ok.shown} + ${rest.shown} ≠ ${before.shown}`);
  await box.fill("");
  await page.waitForTimeout(400);
  expect((await counts()).shown === before.shown, "clearing did not restore the list");
});

await step("selecting a request opens every detail tab without an error", async () => {
  await row("tickets/getAll").click();
  for (const name of ["Response", "Payload", "Headers", "Timing", "Initiator"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(80);
  }
  await page.getByRole("button", { name: "Headers", exact: true }).click();
  await page.getByText(/Request Headers|Response Headers/).first().waitFor();
});

await step("j and k move the selection down and back", async () => {
  const selected = () => textOf(page.locator('[role="row"][aria-selected="true"]').first());
  await rows().nth(3).click();
  const first = await selected();
  await page.keyboard.press("j");
  const second = await selected();
  await page.keyboard.press("k");
  const back = await selected();
  expect(second !== first, "j did not move");
  expect(back === first, "k did not come back");
});

await step("? opens the shortcuts sheet and Escape closes it", async () => {
  await page.keyboard.press("?");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor({ state: "hidden" });
});

await step("Redux: dispatched actions are listed and have a diff", async () => {
  // A press on the page closes a floating panel, by design: it is in the way.
  await page.getByRole("button", { name: "10 Redux actions" }).click();
  await ensureOpen();
  await tab("redux").click();
  await rows().first().waitFor();
  expect((await counts()).total >= 10, "fewer than 10 actions");
  await rows().first().click();
  await page.getByRole("button", { name: "Diff", exact: true }).waitFor();
});

await step("Query: the page's queries are listed", async () => {
  await tab("query").click();
  await rows().first().waitFor();
  expect((await counts()).total >= 3, "fewer than 3 queries");
});

await step("Realtime: the socket is listed with its frames", async () => {
  await tab("realtime").click();
  await rows().first().click();
  await page.getByRole("button", { name: /^Messages/ }).first().click();
  await page.getByText(/ticket\.updated|presence\.update/).first().waitFor();
});

await step("Export → HAR downloads a HAR log of the captured requests", async () => {
  await tab("network").click();
  await page.getByRole("button", { name: "Export the log" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /HAR/ }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const har = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(har.log?.version === "1.2", "not a HAR 1.2 log");
  expect(har.log.entries.length >= 50, `${har.log.entries.length} entries`);
  expect(har.log.entries.every((e) => /^https?:/.test(e.request.url)), "a request without an absolute URL");
});

await step("a pinned request survives Clear", async () => {
  const target = row("tickets/getAll");
  const route = (await textOf(target)).match(/\/\S+/)?.[0];
  await target.click();
  await page.getByRole("button", { name: /^Pin/ }).first().click();
  await page.getByRole("button", { name: "Clear the Network log" }).click();
  await page.waitForTimeout(400);
  expect((await counts()).total === 1, `${(await counts()).total} requests left after Clear`);
  expect((await textOf(rows().first())).includes(route ?? "∅"), "the request left is not the pinned one");
});

await step("a press on the page closes a floating panel, and not a docked one", async () => {
  await page.getByRole("heading", { name: "Blix playground" }).click();
  expect(!(await closeButton().isVisible()), "the floating panel stayed open");
  await ensureOpen();
});

await step("docking reserves the page's edge; floating gives it back", async () => {
  const pad = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).paddingRight));
  const pick = async (name) => {
    const direct = page.getByRole("button", { name, exact: true });
    if (!(await direct.isVisible())) await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name }).or(page.getByRole("menuitemradio", { name })).or(direct).first().click();
    await page.waitForTimeout(300);
  };
  await pick("Dock to the right");
  expect((await pad()) > 100, `docked right, padding-right is ${await pad()}`);
  // The button pressed is gone in the narrow toolbar; focus must stay in the panel.
  expect(
    await page.evaluate(() => !!document.activeElement?.closest(".nm-root")),
    "focus fell out of the panel after docking",
  );
  await page.getByRole("heading", { name: "Blix playground" }).click();
  expect(await closeButton().isVisible(), "a press on the page closed the docked panel");
  // Docked to a side the toolbar is narrow and drops its dock buttons; the
  // command palette still has the command, as it would for a person — who
  // first clicks back into the panel, having just clicked the page.
  await rows().first().click();
  for (let i = 0; i < 5 && !(await page.getByRole("button", { name: "Float the panel", exact: true }).isVisible()); i++) {
    await page.keyboard.press("Control+k");
    await page.keyboard.type("Cycle dock");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
  }
  await pick("Float the panel");
  expect((await pad()) === 0, `floating, padding-right is ${await pad()}`);
  const vars = await page.evaluate(() => [...document.documentElement.style].filter((p) => p.startsWith("--blix-dock")));
  expect(vars.length === 0, `left behind: ${vars}`);
});

await step("a theme chosen is kept across a reload", async () => {
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const options = page.getByRole("menuitemradio");
  expect((await options.count()) >= 10, `${await options.count()} themes`);
  const choice = await textOf(options.nth(3));
  await options.nth(3).click();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await ensureOpen();
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const checked = page.getByRole("menuitemradio", { checked: true });
  expect((await checked.count()) === 1, `${await checked.count()} themes marked current`);
  expect((await textOf(checked)) === choice, `after reload "${await textOf(checked)}" is current, chose "${choice}"`);
  await page.keyboard.press("Escape");
});

await step("the Close button closes the panel and the launcher comes back", async () => {
  await closeButton().click();
  await launcher().waitFor();
  expect(!(await closeButton().isVisible()), "the panel is still open");
});

await step("no error was thrown in the page", async () => {
  expect(pageErrors.length === 0, pageErrors.join("\n"));
});

console.log(`\n${failed ? `${failed} step(s) failed` : "All steps passed"} — ${BROWSER}`);
await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
