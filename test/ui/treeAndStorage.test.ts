import { afterEach, describe, expect, test, vi } from "vitest";
import { captureEncrypted } from "../../src/capture/captureEncrypted";
import { isAxiosCapturedFetch, readMonitorId, stampAxiosFetchOptions, stampMonitorId } from "../../src/capture/monitorStamp";
import { networkMonitor } from "../../src/capture/networkMonitor";
import { safeGet, safeRemove, safeSet } from "../../src/capture/safeStorage";
import type { MonitorEntry } from "../../src/capture/monitorTypes";
import { analyzeFolds, blockLabel, foldSummary } from "../../src/ui/helpers/jsonFold";
import { childPath, defaultExpansion, pathsToMatches, subtreePaths } from "../../src/ui/helpers/jsonTree";
import { resolveSelection } from "../../src/ui/helpers/selection";

/** Follows a tree path ("$.a\\.b[2]") into a value. */
function resolvePath(root: unknown, path: string): unknown {
  let value = root;
  const re = /\[(\d+)\]|\.((?:\\.|[^.[\\])+)/g;
  for (const m of path.slice(1).matchAll(re)) {
    value = m[1] !== undefined ? (value as unknown[])[Number(m[1])] : (value as Record<string, unknown>)[m[2].replace(/\\(.)/g, "$1")];
  }
  return value;
}

describe("tree paths", () => {
  test("keys with dots and brackets get paths that do not collide", () => {
    const paths = new Set([childPath("$", "a.b"), childPath(childPath("$", "a"), "b"), childPath("$", "0"), childPath("$", 0), childPath("$", "[0]")]);
    expect(paths.size).toBe(5);
  });

  test("every path the tree builds leads back to its value", () => {
    const value = { "a.b": { c: [1, { "d[0]": 2 }] }, list: [[1], { x: "y" }] };
    for (const path of subtreePaths(value, "$")) {
      const node = resolvePath(value, path);
      expect(node !== null && typeof node === "object").toBe(true);
    }
  });

  test("default expansion opens a small value, and spends a budget on a big one", () => {
    expect(defaultExpansion({ a: { b: 1 } })).toEqual(new Set(["$", "$.a"]));
    const big = { rows: Array.from({ length: 5000 }, (_, i) => ({ i })) };
    expect(defaultExpansion(big).has("$.rows")).toBe(false);
  });

  test("search opens the way to every key or value that matches, and only that way", () => {
    const value = { user: { name: "Ada", tags: ["x"] }, other: { z: 1 } };
    const open = pathsToMatches(value, "ada");
    expect(open.has("$")).toBe(true);
    expect(open.has("$.user")).toBe(true);
    expect(open.has("$.other")).toBe(false);
    expect(pathsToMatches(value, "")).toEqual(new Set());
  });
});

describe("fold regions of pretty-printed JSON", () => {
  const values: unknown[] = [
    { a: 1, b: [1, 2, { c: { d: [] } }], "e.f": { "[g]": {} } },
    [[1, [2, [3]]], { x: null }],
    { empty: {}, list: [], text: "{ not a block [" },
    { 'quote"key': { "back\\slash": [true] } },
  ];

  test.each(values.map((v) => [JSON.stringify(v).slice(0, 40), v]))("every region matches the value: %s", (_label, value) => {
    const lines = JSON.stringify(value, null, 2).split("\n");
    const { regions, byStart } = analyzeFolds(lines);
    expect(regions.length).toBeGreaterThan(0);
    for (const region of regions) {
      const node = resolvePath(value, region.path);
      expect(Array.isArray(node) ? "array" : "object").toBe(region.kind);
      expect(region.count).toBe(Array.isArray(node) ? node.length : Object.keys(node as object).length);
      expect(lines[region.end].trim()).toMatch(/^[}\]],?$/);
      expect(byStart.get(region.start)).toBe(region);
    }
  });

  test("labels and summaries", () => {
    expect(blockLabel('  "items": [')).toBe("items");
    expect(blockLabel("  {")).toBe("");
    expect(foldSummary({ kind: "object", count: 1 })).toBe("… 1 key");
    expect(foldSummary({ kind: "array", count: 3 })).toBe("… 3 items");
  });
});

describe("selection", () => {
  const a = { id: "a" } as MonitorEntry;
  const b = { id: "b" } as MonitorEntry;

  test("follow, none, visible, hidden by the filter, evicted, restored", () => {
    expect(resolveSelection({ kind: "follow" }, [a, b], [b], new Set(["b"]))).toEqual({ status: "follow", entry: b });
    expect(resolveSelection({ kind: "none" }, [a], [a], new Set(["a"]))).toEqual({ status: "none", entry: null });
    expect(resolveSelection({ kind: "id", id: "a" } as never, [a, b], [a], new Set(["a"]))).toEqual({ status: "visible", entry: a });
    expect(resolveSelection({ kind: "id", id: "b" } as never, [a, b], [a], new Set(["a"]))).toEqual({ status: "hidden-by-filter", entry: b });
    expect(resolveSelection({ kind: "id", id: "gone" } as never, [a], [a], new Set(["a"]))).toEqual({ status: "evicted", entry: null });
    expect(resolveSelection({ kind: "id", id: "gone", restored: true } as never, [a], [a], new Set(["a"]))).toEqual({ status: "none", entry: null });
  });
});

describe("safe storage", () => {
  afterEach(() => vi.restoreAllMocks());

  test("works normally, and swallows a blocked or full localStorage", () => {
    safeSet("k", "v");
    expect(safeGet("k")).toBe("v");
    safeRemove("k");
    expect(safeGet("k")).toBeNull();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(safeGet("k")).toBeNull();
    expect(() => safeSet("k", "v")).not.toThrow();
  });
});

describe("request stamps", () => {
  test("an id stamped on a config is read back, from a spread copy, and from a frozen config", () => {
    const config = {};
    stampMonitorId(config, "id1");
    expect(readMonitorId(config)).toBe("id1");
    expect(Object.keys(config)).toEqual([]);
    expect(readMonitorId({ ...config, __monitorId: "id1" })).toBe("id1");
    const frozen = Object.freeze({});
    stampMonitorId(frozen, "id2");
    expect(readMonitorId(frozen)).toBe("id2");
    expect(readMonitorId(null)).toBeUndefined();
  });

  test("axios's fetch options are marked without losing the app's own", () => {
    const config: { fetchOptions?: unknown } = { fetchOptions: { priority: "high" } };
    stampAxiosFetchOptions(config, "id");
    expect(config.fetchOptions).toMatchObject({ priority: "high" });
    expect(isAxiosCapturedFetch(config.fetchOptions)).toBe(true);
    expect(isAxiosCapturedFetch({})).toBe(false);
  });
});

describe("captureEncrypted", () => {
  test("ciphertext is stored beside its request; binary as a hex preview; one side never blanks the other", () => {
    const id = networkMonitor.nextId();
    networkMonitor.start({ id, method: "POST", url: "/enc", at: 0, startTime: 0 });
    const config = {};
    stampMonitorId(config, id);
    captureEncrypted(config, { request: "Q0lQSEVS" });
    captureEncrypted(config, { response: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) });
    captureEncrypted(config, { request: null });
    const entry = networkMonitor.getById(id)!;
    expect(entry.encryptedRequest).toBe("Q0lQSEVS");
    expect(entry.encryptedResponse).toEqual({ __blixBinary: "Uint8Array", byteLength: 4, head: "deadbeef", truncated: false });
  });

  test("a config Blix never saw is ignored", () => {
    expect(() => captureEncrypted({}, { request: "x" })).not.toThrow();
  });
});
