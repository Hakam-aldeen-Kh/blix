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
import { ownCallsOf, type CaptureOwner } from "./monitorContext";
import { requestOfError } from "./errorOrigin";
import { captureError, describeError, isCapturedError } from "./monitorError";
import { estimateBytes, networkMonitor } from "./networkMonitor";
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
  /** Holds the `queryFn` Blix wraps — see `ownCallsOf`. */
  options?: unknown;
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
  /** Holds the `mutationFn` Blix wraps — see `ownCallsOf`. */
  options?: unknown;
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

/**
 * One client's bookkeeping, kept per client and never shared: two clients — or
 * a new one after HMR, whose caches count mutation ids from 1 again — use the
 * same query hashes and `mutationId`s for different things, and shared maps
 * merged them into one row. Kept by client, not by tap, so a dispose and
 * reinstall of the same client (Strict Mode) finds its rows again.
 */
interface TapState {
  /** queryHash -> the one row that accumulates that key's whole history. */
  queryIds: Map<string, string>;
  /** mutationId -> its row. */
  mutationIds: Map<number, string>;
  /** The last status each mutation was recorded at — see `handleMutationEvent`. */
  mutationStatus: Map<number, string>;
  fetchCounts: Map<string, number>;
}

const tapStates = new WeakMap<object, TapState>();

function stateOf(client: object): TapState {
  let state = tapStates.get(client);
  if (!state) {
    state = { queryIds: new Map(), mutationIds: new Map(), mutationStatus: new Map(), fetchCounts: new Map() };
    tapStates.set(client, state);
  }
  return state;
}

let frameCounter = 0;
function frame(direction: WsFrame["direction"], event: string): WsFrame {
  frameCounter += 1;
  return { id: `qf${frameCounter}`, at: Date.now(), direction, event, data: undefined, sizeBytes: 0 };
}

/** What an HTTP entry's server said, when it is the answer to a failure with
 * `status`: the body of a failed request, or — for a failure the app raised
 * itself on a 2xx, an envelope saying `succeeded: false` — the body of a
 * successful one. */
function answerOf(entry: MonitorEntry, status: number | undefined): unknown {
  if (isCapturedError(entry.error)) return entry.error.response;
  const succeeded = status !== undefined && status >= 200 && status < 300;
  return succeeded && entry.state === "success" ? entry.responsePayload : undefined;
}

/** Whether `entry` can be the request a failure with `status` failed on. A
 * request still reading its body already has its status. */
function couldAnswer(entry: MonitorEntry | undefined, status: number | undefined): entry is MonitorEntry {
  if (entry === undefined || (entry.kind ?? "http") !== "http") return false;
  if (status !== undefined) return entry.status === status;
  // No status to go by: only a request that failed is a failure's answer.
  return entry.state === "pending" || isCapturedError(entry.error);
}

/** The requests each query or mutation had caused before its current fetch
 * (or `mutate`) began — so the ones that attempt caused are known exactly,
 * with no clock involved. */
const causedBefore = new Map<string, Set<string>>();

function beginAttempt(id: string): void {
  causedBefore.set(id, new Set(networkMonitor.getById(id)?.query?.causedIds ?? []));
}

/**
 * The HTTP request a failed query or mutation failed on — only ever when that
 * is known, never inferred:
 *
 * - **`"exact"`** — the error is an object Blix saw come out of a request, or
 *   carries one as its `response` or `cause`: the app's replacement for an
 *   axios error, a `fetch` `Response` (`errorOrigin.ts`).
 * - **`"caused"`** — this attempt caused exactly one request that answered
 *   with the error's status. Retries count as one when they ran one after
 *   another: the error is the last one's.
 *
 * Anything else gets no request. Matching by status and time across the whole
 * log was tried, and with `fetch` it was wrong every time it found anything:
 * the app throws on `!r.ok` before Blix has read the body, so the request
 * really failed on was still pending, and an older failure with the same
 * status was taken instead.
 */
