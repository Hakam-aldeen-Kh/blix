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
import { networkMonitor } from "./networkMonitor";
import { truncateForPersist } from "./monitorTruncate";
import type { QueryMeta, WsFrame } from "./monitorTypes";

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
        error: truncateForPersist(q.state.error, MAX_QUERY_DATA_BYTES).value,
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
      error: truncateForPersist(m.state.error, MAX_QUERY_DATA_BYTES).value,
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
    if (activeClient === client) activeClient = null;
  };
}
