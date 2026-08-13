"use client";

/**
 * Dev Tools — raw JSON text viewer with syntax colouring.
 *
 * The tokenizer emits React nodes rather than an HTML string; the previous
 * implementation built markup and passed it through `dangerouslySetInnerHTML`,
 * which worked only because it HTML-escaped first. Producing nodes removes that
 * class of risk entirely.
 */

import { useMemo, useState } from "react";
import { copyText, formatBytes } from "../helpers/format";

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

export function JsonText({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(true);

  const text = useMemo(() => {
    if (value === undefined) return null;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  const tokens = useMemo(
    () => (text && text.length <= HIGHLIGHT_LIMIT ? tokenize(text) : null),
    [text],
  );

  if (text === null) {
    return <div className="nm-empty">— not captured —</div>;
  }

  const lines = text.split("\n").length;

  const copy = () => {
    void copyText(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="nm-json-wrap">
      <div className="nm-json-toolbar">
        <span className="nm-json-size">
          {formatBytes(text.length)} · {lines} {lines === 1 ? "line" : "lines"}
          {tokens === null && " · highlighting off (large)"}
        </span>
        <button
          className={`nm-copy nm-toggle${wrap ? " active" : ""}`}
          onClick={() => setWrap((w) => !w)}
          title="Toggle line wrapping"
        >
          Wrap
        </button>
        <button className="nm-copy" onClick={copy}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
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
    </div>
  );
}