function sourceOf(
  error: unknown,
  ownerId: string,
  status: number | undefined,
): { entry: MonitorEntry; match: "exact" | "caused" } | undefined {
  const exactId = requestOfError(error);
  const exact = exactId ? networkMonitor.getById(exactId) : undefined;
  if (exact && (exact.kind ?? "http") === "http") return { entry: exact, match: "exact" };

  const owner = networkMonitor.getById(ownerId);
  const before = causedBefore.get(ownerId);
  if (!owner || !before) return undefined;
  const candidates: MonitorEntry[] = [];
  for (const id of owner.query?.causedIds ?? []) {
    if (before.has(id)) continue;
    const entry = networkMonitor.getById(id);
    if (couldAnswer(entry, status)) candidates.push(entry);
  }
  if (candidates.length === 0) return undefined;
  // Several are one only as a chain of retries: each started after the one
  // before it had ended. Overlapping ones could be any of them.
  for (let i = 1; i < candidates.length; i += 1) {
    const prevEnd = candidates[i - 1].endAbs;
    if (prevEnd === undefined || candidates[i].startAbs < prevEnd) return undefined;
  }
  return { entry: candidates[candidates.length - 1], match: "caused" };
}

/** Failures whose request was still reading its body when they were
 * described, by owner row: described again once it has. */
const awaitingBody = new Map<string, { requestId: string; error: unknown; since: number }>();
/** How long a failure waits for its request's body. */
const BODY_WAIT_MS = 30_000;
let unsubscribeAwaiting: (() => void) | null = null;

function checkAwaiting(): void {
  for (const [ownerId, wait] of [...awaitingBody]) {
    const request = networkMonitor.getById(wait.requestId);
    if (request?.state === "pending" && Date.now() - wait.since < BODY_WAIT_MS) continue;
    awaitingBody.delete(ownerId);
    if (!request || request.state === "pending") continue;
    const owner = networkMonitor.getById(ownerId);
    // Only the failure it was waiting for: a refetch since has its own.
    if (owner?.state !== "error" || !isCapturedError(owner.error)) continue;
    if (owner.error.responseFrom !== wait.requestId || owner.error.response !== undefined) continue;
    networkMonitor.update(ownerId, { error: describeFailure(wait.error, ownerId) });
  }
  if (awaitingBody.size === 0 && unsubscribeAwaiting) {
    unsubscribeAwaiting();
    unsubscribeAwaiting = null;
  }
}

function awaitBody(ownerId: string, requestId: string, error: unknown): void {
  awaitingBody.set(ownerId, { requestId, error, since: Date.now() });
  if (!unsubscribeAwaiting) unsubscribeAwaiting = networkMonitor.subscribe(checkAwaiting);
}

/**
 * A failed query's or mutation's error, with the server's answer beside it.
 *
 * What the cache holds is whatever the app threw, and an app that turns an
 * axios failure into its own error routinely keeps a message and a status of
 * a response that said much more. The HTTP entry still has the whole body:
 * it is lent here, as it came back, whatever its shape — from the request
 * `sourceOf` knows it failed on, and from no other.
 */
