/**
 * Dev Tools — a line-level diff, for rendering a change the way a diff is
 * normally read.
 *
 * The Redux diff already knows *which paths* changed; what it could not show
 * was *what inside them* changed, because a structural entry carries a whole
 * before and a whole after and nothing in between. Printed on one line that is
 * `{"items":[…]}` twice — technically the answer, useless as one.
 *
 * Pretty-printing both sides and diffing them by line turns that into the
 * thing everyone already knows how to read: unchanged lines for context,
 * removed lines, added lines.
 *
 * Plain LCS. A structural diff's values are small — a slice of state, not a
 * repository — and `GUARD` below is what keeps a pathological one from
 * becoming an O(n·m) table nobody asked for.
 */

export type LineOp = "context" | "del" | "add";

export interface DiffLine {
  op: LineOp;
  text: string;
  /** 1-based line number on the old side, or null on an added line. */
  before: number | null;
  /** 1-based line number on the new side, or null on a removed line. */
  after: number | null;
}

/**
 * Above this many lines on either side the table would cost more than the
 * result is worth, so the two sides are reported whole: everything removed,
 * then everything added. That is still a correct diff — just not a minimal
 * one — and it renders in the same shape.
 */
const GUARD = 600;

export function lineDiff(beforeText: string, afterText: string): DiffLine[] {
  const a = beforeText.length ? beforeText.split("\n") : [];
  const b = afterText.length ? afterText.split("\n") : [];

  if (a.length > GUARD || b.length > GUARD) return wholesale(a, b);

  // lcs[i][j] = length of the longest common subsequence of a[i…] and b[j…].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: "context", text: a[i], before: i + 1, after: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: "del", text: a[i], before: i + 1, after: null });
      i++;
    } else {
      out.push({ op: "add", text: b[j], before: null, after: j + 1 });
      j++;
    }
  }
  while (i < a.length) out.push({ op: "del", text: a[i], before: ++i, after: null });
  while (j < b.length) out.push({ op: "add", text: b[j], before: null, after: ++j });
  return out;
}

function wholesale(a: string[], b: string[]): DiffLine[] {
  return [
    ...a.map((text, n): DiffLine => ({ op: "del", text, before: n + 1, after: null })),
    ...b.map((text, n): DiffLine => ({ op: "add", text, before: null, after: n + 1 })),
  ];
}

/**
 * Collapses long stretches of unchanged lines, the way a diff viewer does.
 *
 * A changed leaf inside a hundred-line object is otherwise ninety-odd lines of
 * context you have to scroll past to find the three that moved.
 */
export function withHunks(lines: DiffLine[], context = 3): (DiffLine | { gap: number })[] {
  const keep = new Set<number>();
  lines.forEach((l, n) => {
    if (l.op === "context") return;
    for (let k = n - context; k <= n + context; k++) {
      if (k >= 0 && k < lines.length) keep.add(k);
    }
  });

  const out: (DiffLine | { gap: number })[] = [];
  let skipped = 0;
  lines.forEach((l, n) => {
    if (keep.has(n)) {
      if (skipped) {
        out.push({ gap: skipped });
        skipped = 0;
      }
      out.push(l);
    } else {
      skipped++;
    }
  });
  if (skipped) out.push({ gap: skipped });
  return out;
}
