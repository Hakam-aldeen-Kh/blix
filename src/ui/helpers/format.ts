/** Dev Tools — display formatting. */

import { STATUS_TEXT } from "../constants/ui";

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export function shortUrl(url: string): string {
  const path = (url || "").split("?")[0];
  return path.length > 52 ? "…" + path.slice(-51) : path;
}

/** Last path segment, which is what Chrome shows in its Name column. */
/**
 * Segments that say what an endpoint *does* but nothing about *what* it acts
 * on. Roughly a third of this API's routes end in one of these
 * (`/roles/all`, `/permissions/all`, `/user/profile/get`…), so Chrome's
 * last-segment heuristic renders whole screens of rows all called "all".
 */
const GENERIC_SEGMENTS = new Set([
  "get", "list", "all", "index", "search", "filter", "lookup", "count",
  "create", "add", "new", "update", "edit", "save", "submit",
  "delete", "remove",
  "result", "results", "detail", "details", "info", "data",
  "status", "history", "log", "logs", "report",
]);

/** Route prefixes that are the same on every request and carry no signal. */
const PREFIX_SEGMENTS = new Set(["api", "internal-api"]);

const isVersion = (segment: string) => /^v\d+$/i.test(segment);
const isIdLike = (segment: string) =>
  /^\d+$/.test(segment) || /^[0-9a-f]{8,}$/i.test(segment);

/**
 * A short, *distinguishing* label for the Name column.
 *
 * Falls back to the parent segment whenever the last one alone would be
 * ambiguous — a generic verb or a bare id — so `/roles/all` reads `roles/all`
 * rather than `all`. The full URL is always on the row's `title` and in the
 * detail pane, so this only has to disambiguate at a glance.
 */
export function requestName(url: string): string {
  const path = (url || "").split("?")[0];
  const segments = path
    .split("/")
    .filter(Boolean)
    .filter((s, i) => !(i < 2 && (PREFIX_SEGMENTS.has(s.toLowerCase()) || isVersion(s))));

  if (segments.length === 0) return path || "—";

  const last = segments[segments.length - 1];
  const parent = segments[segments.length - 2];

  if (parent && (GENERIC_SEGMENTS.has(last.toLowerCase()) || isIdLike(last))) {
    return `${parent}/${last}`;
  }
  return last;
}

export function clock(at: number): string {
  try {
    return new Date(at).toLocaleTimeString(undefined, { hour12: false });
  } catch {
    return "";
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function statusText(status?: number): string {
  if (status == null) return "";
  return STATUS_TEXT[status] ?? "";
}

/** Best-effort copy that resolves to whether it succeeded, so callers can flash
 * a confirmation. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}
