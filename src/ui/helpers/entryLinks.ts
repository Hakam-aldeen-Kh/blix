/**
 * Dev Tools — cross-source correlation.
 *
 * The panel already knows three facts that tie entries in different sections
 * together: which query caused an HTTP request (`ownerId`, resolved
 * best-effort by `monitorContext.ts`), which requests a query caused
 * (`query.causedIds`), and which request a replay came from (`replayOf`).
 *
 * Each of those used to surface in exactly one direction and in exactly one
 * place — a notice above the tabs, a list inside the Query State tab — so a
 * request never mentioned the query behind it unless you happened to be
 * looking at the query. This module makes the relation symmetric and indexes
 * it once per buffer change, which is what lets a row show a tick and the
 * detail pane show a chip you can step through.
 *
 * Links are only ever *observed*. Absence means "not known", never "not
 * related" — see `monitorContext.ts` for why the HTTP→query direction is
 * best-effort.
 */

import type { MonitorEntry } from "../../capture/networkMonitor";
import { requestName } from "./format";
import type { Section } from "../types/monitorUi";

/** Which top-level section an entry belongs to. */
export function sectionOf(entry: MonitorEntry): Section {
  switch (entry.kind ?? "http") {
    case "ws":
      return "realtime";
    case "redux":
      return "redux";
    case "query":
      return "query";
    default:
      return "network";
  }
}

export interface LinkGraph {
  /** Entry id → the ids it is related to, in both directions. */
  edges: Map<string, string[]>;
  /**
   * Entry id → its links' sections, comma-joined.
   *
   * A string rather than an array on purpose: the row component is memoized,
   * and a freshly-built array per row would change identity on every captured
   * event and re-render the whole visible list. A primitive compares by value
   * and holds the memo.
   */
  tags: Map<string, string>;
  byId: Map<string, MonitorEntry>;
}

const EMPTY: LinkGraph = { edges: new Map(), tags: new Map(), byId: new Map() };

export function buildLinkGraph(entries: MonitorEntry[]): LinkGraph {
  if (entries.length === 0) return EMPTY;

  const byId = new Map(entries.map((e) => [e.id, e]));
  const edges = new Map<string, string[]>();

  const join = (a: string, b: string) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      const list = edges.get(from);
      if (!list) edges.set(from, [to]);
      else if (!list.includes(to)) list.push(to);
    }
  };

  for (const e of entries) {
    if (e.ownerId) join(e.id, e.ownerId);
    if (e.replayOf) join(e.id, e.replayOf);
    for (const caused of e.query?.causedIds ?? []) join(e.id, caused);
  }

  const tags = new Map<string, string>();
  for (const [id, linked] of edges) {
    const sections = new Set<Section>();
    for (const other of linked) {
      const entry = byId.get(other);
      if (entry) sections.add(sectionOf(entry));
    }
    if (sections.size) tags.set(id, [...sections].join(","));
  }

  return { edges, tags, byId };
}

/** The entries `id` is related to, newest-first as the buffer holds them. */
export function linkedEntries(id: string, graph: LinkGraph): MonitorEntry[] {
  const out: MonitorEntry[] = [];
  for (const other of graph.edges.get(id) ?? []) {
    const entry = graph.byId.get(other);
    if (entry) out.push(entry);
  }
  return out;
}

/** A chip-sized description of an entry, for use where it is being referred
 * to from somewhere else rather than shown in its own row. */
export function linkLabel(entry: MonitorEntry): string {
  switch (entry.kind ?? "http") {
    case "redux": {
      const n = entry.redux?.diff?.changes.length ?? 0;
      return n ? `${entry.url} · ±${n}` : entry.url;
    }
    case "query":
      return `${entry.url} · ${entry.query?.status ?? entry.state}`;
    case "ws":
      return `${entry.transport ?? "socket"} ${requestName(entry.url)}`;
    default:
      return `${entry.method} ${requestName(entry.url)} · ${
        entry.status ?? (entry.state === "aborted" ? "⊘" : "—")
      }`;
  }
}
