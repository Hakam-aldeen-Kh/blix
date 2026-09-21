"use client";

/**
 * Dev Tools — where a request's time actually went.
 *
 * Worth its own tab whenever the host transforms bodies in its interceptors
 * (encryption, compression, heavy serialization): a slow request can then be a
 * slow backend *or* a slow client-side pipeline, and nothing else
 * distinguishes the two. Network time is derived rather than measured — it is
 * whatever the total isn't accounted for by those transform phases.
 *
 * The second half answers the question the first half provokes. "712 ms" means
 * nothing on its own and everything beside the session's median and its worst
 * offender, both of which the panel already knows — so the comparison is drawn
 * here rather than left for the reader to do by scrolling the list.
 */

import type { MonitorEntry } from "../../../capture/networkMonitor";
import { formatDuration, requestName } from "../../helpers/format";

export function TimingTab({
  entry,
  medianMs,
  slowest,
}: {
  entry: MonitorEntry;
  /** Median duration across what the list currently shows. */
  medianMs: number;
  /** The slowest entry in the same set, for the upper bound of the scale. */
  slowest: { ms: number; url: string } | null;
}) {
  const total = entry.durationMs;

  if (total == null) {
    return (
      <div className="nm-empty">
        {entry.state === "pending" ? "— still in flight —" : "— no timing captured —"}
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

  // One scale for all three context bars, so their lengths are comparable.
  const ceiling = Math.max(total, medianMs, slowest?.ms ?? 0, 1);
  const context: { key: string; label: string; ms: number }[] = [
    { key: "this", label: "This request", ms: total },
    ...(medianMs > 0
      ? [{ key: "median", label: "Session median", ms: medianMs }]
      : []),
    ...(slowest && slowest.ms > 0
      ? [{ key: "worst", label: `Slowest (${requestName(slowest.url)})`, ms: slowest.ms }]
      : []),
  ];

  return (
    <div className="nm-timing nm-scroll">
      <div className="nm-timing-head">
        <span className="nm-timing-title">REQUEST TIMELINE</span>
        <span className="nm-timing-total">
          total <b>{formatDuration(total)}</b>
          {cryptoShare >= 25 && ` · ${cryptoShare.toFixed(0)}% in crypto`}
        </span>
      </div>

      <div className="nm-timing-bar">
        {rows.map((row) => (
          <span
            key={row.key}
            className={`nm-timing-seg nm-timing-${row.key}`}
            // A phase narrower than its label still has to be visible as a
            // band; below that width it simply carries no text.
            style={{ width: `${pct(row.value)}%`, minWidth: row.value > 0 ? 3 : 0 }}
            title={`${row.label} — ${formatDuration(row.value)}`}
          >
            {pct(row.value) > 14 ? formatDuration(row.value) : ""}
          </span>
        ))}
      </div>

      <div className="nm-timing-legend">
        {rows.map((row) => (
          <div className="nm-timing-row" data-zero={row.value === 0 || undefined} key={row.key}>
            <span className={`nm-timing-swatch nm-timing-${row.key}`} />
            <span className="nm-timing-label">{row.label}</span>
            <span className="nm-timing-note">{row.note}</span>
            <span className="nm-timing-value">{formatDuration(row.value)}</span>
            <span className="nm-timing-pct">{pct(row.value).toFixed(1)}%</span>
          </div>
        ))}
      </div>

      {context.length > 1 && (
        <div className="nm-timing-ctx">
          <div className="nm-timing-ctx-head">IN CONTEXT OF THIS SESSION</div>
          {context.map((row) => (
            <div className={`nm-timing-ctx-row nm-timing-${row.key}`} key={row.key}>
              <span className="nm-timing-ctx-k" title={row.label}>
                {row.label}
              </span>
              <span className="nm-timing-ctx-track">
                <span
                  className="nm-timing-ctx-fill"
                  style={{ width: `${Math.max(2, (row.ms / ceiling) * 100)}%` }}
                />
              </span>
              <span className="nm-timing-ctx-v">{formatDuration(row.ms)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
