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
import type { WireTiming } from "../../../capture/monitorTypes";
import { serverTimingOf } from "../../../capture/resourceTiming";
import { formatBytes, formatDuration, requestName } from "../../helpers/format";

/** The browser's phases, in the order they happen. A phase the browser did
 * not report is left out rather than shown as zero: a reused connection has
 * no DNS lookup, which is not the same as one that took 0 ms. */
const WIRE_PHASES: { key: keyof WireTiming; label: string; note: string }[] = [
  { key: "redirectMs", label: "Redirect", note: "following redirects before the final URL" },
  { key: "queueMs", label: "Queued", note: "waiting for a connection slot or the cache" },
  { key: "dnsMs", label: "DNS", note: "resolving the host name" },
  { key: "connectMs", label: "Connect", note: "opening the TCP connection" },
  { key: "tlsMs", label: "TLS", note: "the HTTPS handshake" },
  { key: "waitMs", label: "Waiting", note: "request sent to first byte back (TTFB)" },
  { key: "downloadMs", label: "Download", note: "first byte to last" },
];

/**
 * What the browser measured for this request, as opposed to what Blix timed
 * around it. Its own section rather than more segments in the bar above: the
 * two are different clocks answering different questions — "how long did my
 * code wait" and "where on the network did that time go" — and one bar made of
 * both would add up to neither.
 */
function WireSection({ entry }: { entry: MonitorEntry }) {
  const wire = entry.wire;
  const server = serverTimingOf(entry);
  if (!wire && server.length === 0) return null;

  const phases = wire
    ? WIRE_PHASES.flatMap((p) => {
        const value = wire[p.key];
        if (typeof value !== "number") return [];
        // A reused connection reports its lookup and handshake as zero-length
        // rather than absent. Those rows say nothing; the two that are always
        // real — the wait and the download — stay even at zero.
        const always = p.key === "waitMs" || p.key === "downloadMs";
        return value > 0 || always ? [{ ...p, value }] : [];
      })
    : [];
  const span = Math.max(wire?.totalMs ?? 0, ...phases.map((p) => p.value), 1);

  const facts: [string, string][] = [];
  if (wire?.protocol) facts.push(["Protocol", wire.protocol]);
  if (wire?.fromCache) facts.push(["Cache", "served from the browser cache"]);
  if (wire?.transferSize) facts.push(["Transferred", formatBytes(wire.transferSize)]);
  if (wire?.encodedBodySize) {
    const compressed =
      wire.decodedBodySize && wire.decodedBodySize > wire.encodedBodySize
        ? ` → ${formatBytes(wire.decodedBodySize)} decoded`
        : "";
    facts.push(["Body", `${formatBytes(wire.encodedBodySize)}${compressed}`]);
  }

  return (
    <>
      {wire && (
        <div className="nm-timing-ctx">
          <div className="nm-timing-ctx-head">
            ON THE WIRE · {formatDuration(wire.totalMs)} MEASURED BY THE BROWSER
          </div>
          {wire.restricted ? (
            <div className="nm-timing-wire-note">
              The browser withholds the phases and sizes of a cross-origin response unless it
              sends <code>Timing-Allow-Origin</code>. Only the total is available.
            </div>
          ) : (
            phases.map((p) => (
              <div className="nm-timing-ctx-row nm-timing-wire" key={p.key} title={p.note}>
                <span className="nm-timing-ctx-k">{p.label}</span>
                <span className="nm-timing-ctx-track">
                  <span
                    className="nm-timing-ctx-fill"
                    style={{ width: `${Math.max(p.value > 0 ? 2 : 0, (p.value / span) * 100)}%` }}
                  />
                </span>
                <span className="nm-timing-ctx-v">{formatDuration(p.value)}</span>
              </div>
            ))
          )}
          {facts.length > 0 && (
            <div className="nm-timing-facts">
              {facts.map(([k, v]) => (
                <span className="nm-timing-fact" key={k}>
                  <span className="nm-timing-fact-k">{k}</span>
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {server.length > 0 && (
        <div className="nm-timing-ctx">
          <div className="nm-timing-ctx-head">SERVER-TIMING · REPORTED BY THE BACKEND</div>
          {server.map((m, i) => {
            const most = Math.max(...server.map((s) => s.durationMs ?? 0), 1);
            return (
              <div className="nm-timing-ctx-row nm-timing-wire" key={`${m.name}-${i}`} title={m.description}>
                <span className="nm-timing-ctx-k">
                  {m.name}
                  {m.description ? ` · ${m.description}` : ""}
                </span>
                <span className="nm-timing-ctx-track">
                  {m.durationMs != null && (
                    <span
                      className="nm-timing-ctx-fill"
                      style={{ width: `${Math.max(2, (m.durationMs / most) * 100)}%` }}
                    />
                  )}
                </span>
                <span className="nm-timing-ctx-v">
                  {m.durationMs != null ? formatDuration(m.durationMs) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

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

      <WireSection entry={entry} />

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
