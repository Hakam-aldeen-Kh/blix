/**
 * Network monitor — TanStack Query cache capture.
 *
 * Structurally typed against the cache-event shape, exactly like
 * `realtimeCapture.ts` restates the realtime adapter contract: this module
 * never imports `@tanstack/react-query`, so the capture layer — which the
 * host's HTTP-client module also depends on — stays free of a dependency on
 * the host's data-fetching library. That is what lets `@tanstack/react-query`
 * be an optional peer rather than a hard one.
 *
 * One entry per `queryHash` (or `mutationId`), accumulating lifecycle frames —
 * the same "one long-lived row" model `realtimeCapture.ts` uses for a socket
 * connection. Under an aggressive `gcTime` a query is added to and removed
 * from the cache repeatedly; hashing by key means the *same row* accumulates
 * that whole session's history instead of flickering in and out of the log —
 * and turns that churn into the panel's most useful signal: a row can show
 * "fetched 7 times this session, 5 of them cache misses".
 *
 * The Query section is backed entirely by this module's own capture, never by
 * a live read of `queryCache.getAll()` — under `gcTime: 0` that read is empty
 * almost all the time, which is the whole reason this capture exists.
 */

import {
  MAX_QUERY_DATA_BYTES,
  MONITOR_ENABLED,
  now,
} from "./monitorConfig";
import { openOwnerWindow } from "./monitorContext";
import { describeError, isCapturedError } from "./monitorError";
import { networkMonitor } from "./networkMonitor";
import { truncateForPersist } from "./monitorTruncate";
import type { MonitorEntry, QueryMeta, WsFrame } from "./monitorTypes";

/** Structural subset of a TanStack Query `Query` this tap needs. */
export interface QueryStateLike {
  status: string;
  fetchStatus?: string;
  data?: unknown;
  error?: unknown;
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
  fetchFailureCount?: number;
  isInvalidated?: boolean;
}
export interface QueryLike {
  queryHash: string;
  queryKey: readonly unknown[];
  state: QueryStateLike;
  getObserversCount?(): number;
}
export interface MutationStateLike {
  status: string;
  variables?: unknown;
  data?: unknown;
  error?: unknown;
}
export interface MutationLike {
  mutationId: number;
  state: MutationStateLike;
}
export interface CacheEventLike {
  type: string;
  query?: QueryLike;
  mutation?: MutationLike;
  action?: { type: string };
}
export interface CacheLike {
  subscribe(listener: (event: CacheEventLike) => void): () => void;
  getAll(): unknown[];
}
/** A TanStack `QueryFilters`-shaped filter — structurally typed, same as
 * everything else in this module, so this file still never imports
 * `@tanstack/react-query`. */
export interface QueryFilterLike {
  queryKey?: readonly unknown[];
  exact?: boolean;
}
export interface QueryClientLike {
  getQueryCache(): CacheLike;
  getMutationCache(): CacheLike;
  invalidateQueries(filters?: QueryFilterLike): Promise<void>;
  refetchQueries(filters?: QueryFilterLike): Promise<void>;
  removeQueries(filters?: QueryFilterLike): void;
  resetQueries(filters?: QueryFilterLike): Promise<void>;
}

const tapped = new WeakSet<object>();
let activeClient: QueryClientLike | null = null;

/** Module handle so panel actions (invalidate/refetch/remove) need neither a
 * React context nor an `@tanstack/react-query` import anywhere in this
 * package. */
export function getTappedQueryClient(): QueryClientLike | null {
  return activeClient;
}

/** queryHash / String(mutationId) -> the one row that accumulates that key's
 * whole session history. */
const queryEntryIds = new Map<string, string>();
const mutationEntryIds = new Map<number, string>();
const fetchCounts = new Map<string, number>();

let frameCounter = 0;
function frame(direction: WsFrame["direction"], event: string): WsFrame {
  frameCounter += 1;
  return { id: `qf${frameCounter}`, at: Date.now(), direction, event, data: undefined, sizeBytes: 0 };
}

/** Clock slack between `Date.now()` (frames) and `timeOrigin + performance.now()`
 * (entries), when deciding whether a request started inside a fetch. */
