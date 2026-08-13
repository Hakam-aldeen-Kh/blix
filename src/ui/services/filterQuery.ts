/**
 * Dev Tools — Chrome-style filter syntax.
 *
 * Free text matches the URL (and, in deep mode, the payload). On top of that:
 *
 *   `-polling`            exclude anything matching "polling"
 *   `method:post`         field match (case-insensitive, substring)
 *   `status:500`          exact status, or `status:5xx` / `status:4xx`
 *   `is:error`            error | ok | pending | aborted | pinned | replay | running
 *   `type:ws`             http | ws
 *   `larger-than:10k`     size threshold — accepts b / k / kb / m / mb
 *   `slower-than:500`     duration in ms, or `slower-than:1.5s`
 *   `has:frames`          frames | initiator | error | replay
 *
 * Any token may be negated with a leading `-`. Tokens are ANDed; quoting with
 * `"..."` keeps spaces together.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import { matchesMeta, getHaystack } from "./searchIndex";

export type FilterField =
  | "text"
  | "method"
  | "status"
  | "is"
  | "type"
  | "larger-than"
  | "slower-than"
  | "has"
  | "url";

export interface FilterToken {
  field: FilterField;
  value: string;
  negated: boolean;
}

export interface ParsedFilter {
  tokens: FilterToken[];
  /** True when nothing meaningful was typed. */
  empty: boolean;
}

const FIELDS: Record<string, FilterField> = {
  method: "method",
  status: "status",
  "status-code": "status",
  is: "is",
  type: "type",
  "larger-than": "larger-than",
  larger: "larger-than",
  "slower-than": "slower-than",
  slower: "slower-than",
  has: "has",
  url: "url",
};

/** Field names offered by the autocomplete hint row. */
export const FILTER_HINTS: { token: string; hint: string }[] = [
  { token: "-", hint: "exclude" },
  { token: "method:", hint: "post, get" },
  { token: "status:", hint: "500, 4xx" },
  { token: "is:", hint: "error, pending, pinned, replay" },
  { token: "type:", hint: "http, ws, redux, query" },
  { token: "larger-than:", hint: "10k, 1mb" },
  { token: "slower-than:", hint: "500, 1.5s" },
  { token: "has:", hint: "frames, initiator, error" },
];

/** Splits on whitespace but keeps `"quoted phrases"` intact. */
function splitTokens(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of input) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      if (current) out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
}

export function parseFilter(input: string): ParsedFilter {
  const tokens: FilterToken[] = [];

  for (const raw of splitTokens(input.trim())) {
    const negated = raw.startsWith("-") && raw.length > 1;
    const body = negated ? raw.slice(1) : raw;
    if (!body) continue;

    const colon = body.indexOf(":");
    if (colon > 0) {
      const key = body.slice(0, colon).toLowerCase();
      const field = FIELDS[key];
      if (field) {
        const value = body.slice(colon + 1).toLowerCase();
        // `method:` with nothing after it is mid-typing, not a filter.
        if (value) tokens.push({ field, value, negated });
        continue;
      }
    }

    tokens.push({ field: "text", value: body.toLowerCase(), negated });
  }

  return { tokens, empty: tokens.length === 0 };
}

/** `10k` → 10240, `1.5mb` → 1572864, `900` → 900. */
export function parseSize(value: string): number | null {
  const match = /^([\d.]+)\s*(b|k|kb|m|mb|g|gb)?$/i.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  switch ((match[2] ?? "b").toLowerCase()) {
    case "k":
    case "kb":
      return n * 1024;
    case "m":
    case "mb":
      return n * 1024 * 1024;
    case "g":
    case "gb":
      return n * 1024 * 1024 * 1024;
    default:
      return n;
  }
}

/** `500` → 500, `1.5s` → 1500. */
export function parseDuration(value: string): number | null {
  const match = /^([\d.]+)\s*(ms|s)?$/i.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return (match[2] ?? "ms").toLowerCase() === "s" ? n * 1000 : n;
}