function describeFailure(error: unknown, ownerId: string): unknown {
  let described = describeError(error, MAX_QUERY_DATA_BYTES);
  if (!isCapturedError(described)) {
    // Not an error at all, yet linked to a request: a `fetch` `Response`
    // thrown as it is (`if (!r.ok) throw r`). It is described as the failure
    // of that request rather than stored as an opaque object.
    const linked = requestOfError(error);
    const entry = linked ? networkMonitor.getById(linked) : undefined;
    if (!entry || (entry.kind ?? "http") !== "http") return described;
    const wire = isCapturedError(entry.error) ? entry.error : undefined;
    described = captureError(error, {
      kind: wire?.kind ?? "http",
      status: entry.status,
      statusText: wire?.statusText,
    });
  }
  if (!isCapturedError(described) || described.response !== undefined) return described;

  const source = sourceOf(error, ownerId, described.status);
  if (!source) return described;
  const { entry, match } = source;
  if (entry.state === "pending") awaitBody(ownerId, entry.id, error);
  const body = entry.state === "pending" ? undefined : answerOf(entry, described.status);

  const wire = isCapturedError(entry.error) ? entry.error : undefined;
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
    ...(body !== undefined ? { response: body } : {}),
    responseFrom: entry.id,
    responseMatch: match,
    ...(details !== undefined ? { details } : {}),
    ...(cause !== undefined ? { cause } : {}),
    ...(stack !== undefined ? { stack } : {}),
    ...(handledAs !== undefined ? { handledAs } : {}),
  };
}

/** A settled row's data, and the size the list's Size column shows for it. */
function withSize(data: unknown): { responsePayload: unknown; sizeBytes: number } {
  return { responsePayload: data, sizeBytes: estimateBytes(data) };
}

const queryOwner = (id: string, q: QueryLike): CaptureOwner => ({
  id,
  kind: "query",
  label: keyLabel(q.queryKey),
});

const mutationOwner = (id: string, m: MutationLike): CaptureOwner => ({
  id,
  kind: "mutation",
  label: `mutation #${m.mutationId}`,
});

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

function toQueryMeta(q: QueryLike, t: TapState): QueryMeta {
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
    fetchCount: t.fetchCounts.get(q.queryHash) ?? 0,
  };
}

function handleQueryEvent(event: CacheEventLike, t: TapState): void {
  const q = event.query;
  if (!q) return;

  // The noisiest events in the library — fired per observer per render —
  // carry no cache information this panel doesn't already have.
  if (event.type === "observerResultsUpdated" || event.type === "observerOptionsUpdated") {
    return;
  }

  if (event.type === "observerAdded" || event.type === "observerRemoved") {
    const id = t.queryIds.get(q.queryHash);
    if (id && networkMonitor.getById(id)) {
      networkMonitor.update(id, { query: toQueryMeta(q, t) });
    }
    return;
  }

  if (event.type === "removed") {
    const id = t.queryIds.get(q.queryHash);
    if (id && networkMonitor.getById(id)) {
      // This is the moment `gcTime: 0` actually happens — recording it,
      // rather than deleting the row, is what makes that setting visible.
      networkMonitor.appendFrame(id, frame("system", "removed"));
      networkMonitor.update(id, { query: { ...toQueryMeta(q, t), gcRemoved: true } });
    }
    return;
  }

  if (event.type !== "added" && event.type !== "updated") return;

  const existingId = t.queryIds.get(q.queryHash);
  const isNew = !existingId || !networkMonitor.getById(existingId);
  const id = isNew ? networkMonitor.nextId() : (existingId as string);

  if (isNew) {
    t.queryIds.set(q.queryHash, id);
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
      query: toQueryMeta(q, t),
    });
  }

  // Before TanStack calls `queryFn`: it reads it after this `fetch` dispatch,
  // and again for each retry.
  ownCallsOf(q, "queryFn", queryOwner(id, q));

  const actionType = event.action?.type;
  switch (actionType) {
    case "fetch":
      t.fetchCounts.set(q.queryHash, (t.fetchCounts.get(q.queryHash) ?? 0) + 1);
      networkMonitor.appendFrame(id, frame("out", "fetch"));
      beginAttempt(id);
      // The row lives for the whole session, so its clock restarts with each
      // fetch: the duration it shows is this fetch's, not the time since the
      // key was first seen. `startAbs` — what the list sorts by — is untouched.
      networkMonitor.update(id, { state: "pending", startTime: now(), query: toQueryMeta(q, t) });
      break;
    case "success":
      networkMonitor.appendFrame(id, frame("in", "success"));
      networkMonitor.update(id, {
        state: "success",
        endTime: now(),
        ...withSize(truncateForPersist(q.state.data, MAX_QUERY_DATA_BYTES).value),
        query: toQueryMeta(q, t),
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
        query: toQueryMeta(q, t),
      });
      break;
    case "invalidate":
      networkMonitor.appendFrame(id, frame("system", "invalidate"));
      networkMonitor.update(id, { query: toQueryMeta(q, t) });
      break;
    default:
      // "setState", or "added"/"updated" with no action — just resync the
      // meta. Skipped on a brand-new row: `start()` above already carries it.
      if (!isNew) networkMonitor.update(id, { query: toQueryMeta(q, t) });
  }
}

