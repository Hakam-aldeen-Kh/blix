import { describe, expect, test } from "vitest";
import type { MonitorEntry } from "../../src/capture/monitorTypes";
import { buildLinkGraph, linkedEntries, linkLabel, sectionOf } from "../../src/ui/helpers/entryLinks";
import { childCount, isExpandable, isLargeBase64, kindOf, summarize } from "../../src/ui/helpers/jsonTree";
import { describeAlg } from "../../src/ui/helpers/jwtAlg";
import { asTable, VALUE_COLUMN } from "../../src/ui/helpers/tabular";
import { endOf, niceScale, rowTiming, startOf } from "../../src/ui/helpers/waterfall";
import { evaluateFilter, parseFilter } from "../../src/ui/services/filterQuery";
import { canReplay } from "../../src/ui/services/replayRequest";
import { classifyReplay } from "../../src/ui/constants/replay";
import { getHaystack, matchesQuery } from "../../src/ui/services/searchIndex";

let n = 0;
const entry = (patch: Partial<MonitorEntry> = {}): MonitorEntry =>
  ({ id: `e${++n}`, seq: n, rev: 0, method: "GET", url: "/x", at: 0, startTime: 0, timeOrigin: 0, startAbs: 100, loadId: "l", state: "success", ...patch }) as MonitorEntry;
const client = { request: async () => ({}) } as never;

describe("links between rows", () => {
  test("owner, replay and caused requests link both ways, once, across sections", () => {
    const query = entry({ kind: "query", url: '["users"]', query: { sub: "query", hash: "h", key: [], status: "success", observers: 1 } });
    const request = entry({ ownerId: query.id });
    query.query!.causedIds = [request.id];
    const replay = entry({ replayOf: request.id });
    const graph = buildLinkGraph([query, request, replay]);
    expect(linkedEntries(request.id, graph).map((e) => e.id).sort()).toEqual([query.id, replay.id].sort());
    expect(linkedEntries(query.id, graph).map((e) => e.id)).toEqual([request.id]);
    expect(graph.tags.get(request.id)?.split(",").sort()).toEqual(["network", "query"]);
  });

  test("a link to an entry no longer in the log is dropped", () => {
    const orphan = entry({ ownerId: "gone" });
    expect(linkedEntries(orphan.id, buildLinkGraph([orphan]))).toEqual([]);
  });

  test("labels and sections", () => {
    expect(sectionOf(entry({ kind: "ws" }))).toBe("realtime");
    expect(linkLabel(entry({ method: "POST", url: "/api/orders/save", status: 201 }))).toBe("POST orders/save · 201");
    expect(linkLabel(entry({ state: "aborted" }))).toContain("⊘");
  });
});

describe("tables", () => {
  test("an array of objects is a table with the union of its keys", () => {
    const table = asTable([{ a: 1, b: 2 }, { a: 3, c: 4 }, { a: 5 }])!;
    expect(table.columns).toEqual(["a", "b", "c"]);
    expect(table.cell(table.rows[1], "c")).toBe(4);
  });

  test("an array of scalars is one value column; a mixed array is no table", () => {
    expect(asTable([1, 2, 3])?.columns).toEqual([VALUE_COLUMN]);
    expect(asTable([1, { a: 1 }, 3])).toBeNull();
  });

  test("too few rows, or a scalar, is no table", () => {
    expect(asTable([{ a: 1 }])).toBeNull();
    expect(asTable("x")).toBeNull();
  });
});

describe("JSON tree", () => {
  test("kinds and summaries", () => {
    expect(kindOf(null)).toBe("null");
    expect(kindOf([1])).toBe("array");
    expect(kindOf({ __nmTruncated: "string" })).toBe("truncated");
    expect(summarize([1, 2])).toBe("Array(2)");
    expect(summarize({ a: 1 })).toBe("{1 key}");
    expect(summarize({ a: 1, b: 2 })).toBe("{2 keys}");
    expect(isExpandable({})).toBe(false);
    expect(isExpandable({ a: 1 })).toBe(true);
    expect(childCount("x")).toBe(0);
  });

  test("large base64 is recognized by a sample; prose is not", () => {
    expect(isLargeBase64("data:image/png;base64,AAAA")).toBe(true);
    expect(isLargeBase64("QUJD".repeat(5000))).toBe(true);
    expect(isLargeBase64("hello world ".repeat(5000))).toBe(false);
  });
});