const CLOCK_SLACK_MS = 100;

/** What an HTTP entry's server said, when it is the answer to a failure with
 * `status`: the body of a failed request, or — for a failure the app raised
 * itself on a 2xx, an envelope saying `succeeded: false` — the body of a
 * successful one. */
function answerOf(entry: MonitorEntry | undefined, status: number | undefined): unknown {
  if (entry === undefined || (entry.kind ?? "http") !== "http") return undefined;
  if (status !== undefined && entry.status !== status) return undefined;
  if (isCapturedError(entry.error)) return entry.error.response;
  const succeeded = status !== undefined && status >= 200 && status < 300;
  return succeeded && entry.state === "success" ? entry.responsePayload : undefined;
}

/** Which failure each request's answer was lent to, so that two that failed
 * alike at once each get their own — while the same failure, described again
 * on every later cache event, keeps the one it got. Bounded: only recent
 * ones matter. */
const lent = new Map<string, string>();
const MAX_LENT = 500;

function lend(requestId: string, ownerId: string): void {
  lent.set(requestId, ownerId);
  if (lent.size > MAX_LENT) lent.delete(lent.keys().next().value as string);
}

/**
 * The HTTP request a failed query or mutation most likely failed on.
 *
 * The requests it is known to have caused come first. That link is often
 * missing — a mutation runs its `mutationFn` after awaiting `onMutate`, when
 * the ownership window has long closed — so after that, the earliest request
 * with the same status since this fetch began that no other failure has
 * claimed. Earliest, because of several that fail together, the first to fail
 * is the first whose caller hears of it. A guess, which is why the entry it
 * came from is recorded next to the body it lent.
 */
function failedRequestFor(
  ownerId: string,
  status: number | undefined,
): { entry: MonitorEntry; body: unknown } | undefined {
  const owner = networkMonitor.getById(ownerId);
  if (!owner) return undefined;

  const caused = owner.query?.causedIds ?? [];
  for (let i = caused.length - 1; i >= 0; i -= 1) {
    const entry = networkMonitor.getById(caused[i]);
    const body = answerOf(entry, status);
    if (entry && body !== undefined) return { entry, body };
  }

  if (status === undefined) return undefined;
  let since = owner.startAbs;
  for (const f of owner.frames ?? []) {
    if (f.direction === "out" && f.event === "fetch" && f.at > since) since = f.at;
  }
  since -= CLOCK_SLACK_MS;

  let best: { entry: MonitorEntry; body: unknown } | undefined;
  for (const entry of networkMonitor.getSnapshot()) {
    const holder = lent.get(entry.id);
    if (entry.startAbs < since || (holder !== undefined && holder !== ownerId)) continue;
    const body = answerOf(entry, status);
    if (body === undefined) continue;
    if (!best || (entry.endAbs ?? Infinity) < (best.entry.endAbs ?? Infinity)) best = { entry, body };
  }
  return best;
}

/**
 * A failed query's or mutation's error, with the server's answer beside it.
 *
 * What the cache holds is whatever the app threw, and an app that turns an
 * axios failure into its own error routinely keeps a message and a status of
 * a response that said much more. The HTTP entry still has the whole body:
 * it is lent here, as it came back, whatever its shape.
 */
function describeFailure(error: unknown, ownerId: string): unknown {
  const described = describeError(error, MAX_QUERY_DATA_BYTES);
  if (!isCapturedError(described) || described.response !== undefined) return described;
  const source = failedRequestFor(ownerId, described.status);
  if (!source) return described;
  lend(source.entry.id, ownerId);
  const wire = isCapturedError(source.entry.error) ? source.entry.error : undefined;
  // The body goes where `captureError` puts one — ahead of the details, the
  // cause and the stack — so it is what the panel shows first.
  const { details, cause, stack, handledAs, ...head } = described;
  return {
    ...head,
    ...(described.kind === "unknown" && wire ? { kind: wire.kind } : {}),
    ...(described.status === undefined && wire?.status !== undefined ? { status: wire.status } : {}),
    ...(described.statusText === undefined && wire?.statusText
      ? { statusText: wire.statusText }
      : {}),
    response: source.body,
    responseFrom: source.entry.id,
    ...(details !== undefined ? { details } : {}),
    ...(cause !== undefined ? { cause } : {}),
    ...(stack !== undefined ? { stack } : {}),
    ...(handledAs !== undefined ? { handledAs } : {}),
  };
}

