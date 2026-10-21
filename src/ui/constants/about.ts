/**
 * Who this build is, and where it lives.
 *
 * `__BLIX_VERSION__` is replaced with package.json's version by tsup at build
 * time. The check scripts and the playground bundle `src/` with esbuild and
 * no define, so the identifier is read through `typeof` and falls back to
 * "dev" there rather than throwing a ReferenceError.
 */

declare const __BLIX_VERSION__: string | undefined;

export const BLIX_VERSION: string =
  typeof __BLIX_VERSION__ === "string" ? __BLIX_VERSION__ : "dev";

/** For display: "v0.12.0", or "dev build" where there is no version to prefix. */
export const BLIX_VERSION_LABEL: string =
  BLIX_VERSION === "dev" ? "dev build" : `v${BLIX_VERSION}`;

const SITE = "https://blixjs.dev";
const REPO = "https://github.com/Hakam-aldeen-Kh/blix";

export const BLIX_LINKS = {
  site: SITE,
  docs: `${SITE}/docs`,
  /** A "dev" build has no release to point at, so it lands on the list. */
  changelog:
    BLIX_VERSION === "dev" ? `${SITE}/changelog` : `${SITE}/changelog#v${BLIX_VERSION}`,
  repo: REPO,
  /** The template chooser: bug report, feature request, or a private security advisory. */
  issues: `${REPO}/issues/new/choose`,
} as const;
