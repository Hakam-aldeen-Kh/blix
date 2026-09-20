"use client";

/**
 * Dev Tools — the key/value tables of the Headers tab, and the `Authorization`
 * row's token inspector.
 *
 * The inspector reads `entry.authClaims`, decoded by capture — when a `fetch`
 * call is made, or when an axios request settles (`JwtClaims.source` says
 * which) — never the header value, which is masked before it is stored (see
 * `capture/monitorAuth.ts`). So it works with masking on, which is the default,
 * and it never renders a token: with masking off the row itself shows the raw
 * value, and copying that is what the row's own Copy is for.
 */

import { MASK_SUFFIX, SENSITIVE_HEADERS } from "../../capture/monitorSerialize";
import type { JwtClaims, JwtClaimsSource, MonitorState } from "../../capture/monitorTypes";
import { useState } from "react";
import { copyText, formatSpan } from "../helpers/format";
import { describeAlg, type AlgView } from "../helpers/jwtAlg";
import { useMonitorClock } from "../hooks/useMonitorClock";

/** What the Request Headers table knows about an entry's `Authorization`. */
export interface AuthorizationView {
  claims?: JwtClaims;
  /** The unmasked value — only for an entry captured while masking was off,
   * and only while it still is. */
  raw?: string;
  /** Masking is off right now. With no `raw`, the value on screen was masked
   * before the switch was flipped, and cannot be recovered. */
  unmasking: boolean;
  /** The entry's outcome: what an unsigned token's warning can state as fact. */
  state?: MonitorState;
  status?: number;
}

function stripSuffix(value: string): string {
  return value.endsWith(MASK_SUFFIX) ? value.slice(0, -MASK_SUFFIX.length) : value;
}

/** A claim's epoch seconds as local date and time. A value no `Date` can hold
 * falls back to the number rather than to "Invalid Date". */
function when(seconds: number): string {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return String(seconds);
  try {
    return date.toLocaleString(undefined, { hour12: false });
  } catch {
    return String(seconds);
  }
}

/** A Copy chip's state: "Copied" for a moment after a successful write. */
function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void copyText(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };
  return [copied, copy];
}

/** Where the claims came from, in the note line's words. The request-time
 * wording has to stay true for all three ways an axios entry ends up there:
 * never settled, settled without a config, or sent with the `auth` option. */
const SOURCE_NOTE: Record<JwtClaimsSource, string> = {
  fetch: "Decoded when the request was made",
  "axios-settle": "Decoded from the headers the request settled with",
  "axios-request": "Decoded when the request started — not re-read at settle",
};

/**
 * The warning for `alg: none`, worded as what was sent and what came back —
 * never as a verdict. Blix cannot know whether the server checked the token: a
 * 200 from an endpoint that ignores it looks exactly like a 200 from one that
 * accepted it, so the status is reported and the conclusion is left to the
 * reader.
 */
function unsignedWarning(alg: string, state?: MonitorState, status?: number): string {
  // The token's own spelling: `NONE` is the detail worth seeing.
  const base = `Unsigned token (alg: ${alg})`;
  if (status != null) return `${base} — the server answered ${status} to a request carrying it.`;
  if (state === undefined || state === "pending") return `${base} — no response yet.`;
  return `${base} — no response status was recorded.`;
}

function ClaimRow({ name, value, bad }: { name: string; value: string; bad?: boolean }) {
  return (
    <div className="nm-jwt-row">
      <span className="nm-jwt-k">{name}</span>
      <span className={`nm-jwt-v${bad ? " nm-jwt-bad" : ""}`}>{value}</span>
    </div>
  );
}

/** `alg`, readable first. The raw string is on the tooltip, and on a Copy chip
 * whenever what is printed is not the raw string — a mapped name, or a cut one. */
