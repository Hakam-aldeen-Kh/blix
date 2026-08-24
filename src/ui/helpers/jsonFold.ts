/**
 * Dev Tools — finding the foldable blocks in pretty-printed JSON.
 *
 * The Tree view folds because it renders from the *value*. The JSON view
 * renders from *text*, which is the point of it — you are looking at the
 * literal bytes — so folding there means finding the blocks in the text
 * itself, the way an editor's code folding does.
 *
 * That is normally the hard version of this problem. Here it is not, because
 * the text is never arbitrary JSON: it is always the output of
 * `JSON.stringify(value, null, 2)`, which guarantees far more than the JSON
 * grammar does.
 *
 *  - Every newline is structural. Newlines inside strings are escaped as `\n`,
 *    so a line never continues into the next one.
 *  - Indentation is exactly two spaces per level, so depth is arithmetic
 *    rather than something to track with a parser.
 *  - A line opens a block if and only if its last character is `{` or `[`. A
 *    string value ending in a brace still ends the line with `"` or `,`,
 *    because the value is quoted and any sibling adds a comma after it.
 *  - An empty object or array is emitted inline as `{}` / `[]`, so it never
 *    opens a block that would immediately close.
 *
 * Those four facts are what let this be a single linear pass with no parser
 * and no lookahead beyond a stack. It is only valid for `JSON.stringify`
 * output with a two-space indent — do not point it at hand-written JSON.
 *
 * Each block also gets the path it occupies in the value, built with the
 * tree's own `childPath`, so folded state can be stored the way the tree
 * stores expansion: against the structure, not against line numbers.
 */

import { childPath } from "./jsonTree";

export interface FoldRegion {
  /** Index of the line that opens the block. */
  start: number;
  /** Index of the line that closes it. */
  end: number;
  kind: "object" | "array";
  /** Direct children, for the collapsed summary. */
  count: number;
  /** Nesting level, 0 for the outermost block. Drives "Fold all", which
   * leaves the outermost open — collapsing that too would leave one line. */
  depth: number;
  /**
   * Where the block sits in the *value*, e.g. `$.user.tags[0]` — the same
   * address the payload tree keys its expansion by, built with the same
   * `childPath`.
   *
   * This is what the folded/unfolded state is stored against. Line numbers
   * are a property of one particular serialization: re-render the same store
   * with one counter changed and every line below it can shift, so folds
   * keyed by line either vanish or, worse, land on whatever moved into that
   * position. The tree has never had that problem because it addresses nodes
   * structurally, and this is that model applied here.
   */
  path: string;
}

/** The address of the outermost block. Matches the tree's root, so the two
 * views speak the same paths. */
const ROOT_PATH = "$";

export interface FoldMap {
  /** Regions keyed by their opening line, which is what a click resolves. */
  byStart: Map<number, FoldRegion>;
  regions: FoldRegion[];
}

const EMPTY: FoldMap = { byStart: new Map(), regions: [] };

/**
 * Above this many lines, folding is not offered and the viewer falls back to
 * flat text.
 *
 * Folding needs one DOM element per line to hang a gutter on, where the flat
 * rendering needs one per *token run*. On a payload big enough for that to
 * matter, the answer was always the Tree view — which pays nothing for a
 * collapsed subtree — so this ceiling costs nothing real and keeps the JSON
 * view as cheap as it is today for the payloads that stress it.
 */
export const FOLD_MAX_LINES = 4000;

/** Leading spaces / 2. Exact for `JSON.stringify` output. */
function indentOf(line: string): number {
  let spaces = 0;
  while (spaces < line.length && line.charCodeAt(spaces) === 32) spaces++;
  return spaces >> 1;
}

function opensBlock(line: string): "object" | "array" | null {
  const last = line.charCodeAt(line.length - 1);
  if (last === 123 /* { */) return "object";
  if (last === 91 /* [ */) return "array";
  return null;
}

/** A closing line is `}` / `]`, optionally with a trailing comma. */
function closesBlock(line: string, from: number): boolean {
  const ch = line.charCodeAt(from);
  return ch === 125 /* } */ || ch === 93 /* ] */;
}

/**
 * The key a child line declares — `  "a\"b": 1` → `a"b`.
 *
 * Parsed back through `JSON.parse` rather than read as raw text, so the path
 * this builds carries the *real* key and matches what the tree builds from the
 * value. Returns `null` for an array element, which declares no key.
 */
function keyOf(line: string, from: number): string | null {
  if (line.charCodeAt(from) !== 34 /* " */) return null;
  for (let i = from + 1; i < line.length; i += 1) {
    const ch = line.charCodeAt(i);
    if (ch === 92 /* \ */) {
      i += 1;
      continue;
    }
    if (ch === 34) {
      try {
        return JSON.parse(line.slice(from, i + 1)) as string;
      } catch {
        return line.slice(from + 1, i);
      }
    }
  }
  return null;
}

export function analyzeFolds(lines: string[], rootPath = ROOT_PATH): FoldMap {
  if (lines.length > FOLD_MAX_LINES) return EMPTY;

  const byStart = new Map<number, FoldRegion>();
  const regions: FoldRegion[] = [];
  /** Open blocks, innermost last. `count` accumulates as children are seen,
   * and doubles as the next index while the block is an array. */
  const stack: {
    start: number;
    indent: number;
    kind: "object" | "array";
    count: number;
    path: string;
  }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = indentOf(line);
    const firstChar = indent * 2;
    const isClose = closesBlock(line, firstChar);

    // Close before counting: a `}` at the parent's child indent belongs to the
    // block it terminates, not to the parent as a new child.
    if (isClose) {
      const open = stack.pop();
      if (open) {
        const region: FoldRegion = {
          start: open.start,
          end: i,
          kind: open.kind,
          count: open.count,
          depth: stack.length,
          path: open.path,
        };
        byStart.set(region.start, region);
        regions.push(region);
      }
      continue;
    }

    // Any non-closing line at the innermost block's child level is one of its
    // direct entries, and its path is the parent's plus its key or index.
    const top = stack[stack.length - 1];
    let path = rootPath;
    if (top && indent === top.indent + 1) {
      const key = top.kind === "array" ? null : keyOf(line, firstChar);
      path = childPath(top.path, key ?? top.count);
      top.count += 1;
    }

    const kind = opensBlock(line);
    if (kind) stack.push({ start: i, indent, kind, count: 0, path });
  }

  return { byStart, regions };
}

/**
 * The key a block hangs off, for the caret's accessible name — `"user"` from
 * `  "user": {`. Without it a screen reader hears "Collapse, button" once per
 * foldable line and has no way to tell which is which.
 *
 * An array element opens with a bare `{`, which has no key; the caller falls
 * back to the plain verb there.
 */
export function blockLabel(line: string): string {
  const head = line
    .trim()
    .replace(/[[{]$/, "")
    .trim()
    .replace(/:$/, "")
    .trim();
  return head.startsWith('"') && head.endsWith('"') && head.length > 1
    ? head.slice(1, -1)
    : "";
}

/** `… 5 keys` — the stand-in shown between a folded block's brackets. No
 * padding of its own: the element that renders it supplies that. */
export function foldSummary(region: Pick<FoldRegion, "kind" | "count">): string {
  const noun =
    region.kind === "object"
      ? region.count === 1
        ? "key"
        : "keys"
      : region.count === 1
        ? "item"
        : "items";
  return `… ${region.count} ${noun}`;
}
