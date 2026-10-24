import { beforeEach, describe, expect, test } from "vitest";
import { POOL_QUOTA } from "../../src/capture/monitorConfig";
import { networkMonitor } from "../../src/capture/networkMonitor";
import type { MonitorStartInput } from "../../src/capture/networkMonitor";

const start = (patch: Partial<MonitorStartInput> = {}) => {
  const id = networkMonitor.nextId();
  networkMonitor.start({ id, method: "GET", url: `/r/${id}`, at: Date.now(), startTime: 100, ...patch });
  return id;
};
const get = (id: string) => networkMonitor.getById(id)!;

beforeEach(() => {
  networkMonitor.setPaused(false);
  for (const e of networkMonitor.getSnapshot()) if (e.pinned) networkMonitor.togglePin(e.id);
  networkMonitor.clear();
});

describe("start / update", () => {
  test("a new entry is pending, newest first, with absolute times", () => {
    const a = start();
    const b = start();
    expect(networkMonitor.getSnapshot().map((e) => e.id)).toEqual([b, a]);
    expect(get(a)).toMatchObject({ state: "pending", rev: 0 });
    expect(get(a).startAbs).toBe(get(a).timeOrigin + 100);
  });

  test("an update merges, bumps rev, and the end gives a duration", () => {
    const id = start();
    networkMonitor.update(id, { status: 200, endTime: 350.4 });
    expect(get(id)).toMatchObject({ status: 200, rev: 1, durationMs: 250, endAbs: get(id).timeOrigin + 350.4 });
  });

  test("timing marks merge rather than replace", () => {
    const id = start();
    networkMonitor.update(id, { marks: { encryptMs: 1 } as never });
    networkMonitor.update(id, { marks: { decryptMs: 2 } as never });
    expect(get(id).marks).toEqual({ encryptMs: 1, decryptMs: 2 });
  });

  test("a query row keeps the requests it caused when its meta is rebuilt", () => {
    const q = start({ kind: "query", query: { sub: "query", hash: "h", key: [], status: "pending", observers: 0 } });
    const child = start();
    networkMonitor.linkChild(q, child);
    networkMonitor.update(q, { query: { sub: "query", hash: "h", key: [], status: "success", observers: 1 } });
    expect(get(q).query?.causedIds).toEqual([child]);
  });

  test("linkChild ignores a non-query owner and keeps the last 20", () => {
    const http = start();
    networkMonitor.linkChild(http, "x");
    expect(get(http).query).toBeUndefined();
    const q = start({ kind: "query", query: { sub: "query", hash: "h", key: [], status: "pending", observers: 0 } });
    for (let i = 0; i < 25; i++) networkMonitor.linkChild(q, `c${i}`);
    expect(get(q).query?.causedIds).toHaveLength(20);
    expect(get(q).query?.causedIds?.[19]).toBe("c24");
  });

  test("nothing starts while paused; unknown ids are ignored", () => {
    networkMonitor.setPaused(true);
    const id = start();
    expect(networkMonitor.getById(id)).toBeUndefined();
    networkMonitor.setPaused(false);
    expect(() => networkMonitor.update("nope", { status: 1 })).not.toThrow();
  });

  test("a replay bumps its parent's count", () => {
    const parent = start();
    start({ replayOf: parent });
    start({ replayOf: parent });
    expect(get(parent).replayCount).toBe(2);
  });
});

describe("clear / pin", () => {
  test("clear keeps pinned entries", () => {
    const keep = start();
    start();
    networkMonitor.togglePin(keep);
    networkMonitor.clear();
    expect(networkMonitor.getSnapshot().map((e) => e.id)).toEqual([keep]);
  });

  test("clear with a predicate removes only what it accepts", () => {
    const redux = start({ kind: "redux" });
    start();
    networkMonitor.clear((e) => (e.kind ?? "http") === "http");
    expect(networkMonitor.getSnapshot().map((e) => e.id)).toEqual([redux]);
  });
});

describe("eviction", () => {
  test("under the total, a pool may use the others' free room", () => {
    for (let i = 0; i < POOL_QUOTA.net + 50; i++) start();
    expect(networkMonitor.getSnapshot()).toHaveLength(POOL_QUOTA.net + 50);
  });

  test("past the total, each pool keeps its own quota; a flood never evicts another source", () => {
    const actions = Array.from({ length: 5 }, () => start({ kind: "redux" }));
    const total = POOL_QUOTA.net + POOL_QUOTA.redux + POOL_QUOTA.query;
    const requests = Array.from({ length: total + 10 }, () => start());
    const http = networkMonitor.getSnapshot().filter((e) => (e.kind ?? "http") === "http");
    // An overflow trims the pool down to its quota at once, and it refills from
    // there: a sawtooth, so trimming is not paid on every request.
    expect(http.length).toBeGreaterThanOrEqual(POOL_QUOTA.net);
    expect(http.length).toBeLessThan(total);
    expect(networkMonitor.getSnapshot().length).toBeLessThanOrEqual(total);
    // The newest ones stay.
    expect(http[0].id).toBe(requests[requests.length - 1]);
    for (const id of actions) expect(networkMonitor.getById(id)).toBeDefined();
  });

  test("pinned entries and open sockets are never evicted", () => {
    const pinned = start();
    networkMonitor.togglePin(pinned);
    const socket = start({ kind: "ws" });
    for (let i = 0; i < POOL_QUOTA.net + POOL_QUOTA.redux + POOL_QUOTA.query + 10; i++) start();
    expect(networkMonitor.getById(pinned)).toBeDefined();
    expect(networkMonitor.getById(socket)).toBeDefined();
  });
});

describe("frames", () => {
  test("frames accumulate size and are capped per connection", () => {
    const ws = start({ kind: "ws", frames: [], sizeBytes: 0 });
    for (let i = 0; i < 510; i++) {
      networkMonitor.appendFrame(ws, { id: `f${i}`, at: 0, direction: "in", event: "m", data: null, sizeBytes: 2 });
    }
    expect(get(ws).frames).toHaveLength(500);
    expect(get(ws).frames?.[0].id).toBe("f10");
    expect(get(ws).sizeBytes).toBe(1020);
  });
});

describe("subscribe", () => {
  test("a burst of changes notifies once", async () => {
    let calls = 0;
    const off = networkMonitor.subscribe(() => (calls += 1));
    start();
    start();
    start();
    await Promise.resolve();
    off();
    expect(calls).toBe(1);
  });
});
