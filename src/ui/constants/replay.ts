/**
 * Dev Tools — replay safety policy.
 *
 * Classification comes from the URL, not the HTTP method: an API where every
 * endpoint is a POST is common enough that the method carries no information
 * about whether re-running a request is safe.
 *
 * These lists are URL-substring heuristics tuned for conventional REST-ish
 * naming. They are deliberately conservative — an unrecognized URL classifies
 * as `"write"` and gets a confirmation step rather than a one-click replay.
 */

/**
 * Never replayable, at any confirmation level.
 *
 * These aren't merely "writes" — each one mutates or destroys the session the
 * devtool itself depends on. Replaying a token-refresh rotates the token; a
 * logout ends the session. Both typically land in the host's auth-failure path,
 * which clears storage and redirects to login — wiping the log the developer
 * is reading.
 */
export const REPLAY_BLOCKLIST = [
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/reset-password",
  "/auth/change-password",
  "/sso/",
  "/attachments/",
];

/** Read-shaped endpoints, replayable on a single click. */
export const REPLAY_READ_PATTERNS = [
  "/list",
  "/getall",
  "/get",
  "/details",
  "/detail",
  "/search",
  "/count",
  "/filter",
  "/lookup",
];

export type ReplayVerdict = "blocked" | "read" | "write";

export function classifyReplay(url: string): ReplayVerdict {
  const lower = (url || "").toLowerCase();
  if (REPLAY_BLOCKLIST.some((p) => lower.includes(p))) return "blocked";
  if (REPLAY_READ_PATTERNS.some((p) => lower.endsWith(p) || lower.includes(`${p}?`)))
    return "read";
  return "write";
}

/**
 * Headers worth carrying over. Everything else is re-derived by the request
 * interceptor from current cookies.
 *
 * Replaying the captured headers wholesale would send a **broken** bearer
 * token: `serializeHeaders` masks `Authorization` to `"eyJhbGc…abcd (masked)"`.
 *
 * Routing headers are load-bearing: if the host's interceptor reads one to
 * choose a backend, dropping it silently retargets the request at the wrong
 * host and yields a mystifying 404 — hence `module` below.
 */
export const REPLAY_HEADER_ALLOWLIST = [
  "module",
  "lang",
  "Accept-Language",
  "Content-Type",
];
