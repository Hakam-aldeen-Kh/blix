"use client";

/**
 * Dev Tools — the flat-text pane, with optional JSON syntax colouring and
 * code folding.
 *
 * A near-pure renderer: it takes text some other format already produced (raw
 * JSON, YAML, or a body that was a string to begin with) and paints it. The
 * size readout, wrap toggle and Copy live one level up in `DataView`, so they
 * sit in the same place whichever format is showing.
 *
 * **Folding.** The Tree view folds because it renders from the *value*; this
 * view renders from *text*, which is the point of it. Folding here therefore
 * finds its blocks the way an editor's does — on the lines — using the block
 * map from `helpers/jsonFold.ts`. It is offered only when that map is
 * non-empty, which means only for JSON and only below the line ceiling;
 * everything else takes the flat path below, unchanged.
 *
 * What is folded, though, is tracked exactly as the tree tracks what is
 * expanded: by the path a block occupies in the value, never by line number.
 * Lines are an accident of one serialization and move under you when the
 * payload is re-rendered; `$.user.tags` does not.
 *
 * The tokenizer emits React nodes rather than an HTML string; the previous
 * implementation built markup and passed it through `dangerouslySetInnerHTML`,
 * which worked only because it HTML-escaped first. Producing nodes removes that
 * class of risk entirely.
 */

import { useMemo } from "react";
import { blockLabel, foldSummary, type FoldMap } from "../helpers/jsonFold";

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

function Tokens({ text, highlight }: { text: string; highlight: boolean }) {
  const tokens = useMemo(
    () => (highlight && text.length <= HIGHLIGHT_LIMIT ? tokenize(text) : null),
    [text, highlight],
  );
  if (!tokens) return <>{text}</>;
  return (
    <>
      {tokens.map((token, i) =>
        token.cls ? (
          <span key={i} className={token.cls}>
            {token.text}
          </span>
        ) : (
          <span key={i}>{token.text}</span>
        ),
      )}
    </>
  );
}

export function JsonText({
  text,
  wrap = true,
  /** Off for YAML and for plain-text bodies: the tokenizer's rules are JSON's,
   * and running them over YAML mis-colours keys and unquoted scalars. */
  highlight = true,
  /** Block map from `analyzeFolds`. Absent means no folding at all. */
  folds,
  /** Folded blocks, by the path each occupies in the value — not by line.
   * See `DataView`: line numbers do not survive the payload re-serializing. */
  folded,
  onToggleFold,
}: {
  text: string;
  wrap?: boolean;
  highlight?: boolean;
  folds?: FoldMap | null;
  folded?: ReadonlySet<string>;
  onToggleFold?: (path: string) => void;
}) {
  const lines = useMemo(() => text.split("\n"), [text]);

  // Nothing foldable — keep the flat rendering, which is one element per token
  // run rather than one per line.
  if (!folds || folds.regions.length === 0 || !onToggleFold || !folded) {
    return (
      <pre className={`nm-json nm-scroll${wrap ? "" : " nm-nowrap"}`}>
        <Tokens text={text} highlight={highlight} />
      </pre>
    );
  }

  const rows: React.ReactNode[] = [];
  /** Only the first caret is a tab stop. Every caret being one meant a
   * thousand-line payload put a thousand stops between the pane and whatever
   * follows it — Tab could not get out of the JSON view. The rest are reached
   * with the arrow keys, as the rows of a foldable document should be. */
  let firstCaret = true;

  for (let i = 0; i < lines.length; ) {
    const region = folds.byStart.get(i);
    const isFolded = region != null && folded.has(region.path);
    const hidden = region ? region.end - region.start - 1 : 0;
    const key = region ? blockLabel(lines[i]) : "";
    const verb = isFolded ? "Expand" : "Collapse";

    rows.push(
      <div className="nm-jrow" key={i}>
        {region ? (
          <button
            className="nm-jcaret"
            aria-expanded={!isFolded}
            aria-label={key ? `${verb} ${key}` : verb}
            tabIndex={firstCaret ? 0 : -1}
            data-fold-caret=""
            title={isFolded ? `Expand — ${hidden} lines hidden` : "Collapse"}
            onClick={() => onToggleFold(region.path)}
          />
        ) : (
          <span className="nm-jcaret nm-jcaret-empty" aria-hidden />
        )}
        <span className="nm-jline">
          <Tokens text={lines[i]} highlight={highlight} />
          {isFolded && region && (
            <>
              {/* The whole collapsed stand-in is clickable, not just the
                  caret — the caret is 16px and this is the thing the eye is
                  already on. Not a tab stop: it does what the caret on its own
                  row already does. */}
              <button
                className="nm-jsum"
                tabIndex={-1}
                onClick={() => onToggleFold(region.path)}
                title={`Expand — ${hidden} lines hidden`}
              >
                {foldSummary(region)}
              </button>
              <Tokens text={lines[region.end].trimStart()} highlight={highlight} />
            </>
          )}
        </span>
      </div>,
    );

    if (region) firstCaret = false;
    i = isFolded && region ? region.end + 1 : i + 1;
  }

  /** Arrow keys walk the carets; left and right fold and unfold, matching the
   * payload tree next door. Read from the DOM rather than tracked in state,
   * so moving through a long document re-renders nothing. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-fold-caret]");
    if (!target) return;
    const carets = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("[data-fold-caret]"),
    );
    const at = carets.indexOf(target);
    if (at < 0) return;
    const go = (index: number) => {
      carets[Math.max(0, Math.min(carets.length - 1, index))]?.focus();
    };
    const isFolded = target.getAttribute("aria-expanded") === "false";

    switch (e.key) {
      case "ArrowDown":
        go(at + 1);
        break;
      case "ArrowUp":
        go(at - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(carets.length - 1);
        break;
      case "ArrowRight":
        if (isFolded) target.click();
        else go(at + 1);
        break;
      case "ArrowLeft":
        if (!isFolded) target.click();
        else go(at - 1);
        break;
      // Enter and Space are the button's own; leave them to it.
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div
      className={`nm-jfold nm-scroll${wrap ? "" : " nm-nowrap"}`}
      onKeyDown={onKeyDown}
    >
      {rows}
    </div>
  );
}