function matchStatus(entry: MonitorEntry, value: string): boolean {
  const status = entry.status;
  if (status == null) return false;
  // `4xx` / `5xx` class matching, as in Chrome.
  const classMatch = /^([1-5])xx$/i.exec(value);
  if (classMatch) return Math.floor(status / 100) === Number(classMatch[1]);
  return String(status) === value;
}

function matchIs(entry: MonitorEntry, value: string): boolean {
  switch (value) {
    case "error":
      return entry.state === "error";
    case "ok":
    case "success":
      return entry.state === "success";
    case "pending":
    case "running":
      return entry.state === "pending";
    case "aborted":
      return entry.state === "aborted";
    case "pinned":
      return entry.pinned === true;
    case "replay":
      return Boolean(entry.replayOf);
    case "encrypted":
      return entry.skipEncryption !== true;
    default:
      return false;
  }
}

function matchHas(entry: MonitorEntry, value: string): boolean {
  switch (value) {
    case "frames":
      return (entry.frames?.length ?? 0) > 0;
    case "initiator":
      return (entry.initiator?.length ?? 0) > 0;
    case "error":
      return entry.error !== undefined;
    case "replay":
      return (entry.replayCount ?? 0) > 0;
    case "body":
      return entry.requestPayload !== undefined;
    default:
      return false;
  }
}

/** Evaluates one token, ignoring its negation (applied by the caller). */
function matchToken(
  entry: MonitorEntry,
  token: FilterToken,
  deepSearch: boolean,
): boolean {
  switch (token.field) {
    case "method":
      return entry.method.toLowerCase().includes(token.value);
    case "status":
      return matchStatus(entry, token.value);
    case "is":
      return matchIs(entry, token.value);
    case "has":
      return matchHas(entry, token.value);
    case "type":
      return (entry.kind ?? "http") === token.value;
    case "url":
      return entry.url.toLowerCase().includes(token.value);
    case "larger-than": {
      const threshold = parseSize(token.value);
      return threshold == null ? true : (entry.sizeBytes ?? 0) > threshold;
    }
    case "slower-than": {
      const threshold = parseDuration(token.value);
      return threshold == null ? true : (entry.durationMs ?? 0) > threshold;
    }
    case "text":
    default:
      if (matchesMeta(entry, token.value)) return true;
      // Only free text reaches into payloads, and only in deep mode — the
      // haystack is cached per entry revision, not rebuilt per keystroke.
      return deepSearch ? getHaystack(entry).includes(token.value) : false;
  }
}

export function evaluateFilter(
  entry: MonitorEntry,
  parsed: ParsedFilter,
  deepSearch: boolean,
): boolean {
  for (const token of parsed.tokens) {
    const hit = matchToken(entry, token, deepSearch);
    if (token.negated ? hit : !hit) return false;
  }
  return true;
}

/** Human-readable chips for the active filter bar. */
export function describeTokens(parsed: ParsedFilter): string[] {
  return parsed.tokens.map((t) => {
    const body = t.field === "text" ? t.value : `${t.field}:${t.value}`;
    return t.negated ? `not ${body}` : body;
  });
}

/**
 * Re-serializes a single token back to raw filter syntax, quoting
 * multi-word values so the result re-parses to the same token. Used to
 * rebuild the query string from `parsed.tokens` (e.g. after removing one
 * chip) instead of naively re-splitting the raw query on whitespace, which
 * desyncs from `tokens`/chips as soon as a value is quoted or a raw word was
 * dropped during parsing (e.g. a bare `-` or a `field:` with no value yet).
 */
export function tokenToRaw(t: FilterToken): string {
  const body = t.field === "text" ? t.value : `${t.field}:${t.value}`;
  const quoted = /\s/.test(body) ? `"${body}"` : body;
  return t.negated ? `-${quoted}` : quoted;
}
