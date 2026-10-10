/**
 * Keyboard check. Needs no build: it bundles `src/` in memory.
 *
 * Every Blix shortcut — the Ctrl+backquote toggle and Ctrl/⌘+K included — is
 * matched against `shortcutKey(event)`, not `event.key`. On a non-Latin layout
 * `event.key` is the character the layout types (ذ, ن, ١), so the shortcut has
 * to follow the *physical* key instead; on a Latin layout it has to keep
 * following the printed character, or AZERTY and QWERTZ lose keys they have
 * today. This is the table of both.
 *
 * `node scripts/check-keyboard.mjs [srcDir]` — the directory defaults to
 * `./src`. Nothing is written to disk.
 */

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.resolve(process.argv[2] ?? path.join(root, "src"));
const posix = (p) => p.split(path.sep).join("/");

const result = await build({
  entryPoints: [path.join(src, "ui", "services", "keyboard.ts")],
  bundle: true,
  write: false,
  format: "esm",
  logLevel: "silent",
});
const { shortcutKey } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

// [event.key, event.code, shiftKey, expected, why]
const rows = [
  // Non-Latin layouts: the physical key decides.
  ["ؤ", "KeyC", false, "c", "Arabic letter on C"],
  ["}", "KeyC", true, "C", "Arabic Shift+C types punctuation"],
  ["لأ", "KeyG", true, "G", "Arabic Shift+G types a ligature"],
  ["ذ", "Backquote", false, "`", "Arabic backquote key — the toggle"],
  ["ن", "KeyK", false, "k", "Arabic letter on K — Ctrl/⌘+K"],
  ["ظ", "Slash", false, "/", "Arabic slash key"],
  ["؟", "Slash", true, "?", "Arabic question mark"],
  ["١", "Digit1", false, "1", "Arabic-Indic digit"],
  ["/", "KeyL", true, "L", "Arabic Shift+L types a slash — still ⇧L"],
  ["Dead", "Backquote", false, "`", "dead-key layouts can still toggle"],
  // Latin layouts: the printed character decides.
  ["q", "KeyA", false, "q", "AZERTY: the key printed Q"],
  ["c", "KeyC", false, "c", "QWERTY"],
  ["C", "KeyC", true, "C", "QWERTY with Shift"],
  ["?", "KeyM", true, "?", "AZERTY types ? with Shift+M"],
  ["/", "Digit7", true, "/", "QWERTZ types / with Shift+7"],
  ["-", "Slash", false, "-", "QWERTZ: the Slash key is a hyphen"],
  [" ", "Space", false, " ", "Space"],
  // Not layout-dependent: passed through.
  ["Escape", "Escape", false, "Escape", "named key"],
  ["ArrowDown", "ArrowDown", false, "ArrowDown", "named key"],
  ["Enter", "Enter", false, "Enter", "named key"],
];

let failed = 0;
for (const [key, code, shiftKey, expected, why] of rows) {
  const got = shortcutKey({ key, code, shiftKey });
  const ok = got === expected;
  if (!ok) failed += 1;
  const cells = [JSON.stringify(key), code, shiftKey ? "shift" : "", `→ ${JSON.stringify(got)}`];
  console.log(
    `${ok ? "✓" : "✗"} ${cells.filter(Boolean).join(" ")}${ok ? "" : ` (expected ${JSON.stringify(expected)})`} — ${why}`,
  );
}

console.log(
  `\n${failed === 0 ? "All" : `${failed} of`} ${rows.length} rows ${failed === 0 ? "passed" : "failed"} — ${posix(src)}`,
);
process.exit(failed === 0 ? 0 : 1);
