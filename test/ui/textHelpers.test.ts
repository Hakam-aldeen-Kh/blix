import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { toYaml } from "../../src/ui/helpers/toYaml";
import { lineDiff, withHunks } from "../../src/ui/helpers/lineDiff";
import {
  describeTokens,
  evaluateFilter,
  parseDuration,
  parseFilter,
  parseSize,
  tokenToRaw,
} from "../../src/ui/services/filterQuery";
import { formatBytes, formatDuration, formatSpan, requestName, shortUrl, splitRoute, statusTone, entryStatusLabel } from "../../src/ui/helpers/format";
import type { MonitorEntry } from "../../src/capture/monitorTypes";

const entry = (patch: Partial<MonitorEntry>): MonitorEntry =>
  ({ id: "e", seq: 1, rev: 0, method: "GET", url: "/api/orders?page=2", at: 0, startTime: 0, timeOrigin: 0, startAbs: 0, loadId: "l", state: "success", ...patch }) as MonitorEntry;

describe("toYaml round-trips through a real YAML parser", () => {
  const cases: [string, unknown][] = [
    ["scalars", { s: "text", n: 1.5, neg: -3, b: true, nul: null }],
    ["strings YAML would misread", { a: "true", b: "null", c: "123", d: "1e5", e: "0x1f", f: "2024-01-01", g: "yes", h: "~", i: "-dash", j: "#hash", k: "a: b", l: "a #b", m: "ends:", n: " padded ", o: "", p: "@at", q: "'quote'", r: '"dq"' }],
    ["control characters", { t: "tab\there", cr: "a\rb", bell: "\u0007", del: "x\u007f" }],
    ["multi-line text", { text: "line one\nline two\n\nline four" }],
    ["multi-line text ending in a newline", { text: "a\nb\n" }],
    ["multi-line text ending in several newlines", { text: "a\nb\n\n\n" }],
    ["only newlines", { text: "\n\n" }],
    ["indented after an empty first line", { text: "\n  x\ny" }],
    ["block text inside a list", [{ notes: "one\n  two\n" }]],
    ["multi-line text whose first line is indented", { code: "  indented\nnot" }],
    ["nested containers", { a: [1, [2, 3], { b: [] }, {}], c: { d: { e: [{ f: 1 }] } } }],
    ["top-level array", [{ a: 1 }, "x", [1, 2], null]],
    ["unicode", { ar: "مرحبا", emoji: "✓ 🚀" }],
    ["keys that need quoting", { "a: b": 1, "": 2, "-k": 3, "123": 4, "true": 5 }],
  ];
  test.each(cases)("%s", (_label, value) => {
    const { text, truncated } = toYaml(value);
    expect(truncated).toBe(false);
    expect(parseYaml(text)).toEqual(value);
  });

  test("numbers that are not finite", () => {
    expect(parseYaml(toYaml({ a: Number.NaN, b: Infinity, c: -Infinity }).text)).toEqual({ a: Number.NaN, b: Infinity, c: -Infinity });
  });

  test("undefined is no text; a huge value is truncated and says so", () => {
    expect(toYaml(undefined)).toEqual({ text: "", truncated: false });
    expect(toYaml(Array.from({ length: 30_000 }, (_, i) => i)).truncated).toBe(true);
  });
});

describe("lineDiff", () => {
  const rebuild = (lines: ReturnType<typeof lineDiff>, side: "before" | "after") =>
    lines.filter((l) => l.op === "context" || l.op === (side === "before" ? "del" : "add")).map((l) => l.text).join("\n");

  test.each([
    ["a\nb\nc", "a\nx\nc"],
    ["", "new"],
    ["old", ""],
    ["a\nb\nc\nd", "d\nc\nb\na"],
    ["same\nsame", "same\nsame"],
    ["{\n  \"a\": 1\n}", "{\n  \"a\": 1,\n  \"b\": 2\n}"],
  ])("both sides rebuild exactly: %j → %j", (before, after) => {
    const diff = lineDiff(before, after);
    expect(rebuild(diff, "before")).toBe(before);
    expect(rebuild(diff, "after")).toBe(after);
  });

  test("line numbers follow each side", () => {
    expect(lineDiff("a\nb", "a\nc")).toEqual([
      { op: "context", text: "a", before: 1, after: 1 },
      { op: "del", text: "b", before: 2, after: null },
      { op: "add", text: "c", before: null, after: 2 },
    ]);
  });

  test("past the guard it is still correct, just wholesale", () => {
    const big = Array.from({ length: 700 }, (_, i) => `l${i}`).join("\n");
    const diff = lineDiff(big, `${big}\nmore`);
    expect(rebuild(diff, "after")).toBe(`${big}\nmore`);
  });

  test("withHunks keeps context around changes and counts what it hides", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "X");
    const hunks = withHunks(lineDiff(before, after), 2);
    expect(hunks[0]).toEqual({ gap: 8 });
    // 21 lines: the change is a del and an add, so 7 follow the kept context.
    expect(hunks.at(-1)).toEqual({ gap: 7 });
    expect(hunks.filter((h) => "op" in h)).toHaveLength(6);
  });
});

