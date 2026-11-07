import { describe, expect, test } from "vitest";
import {
  addsChangeFile,
  insertRelease,
  needsChangeFile,
  nextVersion,
  parseChange,
  renderRelease,
} from "../../scripts/changes.mjs";

const file = (type: string, body: string) => `---\ntype: ${type}\n---\n${body}\n`;

describe("a change file", () => {
  test("is read as its type and text", () => {
    expect(parseChange(file("Fixed", "**A fix.** Why."), "a.md")).toEqual({
      type: "Fixed",
      body: "**A fix.** Why.",
      name: "a.md",
    });
  });

  test("is read the same with CRLF line endings and a BOM", () => {
    const windows = `﻿${file("Added", "A thing.")}`.replace(/\n/g, "\r\n");
    expect(parseChange(windows, "a.md").body).toBe("A thing.");
  });

  // A typo in the type would put the line under no heading at all.
  test("with an unknown type is refused, naming the file", () => {
    expect(() => parseChange(file("Fix", "x"), "typo.md")).toThrow(/typo\.md: type is "Fix"/);
  });

  test("without front matter or without text is refused", () => {
    expect(() => parseChange("just text", "bare.md")).toThrow(/bare\.md: expected front matter/);
    expect(() => parseChange(file("Fixed", ""), "empty.md")).toThrow(/empty\.md: the text .* is empty/);
  });
});

describe("a release section", () => {
  const changes = [
    { type: "Fixed", body: "Second fix.", name: "b.md" },
    { type: "Added", body: "A feature.\n\nIts second paragraph.", name: "z.md" },
    { type: "Fixed", body: "First fix.", name: "a.md" },
  ];

  // The format the CHANGELOG, publish.yml's check and blixjs.dev all read.
  test("has the Keep a Changelog heading, groups in order, files in name order", () => {
    expect(renderRelease("0.14.1", "2026-11-07", changes)).toBe(
      [
        "## [0.14.1] - 2026-11-07",
        "",
        "### Added",
        "",
        "- A feature.",
        "",
        "  Its second paragraph.",
        "",
        "### Fixed",
        "",
        "- First fix.",
        "- Second fix.",
        "",
      ].join("\n"),
    );
  });

  test("is refused with nothing to release", () => {
    expect(() => renderRelease("0.14.1", "2026-11-07", [])).toThrow(/no change files/);
  });

  test("goes above the newest release, below the intro", () => {
    const log = "# Changelog\n\nIntro.\n\n## [0.14.0] - 2026-11-07\n\n### Fixed\n\n- Old.\n";
    const next = insertRelease(log, "## [0.14.1] - 2026-11-08\n\n### Fixed\n\n- New.\n");
    expect(next).toBe(
      "# Changelog\n\nIntro.\n\n## [0.14.1] - 2026-11-08\n\n### Fixed\n\n- New.\n\n## [0.14.0] - 2026-11-07\n\n### Fixed\n\n- Old.\n",
    );
  });
});

describe("the next version", () => {
  test("follows the bump", () => {
    expect(nextVersion("0.14.0", "patch")).toBe("0.14.1");
    expect(nextVersion("0.14.3", "minor")).toBe("0.15.0");
    expect(nextVersion("0.14.3", "major")).toBe("1.0.0");
    expect(nextVersion("0.14.0", "0.16.0")).toBe("0.16.0");
  });

  test("is never the same or lower, and is a version", () => {
    expect(() => nextVersion("0.14.0", "0.14.0")).toThrow(/not higher/);
    expect(() => nextVersion("0.14.0", "0.13.9")).toThrow(/not higher/);
    expect(() => nextVersion("0.14.0", "next")).toThrow(/not a version/);
  });
});

describe("whether a PR needs a change file", () => {
  test("only when it changes src/", () => {
    expect(needsChangeFile(["src/ui/Blix.tsx", "test/x.test.ts"])).toBe(true);
    expect(needsChangeFile(["docs/en.md", "scripts/check-host.mjs", ".github/workflows/ci.yml"])).toBe(false);
  });

  test("and the README in .changes/ is not one", () => {
    expect(addsChangeFile([".changes/fix-thing.md"])).toBe(true);
    expect(addsChangeFile([".changes/README.md", "CHANGELOG.md"])).toBe(false);
  });
});
