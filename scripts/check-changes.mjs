/**
 * Change-file check. Needs no build.
 *
 * Always: every file in `.changes/` parses — front matter, a known type,
 * some text — so a release never meets a broken one.
 *
 * With `--base <ref>` (CI, on a pull request): a PR that changes `src/` adds a
 * change file, unless it carries the `no changelog` label (a refactor, a
 * comment) — `LABELS` holds the PR's labels as JSON. A change a user notices
 * that reaches a release with no line in the CHANGELOG is the gap this
 * closes; it used to rest on remembering.
 *
 * `node scripts/check-changes.mjs [--base origin/main]`
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addsChangeFile, CHANGES_DIR, isChangeFile, needsChangeFile, parseChange } from "./changes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const baseAt = args.indexOf("--base");
const base = baseAt >= 0 ? args[baseAt + 1] : undefined;
const NO_CHANGELOG = "no changelog";

let failed = 0;
const fail = (message) => {
  failed += 1;
  console.log(`✗ ${message}`);
};

const dir = path.join(root, CHANGES_DIR);
const names = readdirSync(dir).filter(isChangeFile).sort();
for (const name of names) {
  try {
    parseChange(readFileSync(path.join(dir, name), "utf8"), name);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
if (failed === 0) console.log(`✓ ${names.length} change file${names.length === 1 ? "" : "s"} in ${CHANGES_DIR}/ parse`);

if (base) {
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const changed = git("diff", "--name-only", `${base}...HEAD`);
  const added = git("diff", "--name-only", "--diff-filter=A", `${base}...HEAD`);
  let labels = [];
  try {
    labels = JSON.parse(process.env.LABELS || "[]");
  } catch {
    /* unreadable labels are no labels */
  }

  if (!needsChangeFile(changed)) {
    console.log("✓ nothing under src/ changed, so no change file is needed");
  } else if (addsChangeFile(added)) {
    console.log("✓ src/ changed and the PR adds a change file");
  } else if (labels.includes(NO_CHANGELOG)) {
    console.log(`✓ src/ changed with no change file, and the PR is labeled "${NO_CHANGELOG}"`);
  } else {
    fail(
      `src/ changed but the PR adds no file to ${CHANGES_DIR}/. Add one (see ${CHANGES_DIR}/README.md), ` +
        `or label the PR "${NO_CHANGELOG}" if users won't notice the change.`,
    );
  }
}

console.log(`\n${failed === 0 ? "All change checks passed" : `${failed} change check${failed === 1 ? "" : "s"} failed`}`);
process.exit(failed === 0 ? 0 : 1);
