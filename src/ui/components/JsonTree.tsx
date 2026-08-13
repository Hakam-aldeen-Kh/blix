"use client";

/**
 * Dev Tools — collapsible JSON tree.
 *
 * Nodes render lazily off the original value and are keyed by path; children
 * exist in the DOM only while their parent is expanded. A collapsed 4 MB
 * subtree therefore costs exactly one row, which is what keeps an
 * `/attachments/get` response from freezing the panel.
 *
 * No virtualization inside the tree: collapsed-by-default, array paging and a
 * hard node cap bound the rendered row count without the cost of a
 * variable-depth virtualizer.
 */

import { isTruncationMarker } from "../../capture/monitorTruncate";
import { useCallback, useMemo, useState } from "react";
import { ARRAY_PAGE, MAX_RENDERED_NODES } from "../constants/ui";
import { formatBytes } from "../helpers/format";
import {
  childPath,
  countVisible,
  defaultExpansion,
  isExpandable,
  isLargeBase64,
  kindOf,
  pathsToMatches,
  splitHighlight,
  summarize,
} from "../helpers/jsonTree";
import { Icon } from "./Icon";

const ROOT = "$";

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {splitHighlight(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="nm-mark">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function StringValue({ value, query }: { value: string; query: string }) {
  const [expanded, setExpanded] = useState(false);

  // Base64 blobs are never painted as text — that is the single easiest way to
  // lock up the panel on file-attachment responses.
  if (isLargeBase64(value)) {
    return (
      <span className="nm-tree-blob">
        «base64, {formatBytes(value.length)}»
        <button
          className="nm-tree-chip"
          onClick={() => void navigator.clipboard?.writeText(value)}
        >
          Copy
        </button>
        {value.startsWith("data:") && (
          <button
            className="nm-tree-chip"
            onClick={() => window.open(value, "_blank", "noopener")}
          >
            Open
          </button>
        )}
      </span>
    );
  }

  const LIMIT = 200;
  if (value.length <= LIMIT || expanded) {
    return (
      <span className="nm-tree-str">
        &quot;
        <Highlighted text={value} query={query} />
        &quot;
        {expanded && value.length > LIMIT && (
          <button className="nm-tree-chip" onClick={() => setExpanded(false)}>
            Less
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="nm-tree-str">
      &quot;
      <Highlighted text={value.slice(0, LIMIT)} query={query} />…&quot;
      <button className="nm-tree-chip" onClick={() => setExpanded(true)}>
        +{formatBytes(value.length - LIMIT)}
      </button>
    </span>
  );
}

function TruncatedChip({ value }: { value: Record<string, unknown> }) {
  const bytes = typeof value.bytes === "number" ? value.bytes : undefined;
  const omitted = typeof value.omitted === "number" ? value.omitted : undefined;
  const head = typeof value.head === "string" ? value.head : undefined;
  return (
    <span className="nm-tree-trunc" title="Trimmed when this entry was saved">
      {head ? `"${head.slice(0, 80)}…"` : ""} «truncated for persistence
      {bytes ? ` — ${formatBytes(bytes)}` : ""}
      {omitted ? ` — ${omitted} omitted` : ""}»
    </span>
  );
}

/**
 * Render budget, as a closure created by the tree root.
 *
 * A plain mutable counter passed down as a prop would be simpler, but mutating
 * a prop is (rightly) forbidden — so the counter lives in the parent's closure
 * and children only *call* into it.
 */
function makeBudget(limit: number) {
  let left = limit;
  return {
    take(): boolean {
      if (left <= 0) return false;
      left -= 1;
      return true;
    },
    exhausted(): boolean {
      return left <= 0;
    },
  };
}

type Budget = ReturnType<typeof makeBudget>;

interface NodeProps {
  label: string;
  value: unknown;
  path: string;
  depth: number;
  query: string;
  expanded: Set<string>;
  toggle: (path: string) => void;
  shown: Map<string, number>;
  showMore: (path: string) => void;
  budget: Budget;
}

function JsonNode({
  label,
  value,
  path,
  depth,
  query,
  expanded,
  toggle,
  shown,
  showMore,
  budget,
}: NodeProps) {
  if (!budget.take()) return null;

  const kind = kindOf(value);
  const open = expanded.has(path);
  const canExpand = isExpandable(value);

  const row = (
    <div
      className={`nm-tree-row${canExpand ? " nm-tree-open" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={canExpand ? () => toggle(path) : undefined}
    >
      {canExpand ? (
        <span className={`nm-tree-caret${open ? " open" : ""}`}>
          <Icon name="chevron" size={11} />
        </span>
      ) : (
        <span className="nm-tree-caret nm-tree-caret-empty" />
      )}

      <span className="nm-tree-key">
        <Highlighted text={label} query={query} />
      </span>
      <span className="nm-tree-colon">:</span>

      {kind === "truncated" ? (
        <TruncatedChip value={value as Record<string, unknown>} />
      ) : canExpand ? (
        <span className="nm-tree-summary">{summarize(value)}</span>
      ) : kind === "string" ? (
        <StringValue value={value as string} query={query} />
      ) : kind === "array" || kind === "object" ? (
        <span className="nm-tree-summary">{summarize(value)}</span>
      ) : (
        <span className={`nm-tree-${kind}`}>
          <Highlighted text={String(value)} query={query} />
        </span>
      )}
    </div>
  );

  if (!canExpand || !open) return row;

  const isArray = Array.isArray(value);
  const allEntries: [string | number, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [i, v])
    : Object.entries(value as Record<string, unknown>);

  // Arrays page in ARRAY_PAGE at a time so a 10 000-element response never
  // becomes 10 000 DOM rows.
  const limit = shown.get(path) ?? ARRAY_PAGE;
  const visible = isArray ? allEntries.slice(0, limit) : allEntries;
  const remaining = allEntries.length - visible.length;

  return (
    <>
      {row}
      {visible.map(([key, child]) => (
        <JsonNode
          key={String(key)}
          label={String(key)}
          value={child}
          path={childPath(path, key)}
          depth={depth + 1}
          query={query}
          expanded={expanded}
          toggle={toggle}
          shown={shown}
          showMore={showMore}
          budget={budget}
        />
      ))}
      {remaining > 0 && (
        <div
          className="nm-tree-more"
          style={{ paddingLeft: 22 + depth * 14 }}
          onClick={() => showMore(path)}
        >
          Show {Math.min(ARRAY_PAGE, remaining)} more ({remaining} remaining)
        </div>
      )}
    </>
  );
}

export function JsonTree({
  value,
  query = "",
  entryId,
}: {
  value: unknown;
  query?: string;
  entryId: string;
}) {
  // Re-deriving the default expansion per entry+tab means switching requests
  // never inherits the previous one's open state.
  const seed = useMemo(
    () => defaultExpansion(value, ROOT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entryId],
  );
  const [manual, setManual] = useState<Set<string> | null>(null);
  const [shown, setShown] = useState<Map<string, number>>(() => new Map());

  // One bounded DFS per (entry, settled query) — never per keystroke per node.
  const searchPaths = useMemo(
    () => (query ? pathsToMatches(value, query, ROOT) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entryId, query],
  );

  const expanded = useMemo(() => {
    const base = manual ?? seed;
    if (!searchPaths || searchPaths.size === 0) return base;
    const merged = new Set(base);
    searchPaths.forEach((p) => merged.add(p));
    return merged;
  }, [manual, seed, searchPaths]);

  const toggle = useCallback(
    (path: string) => {
      setManual((prev) => {
        const next = new Set(prev ?? expanded);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    [expanded],
  );

  const showMore = useCallback((path: string) => {
    setShown((prev) => {
      const next = new Map(prev);
      next.set(path, (next.get(path) ?? ARRAY_PAGE) + ARRAY_PAGE);
      return next;
    });
  }, []);

  if (value === undefined) {
    return <div className="nm-empty">— not captured —</div>;
  }
  if (isTruncationMarker(value)) {
    return (
      <div className="nm-tree nm-scroll">
        <TruncatedChip value={value as unknown as Record<string, unknown>} />
      </div>
    );
  }

  const budget = makeBudget(MAX_RENDERED_NODES);
  // Counted up front: children render after this component returns, so the
  // budget closure can't tell us here whether the cap will be hit.
  const overflowed =
    countVisible(value, expanded, shown, MAX_RENDERED_NODES + 1, ROOT) >
    MAX_RENDERED_NODES;

  return (
    <div className="nm-tree nm-scroll">
      <JsonNode
        label={Array.isArray(value) ? "root[]" : "root"}
        value={value}
        path={ROOT}
        depth={0}
        query={query}
        expanded={expanded}
        toggle={toggle}
        shown={shown}
        showMore={showMore}
        budget={budget}
      />
      {overflowed && (
        <div className="nm-tree-cap">
          Output truncated at {MAX_RENDERED_NODES} nodes — use the Response tab
          for the raw text.
        </div>
      )}
    </div>
  );
}
