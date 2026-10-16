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
 *
 * ## Everything captured is untrusted text
 *
 * A snippet is pasted into a shell or a console, which is a more privileged
 * place than the page the request came from. And what Blix captured is not
 * only what the browser agreed to send: the fetch and XHR wrappers record a
 * method and a header name *before* the browser validates them, so a call the
 * browser rejects still leaves an entry — one whose "method" can be any
 * string a script on the page chose. So nothing captured is ever written into
 * a snippet as syntax. In cURL every piece is one single-quoted argument; in
 * fetch every piece is a `JSON.stringify`-ed literal.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";

const MASK_NOTE =
  "Authorization was masked at capture — substitute a real token before running this.";

function fullUrl(entry: MonitorEntry): string {
  return `${entry.baseURL ?? ""}${entry.url ?? ""}`;
}

/**
 * The request URL resolved against the page it was made from. A `fetch("/api")`
 * or an axios instance with no `baseURL` records a relative URL, which the
 * page's own `fetch` understands but `curl` and a HAR reader do not. Left as
 * recorded outside a browser, or when it does not parse.
 */
export function absoluteUrl(entry: MonitorEntry): string {
  const raw = fullUrl(entry);
  if (typeof location === "undefined") return raw;
  try {
    return new URL(raw, location.href).href;
  } catch {
    return raw;
  }
}

/** The request body as text, or `null` when there is nothing to send — no
 * body, or a value with no text form (a function, a symbol). */
function bodyText(entry: MonitorEntry): string | null {
  const payload = entry.requestPayload;
  if (payload === undefined) return null;
  if (typeof payload === "string") return payload;
  try {
    const text = JSON.stringify(payload);
    return typeof text === "string" ? text : null;
  } catch {
    // A cycle or a BigInt: copying the snippet must not throw over it.
    return String(payload);
  }
}

/** POSIX single-quote: wrap the whole value, turn each ' into '\'' . Safe for bash/zsh/sh. */
const q = (value: unknown): string => `'${String(value).replace(/'/g, `'\\''`)}'`;

/** Header names/values never legitimately contain line breaks. */
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, " ");

/** HTTP methods are letters only; anything else is not a real request. */
const safeMethod = (m: string | undefined): string =>
  m && /^[A-Za-z]+$/.test(m) ? m.toUpperCase() : "GET";

/**
 * A `curl` command for a POSIX shell — bash, zsh, sh, Git Bash.
 *
 * Every captured piece is exactly one `q(…)` argument: the URL, the method,
 * each header (name and value together, as curl takes them), the body. Inside
 * single quotes a POSIX shell expands nothing — no `$(…)`, no backticks, no
 * `;` — and the one character that could end the quoting is the one `q`
 * rewrites. Not for cmd.exe or PowerShell, which quote differently.
 */
export function toCurl(entry: MonitorEntry): string {
  const parts = [`curl ${q(absoluteUrl(entry))}`, `  -X ${q(safeMethod(entry.method))}`];

  for (const [k, v] of Object.entries(entry.requestHeaders ?? {})) {
    parts.push(`  -H ${q(oneLine(`${k}: ${v}`))}`);
  }

  const body = bodyText(entry);
  if (body !== null) parts.push(`  --data-raw ${q(body)}`);

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
 *
 * Every captured value reaches the snippet through `JSON.stringify`, so it can
 * only ever be a string literal or a JSON literal — never code.
 */
export function toFetch(entry: MonitorEntry): string {
  const headers = Object.entries(entry.requestHeaders ?? {});
  const lines: string[] = [`await fetch(${JSON.stringify(fullUrl(entry))}, {`];

  lines.push(`  method: ${JSON.stringify(safeMethod(entry.method))},`);

  if (headers.length) {
    lines.push("  headers: {");
    for (const [k, v] of headers) {
      lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(String(v))},`);
    }
    lines.push("  },");
  }

  if (entry.requestPayload !== undefined) {
    if (typeof entry.requestPayload === "string") {
      lines.push(`  body: ${JSON.stringify(entry.requestPayload)},`);
    } else {
      const text = bodyText(entry);
      if (text !== null) {
        let literal: string;
        try {
          literal = JSON.stringify(entry.requestPayload, null, 2).split("\n").join("\n  ");
        } catch {
          // No JSON form (a cycle, a BigInt): send its text, as a string.
          literal = JSON.stringify(text);
        }
        lines.push(`  body: JSON.stringify(${literal}),`);
      }
    }
  }

  lines.push("}).then((r) => r.json());");

  // Only warn when there is something to warn about — a request with no auth
  // header pastes and runs as-is, and a standing disclaimer would train people
  // to ignore the one that matters.
  const masked = headers.some(([k]) => /^authorization$/i.test(k));
  return masked ? `${lines.join("\n")}\n\n// ${MASK_NOTE}` : lines.join("\n");
}
