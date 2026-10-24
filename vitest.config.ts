import { defineConfig } from "vitest/config";

/**
 * Unit tests: one module at a time, its pure logic and its edge cases. The
 * scenario checks in `scripts/` cover how the modules behave together, and
 * `check:official` / `check:adversarial` cover them in a real browser.
 *
 * Capture is on only in development and only with a `window`, so the tests
 * run under jsdom with `NODE_ENV=development` — the same switch a host app's
 * dev build flips.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    env: { NODE_ENV: "development" },
    // Module-level state (the monitor store, tapped clients) is per file.
    isolate: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts", "src/ui/themes/**"],
      reporter: ["text-summary", "html"],
      reportsDirectory: "coverage",
    },
  },
});