function AlgRow({ view }: { view: AlgView }) {
  const [copied, copy] = useCopied();
  const { raw } = view;
  return (
    <div className="nm-jwt-row">
      <span className="nm-jwt-k">alg</span>
      <span
        className={`nm-jwt-v${view.absent ? " nm-jwt-muted" : ""}${view.unsigned ? " nm-jwt-warn" : ""}`}
      >
        <span className="nm-jwt-alg" title={raw}>
          {view.label}
        </span>
        {raw !== undefined && view.label !== raw && (
          <button className="nm-tree-chip" onClick={() => copy(raw)} title="Copy the raw alg value">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </span>
    </div>
  );
}

/** The decoded claims, as the inspector shows them. `now` is epoch ms. */
export function JwtClaimsView({
  claims,
  now,
  state,
  status,
}: {
  claims: JwtClaims;
  now: number;
  state?: MonitorState;
  status?: number;
}) {
  const alg = describeAlg(claims);
  const expiresAt = claims.exp != null ? claims.exp * 1000 : null;
  const expired = expiresAt != null && expiresAt <= now;
  return (
    <div className="nm-jwt">
      {alg.unsigned && (
        <div className="nm-jwt-warning" role="note">
          {unsignedWarning(alg.raw ?? "none", state, status)}
        </div>
      )}
      <AlgRow view={alg} />
      {claims.sub !== undefined && <ClaimRow name="sub" value={claims.sub} />}
      {claims.iss !== undefined && <ClaimRow name="iss" value={claims.iss} />}
      {claims.iat !== undefined && <ClaimRow name="iat" value={when(claims.iat)} />}
      {claims.exp !== undefined && expiresAt != null && (
        <ClaimRow
          name="exp"
          bad={expired}
          value={`${when(claims.exp)} · ${
            expired
              ? `expired ${formatSpan(now - expiresAt)} ago`
              : `expires in ${formatSpan(expiresAt - now)}`
          }`}
        />
      )}
      <div className="nm-jwt-note">
        {claims.source ? SOURCE_NOTE[claims.source] : "Decoded by Blix"} · signature not verified
      </div>
    </div>
  );
}

/**
 * The `Authorization` row. Collapsed, the claims are a chip beside the value
 * that still says whether the token has expired, or declares no signature;
 * expanded, they open beneath it — the same toggle-and-reveal the databases
 * sheet uses for its peek.
 */
function AuthorizationRow({
  name,
  stored,
  view,
}: {
  name: string;
  stored: string;
  view: AuthorizationView;
}) {
  const [open, setOpen] = useState(false);
  const [copied, copy] = useCopied();
  const { claims, raw } = view;
  // Ticks only when there is an expiry to count down to.
  const now = useMonitorClock(claims?.exp != null);
  const expired = claims?.exp != null && claims.exp * 1000 <= now;
  const unsigned = claims ? describeAlg(claims).unsigned : false;

  return (
    <div className="nm-kv-row">
      <dt className="nm-kv-k">{name}</dt>
      <dd className="nm-kv-v nm-kv-auth">
        <span className="nm-kv-val">{raw ?? stripSuffix(stored)}</span>
        {raw === undefined ? (
          <span className="nm-tag-masked" title="Masked at capture — never the real value">
            MASKED
          </span>
        ) : (
          <span
            className="nm-tag-masked nm-tag-unmasked"
            title="Shown in full because masking is off. Exports, copied snippets and the saved log still carry the masked value."
          >
            UNMASKED
          </span>
        )}
        {raw !== undefined && (
          <button className="nm-tree-chip" onClick={() => copy(raw)} title="Copy the full value">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {claims && (
          <button
            className={`nm-tree-chip nm-jwt-chip${expired ? " nm-jwt-bad" : unsigned ? " nm-jwt-warn" : ""}`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            title={
              open
                ? "Hide the token's claims"
                : "Show the token's claims — decoded by Blix, not verified"
            }
          >
            JWT
            {unsigned && " · unsigned"}
            {claims.exp != null &&
              ` · ${expired ? "expired" : `${formatSpan(claims.exp * 1000 - now)} left`}`}
          </button>
        )}
        {raw === undefined && view.unmasking && (
          <span className="nm-kv-note">
            Captured while masking was on — the full value was never stored, so it
            cannot be shown.
          </span>
        )}
        {open && claims && (
          <JwtClaimsView claims={claims} now={now} state={view.state} status={view.status} />
        )}
      </dd>
    </div>
  );
}

export function HeadersTable({
  title,
  rows,
  authorization,
}: {
  title: string;
  rows: [string, string][];
  /** Set for a request's own headers, where an `Authorization` row gets the
   * inspector. */
  authorization?: AuthorizationView;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="nm-htable">
      <div className="nm-htable-title">{title}</div>
      <dl className="nm-kv">
        {rows.map(([k, v]) => {
          if (authorization && k.toLowerCase() === "authorization") {
            return <AuthorizationRow key={k} name={k} stored={v} view={authorization} />;
          }
          // Say it, rather than leaving the reader to infer it from an
          // ellipsis: a truncated bearer token looks exactly like a bearer
          // token, and copying one out of here and wondering why it 401s is a
          // whole afternoon. The suffix stays on the stored value for every
          // export path that has no room for a tag.
          const masked = SENSITIVE_HEADERS.has(k.toLowerCase());
          const value = masked ? stripSuffix(v) : v;
          return (
            <div className="nm-kv-row" key={k}>
              <dt className="nm-kv-k">{k}</dt>
              <dd className="nm-kv-v">
                {value}
                {masked && (
                  <span className="nm-tag-masked" title="Masked at capture — never the real value">
                    MASKED
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
