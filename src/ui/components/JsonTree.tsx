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
import {
  ARRAY_PAGE,
  INLINE_STRING_CAP,
  MAX_RENDERED_NODES,
} from "../constants/ui";
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
  subtreePaths,
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

  const LIMIT = INLINE_STRING_CAP;
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
  isOpen: (path: string) => boolean;
  toggle: (path: string, value: unknown, deep: boolean) => void;
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
  isOpen,
  toggle,
  shown,
  showMore,
  budget,
}: NodeProps) {
  if (!budget.take()) return null;

  const kind = kindOf(value);
  const open = isOpen(path);
  const canExpand = isExpandable(value);

  /** A row is a click target *and* a block of selectable text. A drag that
   * ends inside the row finishes as a click, so without this, selecting a key
   * to copy it collapses the object you were reading. */
  const onClick = (e: React.MouseEvent) => {
    const selection = typeof window === "undefined" ? null : window.getSelection();
    if (selection && !selection.isCollapsed) return;
    // Alt-click walks the whole subtree, as it does in Chrome's tree.
    toggle(path, value, e.altKey);
  };

  const row = (
    <div
      className={`nm-tree-row${canExpand ? " nm-tree-open" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={canExpand ? open : undefined}
      // Roving focus: the tree is entered at its root row and walked with the
      // arrow keys, rather than putting every one of a few thousand rows in
      // the page's tab order.
      tabIndex={path === ROOT ? 0 : -1}
      data-path={path}
      data-tree-focus=""
      // Only the root carries the hint. On every row it is a tooltip that
      // pops up wherever the pointer rests while you read, which is worse
      // than the discoverability it buys; the root is the one row always in
      // view, and the cheatsheet has it too.
      title={
        canExpand && path === ROOT
          ? "Click to expand · Alt-click for everything below"
          : undefined
      }
      onClick={canExpand ? onClick : undefined}
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
          isOpen={isOpen}
          toggle={toggle}
          shown={shown}
          showMore={showMore}
          budget={budget}
        />
      ))}
      {remaining > 0 && (
        <button
          className="nm-tree-more"
          style={{ paddingLeft: 22 + depth * 14 }}
          role="treeitem"
          aria-level={depth + 2}
          tabIndex={-1}
          data-tree-focus=""
          onClick={() => showMore(path)}
        >
          Show {Math.min(ARRAY_PAGE, remaining)} more ({remaining} remaining)
        </button>
      )}
    </>
  );
}

/**
 * What the reader has changed about *this* payload's tree.
 *
 * `overrides` is a map, not a set of open paths, because open and closed are
 * not each other's absence here: a search match auto-opens a node, and
 * collapsing it has to mean "closed" rather than "no opinion" — otherwise the
 * next render re-opens it from the search set and the node cannot be closed at
 * all while a filter is active. `undefined` is the third state: defer to the
 * search set, then to the default expansion.
 *
 * `key` is the entry it belongs to. Comparing it during render, rather than
 * clearing state in an effect, is what makes switching requests actually
 * reset: an effect runs *after* a render that has already drawn the previous
 * entry's expansion over the new payload.
 */
interface TreeState {
  key: string;
  overrides: Map<string, boolean>;
  /** How many children of a paged array are rendered, by path. */
  shown: Map<string, number>;
}

const freshState = (key: string): TreeState => ({
  key,
  overrides: new Map(),
  shown: new Map(),
});

/** Stand-in while the stored state belongs to a previous entry. Shared, so a
 * payload nobody has touched yet does not allocate two maps per render — and
 * safe to share because every write copies rather than mutates. */
const NO_STATE: TreeState = freshState("");

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
  const [stored, setStored] = useState<TreeState>(() => freshState(entryId));
  const { overrides, shown } = stored.key === entryId ? stored : NO_STATE;

  // One bounded DFS per (entry, settled query) — never per keystroke per node.
  const searchPaths = useMemo(
    () => (query ? pathsToMatches(value, query, ROOT) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entryId, query],
  );

  const isOpen = useCallback(
    (path: string): boolean => {
      const override = overrides.get(path);
      if (override !== undefined) return override;
      if (searchPaths?.has(path)) return true;
      return seed.has(path);
    },
    [overrides, searchPaths, seed],
  );

  const toggle = useCallback(
    (path: string, node: unknown, deep: boolean) => {
      const open = !isOpen(path);
      setStored((prev) => {
        const base = prev.key === entryId ? prev : freshState(entryId);
        const next = new Map(base.overrides);
        if (deep) {
          // Written for every descendant rather than only the root of the
          // subtree, so re-opening an Alt-collapsed object finds it collapsed
          // all the way down instead of springing back to whatever the default
          // expansion or the search had opened.
          for (const descendant of subtreePaths(node, path)) {
            next.set(descendant, open);
          }
        } else {
          next.set(path, open);
        }
        return { ...base, key: entryId, overrides: next };
      });
    },
    [entryId, isOpen],
  );

  const showMore = useCallback(
    (path: string) => {
      setStored((prev) => {
        const base = prev.key === entryId ? prev : freshState(entryId);
        const next = new Map(base.shown);
        next.set(path, (next.get(path) ?? ARRAY_PAGE) + ARRAY_PAGE);
        return { ...base, key: entryId, shown: next };
      });
    },
    [entryId],
  );

  /**
   * Arrow-key navigation over the flat row list, per the tree pattern: up and
   * down walk rows, right opens or descends, left closes or climbs. The rows
   * are read from the DOM rather than tracked in state — moving focus through
   * a few thousand nodes must not re-render the tree to do it.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-tree-focus]");
    if (!target) return;

    const rows = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("[data-tree-focus]"),
    );
    const at = rows.indexOf(target);
    if (at < 0) return;
    const expanded = target.getAttribute("aria-expanded");
    const go = (index: number) => {
      rows[Math.max(0, Math.min(rows.length - 1, index))]?.focus();
    };

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
        go(rows.length - 1);
        break;
      case "ArrowRight":
        if (expanded === "false") target.click();
        else go(at + 1);
        break;
      case "ArrowLeft": {
        if (expanded === "true") {
          target.click();
          break;
        }
        // Climb to the parent: the nearest row above at a shallower level.
        const level = Number(target.getAttribute("aria-level") ?? 1);
        for (let i = at - 1; i >= 0; i -= 1) {
          if (Number(rows[i].getAttribute("aria-level") ?? 1) < level) {
            rows[i].focus();
            break;
          }
        }
        break;
      }
      case "Enter":
      case " ":
        // A leaf row has no `aria-expanded` and nothing to activate; leave the
        // key alone so it still scrolls or types where it should.
        if (expanded === null) return;
        target.click();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

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
    countVisible(value, isOpen, shown, MAX_RENDERED_NODES + 1, ROOT) >
    MAX_RENDERED_NODES;

  return (
    <div className="nm-tree nm-scroll" onKeyDown={onKeyDown}>
      {/* The tree role goes on an inner element so the truncation notice
          below is not a stray non-item child of it. */}
      <div role="tree" aria-label="Payload">
        <JsonNode
          // Keyed by entry so the per-node state React owns — a long string
          // expanded behind its "+2 KB" chip — resets with everything else
          // instead of landing on whatever sits at that position next.
          key={entryId}
          label={Array.isArray(value) ? "root[]" : "root"}
          value={value}
          path={ROOT}
          depth={0}
          query={query}
          isOpen={isOpen}
          toggle={toggle}
          shown={shown}
          showMore={showMore}
          budget={budget}
        />
      </div>
      {overflowed && (
        <div className="nm-tree-cap">
          Output truncated at {MAX_RENDERED_NODES} nodes — switch to the JSON or
          Text format for everything.
        </div>
      )}
    </div>
  );
}
