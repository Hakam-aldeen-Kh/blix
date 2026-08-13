import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "capture/index": "src/capture/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: false,
  clean: true,
  external: ["react", "react-dom", "axios", "@reduxjs/toolkit", "@tanstack/react-query"],
  // CRITICAL: do not define or replace process.env.NODE_ENV.
  // It must survive verbatim into dist/ so the consuming app's bundler
  // substitutes it at ITS build time (enabling dead-code elimination of the
  // whole panel in production builds of the consumer).
  // esbuildOptions is intentionally absent — no `define` touching NODE_ENV.
});