function handleMutationEvent(event: CacheEventLike, t: TapState): void {
  const m = event.mutation;
  if (!m) return;
  if (event.type === "observerResultsUpdated" || event.type === "observerOptionsUpdated") return;

  const existingId = t.mutationIds.get(m.mutationId);
  // Missing from the log too — cleared, or never started while capture was
  // paused — and the next event starts the row again, as for a query.
  const isNew = !existingId || !networkMonitor.getById(existingId);
  const id = isNew ? networkMonitor.nextId() : (existingId as string);

  if (isNew) {
    t.mutationIds.set(m.mutationId, id);
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
    // Hooked at once: `mutationFn` runs after `onMutate` has been awaited.
    ownCallsOf(m, "mutationFn", mutationOwner(id, m));
    // A row started late — after a clear, or a pause — is past `idle`: the
    // status it is at is recorded below like any change, error and all.
    t.mutationStatus.delete(m.mutationId);
  }

  // A mutation is added to the cache before it runs, with no variables yet:
  // they arrive with `pending`, and the row would otherwise never show them.
  const prev = networkMonitor.getById(id);
  if (m.state.variables !== undefined && prev?.requestPayload === undefined) {
    networkMonitor.update(id, {
      requestPayload: truncateForPersist(m.state.variables, MAX_QUERY_DATA_BYTES).value,
    });
  }

  // Only a change of status is news. The cache keeps emitting for a settled
  // mutation — an observer going, garbage collection — and settling it again
  // on each moved its end time, so its duration grew for as long as it stayed
  // in the cache.
  const status = m.state.status;
  if (t.mutationStatus.get(m.mutationId) === status) return;
  t.mutationStatus.set(m.mutationId, status);
  const meta = (s: "pending" | "success" | "error"): QueryMeta => ({
    sub: "mutation",
    hash: String(m.mutationId),
    key: [],
    status: s,
    observers: 0,
  });

  if (status === "pending") {
    networkMonitor.appendFrame(id, frame("out", "mutate"));
    beginAttempt(id);
    networkMonitor.update(id, { state: "pending", startTime: now(), query: meta("pending") });
  } else if (status === "success") {
    networkMonitor.appendFrame(id, frame("in", "success"));
    networkMonitor.update(id, {
      state: "success",
      endTime: now(),
      ...withSize(truncateForPersist(m.state.data, MAX_QUERY_DATA_BYTES).value),
      query: meta("success"),
    });
  } else if (status === "error") {
    networkMonitor.appendFrame(id, frame("in", "error"));
    networkMonitor.update(id, {
      state: "error",
      endTime: now(),
      error: describeFailure(m.state.error, id),
      query: meta("error"),
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
  const state = stateOf(client);

  try {
    for (const q of client.getQueryCache().getAll() as QueryLike[]) {
      handleQueryEvent({ type: "added", query: q }, state);
    }
  } catch {
    /* backfill is best-effort */
  }

  const unsubQuery = client.getQueryCache().subscribe((event) => {
    try {
      handleQueryEvent(event, state);
    } catch {
      /* capture must never break the app */
    }
  });
  const unsubMutation = client.getMutationCache().subscribe((event) => {
    try {
      handleMutationEvent(event, state);
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
