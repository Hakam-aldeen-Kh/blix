/**
 * Blix — encrypted-payload capture (opt-in).
 *
 * Blix cannot capture ciphertext by itself. It has no knowledge of any app's
 * encryption scheme, and — by design — its own interceptors sit on the
 * *plaintext* side of the pipeline, so the encrypted form simply does not exist
 * at the moment Blix captures. This is the hand-off: the host calls
 * `captureEncrypted` from inside its own encrypt/decrypt interceptors, where
 * the ciphertext does exist, and passes back the same axios config object Blix
 * already stamped.
 *
 * Entirely optional. An app that never calls it behaves exactly as before, and
 * the panel hides the Encrypted tab for every entry that has nothing in it.
 *
 * Like the rest of the capture layer, this must never throw, never warn, and
 * never be reachable in a production build.
 */

import { MONITOR_ENABLED, PERSIST_MAX_ENTRY_BYTES } from "./monitorConfig";
import { serializeBody } from "./monitorSerialize";
import { readMonitorId } from "./monitorStamp";
import { truncateForPersist } from "./monitorTruncate";
import { networkMonitor } from "./networkMonitor";

/**
 * What the host hands over. Both sides are optional and independent: the
 * request-side ciphertext is produced early (on the way out) and the
 * response-side late (on the way back), so they normally arrive in two separate
 * calls.
 */
export interface EncryptedPayload {
  /** What actually went on the wire, in place of `requestPayload`. */
  request?: unknown;
  /** What actually came back, before the host decrypted it. */
  response?: unknown;
}

/**
 * Ceiling for a single captured ciphertext, in the live buffer as well as in
 * IndexedDB.
 *
 * Deliberately the same number the persistence layer already uses per entry.
 * Ciphertext is often an order of magnitude larger than the plaintext it
 * wraps (base64 of an AES envelope, plus a wrapped key), and unlike the
 * plaintext bodies — which are references to objects the app is holding
 * anyway — a ciphertext string handed to us is retained by the buffer alone.
 * So this one is bounded at capture time rather than only at persist time.
 */
const MAX_ENCRYPTED_BYTES = PERSIST_MAX_ENTRY_BYTES;

/** Leading bytes kept, as hex, when the value is binary. */
const BINARY_PREVIEW_BYTES = 512;

/** Rendered in the Encrypted tab in place of an ArrayBuffer/TypedArray, which
 * would otherwise serialize to a useless `{}`. */
interface BinaryPreview {
  __blixBinary: string;
  byteLength: number;
  /** Hex of the first `BINARY_PREVIEW_BYTES` bytes. */
  head: string;
  /** True when `head` covers only part of the value. */
  truncated: boolean;
}

const HEX = "0123456789abcdef";

function toBytes(value: unknown): Uint8Array | null {
  if (typeof ArrayBuffer === "undefined") return null;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

/** `Uint8Array`, `ArrayBuffer`, … — whatever the host actually passed. */
function labelOf(value: object): string {
  const name = (value as { constructor?: { name?: string } }).constructor?.name;
  return typeof name === "string" && name.length > 0 ? name : "BufferSource";
}

function binaryPreview(bytes: Uint8Array, label: string): BinaryPreview {
  const limit = Math.min(bytes.length, BINARY_PREVIEW_BYTES);
  let head = "";
  for (let i = 0; i < limit; i += 1) {
    const byte = bytes[i];
    head += HEX[byte >> 4] + HEX[byte & 15];
  }
  return {
    __blixBinary: label,
    byteLength: bytes.length,
    head,
    truncated: bytes.length > limit,
  };
}

/**
 * Brings a host-supplied ciphertext under the same rules the plaintext bodies
 * already follow — `serializeBody` for the shape, `truncateForPersist` for the
 * size — with one addition the plaintext path never needs: binary.
 *
 * Note what is deliberately *not* applied here: header redaction. These are
 * bodies, not headers, and they are ciphertext. See the README for the
 * corresponding caveat about what a host chooses to pass as `response`.
 */
function normalize(value: unknown): unknown {
  const bytes = toBytes(value);
  if (bytes) return binaryPreview(bytes, labelOf(value as object));
  return truncateForPersist(serializeBody(value), MAX_ENCRYPTED_BYTES).value;
}

/**
 * Attaches the encrypted form of a request and/or response to the entry Blix
 * already captured for `config`.
 *
 * ```ts
 * apiClient.interceptors.request.use((config) => {
 *   const encrypted = encrypt(config.data);
 *   captureEncrypted(config, { request: encrypted });
 *   return { ...config, data: encrypted };
 * });
 * ```
 *
 * Correlation is by identity of the config object, never by URL or timing —
 * two concurrent requests to the same endpoint stay correctly apart. Pass the
 * object axios gave you; a `{ ...config }` copy made by your own interceptor
 * also resolves (see `monitorStamp.ts`). Call it as many times as you like, in
 * either order, before or after the response arrives; each call merges into the
 * existing entry and refreshes the panel. It never creates an entry of its own.
 *
 * A silent no-op — no throw, no console output — in every failure mode:
 * outside development, when `attachHttpMonitor` was never called, when the
 * config carries no stamp (a retry that built a fresh config, say), and when
 * the entry has already been evicted from the ring buffer.
 */
export function captureEncrypted(
  config: unknown,
  payload: EncryptedPayload,
): void {
  if (!MONITOR_ENABLED) return;
  try {
    const id = readMonitorId(config);
    if (!id) return;
    if (!payload) return;

    // Built key-by-key: a bare `{ request }` must not blank an
    // `encryptedResponse` captured by an earlier call, and `{ response: null }`
    // is not a ciphertext worth showing a tab for.
    const patch: { encryptedRequest?: unknown; encryptedResponse?: unknown } = {};
    if (payload.request != null) patch.encryptedRequest = normalize(payload.request);
    if (payload.response != null) patch.encryptedResponse = normalize(payload.response);
    if (patch.encryptedRequest === undefined && patch.encryptedResponse === undefined) {
      return;
    }

    // Silently ignores an unknown id — the entry may have been evicted, or the
    // request may have started while capture was paused.
    networkMonitor.update(id, patch);
  } catch {
    /* capture must never break a request */
  }
}
