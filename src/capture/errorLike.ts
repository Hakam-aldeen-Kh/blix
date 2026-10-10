/**
 * Network monitor — telling a thrown error from data.
 *
 * Its own module, with no imports, because three places need the same answer
 * and two of them cannot import each other: `monitorError.ts` describes
 * errors and imports `monitorTruncate.ts`, which must refuse to copy one.
 *
 * **By identity, never by key names.** The first version of this test also
 * accepted any object with a `config` key or a string `stack` — the marks of
 * an `AxiosError`. They are also the marks of ordinary data: a Redux payload
 * `{ config: { theme: "dark" } }`, a query result with a `config` field, a
 * record whose `stack` is `"react,node"`. Every one of those was taken for an
 * error and stored as `{}`. What an object *is* decides; what its keys are
 * called does not.
 *
 * - `instanceof Error` — every error thrown in this realm, `AxiosError`
 *   included.
 * - `isAxiosError === true` — axios's own brand, for an error from a second
 *   copy of axios in the bundle, whose class is not this realm's.
 * - `[object Error]` — an error from another realm (an iframe, a worker's
 *   structured clone), which fails `instanceof` against this window's `Error`.
 */
export const isErrorLike = (v: unknown): v is object =>
  v instanceof Error ||
  (v !== null &&
    typeof v === "object" &&
    ((v as { isAxiosError?: unknown }).isAxiosError === true ||
      Object.prototype.toString.call(v) === "[object Error]"));
