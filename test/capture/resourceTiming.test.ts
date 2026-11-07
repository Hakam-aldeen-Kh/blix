import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { networkMonitor } from "../../src/capture/networkMonitor";
import { startResourceTiming } from "../../src/capture/resourceTiming";

/**
 * The browser's timing entries are handed to Blix by a `PerformanceObserver`.
 * jsdom has none that fires, so a stand-in captures the callback and the test
 * delivers entries to it the way the browser would.
 */
let deliver: (entries: Partial<PerformanceResourceTiming>[]) => void = () => {};
const RealObserver = globalThis.PerformanceObserver;

beforeAll(() => {
  class FakeObserver {
    constructor(callback: (list: { getEntries: () => unknown[] }) => void) {
      deliver = (entries) => callback({ getEntries: () => entries });
    }
    observe(): void {}
    disconnect(): void {}
  }
  globalThis.PerformanceObserver = FakeObserver as unknown as typeof PerformanceObserver;
  startResourceTiming();
});

afterAll(() => {
  globalThis.PerformanceObserver = RealObserver;
});

beforeEach(() => {
  networkMonitor.clear();
});

const ORIGIN = "https://api.test";

/** A request Blix captured that has already ended. */
function request(url: string, startTime: number, endTime: number): string {
  const id = networkMonitor.nextId();
  networkMonitor.start({ id, method: "GET", url, at: Date.now(), startTime });
  networkMonitor.update(id, { status: 200, endTime, responsePayload: "{}" });
  return id;
}

/** The browser's timing entry for `url`, with phases that name it. */
function timing(url: string, startTime: number, responseEnd: number, connect: number): Partial<PerformanceResourceTiming> {
  return {
    name: url,
    initiatorType: "fetch",
    startTime,
    fetchStart: startTime,
    domainLookupStart: startTime,
    domainLookupEnd: startTime,
    connectStart: startTime,
    connectEnd: startTime + connect,
    secureConnectionStart: 0,
    requestStart: startTime + connect,
    responseStart: responseEnd - 1,
    responseEnd,
    duration: responseEnd - startTime,
    transferSize: 100,
    encodedBodySize: 2,
    decodedBodySize: 2,
    nextHopProtocol: "h2",
    serverTiming: [],
  };
}

describe("resource timing → request", () => {
  test("parallel requests to one path, differing only in the query, each get their own timing", () => {
    // `fetch-parallel-same-url` in check:official: the requests end within a
    // millisecond of each other, so the end alone cannot tell them apart. The
    // neighbour ended closer to this timing entry's end than the exact one did.
    const a = request(`${ORIGIN}/x/json?k=0`, 10, 200.8);
    const b = request(`${ORIGIN}/x/json?k=1`, 10, 200.1);

    deliver([timing(`${ORIGIN}/x/json?k=0`, 10, 200, 60.8)]);
    deliver([timing(`${ORIGIN}/x/json?k=1`, 10, 200, 7)]);

    expect(networkMonitor.getById(a)!.wire?.connectMs).toBe(60.8);
    expect(networkMonitor.getById(b)!.wire?.connectMs).toBe(7);
  });

  test("with no exact URL among the candidates, a path match still links (axios `params`)", () => {
    const id = request(`${ORIGIN}/items`, 10, 120.5);
    deliver([timing(`${ORIGIN}/items?page=2`, 10, 120, 5)]);
    expect(networkMonitor.getById(id)!.wire?.connectMs).toBe(5);
  });
});
