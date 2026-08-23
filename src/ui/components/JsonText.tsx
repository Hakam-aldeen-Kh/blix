"use client";

/**
 * Dev Tools — the flat-text pane, with optional JSON syntax colouring.
 *
 * A pure renderer: it takes text that some other format already produced (raw
 * JSON, YAML, or a body that was a string to begin with) and paints it. The
 * size readout, wrap toggle and Copy live one level up in `DataView`, so they
 * sit in the same place whichever format is showing.
 *
 * The tokenizer emits React nodes rather than an HTML string; the previous
 * implementation built markup and passed it through `dangerouslySetInnerHTML`,
 * which worked only because it HTML-escaped first. Producing nodes removes that
 * class of risk entirely.
 */

import { useMemo } from "react";

const TOKEN_RE =
  /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

type Token = { text: string; cls: string | null };

function tokenize(json: string): Token[] {
  const out: Token[] = [];
  let last = 0;

  for (const match of json.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: json.slice(last, index), cls: null });

    const text = match[0];
    let cls = "nm-num";
    if (text.startsWith('"')) cls = text.trimEnd().endsWith(":") ? "nm-key" : "nm-str";
    else if (text === "true" || text === "false") cls = "nm-bool";
    else if (text === "null") cls = "nm-null";

    out.push({ text, cls });
    last = index + text.length;
  }

  if (last < json.length) out.push({ text: json.slice(last), cls: null });
  return out;
}

/** Beyond this the tokenizer is skipped and the text renders unstyled — the
 * regex pass is linear but the token array is not free, and nobody reads 2 MB
 * of raw JSON by eye anyway. */
const HIGHLIGHT_LIMIT = 512 * 1024;

export function JsonText({
  text,
  wrap = true,
  /** Off for YAML and for plain-text bodies: the tokenizer's rules are JSON's,
   * and running them over YAML mis-colours keys and unquoted scalars. */
  highlight = true,
}: {
  text: string;
  wrap?: boolean;
  highlight?: boolean;
}) {
  const tokens = useMemo(
    () => (highlight && text.length <= HIGHLIGHT_LIMIT ? tokenize(text) : null),
    [text, highlight],
  );

  return (
    <pre className={`nm-json nm-scroll${wrap ? "" : " nm-nowrap"}`}>
      {tokens
        ? tokens.map((token, i) =>
            token.cls ? (
              <span key={i} className={token.cls}>
                {token.text}
              </span>
            ) : (
              <span key={i}>{token.text}</span>
            ),
          )
        : text}
    </pre>
  );
}
