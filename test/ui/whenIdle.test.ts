import { afterEach, describe, expect, test, vi } from "vitest";
import { prefsStore, savePrefs, type PrefsChange } from "../../src/capture/monitorPersistence";
import { subscribeWhenIdle, whenIdle } from "../../src/ui/helpers/whenIdle";

/** A store whose changes say what caused them, like `prefsStore`. */
function changeStore() {
  const listeners = new Set<(change: PrefsChange) => void>();
  return {
    subscribe: (listener: (change: PrefsChange) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (change: PrefsChange) => listeners.forEach((listener) => listener(change)),
  };
}

/** A tiny store: `emit()` calls every listener synchronously. */
function store() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: () => listeners.forEach((listener) => listener()),
    get size() {
      return listeners.size;
    },
  };
}

/** Stands in for the browser's idle queue, run by hand. */
function fakeIdle() {
  const queue = new Map<number, () => void>();
  let next = 0;
  vi.stubGlobal("requestIdleCallback", (fn: () => void) => {
    queue.set(++next, fn);
    return next;
  });
  vi.stubGlobal("cancelIdleCallback", (handle: number) => queue.delete(handle));
  return {
    get pending() {
      return queue.size;
    },
    runIdle: () => {
      const due = [...queue.values()];
      queue.clear();
      due.forEach((fn) => fn());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("panel updates wait for an idle main thread", () => {
  test("a change reaches the panel only when the browser is idle, never inside the emit", async () => {
    const idle = fakeIdle();
    const s = store();
    const listener = vi.fn();
    subscribeWhenIdle(s.subscribe)(listener);

    s.emit();
    // Not in the emit (the host's render), and not a microtask later either:
    // a microtask still runs between two slices of that render.
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();

    idle.runIdle();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("a burst of changes is one panel update", () => {
    const idle = fakeIdle();
    const s = store();
    const listener = vi.fn();
    subscribeWhenIdle(s.subscribe)(listener);

    for (let i = 0; i < 20; i += 1) s.emit();
    expect(idle.pending).toBe(1);
    idle.runIdle();
    expect(listener).toHaveBeenCalledTimes(1);

    // And the next change after it is delivered again.
    s.emit();
    idle.runIdle();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("unsubscribing drops the waiting update and the store subscription", () => {
    const idle = fakeIdle();
    const s = store();
    const listener = vi.fn();
    const unsubscribe = subscribeWhenIdle(s.subscribe)(listener);

    s.emit();
    unsubscribe();
    expect(idle.pending).toBe(0);
    expect(s.size).toBe(0);
    idle.runIdle();
    expect(listener).not.toHaveBeenCalled();
  });

  // Restoring the saved log reported "loading" and "ready" straight to the
  // panel, mid-hydration, and each restarted the host's render. Background
  // changes wait; the developer's own clicks and drags must not.
  test("the developer's own change shows at once, and takes a waiting one with it", () => {
    const idle = fakeIdle();
    const s = changeStore();
    const listener = vi.fn();
    subscribeWhenIdle(s.subscribe, (change) => change === "user")(listener);

    s.emit("background");
    expect(listener).not.toHaveBeenCalled();
    expect(idle.pending).toBe(1);

    s.emit("user");
    expect(listener).toHaveBeenCalledTimes(1);
    // The snapshot it rendered already held the background change.
    expect(idle.pending).toBe(0);
    idle.runIdle();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("a background change still waits for idle when `now` is given", () => {
    const idle = fakeIdle();
    const s = changeStore();
    const listener = vi.fn();
    subscribeWhenIdle(s.subscribe, (change) => change === "user")(listener);

    s.emit("background");
    s.emit("background");
    expect(listener).not.toHaveBeenCalled();
    idle.runIdle();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("a prefs change the developer made is reported as theirs", () => {
    const seen: PrefsChange[] = [];
    const unsubscribe = prefsStore.subscribe((change) => seen.push(change));
    savePrefs({ density: "compact" });
    unsubscribe();
    expect(seen).toEqual(["user"]);
  });

  test("without requestIdleCallback it falls back to a macrotask, still outside the emit", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.useFakeTimers();
    const fn = vi.fn();
    whenIdle(fn);
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);

    const canceled = vi.fn();
    whenIdle(canceled)();
    vi.runAllTimers();
    expect(canceled).not.toHaveBeenCalled();
  });
});