describe("waterfall", () => {
  test("start and end, measured or derived", () => {
    expect(startOf(entry({ startAbs: 50 }))).toBe(50);
    expect(endOf(entry({ startAbs: 50, endAbs: 80 }))).toBe(80);
    expect(endOf(entry({ startAbs: 50, durationMs: 10 }))).toBe(60);
    expect(endOf(entry({ startAbs: 50 }))).toBeUndefined();
  });

  test("a scale is a round number at or above the max", () => {
    expect(niceScale(0)).toBe(1000);
    expect(niceScale(1234)).toBe(1300);
    expect(niceScale(87)).toBe(87);
    for (const max of [3, 47, 999, 12_345]) expect(niceScale(max)).toBeGreaterThanOrEqual(max);
  });

  test("a running request grows with time; bars never pass 100%", () => {
    expect(rowTiming(entry({ state: "pending", startAbs: 0, durationMs: undefined }), 1000, 500).transferPct).toBe(50);
    expect(rowTiming(entry({ durationMs: 5000 }), 1000, 0).transferPct).toBe(100);
  });
});

describe("JWT alg label", () => {
  test("known, unknown, absent, malformed and unsigned", () => {
    expect(describeAlg({ alg: "HS256" }).unsigned).toBe(false);
    expect(describeAlg({}).absent).toBe(true);
    expect(describeAlg({ algNotString: true }).label).toBe("present, not a string");
    expect(describeAlg({ alg: "NoNe" }).unsigned).toBe(true);
    expect(describeAlg({ alg: "x".repeat(40) }).label).toHaveLength(25);
    // A long label is cut by code point, never through an emoji.
    expect(describeAlg({ alg: "😀".repeat(30) }).label).toBe(`${"😀".repeat(24)}…`);
  });
});

describe("replay", () => {
  test("fetch, no client, multipart and session endpoints are refused with a reason", () => {
    expect(canReplay(entry({ client: "fetch" }), client).can).toBe(false);
    expect(canReplay(entry({ client: "axios" })).reason).toBe("HTTP client not provided");
    expect(canReplay(entry({ client: "axios", hadFormData: true }), client).can).toBe(false);
    expect(canReplay(entry({ client: "axios", url: "/api/auth/refresh" }), client).can).toBe(false);
  });

  test("reads replay on one click; writes ask first", () => {
    expect(canReplay(entry({ client: "axios", url: "/api/orders/list" }), client)).toEqual({ can: true, needsConfirm: false });
    expect(canReplay(entry({ client: "axios", method: "POST", url: "/api/orders/save" }), client).needsConfirm).toBe(true);
  });

  test("a method that can only write always asks, whatever the URL", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(canReplay(entry({ client: "axios", method, url: "/api/orders/5/details" }), client).needsConfirm).toBe(true);
    }
  });

  test("classification by URL", () => {
    expect(classifyReplay("/api/users/getAll?x=1")).toBe("read");
    expect(classifyReplay("/api/users/save")).toBe("write");
    expect(classifyReplay("/sso/callback")).toBe("blocked");
  });
});

describe("search", () => {
  test("the host of a client with a baseURL is searchable, by text and by url:", () => {
    const e = entry({ baseURL: "https://api.example.com", url: "/v1/users" });
    expect(matchesQuery(e, "api.example.com", false)).toBe(true);
    expect(evaluateFilter(e, parseFilter("url:api.example.com"), false)).toBe(true);
  });

  test("deep search reads bodies, case-insensitively, and follows a new revision", () => {
    const e = entry({ responsePayload: { name: "Ada Lovelace" } });
    expect(matchesQuery(e, "lovelace", false)).toBe(false);
    expect(matchesQuery(e, "lovelace", true)).toBe(true);
    const next = { ...e, rev: 1, responsePayload: { name: "Grace" } };
    expect(getHaystack(next)).not.toContain("lovelace");
  });
});