function keyLabel(key: readonly unknown[]): string {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

function toEntryState(status: string): "pending" | "success" | "error" {
  if (status === "error") return "error";
  if (status === "success") return "success";
  return "pending";
}

function toQueryMeta(q: QueryLike): QueryMeta {
  return {
    sub: "query",
    hash: q.queryHash,
    key: [...q.queryKey],
    status: toEntryState(q.state.status),
    fetchStatus: q.state.fetchStatus as QueryMeta["fetchStatus"] | undefined,
    observers: q.getObserversCount?.() ?? 0,
    isInvalidated: q.state.isInvalidated,
    dataUpdatedAt: q.state.dataUpdatedAt,
    errorUpdatedAt: q.state.errorUpdatedAt,
    failureCount: q.state.fetchFailureCount,
    fetchCount: fetchCounts.get(q.queryHash) ?? 0,
  };
}

function handleQueryEvent(event: CacheEventLike): void {
  const q = event.query;
  if (!q) return;

  // The noisiest events in the library — fired per observer per render —
  // carry no cache information this panel doesn't already have.
  if (event.type === "observerResultsUpdated" || event.type === "observerOptionsUpdated") {
    return;
  }

  if (event.type === "observerAdded" || event.type === "observerRemoved") {
    const id = queryEntryIds.get(q.queryHash);
    if (id && networkMonitor.getById(id)) {
      networkMonitor.update(id, { query: toQueryMeta(q) });
    }
    return;
  }

  if (event.type === "removed") {
    const id = queryEntryIds.get(q.queryHash);
    if (id && networkMonitor.getById(id)) {
      // This is the moment `gcTime: 0` actually happens — recording it,
      // rather than deleting the row, is what makes that setting visible.
      networkMonitor.appendFrame(id, frame("system", "removed"));
      networkMonitor.update(id, { query: { ...toQueryMeta(q), gcRemoved: true } });
    }
    return;
  }

  if (event.type !== "added" && event.type !== "updated") return;

  const existingId = queryEntryIds.get(q.queryHash);
  const isNew = !existingId || !networkMonitor.getById(existingId);
  const id = isNew ? networkMonitor.nextId() : (existingId as string);

  if (isNew) {
    queryEntryIds.set(q.queryHash, id);
    networkMonitor.start({
      id,
      kind: "query",
      method: "QUERY",
      url: keyLabel(q.queryKey),
      at: Date.now(),
      startTime: now(),
      state: toEntryState(q.state.status),
      sizeBytes: 0,
      frames: [],
      requestPayload: { key: [...q.queryKey] },
      query: toQueryMeta(q),
    });
  }

  const actionType = event.action?.type;
  switch (actionType) {
    case "fetch":
      fetchCounts.set(q.queryHash, (fetchCounts.get(q.queryHash) ?? 0) + 1);
      networkMonitor.appendFrame(id, frame("out", "fetch"));
      // Opened *after* the frame is recorded but still synchronously within
      // this dispatch — the queryFn TanStack is about to call runs in the
      // same task, which is what makes the correlation work at all.
      openOwnerWindow({ id, kind: "query", label: keyLabel(q.queryKey) });
      networkMonitor.update(id, { state: "pending", query: toQueryMeta(q) });
      break;
    case "success":
      networkMonitor.appendFrame(id, frame("in", "success"));
      networkMonitor.update(id, {
        state: "success",
        endTime: now(),
        responsePayload: truncateForPersist(q.state.data, MAX_QUERY_DATA_BYTES).value,
        query: toQueryMeta(q),
      });
      break;
    case "error":
    case "failed":
      networkMonitor.appendFrame(id, frame("in", "error"));
      networkMonitor.update(id, {
        state: "error",
        endTime: now(),
        // Described, never copied: a queryFn that uses axios rejects with an
        // error whose enumerable `config` holds the request's headers.
        error: describeFailure(q.state.error, id),
        query: toQueryMeta(q),
      });
      break;
    case "invalidate":
      networkMonitor.appendFrame(id, frame("system", "invalidate"));
      networkMonitor.update(id, { query: toQueryMeta(q) });
      break;
    default:
      // "setState", or "added"/"updated" with no action — just resync the
      // meta. Skipped on a brand-new row: `start()` above already carries it.
      if (!isNew) networkMonitor.update(id, { query: toQueryMeta(q) });
  }
}

function handleMutationEvent(event: CacheEventLike): void {
  const m = event.mutation;
  if (!m) return;
  if (event.type === "observerResultsUpdated" || event.type === "observerOptionsUpdated") return;

  const existingId = mutationEntryIds.get(m.mutationId);
  const isNew = !existingId;
  const id = isNew ? networkMonitor.nextId() : (existingId as string);

  if (isNew) {
    mutationEntryIds.set(m.mutationId, id);
    networkMonitor.start({
      id,
      kind: "query",
      method: "MUTATE",
      url: "mutation",
      at: Date.now(),
      startTime: now(),
      state: toEntryState(m.state.status),
      sizeBytes: 0,
      requestPayload: truncateForPersist(m.state.variables, MAX_QUERY_DATA_BYTES).value,
      query: {
        sub: "mutation",
        hash: String(m.mutationId),
        key: [],
        status: toEntryState(m.state.status),
        observers: 0,
      },
    });
    if (m.state.status === "pending") {
      openOwnerWindow({ id, kind: "mutation", label: `mutation #${m.mutationId}` });
    }
    return;
  }

  // A mutation is added to the cache before it runs, with no variables yet:
  // they arrive with `pending`, and the row would otherwise never show them.
  const prev = networkMonitor.getById(id);
  if (m.state.variables !== undefined && prev?.requestPayload === undefined) {
    networkMonitor.update(id, {
      requestPayload: truncateForPersist(m.state.variables, MAX_QUERY_DATA_BYTES).value,
    });
  }

  if (m.state.status === "success") {
    networkMonitor.update(id, {
      state: "success",
      endTime: now(),
      responsePayload: truncateForPersist(m.state.data, MAX_QUERY_DATA_BYTES).value,
      query: { sub: "mutation", hash: String(m.mutationId), key: [], status: "success", observers: 0 },
    });
  } else if (m.state.status === "error") {
    networkMonitor.update(id, {
      state: "error",
      endTime: now(),
      error: describeFailure(m.state.error, id),
      query: { sub: "mutation", hash: String(m.mutationId), key: [], status: "error", observers: 0 },
    });
  }
}

/**
 * Installs the tap on a `QueryClient`. Idempotent, and safe to call from a
 * React effect in your query provider rather than the `useState` initializer
 * that creates the client — React Strict Mode double-invokes initializers, and
 * tapping there would tap a client that gets discarded.
 *
 * Because parent effects run *after* child effects, a child's `useQuery` has
 * already fired by the time this installs — so it backfills from
 * `getQueryCache().getAll()` first, rather than starting blind.
 */
export function tapQueryClient(client: QueryClientLike): () => void {
  if (!MONITOR_ENABLED) return () => {};
  if (tapped.has(client)) return () => {};
  tapped.add(client);
  activeClient = client;

  try {
    for (const q of client.getQueryCache().getAll() as QueryLike[]) {
      handleQueryEvent({ type: "added", query: q });
    }
  } catch {
    /* backfill is best-effort */
  }

  const unsubQuery = client.getQueryCache().subscribe((event) => {
    try {
      handleQueryEvent(event);
    } catch {
      /* capture must never break the app */
    }
  });
  const unsubMutation = client.getMutationCache().subscribe((event) => {
    try {
      handleMutationEvent(event);
    } catch {
      /* capture must never break the app */
    }
  });

  return () => {
    unsubQuery();
    unsubMutation();
    // Unmark the client, or the idempotency guard above turns a
    // dispose-then-reinstall — which is exactly what Strict Mode does to an
    // effect that returns this disposer — into a silent permanent no-op.
    tapped.delete(client);
    if (activeClient === client) activeClient = null;
  };
}
