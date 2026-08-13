/**
 * Network monitor — synchronous "who's fetching right now" handle.
 *
 * TanStack Query dispatches its `fetch` action, and invokes `queryFn`,
 * synchronously in the same task. So when a `queryFn` calls `apiClient.post(...)`
 * without `await`ing anything first — the overwhelmingly common shape in this
 * app — the HTTP request's axios interceptor runs while this "ownership
 * window" is still open, and can attribute the request to the query/mutation
 * that caused it.
 *
 * A `queryFn` that awaits something before calling axios simply gets no
 * owner. This is a best-effort correlation, not a guarantee — the panel must
 * render a miss as "unknown", never as "not caused by a query".
 */

export interface CaptureOwner {
  id: string;
  kind: "query" | "mutation";
  label: string;
}

let owner: CaptureOwner | null = null;

/** Opens the window for the remainder of the current task; cleared on the
 * next microtask so it can never leak into an unrelated later request. */
export function openOwnerWindow(next: CaptureOwner): void {
  owner = next;
  queueMicrotask(() => {
    if (owner === next) owner = null;
  });
}

export function getOwner(): CaptureOwner | null {
  return owner;
}