describe("filter", () => {
  const match = (q: string, e: MonitorEntry, deep = false) => evaluateFilter(e, parseFilter(q), deep);

  test("fields, aliases, negation and quotes", () => {
    expect(parseFilter('method:POST -status:5xx "agent 3" larger:10k').tokens).toEqual([
      { field: "method", value: "post", negated: false },
      { field: "status", value: "5xx", negated: true },
      { field: "text", value: "agent 3", negated: false },
      { field: "larger-than", value: "10k", negated: false },
    ]);
    expect(parseFilter("   ").empty).toBe(true);
    expect(parseFilter("foo:bar").tokens[0]).toEqual({ field: "text", value: "foo:bar", negated: false });
    expect(parseFilter("-").tokens[0]).toEqual({ field: "text", value: "-", negated: false });
  });

  test("a filter written back and parsed again is the same filter", () => {
    for (const q of ['method:post -is:error "agent 3"', 'url:"a b" -"x y" status:4xx', "slower-than:1.5s has:frames"]) {
      const parsed = parseFilter(q);
      expect(parseFilter(parsed.tokens.map(tokenToRaw).join(" "))).toEqual(parsed);
    }
  });

  test("sizes and durations", () => {
    expect(parseSize("10k")).toBe(10240);
    expect(parseSize("1.5mb")).toBe(1.5 * 1024 * 1024);
    expect(parseSize("12")).toBe(12);
    expect(parseSize("big")).toBeNull();
    expect(parseDuration("1.5s")).toBe(1500);
    expect(parseDuration("200")).toBe(200);
    expect(parseDuration("soon")).toBeNull();
  });

  test("matching", () => {
    const failed = entry({ method: "POST", status: 503, state: "error", sizeBytes: 20_000, durationMs: 900, client: "axios" });
    expect(match("method:post status:5xx is:error client:axios", failed)).toBe(true);
    expect(match("status:503", failed)).toBe(true);
    expect(match("status:50", failed)).toBe(false);
    expect(match("larger-than:10k slower-than:500", failed)).toBe(true);
    expect(match("-is:error", failed)).toBe(false);
    expect(match("type:http", failed)).toBe(true);
    expect(match("url:orders", failed)).toBe(true);
    expect(match("is:pending", failed)).toBe(false);
    expect(describeTokens(parseFilter("-is:error x"))).toEqual(["not is:error", "x"]);
  });
});

describe("format", () => {
  test("bytes pick the unit after rounding", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1_048_575)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  test("durations pick the unit after rounding", () => {
    expect(formatDuration(12.4)).toBe("12 ms");
    expect(formatDuration(999.6)).toBe("1.00 s");
    expect(formatDuration(1500)).toBe("1.50 s");
  });

  test("spans", () => {
    expect(formatSpan(5_000)).toBe("5s");
    expect(formatSpan(65_000)).toBe("1m 5s");
    expect(formatSpan(3_700_000)).toBe("1h 1m");
    expect(formatSpan(90_000_000)).toBe("1d 1h");
  });

  test("a request's name skips api, versions and ids", () => {
    expect(requestName("/api/v2/orders/12345?x=1")).toBe("orders/12345");
    expect(requestName("/api/orders/list")).toBe("orders/list");
    expect(requestName("/internal-api/users")).toBe("users");
    expect(requestName("")).toBe("—");
    expect(shortUrl(`/${"x".repeat(100)}?q=1`)).toHaveLength(52);
  });

  test("route split keeps the query on the tail", () => {
    expect(splitRoute(entry({ url: "/api/orders?page=2" }))).toEqual({ head: "/api/", tail: "orders?page=2" });
    expect(splitRoute(entry({ kind: "redux", url: "cart/add" }))).toEqual({ head: "cart/", tail: "add" });
  });

  test("status tone and label", () => {
    expect(statusTone(entry({ status: 200 }))).toBe("ok");
    expect(statusTone(entry({ status: 304 }))).toBe("mark");
    expect(statusTone(entry({ status: 401 }))).toBe("err");
    expect(statusTone(entry({ status: 404 }))).toBe("warn");
    expect(statusTone(entry({ status: 500 }))).toBe("err");
    expect(statusTone(entry({ state: "pending" }))).toBe("info");
    expect(entryStatusLabel(entry({ status: undefined, state: "error", error: { kind: "timeout", message: "t" } }))).toBe("timeout");
    expect(entryStatusLabel(entry({ status: undefined, state: "error", error: { kind: "network", message: "n" } }))).toBe("network");
    expect(entryStatusLabel(entry({ kind: "ws", state: "pending" }))).toBe("open");
  });
});
