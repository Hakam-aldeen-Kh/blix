/**
 * Network monitor — web storage that cannot throw.
 *
 * `localStorage` is not merely sometimes full. In a sandboxed iframe without
 * `allow-same-origin`, and under some browsers' strict privacy settings,
 * *reading the `localStorage` property itself* throws a `SecurityError` —
 * before any method is called. One unguarded access in a render path is enough
 * to take the panel down, and whatever of the host app shares its error
 * boundary with it.
 *
 * So every access goes through here: a read that fails is a miss, a write that
 * fails is dropped. Nothing Blix keeps in web storage is worth more than that —
 * the preferences mirror is a cache of what IndexedDB holds, and the database
 * registry is a convenience.
 *
 * Only `localStorage`: Blix does not use `sessionStorage`.
 */

/** The stored string, or `null` when absent, unreadable, or not in a browser. */
export function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value`. Silent when storage is blocked or over quota. */
export function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* blocked or full — every caller treats storage as best-effort */
  }
}

/** Removes `key`. Silent when storage is blocked. */
export function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* blocked — nothing to remove that could be read anyway */
  }
}
