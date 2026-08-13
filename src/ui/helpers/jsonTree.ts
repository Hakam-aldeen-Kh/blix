/**
 * Dev Tools — JSON tree helpers.
 *
 * The tree is never materialized: nodes are rendered lazily straight off the
 * original value, keyed by path. A collapsed 4 MB subtree therefore costs one
 * DOM row, which is what keeps `/attachments/get` responses from freezing the
 * panel.
 */

import { isTruncationMarker } from "../../capture/monitorTruncate";
import {
  ARRAY_PAGE,
  AUTO_DEPTH,
  AUTO_NODE_BUDGET,
  BASE64_SNIFF_MIN,
  MAX_SEARCH_NODES,
} from "../constants/ui";

export type NodeKind =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "truncated";

export function kindOf(value: unknown): NodeKind {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (isTruncationMarker(value)) return "truncated";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return "string";
  }
}

export function isExpandable(value: unknown): boolean {
  const kind = kindOf(value);
  if (kind !== "object" && kind !== "array") return false;
  return childCount(value) > 0;
}

export function childCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

/** One-line summary shown next to a collapsed node, Chrome-style. */
export function summarize(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  const n = childCount(value);
  return n === 1 ? "{1 key}" : `{${n} keys}`;
}

/**
 * A long, base64-shaped string is rendered as a chip rather than as text.
 * Attachment responses are megabytes of base64, and painting that into the DOM
 * is the single easiest way to lock up the panel.
 */
export function isLargeBase64(value: string): boolean {
  if (value.startsWith("data:")) return true;
  if (value.length < BASE64_SNIFF_MIN) return false;
  // Sampling beats testing the whole string, which for 4 MB is itself slow.
  const sample = value.slice(0, 256);
  return /^[A-Za-z0-9+/\r\n=]+$/.test(sample);
}

export function childPath(parent: string, key: string | number): string {
  return typeof key === "number" ? `${parent}[${key}]` : `${parent}.${key}`;
}

/**
 * Which paths to expand when a payload is first shown: everything down to
 * `AUTO_DEPTH`, but stopping as soon as `AUTO_NODE_BUDGET` rows would be
 * visible. Bounded by construction, so a huge payload costs no more than a
 * small one.
 */
export function defaultExpansion(root: unknown, rootPath = "$"): Set<string> {
  const expanded = new Set<string>();
  let budget = AUTO_NODE_BUDGET;

  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > AUTO_DEPTH || budget <= 0 || !isExpandable(value)) return;

    const count = childCount(value);
    if (count > budget) return;

    expanded.add(path);
    budget -= count;

    const entries: [string | number, unknown][] = Array.isArray(value)
      ? value.map((v, i) => [i, v])
      : Object.entries(value as Record<string, unknown>);

    for (const [key, child] of entries) {
      if (budget <= 0) return;
      visit(child, childPath(path, key), depth + 1);
    }
  };

  visit(root, rootPath, 0);
  return expanded;
}

/**
 * How many rows the tree would render given the current expansion, capped at
 * `limit`.
 *
 * Needed as a *pre-pass* rather than a counter consumed during render: children
 * render after their parent returns, so a budget counter can't be read by the
 * parent to decide whether to show a "truncated" footer.
 */
export function countVisible(
  root: unknown,
  expanded: Set<string>,
  shown: Map<string, number>,
  limit: number,
  rootPath = "$",
): number {
  let count = 0;

  const visit = (value: unknown, path: string) => {
    if (count >= limit) return;
    count += 1;
    if (!expanded.has(path) || !isExpandable(value)) return;

    if (Array.isArray(value)) {
      const cap = Math.min(value.length, shown.get(path) ?? ARRAY_PAGE);
      for (let i = 0; i < cap; i += 1) {
        if (count >= limit) return;
        visit(value[i], childPath(path, i));
      }
      return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (count >= limit) return;
      visit(child, childPath(path, key));
    }
  };

  visit(root, rootPath);
  return count;
}

/**
 * Ancestor paths of every node matching `query`, so the tree can auto-expand to
 * reveal search hits. One bounded DFS, recomputed only when the entry or the
 * debounced query changes — never per keystroke per node.
 */
export function pathsToMatches(
  root: unknown,
  query: string,
  rootPath = "$",
): Set<string> {
  const out = new Set<string>();
  if (!query) return out;
  let visited = 0;

  const visit = (value: unknown, path: string, ancestors: string[]): boolean => {
    if (visited++ > MAX_SEARCH_NODES) return false;

    if (value !== null && typeof value === "object") {
      const entries: [string | number, unknown][] = Array.isArray(value)
        ? value.map((v, i) => [i, v])
        : Object.entries(value as Record<string, unknown>);

      let hit = false;
      const nextAncestors = [...ancestors, path];
      for (const [key, child] of entries) {
        if (String(key).toLowerCase().includes(query)) {
          nextAncestors.forEach((a) => out.add(a));
          hit = true;
        }
        if (visit(child, childPath(path, key), nextAncestors)) hit = true;
      }
      return hit;
    }

    const text = String(value ?? "").toLowerCase();
    if (text.includes(query)) {
      ancestors.forEach((a) => out.add(a));
      return true;
    }
    return false;
  };

  visit(root, rootPath, []);
  return out;
}

/**
 * Splits `text` around case-insensitive occurrences of `query`.
 *
 * Returns plain segments for React to render — deliberately not HTML, so
 * highlighting can never inject markup the way a `dangerouslySetInnerHTML`
 * approach could.
 */
export function splitHighlight(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  if (!query) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const out: { text: string; match: boolean }[] = [];
  let index = 0;

  for (;;) {
    const at = lower.indexOf(query, index);
    if (at < 0) break;
    if (at > index) out.push({ text: text.slice(index, at), match: false });
    out.push({ text: text.slice(at, at + query.length), match: true });
    index = at + query.length;
  }

  if (index < text.length) out.push({ text: text.slice(index), match: false });
  return out.length ? out : [{ text, match: false }];
}
