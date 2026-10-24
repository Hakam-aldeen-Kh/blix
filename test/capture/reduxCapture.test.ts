import { configureStore, createSlice } from "@reduxjs/toolkit";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, test } from "vitest";
import { networkMonitor } from "../../src/capture/networkMonitor";
import { createReduxMonitorMiddleware, type ReduxCaptureOptions } from "../../src/capture/reduxCapture";
import type { StateDiff } from "../../src/capture/monitorTypes";

const counter = createSlice({
  name: "counter",
  initialState: { n: 0, tag: "", items: [] as number[] },
  reducers: {
    tick: (s) => void (s.n += 1),
    tag: (s, a: { payload: string }) => void (s.tag = a.payload),
    push: (s, a: { payload: number }) => void s.items.push(a.payload),
    boom: () => {
      throw new Error("reducer threw");
    },
  },
});
const noise = createSlice({ name: "noise", initialState: { hits: 0 }, reducers: { hit: (s) => void (s.hits += 1) } });

function makeStore(options: ReduxCaptureOptions = {}) {
  return configureStore({
    reducer: { counter: counter.reducer, noise: noise.reducer },
    middleware: (d) =>
      d({ serializableCheck: false, immutableCheck: false }).concat(createReduxMonitorMiddleware(options) as never),
  });
}

/** Redux rows, oldest first. */
const rows = (type?: string) =>
  networkMonitor
    .getSnapshot()
    .filter((e) => e.kind === "redux" && (!type || e.url === type))
    .sort((a, b) => a.seq - b.seq);

function apply(before: unknown, diff: StateDiff): unknown {
  const out = structuredClone(before) as Record<string, unknown>;
  for (const c of diff.changes) {
    const parts = c.path.match(/[^.[\]]+/g) ?? [];
    const last = parts.pop() as string;
    const parent = parts.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, out);
    if (c.op === "remove") delete parent[last];
    else parent[last] = structuredClone(c.after);
  }
  return out;
}

beforeEach(() => networkMonitor.clear());

describe("one row per action", () => {
  test("type, slice, payload and a diff that reproduces the state", () => {
    const store = makeStore();
    const before = store.getState();
    store.dispatch(counter.actions.push(5));
    const [row] = rows();
    expect(row).toMatchObject({ method: "counter", url: "counter/push", state: "success" });
    expect(row.redux?.payload).toEqual({ payload: 5 });
    expect(row.redux?.replayable).toBe(true);
    expect(apply(before, row.redux!.diff!)).toEqual(store.getState());
    expect(row.redux?.diff?.slices).toEqual(["counter"]);
  });

  test("an action that changes nothing has no diff", () => {
    const store = makeStore();
    store.dispatch({ type: "nothing/here" });
    expect(rows()[0].redux?.diff).toBeUndefined();
  });

  test("ignored types, exact and by prefix, get no row and still reach the reducer", () => {
    const store = makeStore({ ignore: ["noise/*", "counter/tag"] });
    store.dispatch(noise.actions.hit());
    store.dispatch(counter.actions.tag("x"));
    store.dispatch(counter.actions.tick());
    expect(rows().map((r) => r.url)).toEqual(["counter/tick"]);
    expect(store.getState().noise.hits).toBe(1);
  });

  test("a thunk (no string type) passes through untouched", () => {
    const store = makeStore();
    const result = store.dispatch(((dispatch: (a: unknown) => unknown) => {
      dispatch(counter.actions.tick());
      return "thunk result";
    }) as never);
    expect(result).toBe("thunk result");
    expect(rows().map((r) => r.url)).toEqual(["counter/tick"]);
  });

  test("a reducer that throws throws to the caller", () => {
    const store = makeStore();
    expect(() => store.dispatch(counter.actions.boom())).toThrow("reducer threw");
  });
});

describe("payloads", () => {
  test("an error payload is described, never copied, and not replayable", () => {
    const store = makeStore();
    const error = new AxiosError("fail", "ERR", { headers: { Authorization: "Bearer SECRET.TOKEN" } } as never);
    store.dispatch({ type: "orders/load/rejected", payload: error, error: true });
    const [row] = rows();
    expect(JSON.stringify(row)).not.toContain("SECRET");
    expect(row.redux?.isError).toBe(true);
    expect(row.redux?.replayable).toBe(false);
    expect(row.state).toBe("error");
  });

  test("a payload cut by the size cap is not replayable", () => {
    const store = makeStore();
    store.dispatch({ type: "big/payload", payload: { blob: "x".repeat(10_000) } });
    expect(rows()[0].redux?.replayable).toBe(false);
  });
});

describe("folding", () => {
  test("identical actions fold into one row whose diff covers all of them", () => {
    const store = makeStore();
    const before = store.getState();
    for (let i = 0; i < 4; i++) store.dispatch(counter.actions.tick());
    const ticks = rows("counter/tick");
    expect(ticks).toHaveLength(1);
    expect(ticks[0].redux?.batchCount).toBe(4);
    expect(apply(before, ticks[0].redux!.diff!)).toEqual(store.getState());
  });

  test("the same type with a different payload is not folded", () => {
    const store = makeStore();
    store.dispatch(counter.actions.push(1));
    store.dispatch(counter.actions.push(2));
    expect(rows("counter/push").map((r) => r.redux?.payload)).toEqual([{ payload: 1 }, { payload: 2 }]);
  });

  test("an ignored action changing the state in between stops the fold", () => {
    const store = makeStore({ ignore: ["noise/*"] });
    store.dispatch(counter.actions.tick());
    store.dispatch(noise.actions.hit());
    store.dispatch(counter.actions.tick());
    expect(rows("counter/tick")).toHaveLength(2);
  });

  test("outside the window, no folding", () => {
    const store = makeStore({ coalesceMs: 0 });
    store.dispatch(counter.actions.tick());
    store.dispatch(counter.actions.tick());
    expect(rows("counter/tick")).toHaveLength(2);
  });
});

describe("nesting and flooding", () => {
  test("a dispatch from a subscriber does not leak into the outer action's diff", () => {
    const store = makeStore();
    let once = true;
    store.subscribe(() => {
      if (once) {
        once = false;
        store.dispatch(counter.actions.tag("inner"));
      }
    });
    store.dispatch(counter.actions.tick());
    const outer = rows("counter/tick")[0];
    expect(outer.redux?.diff?.changes.map((c) => c.path)).toEqual(["counter.n"]);
    const inner = rows("counter/tag")[0];
    expect(inner.redux?.diff?.changes.map((c) => c.path)).toEqual(["counter.tag"]);
    expect(outer.startAbs).toBeLessThanOrEqual(inner.startAbs);
  });

  test("above the rate limit, rows keep coming but diffs stop", () => {
    const store = makeStore({ maxActionsPerSecond: 3, coalesceMs: 0 });
    for (let i = 0; i < 6; i++) store.dispatch(counter.actions.push(i));
    const pushes = rows("counter/push");
    expect(pushes).toHaveLength(6);
    expect(pushes.at(-1)?.redux?.diff).toBeUndefined();
  });

  test("the dispatcher's call stack is recorded", () => {
    const store = makeStore();
    store.dispatch(counter.actions.tick());
    expect(rows()[0].initiator?.length ?? 0).toBeGreaterThan(0);
  });
});
