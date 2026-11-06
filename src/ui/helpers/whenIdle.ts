/**
 * Dev Tools — panel updates that wait for the host to finish rendering.
 *
 * The panel renders inside the host's React root, and React has one
 * work-in-progress render for the whole page: any update to the panel, at any
 * priority, interrupts a lower-priority render the host has under way and
 * throws its progress away. That is normally a small cost. It became a hang
 * when the update was caused by the host's render itself: `useQuery` builds
 * its query during render, the QueryCache reports it, the capture records it,
 * and the panel re-rendered — discarding the host's render, whose restart
 * built the query again (under `gcTime: 0` it had already been collected).
 * The host's low-priority work (hydrating a Next.js page beside a hidden
 * `<Activity>`) never completed, and the page's first fetch waited for a click.
 *
 * An idle callback is the browser's own answer to "is anything else waiting?":
 * React's time-sliced render keeps a task queued until it commits, so a panel
 * update scheduled here lands after the host's render, never in the middle of
 * it. No `timeout`, on purpose — a deadline would put the interruption back
 * for any host render longer than it, which is exactly the case this exists
 * for. The panel is a little late while the page is busy, which is the right
 * way round for a devtool.
 */

type Cancel = () => void;

/** Runs `fn` once the main thread is idle. Returns a canceller. */
export function whenIdle(fn: () => void): Cancel {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(() => fn());
    return () => cancelIdleCallback(handle);
  }
  // Without idle callbacks (jsdom, older Safari) a macrotask is the closest
  // thing: it at least never runs inside the render that caused it.
  const timer = setTimeout(fn, 0);
  return () => clearTimeout(timer);
}

/**
 * Wraps a `useSyncExternalStore` subscribe function so its listener is called
 * once the main thread is idle — once per burst, however many changes the
 * burst held. `getSnapshot` is untouched: a render that happens for any other
 * reason still reads the store as it is.
 */
export function subscribeWhenIdle(
  subscribe: (listener: () => void) => () => void,
): (listener: () => void) => () => void {
  return (listener) => {
    let pending: Cancel | null = null;
    const unsubscribe = subscribe(() => {
      if (pending) return;
      pending = whenIdle(() => {
        pending = null;
        listener();
      });
    });
    return () => {
      unsubscribe();
      pending?.();
      pending = null;
    };
  };
}
