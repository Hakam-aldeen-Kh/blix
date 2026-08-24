/**
 * Dev Tools — YAML rendering of captured payloads.
 *
 * Why a viewer would want YAML at all: JSON spends a lot of ink on structure.
 * A deeply nested config object or a settings response is markedly easier to
 * scan without the braces, quotes and trailing commas, and YAML's indentation
 * makes the shape of the data the most visible thing on screen. Multi-line
 * strings — stack traces, SQL, templates — stop being one long line of escaped
 * newlines and become readable text.
 *
 * **This is an emitter, not a serializer.** Its input is always JSON-shaped
 * data that came out of `JSON.parse` or a structured-clone-safe capture, so the
 * hard parts of YAML — anchors, aliases, tags, cyclic references, non-string
 * keys — cannot occur. What it does have to get right is quoting: a string
 * that would otherwise read back as a number, a boolean, a date or a
 * structural token must be quoted, or the rendering would misrepresent the
 * payload. That is most of the code below.
 *
 * Nothing round-trips through this — it is display and clipboard output only.
 */

/** Strings a YAML reader coerces to a non-string scalar. Quoting these is what
 * stops a payload's `"yes"`, `"null"` or `"1.0"` from silently changing type
 * on screen. */
const AMBIGUOUS =
  /^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|[-+]?\d[\d_]*(?:\.\d*)?(?:[eE][-+]?\d+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)|0[xXoObB][\da-fA-F_]+|\d{4}-\d{2}-\d{2}.*)$/;

/** Leading characters a YAML reader treats as an indicator, not as text. */
const LEADING_INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;

/**
 * Control characters have no plain YAML representation.
 *
 * Written as a code-point scan rather than a character-class regex on purpose:
 * a literal control range inside a regex literal makes this source file itself
 * contain control bytes, which tooling (and diffs, and `grep`) then treat as
 * binary. `newlineOk` lets the block-scalar check accept the one control
 * character that *does* have a representation.
 */
function hasControlChar(s: string, newlineOk = false): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code === 0x0a && newlineOk) continue;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function needsQuotes(s: string): boolean {
  return (
    s.length === 0 ||
    AMBIGUOUS.test(s) ||
    LEADING_INDICATOR.test(s) ||
    // `: ` opens a mapping and ` #` opens a comment, anywhere in the scalar.
    s.includes(": ") ||
    s.includes(" #") ||
    s.endsWith(":") ||
    // Leading or trailing space survives quoting only.
    s !== s.trim() ||
    hasControlChar(s)
  );
}

/** Single quotes are YAML's literal form — no escape processing at all, so the
 * only escape needed is a doubled quote. Preferred wherever it works, because
 * it leaves the payload's own backslashes visible as written. */
function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

const ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/**
 * The double-quoted form, which is the only YAML scalar style that can carry a
 * control character. Needed more often than it looks: a tab inside a value, or
 * a `\r\n` line ending on a payload captured from a Windows service, makes the
 * single-quoted form unparseable — the emitter used to produce exactly that.
 */
function doubleQuote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const mapped = ESCAPES[ch];
    if (mapped) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    out +=
      code < 0x20 || code === 0x7f
        ? `\\u${code.toString(16).padStart(4, "0")}`
        : ch;
  }
  return `${out}"`;
}

function isContainer(v: unknown): v is object {
  return typeof v === "object" && v !== null;
}

function isEmptyContainer(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  return isContainer(v) && Object.keys(v).length === 0;
}

/**
 * Renders a leaf. Also handles *empty* containers, which are leaves as far as
 * layout is concerned — `{}` and `[]` sit on the key's own line rather than
 * opening an indented block.
 */
function scalar(value: unknown, indent: string): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "[]";
  if (typeof value === "boolean") return String(value);

  if (typeof value === "number") {
    if (Number.isNaN(value)) return ".nan";
    if (value === Infinity) return ".inf";
    if (value === -Infinity) return "-.inf";
    return String(value);
  }

  if (typeof value === "string") {
    // A block scalar shows multi-line text as text. `|-` keeps the interior
    // newlines and strips the trailing one. Anything carrying *other* control
    // characters falls through to quoting instead.
    if (value.includes("\n") && !hasControlChar(value, true)) {
      const body = value
        .split("\n")
        .map((line) => (line ? `${indent}  ${line}` : ""))
        .join("\n");
      return `|-\n${body}`;
    }
    // Anything still carrying a control character has to be double-quoted;
    // single quotes would emit it raw and produce unparseable YAML.
    if (hasControlChar(value)) return doubleQuote(value);
    return needsQuotes(value) ? quote(value) : value;
  }

  if (isContainer(value)) return "{}";

  // undefined, functions, symbols — unreachable from captured data, but a
  // payload is `unknown` and this must not throw.
  return "null";
}

/** Rendered-line ceiling. The tree viewer has its own node cap for the same
 * reason: a 4 MB response must not become a million-line string on the main
 * thread just because a tab was clicked. */
export const YAML_MAX_LINES = 20_000;

export function toYaml(value: unknown): { text: string; truncated: boolean } {
  if (value === undefined) return { text: "", truncated: false };

  const out: string[] = [];
  let truncated = false;

  /** Returns false once the ceiling is hit, so callers can unwind. */
  const push = (line: string): boolean => {
    if (out.length >= YAML_MAX_LINES) {
      truncated = true;
      return false;
    }
    out.push(line);
    return true;
  };

  /**
   * Emits `v` at `indent`. `inline` is text already destined for the current
   * line — a `- ` from an enclosing sequence — that this value must follow, so
   * that a mapping nested in a sequence starts on the dash's own row the way
   * YAML is normally written by hand.
   */
  const walk = (v: unknown, indent: string, inline: string): void => {
    if (truncated) return;

    if (Array.isArray(v)) {
      if (v.length === 0) {
        push(`${inline}[]`);
        return;
      }
      // A sequence nested directly in another sequence needs the outer dash on
      // a line of its own.
      if (inline.trim() && !push(inline.trimEnd())) return;
      for (const item of v) {
        if (truncated) return;
        if (isContainer(item) && !isEmptyContainer(item)) {
          walk(item, `${indent}  `, `${indent}- `);
        } else if (!push(`${indent}- ${scalar(item, indent)}`)) {
          return;
        }
      }
      return;
    }

    if (isContainer(v)) {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) {
        push(`${inline}{}`);
        return;
      }
      let first = true;
      for (const [k, item] of entries) {
        if (truncated) return;
        const key = needsQuotes(k) ? quote(k) : k;
        // Only the first key joins the enclosing `- `; the rest indent under it.
        const prefix = first && inline.trimEnd().endsWith("-") ? inline : indent;
        first = false;

        if (isContainer(item) && !isEmptyContainer(item)) {
          if (!push(`${prefix}${key}:`)) return;
          // A sequence may sit at the same column as its key; a mapping may not.
          walk(item, Array.isArray(item) ? indent : `${indent}  `, "");
        } else if (!push(`${prefix}${key}: ${scalar(item, indent)}`)) {
          return;
        }
      }
      return;
    }

    push(`${inline}${scalar(v, indent)}`);
  };

  walk(value, "", "");
  return { text: out.join("\n"), truncated };
}
