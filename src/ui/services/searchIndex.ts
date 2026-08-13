/**
 * Dev Tools — deep-search haystack cache.
 *
 * The original panel did `JSON.stringify(requestPayload) + JSON.stringify(
 * responsePayload)` for **every entry on every keystroke**. With 200 buffered
 * entries and a multi-megabyte attachment response in the buffer, that made the
 * search box unusable.
 *
 * Two fixes here: the text is built at most once per entry revision (the store
 * bumps `rev` on every patch, so a settled request is stringified twice in its
 * whole lifetime), and it is capped so a 4 MB base64 payload contributes at
 * most `SEARCH_INDEX_CAP` characters.
 */

import { SEARCH_INDEX_CAP } from "../../capture/monitorConfig";
import type { MonitorEntry } from "../../capture/networkMonitor";

interface CacheRow {
  rev: number;
  text: string;
  truncated: boolean;
}

const cache = new Map<string, CacheRow>();

/** Depth-first append with a hard character budget. Never serializes the whole
 * value first — that is the cost we're avoiding. */
function appendBounded(value: unknown, out: string[], budget: { left: number }) {
  if (budget.left <= 0 || value == null) return;

  if (typeof value === "string") {
    const slice = value.slice(0, budget.left);
    out.push(slice.toLowerCase());
    budget.left -= slice.length;
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    const s = String(value);
    out.push(s);
    budget.left -= s.length;
    return;
  }

  if (typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (budget.left <= 0) return;
      appendBounded(item, out, budget);
    }
    return;
  }

  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (budget.left <= 0) return;
    out.push(key.toLowerCase());
    budget.left -= key.length;
    appendBounded(val, out, budget);
  }
}

function build(entry: MonitorEntry): CacheRow {
  const parts: string[] = [];
  const budget = { left: SEARCH_INDEX_CAP };
  try {
    appendBounded(entry.requestPayload, parts, budget);
    appendBounded(entry.responsePayload ?? entry.error, parts, budget);
  } catch {
    /* exotic payload — index whatever we collected */
  }
  return { rev: entry.rev, text: parts.join(" "), truncated: budget.left <= 0 };
}

export function getHaystack(entry: MonitorEntry): string {
  const hit = cache.get(entry.id);
  if (hit && hit.rev === entry.rev) return hit.text;
  const row = build(entry);
  cache.set(entry.id, row);
  return row.text;
}

/** True when any currently cached entry had its indexed text cut short, so the
 * panel can say deep search is not exhaustive. */
export function isIndexTruncated(entry: MonitorEntry): boolean {
  return cache.get(entry.id)?.truncated ?? false;
}

/** Drops cache rows for entries that have left the buffer. Called with the live
 * id set rather than per-eviction so it stays O(cache). */
export function pruneSearchIndex(liveIds: Set<string>): void {
  if (cache.size <= liveIds.size) return;
  for (const id of cache.keys()) {
    if (!liveIds.has(id)) cache.delete(id);
  }
}

/** Cheap metadata match — url, method, status. Checked before the haystack so
 * the common case never touches payloads at all. */
export function matchesMeta(entry: MonitorEntry, q: string): boolean {
  return (
    entry.url.toLowerCase().includes(q) ||
    entry.method.toLowerCase().includes(q) ||
    String(entry.status ?? "").includes(q)
  );
}

export function matchesQuery(
  entry: MonitorEntry,
  q: string,
  deepSearch: boolean,
): boolean {
  if (!q) return true;
  if (matchesMeta(entry, q)) return true;
  if (!deepSearch) return false;
  return getHaystack(entry).includes(q);
}
