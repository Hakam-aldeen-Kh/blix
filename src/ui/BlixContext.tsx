import { createContext } from "react";

/** Structural redux-store shape — only the subset the panel actually uses.
 * Mirrors `MiddlewareApiLike` in `reduxCapture.ts` but adds `subscribe` and
 * `dispatch` so the State tab and Re-dispatch action can work. */
export interface StoreLike<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
  dispatch(action: unknown): unknown;
}

/**
 * The config Blix hands to `request()` when replaying an entry — exactly the
 * eight fields `replayEntry` sets (`services/replayRequest.ts`), nothing more.
 *
 * Two deliberate choices here, both forced by making a genuine `AxiosInstance`
 * assignable to `HttpClientLike` without a cast:
 *
 * 1. **`headers` is `unknown`, not `Record<string, unknown>`.** Axios types
 *    headers as `AxiosHeaders | (Partial<RawAxiosHeaders & …> & …)`, which a
 *    `Record<string, unknown>` is not assignable to. Since Blix only ever
 *    *writes* this field (a flat `Record<string, string>` built from the
 *    captured request), nothing here needs to read it back, so the widest type
 *    that still accepts what Blix passes is the correct one.
 *
 * 2. **No `[key: string]: unknown` index signature.** Method parameters are
 *    compared bivariantly, so it is enough for `AxiosRequestConfig` to be
 *    assignable to *this* type — but an interface never satisfies a target
 *    index signature (TypeScript only infers implicit index signatures for
 *    object-literal types), so the index signature was what actually blocked
 *    that direction. The three non-axios fields Blix passes are therefore
 *    named explicitly instead of being swept up by the index signature.
 *
 * Declared as a `type` alias rather than an `interface` on purpose: an
 * object-literal type gets an implicit index signature, so this stays
 * assignable to a client whose own parameter is declared as
 * `Record<string, unknown>` — a shape that was valid in 0.2.1 and must remain
 * valid.
 */
export type HttpClientRequestConfig = {
  url?: string;
  method?: string;
  baseURL?: string;
  /** Written by Blix, never read — see note 1 above. */
  headers?: unknown;
  data?: unknown;
  /** Host convention: opt this request out of the encryption pipeline. */
  skipEncryption?: boolean;
  /** Host convention: mark as already-retried, so auth interceptors don't loop. */
  _retry?: boolean;
  /** Blix internal: id of the entry this replay came from. */
  __monitorReplayOf?: string;
};

/**
 * Structural axios-instance shape — `request` is the only member the panel
 * touches (`services/replayRequest.ts:90`), so it is the only one declared.
 *
 * Structural on purpose: Blix does not import from axios here and does not
 * depend on it, so any client exposing a compatible `request` works.
 */
export interface HttpClientLike {
  request(config: HttpClientRequestConfig): Promise<unknown>;
}

export interface BlixContextValue {
  store?: StoreLike<unknown>;
  apiClient?: HttpClientLike;
}

export const BlixContext = createContext<BlixContextValue>({});
