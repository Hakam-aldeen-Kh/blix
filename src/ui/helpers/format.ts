/** Dev Tools — display formatting. */

import type { MonitorEntry } from "../../capture/networkMonitor";
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

/** A span of time at the precision a countdown needs: `42s`, `3m 10s`,
 * `5h 2m`, `12d 4h`. Sign is ignored — the caller says "in" or "ago". */
export function formatSpan(ms: number): string {
  const s = Math.floor(Math.abs(ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function statusText(status?: number): string {
  if (status == null) return "";
  return STATUS_TEXT[status] ?? "";
}

/**
 * The short label in an entry's status pill.
 *
 * Shared by the row and the detail head so the two can never disagree — they
 * did, and a Redux action that read "±14" in the list read "—" one pane over.
 * Only HTTP has a status code; the other three fill the same slot with the
 * nearest thing they have, rather than the blank that reads as "unknown" when
 * the row's own state already says otherwise.
 */
export function entryStatusLabel(entry: MonitorEntry): string {
  switch (entry.kind ?? "http") {
    case "ws":
      return entry.state === "pending" ? "open" : "closed";
    case "redux": {
      const diff = entry.redux?.diff;
      const n = diff?.changes.length ?? 0;
      return n ? `±${n}${diff?.truncated ? "+" : ""}` : "—";
    }
    case "query":
      if (entry.state === "pending") return "•••";
      if (entry.state === "error") return "ERR";
      return (entry.query?.status ?? "OK").toUpperCase().slice(0, 4);
    default:
      // Words, not glyphs. The column is monospace text now rather than a
      // pill, and "pending" and "aborted" are states a code cannot express —
      // the glyphs that used to stand in for them (••• and ⊘) had to be
      // learned, and one of them read as "disabled".
      if (entry.state === "pending") return "pending";
      if (entry.state === "aborted") return "aborted";
      if (entry.status != null) return String(entry.status);
      return entry.state === "error" ? "ERR" : "—";
  }
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

/**
 * A route, split where the eye needs it: the module that says *where* and the
 * identifier that says *what*.
 *
 * The list used to show only `requestName`'s last segment, which is why four
 * rows against `Tickets/getAll`, `Macros/getAll`, `Agents/getAll` and
 * `Presence/getAll` all read `getAll` and could not be told apart. The head is
 * what gives way when the column narrows; the tail never truncates, because
 * the tail is the part you are scanning for.
 *
 * The query string travels with the tail — `getAll?status=open` and
 * `getAll?status=closed` are two different calls, and dropping the difference
 * would recreate the bug one level down.
 */
export function splitRoute(entry: MonitorEntry): { head: string; tail: string } {
  const raw = entry.url || "";
  const kind = entry.kind ?? "http";

  // A Redux action type and a serialized query key are already `slice/name`;
  // they have no query string and must not be path-cleaned.
  if (kind === "redux" || kind === "query") {
    const cut = raw.lastIndexOf("/");
    return cut < 0
      ? { head: "", tail: raw }
      : { head: raw.slice(0, cut + 1), tail: raw.slice(cut + 1) };
  }

  const q = raw.indexOf("?");
  const path = q < 0 ? raw : raw.slice(0, q);
  const search = q < 0 ? "" : raw.slice(q);
  const cut = path.lastIndexOf("/");
  if (cut < 0) return { head: "", tail: path + search || "—" };
  return { head: path.slice(0, cut + 1), tail: path.slice(cut + 1) + search };
}

/**
 * Which of the four data colours a row paints in.
 *
 * Severity, not success: a 404 on an avatar and a 500 on checkout are both
 * "not 2xx" and are not the same news. `mark` is the deliberate absence — a
 * 304 and an aborted request are both "nothing happened", which must not read
 * as either progress or failure.
 */
export type Tone = "ok" | "warn" | "err" | "info" | "mark";

export function statusTone(entry: MonitorEntry): Tone {
  if (entry.state === "aborted") return "mark";
  if (entry.state === "pending") return "info";

  const status = entry.status;
  if (status == null) return entry.state === "error" ? "err" : "ok";
  if (status === 304) return "mark";
  if (status < 200) return "info"; // 101, and anything else informational
  if (status < 300) return "ok";
  if (status < 400) return "info"; // a redirect is in progress, not finished
  // 401 is the one 4xx that reads as a failure rather than as an outcome: it
  // stops the app rather than answering it, and a wall of them is the bug.
  if (status === 401) return "err";
  if (status < 500) return "warn";
  return "err";
}
