/**
 * Dev Tools — reproducing one captured request as code you can paste somewhere.
 *
 * Two targets, because the two audiences differ. **cURL** goes to a terminal,
 * a backend engineer or a ticket — it is the lingua franca for "this is the
 * request". **fetch** goes back into the app's own console, which is where you
 * actually want it when the question is "does this still fail if I change one
 * header", and it needs no shell at all.
 *
 * Both reconstruct from the *plaintext* body and the sanitized headers this
 * panel captured. The captured `Authorization` header is masked, so neither
 * snippet carries a working token — deliberately, and the reason a real re-run
 * should use Replay instead. That holds with the panel set to show
 * `Authorization` in full: the raw value is never on the entry these read (see
 * `NetworkMonitor.getAuthorization`).
 */

import type { MonitorEntry } from "../../capture/networkMonitor";

const MASK_NOTE =
  "Authorization was masked at capture — substitute a real token before running this.";

function fullUrl(entry: MonitorEntry): string {
  return `${entry.baseURL ?? ""}${entry.url ?? ""}`;
}

function bodyText(entry: MonitorEntry): string | null {
  if (entry.requestPayload === undefined) return null;
  return typeof entry.requestPayload === "string"
    ? entry.requestPayload
    : JSON.stringify(entry.requestPayload);
}

/** Single-quoted shell string: end the quote, escape the quote, reopen. */
function shellQuote(s: string): string {
  return s.replace(/'/g, "'\\''");
}

export function toCurl(entry: MonitorEntry): string {
  const parts = [`curl '${shellQuote(fullUrl(entry))}'`, `  -X ${entry.method}`];

  for (const [k, v] of Object.entries(entry.requestHeaders ?? {})) {
    parts.push(`  -H '${k}: ${shellQuote(v)}'`);
  }

  const body = bodyText(entry);
  if (body !== null) parts.push(`  --data-raw '${shellQuote(body)}'`);

  return parts.join(" \\\n");
}

/**
 * A `fetch` call, formatted to be pasted straight into a browser console.
 *
 * The body is emitted as `JSON.stringify(<literal>)` rather than as a
 * pre-serialized string: the literal stays readable and editable, which is the
 * entire point of choosing this form over cURL. A body that was captured as a
 * raw string (a form post, an already-serialized payload) is passed through as
 * a string instead, since re-stringifying it would double-encode.
 */
export function toFetch(entry: MonitorEntry): string {
  const headers = Object.entries(entry.requestHeaders ?? {});
  const lines: string[] = [`await fetch(${JSON.stringify(fullUrl(entry))}, {`];

  lines.push(`  method: ${JSON.stringify(entry.method)},`);

  if (headers.length) {
    lines.push("  headers: {");
    for (const [k, v] of headers) {
      lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    }
    lines.push("  },");
  }

  if (entry.requestPayload !== undefined) {
    if (typeof entry.requestPayload === "string") {
      lines.push(`  body: ${JSON.stringify(entry.requestPayload)},`);
    } else {
      const literal = JSON.stringify(entry.requestPayload, null, 2)
        .split("\n")
        .join("\n  ");
      lines.push(`  body: JSON.stringify(${literal}),`);
    }
  }

  lines.push("}).then((r) => r.json());");

  // Only warn when there is something to warn about — a request with no auth
  // header pastes and runs as-is, and a standing disclaimer would train people
  // to ignore the one that matters.
  const masked = headers.some(([k]) => /^authorization$/i.test(k));
  return masked ? `${lines.join("\n")}\n\n// ${MASK_NOTE}` : lines.join("\n");
}
