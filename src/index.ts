"use client";

/**
 * Root entry — the panel plus the whole capture surface.
 *
 * **Why the directive lives here and not only in `ui/Blix.tsx`.** esbuild (via
 * tsup) preserves a `"use client"` directive only when it sits at the top of an
 * *entry* file; a directive on a module that gets bundled into an entry is
 * dropped. `Blix.tsx` declares its own — correctly, for anyone reading the
 * source — but that copy does not reach `dist/index.js`, so without this line
 * the published bundle carries no client boundary at all and a React Server
 * Component rendering `<Blix />` fails on `useRef`/`createContext`.
 *
 * The consequence is deliberate: everything re-exported from here is inside a
 * client boundary. Modules that run during SSR or at module-eval time must
 * import capture functions from `@hakam-aldeen-kh/blix/capture`, which has no
 * directive and pulls in no React.
 */

export * from "./capture/index";
export * from "./ui/index";
