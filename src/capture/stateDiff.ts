/**
 * Network monitor — bounded structural diff between two Redux states.
 *
 * The core trick is reference-equality pruning: RTK/Immer guarantee
 * structural sharing (RTK's own `immutableCheck` dev middleware proves
 * reducers never mutate in place), so `Object.is(a, b)` at any node means
 * "nothing under here changed" and the whole subtree is skipped without being
 * visited. On a typical action that touches one nested value, this makes the
 * walk cost roughly proportional to the *path* to that value, not the size of
 * the state tree — so appending one message to one conversation out of two
 * hundred costs on the order of a few hundred pointer compares, not a
 * traversal of every message in the store.
 *
 * Bounded on every axis (depth, node count, change count, per-value size) so
 * a reducer that legitimately rebuilds a large array (`state.x = state.x.map(...)`)
 * degrades to one summarized "length N → M" change instead of walking every
 * element pairwise.
 *
 * Pure and side-effect free — this module is called from `reduxCapture.ts`
 * inside a `try/catch`, but never throws by design.
 */

import { MAX_REDUX_DIFF_VALUE_BYTES } from "./monitorConfig";
import { truncateForPersist } from "./monitorTruncate";
import type { DiffOp, StateDiff, StateDiffEntry } from "./monitorTypes";

export interface DiffOptions {
  /** How many levels deep to descend before summarizing the rest. */
  maxDepth?: number;
  /** How many nodes to visit in total before summarizing the rest. */
  maxNodes?: number;
  /** How many changes to record before stopping. */
  maxChanges?: number;
  /** Cap on each captured `before`/`after` value. */
  maxValueBytes?: number;
  /** Arrays with more reference-different elements than this are summarized
   * as one change rather than diffed element-by-element. */
  arrayScanCap?: number;
}

const DEFAULTS: Required<DiffOptions> = {
  maxDepth: 6,
  maxNodes: 2000,
  maxChanges: 100,
  maxValueBytes: MAX_REDUX_DIFF_VALUE_BYTES,
  arrayScanCap: 64,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function capture(value: unknown, maxBytes: number): unknown {
  return truncateForPersist(value, maxBytes).value;
}

/**
 * Diffs `prev` against `next`, returning a bounded list of changed paths.
 * `slices` collects the top-level keys touched, which is what the Redux
 * section's Slices column and the "no-op action" signal are built from.
 */
export function diffState(
  prev: unknown,
  next: unknown,
  options?: DiffOptions,
): StateDiff {
  const o = { ...DEFAULTS, ...options };
  const changes: StateDiffEntry[] = [];
  const slices = new Set<string>();
  let truncated = false;
  let nodesVisited = 0;

  const record = (path: string, op: DiffOp, before?: unknown, after?: unknown) => {
    if (changes.length >= o.maxChanges) {
      truncated = true;
      return;
    }
    const entry: StateDiffEntry = { path, op };
    if (before !== undefined) entry.before = capture(before, o.maxValueBytes);
    if (after !== undefined) entry.after = capture(after, o.maxValueBytes);
    changes.push(entry);

    const top = path.split(/[.[]/)[0];
    if (top) slices.add(top);
  };

  const walk = (a: unknown, b: unknown, path: string, depth: number): void => {
    if (Object.is(a, b)) return;
    if (changes.length >= o.maxChanges) {
      truncated = true;
      return;
    }

    nodesVisited += 1;
    if (nodesVisited > o.maxNodes || depth > o.maxDepth) {
      truncated = true;
      record(path || "(root)", "change", a, b);
      return;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        record(path || "(root)", "change", `length ${a.length}`, `length ${b.length}`);
        return;
      }
      let refDifferent = 0;
      for (let i = 0; i < a.length; i += 1) {
        if (!Object.is(a[i], b[i])) refDifferent += 1;
      }
      if (refDifferent > o.arrayScanCap) {
        truncated = true;
        record(
          path || "(root)",
          "change",
          undefined,
          `${refDifferent} of ${a.length} elements changed`,
        );
        return;
      }
      for (let i = 0; i < a.length; i += 1) {
        if (!Object.is(a[i], b[i])) walk(a[i], b[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    if (isPlainObject(a) && isPlainObject(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        const childPath = path ? `${path}.${key}` : key;
        const av = a[key];
        const bv = b[key];
        if (Object.is(av, bv)) continue;
        if (!(key in a)) record(childPath, "add", undefined, bv);
        else if (!(key in b)) record(childPath, "remove", av, undefined);
        else walk(av, bv, childPath, depth + 1);
      }
      return;
    }

    // Primitives, or a type change (array <-> object <-> primitive).
    record(path || "(root)", "change", a, b);
  };

  try {
    walk(prev, next, "", 0);
  } catch {
    truncated = true;
  }

  return { changes, truncated, slices: Array.from(slices) };
}
