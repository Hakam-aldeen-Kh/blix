/**
 * Change files: how a change waits for its release.
 *
 * Every PR that changes something a user notices adds one Markdown file to
 * `.changes/`. At release, `scripts/release.mjs` turns them into the
 * version's `CHANGELOG.md` section and deletes them.
 *
 * Why not a line under `## [Unreleased]` in `CHANGELOG.md`, as Keep a
 * Changelog suggests: every PR edited the same few lines, so two open PRs
 * always conflicted, and blixjs.dev listed the pending section as a release.
 * Why not Changesets: its sections are `## 0.14.1` / `### Patch Changes`, with
 * no date and no Added/Changed/Fixed, which is the format this CHANGELOG, the
 * publish workflow and the site are built on. The idea is the same
 * (Prettier's `changelog_unreleased/` is another take on it); the output is
 * the CHANGELOG as it has always been written.
 *
 * A change file:
 *
 *     ---
 *     type: Fixed
 *     ---
 *     **One bold sentence a user can act on.** Then why, in full sentences.
 *
 * Pure functions only; reading and writing files is the callers' job.
 */

/** Keep a Changelog's groups, in the order a section lists them. */
export const TYPES = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];

/** Where change files live, relative to the repository root. */
export const CHANGES_DIR = ".changes";

/** The one file in `.changes/` that is not a change. */
export const README = "README.md";

/** Whether `name` (a file in `.changes/`) is a change file. */
export function isChangeFile(name) {
  return name.endsWith(".md") && name !== README;
}

/**
 * Reads one change file. Throws, naming the file, on anything that would
 * make a wrong or empty CHANGELOG line: no front matter, an unknown type, no
 * text.
 */
export function parseChange(text, name) {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
  if (!match) throw new Error(`${name}: expected front matter between two "---" lines, then the text`);

  const fields = Object.fromEntries(
    match[1]
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const colon = line.indexOf(":");
        if (colon < 0) throw new Error(`${name}: "${line}" is not a "key: value" line`);
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      }),
  );

  const type = fields.type;
  if (!TYPES.includes(type)) {
    throw new Error(`${name}: type is ${type ? `"${type}"` : "missing"}; use one of ${TYPES.join(", ")}`);
  }
  const body = match[2].trim();
  if (!body) throw new Error(`${name}: the text after the front matter is empty`);
  return { type, body, name };
}

/** A body as one CHANGELOG list item: "- " on the first line, two spaces on
 * the rest, so a multi-paragraph change stays one item. */
function asListItem(body) {
  return body
    .split("\n")
    .map((line, i) => (i === 0 ? `- ${line}` : line === "" ? "" : `  ${line}`))
    .join("\n");
}

/**
 * The `## [version] - date` section for `changes`, grouped by type in
 * `TYPES` order and, within a group, in file-name order so a release reads
 * the same whoever runs it.
 */
export function renderRelease(version, date, changes) {
  if (changes.length === 0) throw new Error("there are no change files to release");
  const lines = [`## [${version}] - ${date}`, ""];
  for (const type of TYPES) {
    const group = changes
      .filter((change) => change.type === type)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (group.length === 0) continue;
    lines.push(`### ${type}`, "", ...group.map((change) => asListItem(change.body)), "");
  }
  return lines.join("\n");
}

/** `changelog` with `section` placed above the newest release. */
export function insertRelease(changelog, section) {
  const normalized = changelog.replace(/\r\n?/g, "\n");
  const at = normalized.search(/^## \[/m);
  if (at < 0) return `${normalized.trimEnd()}\n\n${section}`;
  return `${normalized.slice(0, at)}${section}\n${normalized.slice(at)}`;
}

/** The next version after `current` for `bump`: "patch", "minor", "major",
 * or an explicit "x.y.z" that must be higher. */
export function nextVersion(current, bump) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    if (!m) throw new Error(`"${v}" is not a version like 1.2.3`);
    return m.slice(1).map(Number);
  };
  const [major, minor, patch] = parse(current);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  const next = parse(bump);
  const higher = next[0] - major || next[1] - minor || next[2] - patch;
  if (higher <= 0) throw new Error(`${bump} is not higher than the current ${current}`);
  return bump;
}

/**
 * Whether a PR that touched `paths` needs a change file: anything under
 * `src/` reaches users. Docs, tests, scripts and CI do not, and a release
 * PR, which only consumes change files, does not either.
 */
export function needsChangeFile(paths) {
  return paths.some((p) => p.startsWith("src/"));
}

/** Whether `paths` (added in the PR) include a change file. */
export function addsChangeFile(paths) {
  return paths.some((p) => p.startsWith(`${CHANGES_DIR}/`) && isChangeFile(p.slice(CHANGES_DIR.length + 1)));
}
