import { describe, expect, test } from "vitest";
import { diffState } from "../../src/capture/stateDiff";
import type { StateDiff } from "../../src/capture/monitorTypes";

/** Replays a diff onto `before`: a complete diff must give `after` exactly. */
function apply(before: unknown, diff: StateDiff): unknown {
  const out = structuredClone(before) as Record<string, unknown>;
  for (const change of diff.changes) {
    if (change.path === "(root)") return structuredClone(change.after);
    const parts = change.path.match(/[^.[\]]+/g) ?? [];
    const last = parts.pop() as string;
    const parent = parts.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, out);
    if (change.op === "remove") delete parent[last];
    else parent[last] = structuredClone(change.after);
  }
  return out;
}

describe("diffState", () => {
  test("the same reference is no change, without walking it", () => {
    const state = { a: { deep: [1, 2, 3] } };
    expect(diffState(state, state)).toEqual({ changes: [], truncated: false, slices: [] });
  });

  test("a changed primitive deep inside records its path and both values", () => {
    const before = { user: { profile: { name: "Ada", age: 36 } }, other: { x: 1 } };
    const after = { ...before, user: { profile: { ...before.user.profile, age: 37 } } };
    const diff = diffState(before, after);
    expect(diff.changes).toEqual([{ path: "user.profile.age", op: "change", before: 36, after: 37 }]);
    expect(diff.slices).toEqual(["user"]);
    expect(apply(before, diff)).toEqual(after);
  });

  test("added and removed keys", () => {
    const before = { s: { a: 1, b: 2 } };
    const after = { s: { a: 1, c: 3 } };
    const diff = diffState(before, after);
    expect(diff.changes).toContainEqual({ path: "s.b", op: "remove", before: 2 });
    expect(diff.changes).toContainEqual({ path: "s.c", op: "add", after: 3 });
    expect(apply(before, diff)).toEqual(after);
  });

  test("an element changed in place is diffed by index", () => {
    const items = [{ id: 1, done: false }, { id: 2, done: false }];
    const before = { todos: { items } };
    const after = { todos: { items: [items[0], { id: 2, done: true }] } };
    const diff = diffState(before, after);
    expect(diff.changes).toEqual([{ path: "todos.items[1].done", op: "change", before: false, after: true }]);
  });

  test("a removal from the middle keeps the whole array, so it says which item went", () => {
    const before = { todos: { items: ["a", "b", "c"] } };
    const after = { todos: { items: ["a", "c"] } };
    const diff = diffState(before, after);
    expect(diff.truncated).toBe(false);
    expect(diff.changes).toEqual([{ path: "todos.items", op: "change", before: ["a", "b", "c"], after: ["a", "c"] }]);
    expect(apply(before, diff)).toEqual(after);
  });

  test("a length change past the scan cap is a summary, and says it is one", () => {
    const before = { big: { list: Array.from({ length: 100 }, (_, i) => i) } };
    const after = { big: { list: [...before.big.list, 100] } };
    const diff = diffState(before, after);
    expect(diff.truncated).toBe(true);
    expect(diff.changes[0]).toMatchObject({ path: "big.list", before: "length 100", after: "length 101" });
  });

  test("too many elements changed at once is a summary marked truncated", () => {
    const before = { l: Array.from({ length: 80 }, (_, i) => ({ i })) };
    const after = { l: before.l.map((x) => ({ ...x })) };
    const diff = diffState(before, after);
    expect(diff.truncated).toBe(true);
    expect(diff.changes[0].after).toBe("80 of 80 elements changed");
  });

  test("a value cut by the size cap marks the diff truncated", () => {
    const before = { s: { blob: "x" } };
    const after = { s: { blob: "y".repeat(40_000) } };
    const diff = diffState(before, after);
    expect(diff.truncated).toBe(true);
  });

  test("a value that fits is kept whole and the diff is complete", () => {
    const before = { s: { cfg: null as unknown } };
    const after = { s: { cfg: { theme: "dark", sizes: [1, 2] } } };
    const diff = diffState(before, after);
    expect(diff.truncated).toBe(false);
    expect(apply(before, diff)).toEqual(after);
  });

  test("past the depth ceiling the rest is recorded whole and marked", () => {
    const deep = (n: number, leaf: unknown): unknown => (n === 0 ? leaf : { d: deep(n - 1, leaf) });
    const diff = diffState(deep(10, 1), deep(10, 2), { maxDepth: 3 });
    expect(diff.truncated).toBe(true);
    expect(diff.changes).toHaveLength(1);
  });

  test("the change count ceiling stops and marks", () => {
    const before = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 0]));
    const after = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 1]));
    const diff = diffState(before, after, { maxChanges: 5 });
    expect(diff.changes).toHaveLength(5);
    expect(diff.truncated).toBe(true);
  });

  test("a type change (array to object) is one change at that path", () => {
    const diff = diffState({ s: { v: [1] } }, { s: { v: { 0: 1 } } });
    expect(diff.changes).toEqual([{ path: "s.v", op: "change", before: [1], after: { 0: 1 } }]);
  });

  test("a root that is not an object is recorded at (root)", () => {
    expect(diffState(1, 2).changes).toEqual([{ path: "(root)", op: "change", before: 1, after: 2 }]);
  });

  test("slices lists every top-level key touched, once", () => {
    const before = { a: { x: 1, y: 1 }, b: { z: 1 }, c: { w: 1 } };
    const after = { a: { x: 2, y: 2 }, b: { z: 2 }, c: before.c };
    expect(diffState(before, after).slices.sort()).toEqual(["a", "b"]);
  });

  test("a getter that throws does not throw out of the diff", () => {
    const after = { s: {} };
    Object.defineProperty(after.s, "boom", { enumerable: true, get: () => { throw new Error("no"); } });
    expect(() => diffState({ s: { boom: 1 } }, after)).not.toThrow();
  });
});
