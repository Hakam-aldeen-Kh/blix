/**
 * Dev Tools — the flat export formats.
 *
 * HAR (`harExport.ts`) is the format for handing a repro to another *tool*.
 * These four are for handing it to a *person* or a *shell*, which is a
 * different job and the reason they exist:
 *
 * - **CSV** opens in a spreadsheet. One row per entry, no payloads — for
 *   sorting a hundred requests by duration, or counting how many 401s a
 *   session produced.
 * - **Markdown** pastes into a GitHub issue, a PR review or Slack. This is the
 *   one that gets used most: "here is what the client actually sent" is the
 *   hardest thing to communicate in a bug report, and a HAR attachment nobody
 *   opens does not communicate it.
 * - **NDJSON** pipes into `jq`. One entry per line, so a log too big to open
 *   is still greppable and streamable.
 * - **cURL script** replays a whole session against another environment.
 *
 * All four take the entries they are given — the caller decides whether that
 * is everything captured or only what the current filter shows.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import { formatBytes, requestName } from "../helpers/format";
import { toCurl } from "./snippets";

/** Full URL as issued, with the base the client was configured with. */
function fullUrl(entry: MonitorEntry): string {
  return `${entry.baseURL ?? ""}${entry.url ?? ""}`;
}

/**
 * The short label for a row, matching what the table shows.
 *
 * `requestName` parses its argument as a URL path and drops generic and parent
 * segments — exactly wrong for a Redux action type (`cart/addItem`) or a
 * serialized query key, where the whole string *is* the name. Without this the
 * exports quietly truncated every Redux and Query row to its last segment.
 */
function rowLabel(entry: MonitorEntry): string {
  const kind = entry.kind ?? "http";
  return kind === "redux" || kind === "query" ? entry.url : requestName(entry.url);
}

/** What a row's status column reads, across the four kinds of entry. */
function statusOf(entry: MonitorEntry): string {
  if (entry.status != null) return String(entry.status);
  switch (entry.state) {
    case "pending":
      return (entry.kind ?? "http") === "ws" ? "open" : "pending";
    case "aborted":
      return "aborted";
    case "error":
      return "error";
    default:
      return "ok";
  }
}

/* ── CSV ───────────────────────────────────────────────────────────────── */

/**
 * RFC 4180 quoting: wrap in double quotes and double any interior quote.
 *
 * Applied to every field rather than only the ones that appear to need it. A
 * value is only known to be safe after inspecting it, the check costs as much
 * as the quoting, and unconditional quoting removes the chance of a URL with a
 * comma in a query string silently splitting a row.
 */
function csvField(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = [
  "time",
  "kind",
  "method",
  "name",
  "url",
  "status",
  "state",
  "duration_ms",
  "size_bytes",
  "initiator",
  "pinned",
] as const;

export function toCsv(entries: MonitorEntry[]): string {
  const rows = entries.map((e) =>
    [
      new Date(e.at).toISOString(),
      e.kind ?? "http",
      e.transport ?? e.method,
      rowLabel(e),
      fullUrl(e),
      statusOf(e),
      e.state,
      e.durationMs ?? "",
      e.sizeBytes ?? "",
      e.initiator?.[0]?.file ?? "",
      e.pinned ? "yes" : "",
    ]
      .map(csvField)
      .join(","),
  );
  // CRLF is what RFC 4180 specifies and what Excel is happiest with.
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n");
}

/* ── Markdown ──────────────────────────────────────────────────────────── */

/** `|` ends a cell and a newline ends a row, so both have to go. */
function mdCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

/** Backticks around a value that is code — a URL, a method, an action type. */
function mdCode(value: unknown): string {
  const s = String(value ?? "");
  return s ? `\`${mdCell(s)}\`` : "";
}

const MD_HEADER = "| # | Method | Name | Status | Time | Size |";
const MD_RULE = "| ---: | :--- | :--- | :--- | ---: | ---: |";

/**
 * A table plus a one-line summary. Deliberately not a wall of payloads: what
 * makes a bug report readable is the shape of the session, and anyone who
 * needs a body can ask for the JSON export.
 *
 * Failures are listed underneath with their error payload, because that *is*
 * the part worth pasting.
 */
export function toMarkdown(entries: MonitorEntry[]): string {
  const rows = entries.map((e, i) =>
    [
      String(i + 1),
      mdCode(e.transport ?? e.method),
      mdCode(rowLabel(e)),
      statusOf(e),
      e.durationMs != null ? `${e.durationMs} ms` : "",
      e.sizeBytes != null ? formatBytes(e.sizeBytes) : "",
    ].join(" | "),
  );

  const errors = entries.filter((e) => e.state === "error");
  const totalBytes = entries.reduce((sum, e) => sum + (e.sizeBytes ?? 0), 0);

  const out = [
    `**${entries.length}** ${entries.length === 1 ? "entry" : "entries"}` +
      (errors.length ? ` · **${errors.length}** failed` : "") +
      ` · ${formatBytes(totalBytes)} transferred`,
    "",
    MD_HEADER,
    MD_RULE,
    ...rows.map((r) => `| ${r} |`),
  ];

  if (errors.length) {
    out.push("", "<details><summary>Failures</summary>", "");
    for (const e of errors) {
      out.push(
        `**${e.method} ${fullUrl(e)}** — ${statusOf(e)}`,
        "",
        "```json",
        safeJson(e.error ?? e.responsePayload),
        "```",
        "",
      );
    }
    out.push("</details>");
  }

  return out.join("\n");
}

function safeJson(value: unknown): string {
  if (value === undefined) return "null";
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}

/* ── NDJSON ────────────────────────────────────────────────────────────── */

/** One entry per line. An entry that cannot be stringified (a payload holding
 * something exotic a capture let through) becomes an error line rather than
 * failing the whole export — a partial log still beats no log. */
export function toNdjson(entries: MonitorEntry[]): string {
  return entries
    .map((e) => {
      try {
        return JSON.stringify(e);
      } catch {
        return JSON.stringify({ id: e.id, url: e.url, _error: "not serializable" });
      }
    })
    .join("\n");
}

/* ── cURL script ───────────────────────────────────────────────────────── */

/**
 * Every HTTP entry as a runnable shell script, oldest first so the sequence
 * matches what the app actually did.
 *
 * Carries the same caveat as a single Copy-as-cURL: captured `Authorization`
 * headers are masked, so the script needs a real token substituting before it
 * will authenticate.
 */
export function toCurlScript(entries: MonitorEntry[]): string {
  const http = entries
    .filter((e) => (e.kind ?? "http") === "http")
    .slice()
    .sort((a, b) => a.seq - b.seq);

  const header = [
    "#!/usr/bin/env bash",
    "# Captured by blix. Requests run in the order the app issued them.",
    "# Authorization headers were masked at capture — substitute a real token.",
    "set -euo pipefail",
    "",
  ];

  const body = http.map(
    (e) => `# ${statusOf(e)} · ${e.durationMs ?? "?"} ms\n${toCurl(e)}\n`,
  );

  return [...header, ...body].join("\n");
}
