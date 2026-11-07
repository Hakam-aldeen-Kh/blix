/**
 * Prepares a release from the change files in `.changes/`: writes the
 * version's section into `CHANGELOG.md`, bumps `package.json` and the bug
 * report form's version placeholder, and deletes the change files it used.
 * It commits, tags and publishes nothing — review the diff, open the release
 * PR, and tag the merge commit; `publish.yml` does the rest.
 *
 * `node scripts/release.mjs <patch|minor|major|x.y.z> [--dry-run] [--date YYYY-MM-DD]`
 *
 * See `scripts/changes.mjs` for the format and why it exists.
 */

import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHANGES_DIR, insertRelease, isChangeFile, nextVersion, parseChange, renderRelease } from "./changes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dateAt = args.indexOf("--date");
const bump = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--date");
const date = dateAt >= 0 ? args[dateAt + 1] : new Date().toISOString().slice(0, 10);

if (!bump) {
  console.error("usage: node scripts/release.mjs <patch|minor|major|x.y.z> [--dry-run] [--date YYYY-MM-DD]");
  process.exit(2);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`--date ${date} is not YYYY-MM-DD`);
  process.exit(2);
}

const at = (...p) => path.join(root, ...p);
const changesDir = at(CHANGES_DIR);
const names = readdirSync(changesDir).filter(isChangeFile).sort();
const changes = names.map((name) => parseChange(readFileSync(path.join(changesDir, name), "utf8"), name));

const pkgText = readFileSync(at("package.json"), "utf8");
const current = JSON.parse(pkgText).version;
const version = nextVersion(current, bump);
const section = renderRelease(version, date, changes);

const changelog = readFileSync(at("CHANGELOG.md"), "utf8");
if (changelog.includes(`## [${version}]`)) {
  console.error(`CHANGELOG.md already has a ${version} section`);
  process.exit(1);
}

// Replaced in place rather than re-serialized, so the files keep their own
// formatting and the diff is the version and nothing else.
const pkgNext = pkgText.replace(`"version": "${current}"`, `"version": "${version}"`);
const formPath = at(".github", "ISSUE_TEMPLATE", "bug_report.yml");
const formText = readFileSync(formPath, "utf8");
const formNext = formText.replace(`placeholder: "${current}"`, `placeholder: "${version}"`);

console.log(`${current} → ${version}, ${changes.length} change file${changes.length === 1 ? "" : "s"}\n`);
console.log(section);

if (dryRun) {
  console.log("--dry-run: nothing written");
  process.exit(0);
}

writeFileSync(at("CHANGELOG.md"), insertRelease(changelog, section));
writeFileSync(at("package.json"), pkgNext);
writeFileSync(formPath, formNext);
for (const name of names) rmSync(path.join(changesDir, name));
console.log(`Wrote CHANGELOG.md, package.json and bug_report.yml; removed ${names.length} change file${names.length === 1 ? "" : "s"}.`);
console.log(`Next: pnpm release:check, open the release PR, then tag v${version} on its merge commit.`);
