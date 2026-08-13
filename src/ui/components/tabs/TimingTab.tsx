"use client";

/**
 * Dev Tools — where a request's time actually went.
 *
 * Worth its own tab whenever the host transforms bodies in its interceptors
 * (encryption, compression, heavy serialization): a slow request can then be a
 * slow backend *or* a slow client-side pipeline, and nothing else
 * distinguishes the two. Network time is derived rather than measured — it is
 * whatever the total isn't accounted for by those transform phases.
 */

import type { MonitorEntry } from "../../../capture/networkMonitor";
import { formatDuration } from "../../helpers/format";

const COLORS = {
  encrypt: "#c084fc",
  network: "#60a5fa",
  decrypt: "#fbbf24",
};

export function TimingTab({ entry }: { entry: MonitorEntry }) {
  const total = entry.durationMs;

  if (total == null) {
    return (
      <div className="nm-empty">
        {entry.state === "pending"
          ? "— still in flight —"
          : "— no timing captured —"}
      </div>
    );
  }

  const encrypt = entry.marks?.encryptMs ?? 0;
  const decrypt = entry.marks?.decryptMs ?? 0;
  // Everything not spent in our own crypto is time on the wire (plus whatever
  // the backend took to answer). Clamped, because the three measurements come
  // from separate clock reads and can round past the total on fast requests.
  const network = Math.max(0, total - encrypt - decrypt);

  const rows = [
    {
      key: "encrypt",
      label: "Encrypt",
      value: encrypt,
      note: entry.skipEncryption
        ? "skipped for this endpoint"
        : "RSA+AES of the request body",
    },
    {
      key: "network",
      label: "Network + server",
      value: network,
      note: "request on the wire and backend processing",
    },
    {
      key: "decrypt",
      label: "Decrypt",
      value: decrypt,
      note: "AES of the response body",
    },
  ] as const;

  const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const cryptoShare = pct(encrypt + decrypt);

  return (
    <div className="nm-timing nm-scroll">
      <div className="nm-timing-bar">
        {rows.map((row) => (
          <span
            key={row.key}
            className="nm-timing-seg"
            style={{
              width: `${pct(row.value)}%`,
              background: COLORS[row.key],
            }}
            title={`${row.label} — ${formatDuration(row.value)}`}
          />
        ))}
      </div>

      <div className="nm-timing-legend">
        {rows.map((row) => (
          <div className="nm-timing-row" key={row.key}>
            <span
              className="nm-timing-swatch"
              style={{ background: COLORS[row.key] }}
            />
            <span className="nm-timing-label">{row.label}</span>
            <span className="nm-timing-note">{row.note}</span>
            <span className="nm-timing-value">
              {formatDuration(row.value)} · {pct(row.value).toFixed(0)}%
            </span>
          </div>
        ))}

        <div className="nm-timing-row" style={{ marginTop: 8 }}>
          <span />
          <span className="nm-timing-label">
            <strong>Total</strong>
          </span>
          <span className="nm-timing-note">
            {cryptoShare >= 25
              ? `${cryptoShare.toFixed(0)}% of this request was spent encrypting/decrypting`
              : ""}
          </span>
          <span className="nm-timing-value">{formatDuration(total)}</span>
        </div>
      </div>
    </div>
  );
}
