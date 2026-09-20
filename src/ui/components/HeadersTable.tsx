"use client";

/**
 * Dev Tools — the key/value tables of the Headers tab, and the `Authorization`
 * row's token inspector.
 *
 * The inspector reads `entry.authClaims`, decoded at capture — never the header
 * value, which is masked before it is stored (see `capture/monitorAuth.ts`). So
 * it works with masking on, which is the default, and it never renders a token:
 * with masking off the row itself shows the raw value, and copying that is what
 * the row's own Copy is for.
 */

import { MASK_SUFFIX, SENSITIVE_HEADERS } from "../../capture/monitorSerialize";
import type { JwtClaims } from "../../capture/monitorTypes";
import { useState } from "react";
import { copyText, formatSpan } from "../helpers/format";
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

function ClaimRow({ name, value, bad }: { name: string; value: string; bad?: boolean }) {
  return (
    <div className="nm-jwt-row">
      <span className="nm-jwt-k">{name}</span>
      <span className={`nm-jwt-v${bad ? " nm-jwt-bad" : ""}`}>{value}</span>
    </div>
  );
}

/** The decoded claims, as the inspector shows them. `now` is epoch ms. */
export function JwtClaimsView({ claims, now }: { claims: JwtClaims; now: number }) {
  const expiresAt = claims.exp != null ? claims.exp * 1000 : null;
  const expired = expiresAt != null && expiresAt <= now;
  return (
    <div className="nm-jwt">
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
      <div className="nm-jwt-note">{claims.alg} · decoded at capture, signature not verified</div>
    </div>
  );
}

/**
 * The `Authorization` row. Collapsed, the claims are a chip beside the value
 * that still says whether the token has expired; expanded, they open beneath
 * it — the same toggle-and-reveal the databases sheet uses for its peek.
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
  const [copied, setCopied] = useState(false);
  const { claims, raw } = view;
  // Ticks only when there is an expiry to count down to.
  const now = useMonitorClock(claims?.exp != null);
  const expired = claims?.exp != null && claims.exp * 1000 <= now;

  const copy = () => {
    if (raw === undefined) return;
    void copyText(raw).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

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
          <button className="nm-tree-chip" onClick={copy} title="Copy the full value">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {claims && (
          <button
            className={`nm-tree-chip nm-jwt-chip${expired ? " nm-jwt-bad" : ""}`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            title={
              open
                ? "Hide the token's claims"
                : "Show the token's claims — decoded at capture, not verified"
            }
          >
            JWT
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
        {open && claims && <JwtClaimsView claims={claims} now={now} />}
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
