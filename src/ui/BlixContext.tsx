import { createContext } from "react";

/** Structural redux-store shape — only the subset the panel actually uses.
 * Mirrors `MiddlewareApiLike` in `reduxCapture.ts` but adds `subscribe` and
 * `dispatch` so the State tab and Re-dispatch action can work. */
export interface StoreLike<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
  dispatch(action: unknown): unknown;
}

/** Structural axios-instance shape — only `request` is needed for replay. */
export interface HttpClientLike {
  request(config: {
    url?: string;
    method?: string;
    baseURL?: string;
    headers?: Record<string, unknown>;
    data?: unknown;
    [key: string]: unknown;
  }): Promise<unknown>;
}

export interface BlixContextValue {
  store?: StoreLike<unknown>;
  apiClient?: HttpClientLike;
}

export const BlixContext = createContext<BlixContextValue>({});
