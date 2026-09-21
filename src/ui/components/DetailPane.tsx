"use client";

/** Dev Tools — the detail pane: request summary plus tabbed payloads. */

import { summarizeInitiator } from "../../capture/monitorInitiator";
import { networkMonitor, type MonitorEntry } from "../../capture/networkMonitor";
import { HeadersTable } from "./HeadersTable";
import { useContext, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BlixContext } from "../BlixContext";
import { accentKey } from "../constants/ui";
import {
  clock,
  copyText,
  entryStatusLabel,
  formatBytes,
  formatDuration,
  splitRoute,
  statusText,
  statusTone,
} from "../helpers/format";
import { linkLabel, sectionOf } from "../helpers/entryLinks";
import { useMeasuredSize } from "../hooks/useMeasuredSize";
import { canActOnQuery, invalidateQuery } from "../services/queryActions";
import { canRedispatch, redispatchAction } from "../services/reduxActions";
import { canReplay, replayEntry } from "../services/replayRequest";
import { toCurl } from "../services/snippets";
import type { DataFormat, Resolved, SectionNouns, Tab } from "../types/monitorUi";
import { DiffTab } from "./tabs/DiffTab";
import { DataView, PayloadToolbarSlot } from "./DataView";
import { Icon } from "./Icon";
import { ScrollStrip } from "./ScrollStrip";
import { MessagesTab } from "./tabs/MessagesTab";
import { TimingTab } from "./tabs/TimingTab";

/**
 * "Preview" and "Response" used to be separate tabs over the same field — one
 * rendering it as a tree, the other as raw JSON. Now that the viewer carries a
 * format switch, they are one tab and the reader picks the rendering.
 */
const HTTP_TABS: { id: Tab; label: string }[] = [
  { id: "preview", label: "Response" },
  { id: "payload", label: "Payload" },
  { id: "headers", label: "Headers" },
  { id: "timing", label: "Timing" },
  { id: "initiator", label: "Initiator" },
];

/**
 * The Encrypted tab is conditional, not part of the fixed set.
 *
 * Blix cannot produce ciphertext on its own — it only ever holds what a host
 * pushed in via `captureEncrypted`. For every app that never calls it (which
 * is every app by default) the tab had nothing to show, so it is not offered
 * at all rather than offered empty. Both variants are module constants so the
 * choice costs no allocation per render.
 */
const HTTP_TABS_ENCRYPTED: { id: Tab; label: string }[] = [
  ...HTTP_TABS,
  { id: "raw", label: "Encrypted" },
];

/** Whether this entry actually carries a host-pushed ciphertext. */
function hasEncrypted(entry: MonitorEntry): boolean {
  return entry.encryptedRequest != null || entry.encryptedResponse != null;
}

/** A realtime connection has no payload, headers or encryption envelope of its
 * own — only its frames and how long it has been open. */
const WS_TABS: { id: Tab; label: string }[] = [
  { id: "messages", label: "Messages" },
  { id: "headers", label: "Connection" },
];

/** A Redux action reuses the generic "payload" and "initiator" tab bodies
 * (relabeled) rather than needing bespoke ones — only the diff and the live
 * state view are genuinely new. */
const REDUX_TABS: { id: Tab; label: string }[] = [
  { id: "payload", label: "Action" },
  { id: "diff", label: "Diff" },
  { id: "reduxState", label: "State" },
  { id: "initiator", label: "Dispatched by" },
];

/** A query/mutation row reuses "payload" (its key/variables) and "preview"
 * (its data/error) — see `entry.requestPayload`/`entry.responsePayload`,
 * populated by `queryCapture.ts` — plus "messages" for its lifecycle frames. */
const QUERY_TABS: { id: Tab; label: string }[] = [
  { id: "payload", label: "Key" },
  { id: "preview", label: "Data" },
  { id: "queryState", label: "State" },
  { id: "messages", label: "Timeline" },
];

/** What a slice holds, for the chip's tooltip — a rough sense of its size
 * without having to open it. */
function sliceSize(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  }
  if (typeof value === "object") {
    const n = Object.keys(value).length;
    return `${n} ${n === 1 ? "key" : "keys"}`;
  }
  return typeof value;
}

/**
 * The live Redux store, scoped to one slice at a time.
 *
 * Reads the store rather than anything captured — the entry only carries a
 * bounded diff, never a snapshot, so this is the one place a developer sees
 * the *current* full state and not just what one action changed. Subscribes
 * directly, so it stays live while the tab is open.
 *
 * **The slice picker is navigation, not a setting**, which is why it gets its
 * own bar above the format toolbar rather than a slot inside it. A real store
 * is a dozen reducers wide with names like `cifCorporateSlice`; sharing a row
 * with the format switch left it clipping names mid-word and squeezing the
 * size readout into a column narrow enough to wrap.
 *
 * **It opens where the action landed.** Until the developer picks a slice, the
 * tab shows the one this action changed — the question being asked, almost
 * always, is "what does the state look like *now*, where this action hit".
 * Falling back to the root meant answering that by hunting through a collapsed
 * object. An explicit pick sticks, including a pick of `root`.
 */
function ReduxStateTab({
  entry,
  query,
  format,
  onFormat,
}: {
  entry: MonitorEntry;
  query: string;
  format: DataFormat;
  onFormat: (format: DataFormat) => void;
}) {
  const { store } = useContext(BlixContext);
  // `undefined` is "not chosen yet" and defers to the action; `null` is an
  // explicit choice of the root. The two must stay distinguishable or the
  // default would fight the developer every time they clicked root.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const noop = () => () => {};
  const nullSnapshot = () => null;
  const state = useSyncExternalStore(
    store?.subscribe ?? noop,
    store?.getState ?? nullSnapshot,
    store?.getState ?? nullSnapshot,
  );

  if (!store) return <div className="nm-empty">— Redux store not provided —</div>;

  const isRootObject =
    typeof state === "object" && state !== null && !Array.isArray(state);
  const slices = isRootObject ? Object.keys(state as object) : [];
  const touched = entry.redux?.diff?.slices ?? [];

  // Only auto-select when the action names exactly one slice. Two or more and
  // there is no single right answer, so the root — where all of them are
  // visible and marked — is the honest default.
  const suggested =
    touched.length === 1 && slices.includes(touched[0]) ? touched[0] : null;
  const chosen = picked === undefined ? suggested : picked;
  // A slice that has since left the store falls back to the root rather than
  // rendering an empty pane.
  const active = chosen && slices.includes(chosen) ? chosen : null;

  const record = state as Record<string, unknown>;
  const value = active ? record[active] : state;
  const hits = new Set(touched);

  /** Arrow keys walk the strip, as a tablist should; Home and End jump to its
   * ends, which is the fast way through a store too wide to see. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const chips = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("button.nm-slice"),
    );
    const at = chips.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? chips.length - 1
          : (at + (e.key === "ArrowRight" ? 1 : -1) + chips.length) % chips.length;
    // `preventScroll`, because the browser's focus scroll walks scrollable
    // ancestors — including the host app's page. The click that follows moves
    // the selection, and the strip reveals the selected chip itself.
    chips[next]?.focus({ preventScroll: true });
    chips[next]?.click();
  };

  return (
    <DataView
      value={value}
      query={query}
      // Keyed by slice so expanding `cart` doesn't restore its expansion state
      // onto `auth` when you switch.
      entryId={`redux:live-state:${active ?? "$root"}`}
      format={format}
      onFormat={onFormat}
    >
      {slices.length > 1 && (
        <div className="nm-slicebar">
          <span className="nm-slicebar-label">Store</span>
          {/* Deliberately not `nm-scroll`: that class styles a visible themed
              scrollbar, and this strip fades its clipped edges instead. */}
          <ScrollStrip
            className="nm-slices"
            role="tablist"
            label="Store slice"
            onKeyDown={onKeyDown}
            // The auto-selected slice is often deep in an alphabetical list of
            // twenty; without this the tab opens on a chip nobody can see.
            activeKey={`${entry.id}:${active ?? "$root"}`}
          >
            <button
              role="tab"
              aria-selected={active === null}
              tabIndex={active === null ? 0 : -1}
              data-strip-active={active === null}
              className={`nm-slice nm-slice-root${active === null ? " active" : ""}`}
              onClick={() => setPicked(null)}
              title={`The whole store — ${slices.length} slices`}
            >
              root
            </button>
            {slices.map((name) => {
              const hit = hits.has(name);
              return (
                <button
                  key={name}
                  role="tab"
                  aria-selected={active === name}
                  tabIndex={active === name ? 0 : -1}
                  data-strip-active={active === name}
                  className={`nm-slice${active === name ? " active" : ""}${
                    hit ? " nm-slice-hit" : ""
                  }`}
                  onClick={() => setPicked(name)}
                  title={`${name} — ${sliceSize(record[name])}${
                    hit ? " · changed by this action" : ""
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </ScrollStrip>
          {touched.length > 0 && (
            <span className="nm-slicebar-hint" title="Slices this action changed">
              {touched.length} changed
            </span>
          )}
        </div>
      )}
    </DataView>
  );
}

/** The cache row's own state. The requests this key caused are *not* here any
 * more — they are chips in the linked strip at the foot of the pane, where
 * they read in both directions and don't need a tab to be found. */
function QueryStateTab({ entry }: { entry: MonitorEntry }) {
  const q = entry.query;
  if (!q) return <div className="nm-empty">— no query metadata —</div>;

  const rows: [string, string][] = [
    ["Type", q.sub === "mutation" ? "Mutation" : "Query"],
    ["Status", q.status],
    ...(q.fetchStatus ? ([["Fetch status", q.fetchStatus]] as [string, string][]) : []),
    ["Observers", String(q.observers)],
    ...(q.isInvalidated != null
      ? ([["Invalidated", q.isInvalidated ? "yes" : "no"]] as [string, string][])
      : []),
    ...(q.dataUpdatedAt
      ? ([["Data updated", clock(q.dataUpdatedAt)]] as [string, string][])
      : []),
    ...(q.errorUpdatedAt
      ? ([["Error updated", clock(q.errorUpdatedAt)]] as [string, string][])
      : []),
    ...(q.failureCount ? ([["Failures", String(q.failureCount)]] as [string, string][]) : []),
    ...(q.fetchCount != null
      ? ([["Fetched this session", String(q.fetchCount)]] as [string, string][])
      : []),
    ["Removed from cache", q.gcRemoved ? "yes — gcTime: 0" : "no"],
  ];

  return (
    <div className="nm-headers nm-scroll">
      <HeadersTable title="Query state" rows={rows} />
      {q.observers === 0 && (
        <div className="nm-notice">
          <span className="nm-notice-txt">
            No active observers — Invalidate/Refetch would be a no-op, since
            nothing is mounted to refetch.
          </span>
        </div>
      )}
    </div>
  );
}

function EmptyDetail({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="nm-empty nm-empty-detail">
      <span className="nm-empty-ico">
        <Icon name="inbox" size={20} />
      </span>
      <div className="nm-empty-copy">
        <p className="nm-empty-title">{title}</p>
        <p className="nm-empty-sub">{sub}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * The one-line answer to "what is this and how did it go".
 *
 * Everything the head used to spell out in separate `nm-meta` spans, joined
 * into one truncating line — so the action buttons beside it sit at the same
 * x for every entry, instead of sliding as the metadata changes shape.
 */
/**
 * The reason phrase — the words beside the status code. Only HTTP has one;
 * the other three sources fill the slot with the nearest thing they have,
 * rather than the blank that reads as "unknown".
 */
function reasonOf(entry: MonitorEntry): string {
  switch (entry.kind ?? "http") {
    case "ws":
      return entry.state === "pending" ? "Open" : "Closed";
    case "redux":
      return entry.redux?.diff?.slices.join(", ") ?? "";
    case "query": {
      const q = entry.query;
      if (!q) return "";
      return q.sub === "mutation" ? "Mutation" : "Query";
    }
    default:
      if (entry.state === "error") return "Failed";
      if (entry.state === "aborted") return "Cancelled, or cut off by a page reload";
      return statusText(entry.status) || "OK";
  }
}

/**
 * The measurements, pushed to the right of the status line. Each one is its
 * own element so they keep their own spacing rather than being glued into a
 * single string with separators in it.
 */
function metaOf(entry: MonitorEntry): string[] {
  const parts: string[] = [];
  switch (entry.kind ?? "http") {
    case "ws":
      parts.push(`${entry.frames?.length ?? 0} frames`);
      break;
    case "redux":
      if (entry.redux?.reducerMs != null) {
        parts.push(`reducer ${formatDuration(entry.redux.reducerMs)}`);
      }
      break;
    case "query":
      if (entry.query) {
        parts.push(`${entry.query.observers} ${entry.query.observers === 1 ? "observer" : "observers"}`);
      }
      break;
    default:
      if (entry.durationMs != null) parts.push(formatDuration(entry.durationMs));
      if (entry.sizeBytes != null) parts.push(formatBytes(entry.sizeBytes));
  }
  parts.push(clock(entry.at));
  if (entry.replayCount) parts.push(`replayed ${entry.replayCount}×`);
  return parts.filter(Boolean);
}

export function DetailPane({
  resolved,
  hidingLabel,
  onReveal,
  onClearSelection,
  onTogglePin,
  onSelectEntry,
  onMoreMenu,
  linked,
  timingContext,
  query,
  nouns,
  format,
  onFormat,
  authUnmasked,
}: {
  /** `Authorization` masking is switched off — see `capture/monitorAuth.ts`. */
  authUnmasked: boolean;
  resolved: Resolved;
  hidingLabel: string;
  onReveal: () => void;
  onClearSelection: () => void;
  onTogglePin: (id: string) => void;
  /** Pins another entry and switches to it — used by the linked-events strip. */
  onSelectEntry: (id: string) => void;
  /** Opens the entry's context menu from the head's overflow button, so the
   * full action set stays one click away without a second menu to maintain. */
  onMoreMenu: (e: React.MouseEvent, entry: MonitorEntry) => void;
  /** Entries correlated with this one — see `helpers/entryLinks.ts`. */
  linked: MonitorEntry[];
  /** Where this entry's duration sits among the ones currently listed. Owned
   * by the panel, which is the only place that knows the whole set. */
  timingContext: { medianMs: number; slowest: { ms: number; url: string } | null };
  query: string;
  /** What a row *is* in the active section. The empty states are the one place
   * this pane has to speak before it has an entry to infer the kind from —
   * they used to say "request" over a table of Redux actions. */
  nouns: SectionNouns;
  /** How payloads render. Lifted to the panel so it persists across entries
   * and sections — a developer who works in YAML should not have to re-pick it
   * for every request they click. */
  format: DataFormat;
  onFormat: (format: DataFormat) => void;
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const [curlCopied, setCurlCopied] = useState(false);
  const [armedId, setArmedId] = useState<string | null>(null);
  // The tab row lends its trailing half to whatever payload viewer is mounted
  // below it; see `PayloadToolbarSlot`. State rather than a ref, because the
  // consumers only learn the node exists when a render tells them so.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  /**
   * A callback ref rather than a plain one: this component has three return
   * branches, and the one that owns the tab row only mounts once an entry is
   * selected - after the measuring effect has already run and found nothing.
   * Re-identifying the ref object when the node changes is what makes the
   * observer attach to the element that actually exists.
   */
  const [paneEl, setPaneEl] = useState<HTMLDivElement | null>(null);
  const paneRef = useMemo(() => ({ current: paneEl }), [paneEl]);
  const paneSize = useMeasuredSize(paneRef);
  /**
   * Whether the format controls share the tab row.
   *
   * Sharing it is right when there is room: two stacked bars squeezed the size
   * readout into a column narrow enough to wrap across three lines. But a
   * narrow pane cannot hold five tabs, five formats, a size, Wrap and Copy on
   * one 27px line, and the tabs scroll while the tools cannot - so below this
   * the tools take a row of their own rather than a sliver of that one.
   */
  const sharesTabRow = paneSize.width === 0 || paneSize.width >= 560;
  const { store, apiClient } = useContext(BlixContext);
  const entry = resolved.entry;

  if (resolved.status === "evicted") {
    return (
      <div className="nm-detail">
        <EmptyDetail
          title={`This ${nouns.one} is no longer buffered`}
          sub={`It was dropped to make room for newer ${nouns.many}.`}
          action={
            <button className="nm-notice-btn" onClick={onClearSelection}>
              Clear selection
            </button>
          }
        />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="nm-detail">
        <EmptyDetail
          title={`Select ${nouns.article} ${nouns.one}`}
          sub="Pick one from the list to inspect it."
        />
      </div>
    );
  }

  const copyCurl = () => {
    void copyText(toCurl(entry)).then((ok) => {
      if (!ok) return;
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 1400);
    });
  };

  const kind = entry.kind ?? "http";
  const isWs = kind === "ws";
  const isHttp = kind === "http";
  const isRedux = kind === "redux";
  const isQuery = kind === "query";

  /**
   * The one thing this entry can be made to do again.
   *
   * Each section has exactly one, and it is the action a developer reaches for
   * often enough that hunting for it in a right-click menu is the wrong cost —
   * so it gets the head's only primary button, labelled for what it does here
   * rather than with a generic "run".
   *
   * A realtime connection has no such action: you cannot re-open a socket
   * frame, and the button is simply absent rather than present-and-dead.
   */
  const primary = ((): {
    label: string;
    can: boolean;
    reason?: string;
    /** True for an action that hits the live backend — see `constants/replay`. */
    confirm: boolean;
    run: () => void;
  } | null => {
    if (isHttp) {
      const check = canReplay(entry, apiClient);
      return {
        label: "Replay",
        can: check.can,
        reason: check.reason,
        confirm: check.needsConfirm,
        // A failed replay is captured as its own error row, which is the
        // useful place to read it — nothing to surface here.
        run: () => {
          if (apiClient) void replayEntry(entry, apiClient).catch(() => {});
        },
      };
    }
    if (isRedux) {
      const check = canRedispatch(entry, store);
      return {
        label: "Re-dispatch",
        can: check.can,
        reason: check.reason,
        confirm: false,
        run: () => {
          if (store) redispatchAction(entry, store);
        },
      };
    }
    if (isQuery) {
      const check = canActOnQuery(entry);
      return {
        label: "Invalidate",
        can: check.can,
        reason: check.reason,
        confirm: false,
        run: () => invalidateQuery(entry),
      };
    }
    return null;
  })();

  // Armed by entry id rather than a bare boolean, so clicking away and back
  // never leaves a different request one click from being re-fired.
  const armed = armedId === entry.id;
  const runPrimary = () => {
    if (!primary?.can) return;
    if (primary.confirm && !armed) {
      setArmedId(entry.id);
      window.setTimeout(() => setArmedId((id) => (id === entry.id ? null : id)), 3000);
      return;
    }
    setArmedId(null);
    primary.run();
  };

  const tabs = isWs
    ? WS_TABS
    : isRedux
      ? REDUX_TABS
      : isQuery
        ? QUERY_TABS
        : hasEncrypted(entry)
          ? HTTP_TABS_ENCRYPTED
          : HTTP_TABS;
  // Derived rather than reset in an effect: selecting a WebSocket while the
  // Payload tab is open would otherwise render a tab that doesn't exist. The
  // same fallback covers moving from an entry that has an Encrypted tab to one
  // that doesn't.
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  return (
    <div className="nm-detail" data-tone={statusTone(entry)} ref={setPaneEl}>
      {/* The selection has left the current filter. Keep showing it — hiding it
          would make the user's context vanish for a reason they didn't cause —
          but say so, and offer to clear only the filter responsible. */}
      {resolved.status === "hidden-by-filter" && (
        <div className="nm-notice">
          <span className="nm-notice-txt">Hidden by the current {hidingLabel}</span>
          <button className="nm-notice-btn" onClick={onReveal}>
            Show it
          </button>
          <button className="nm-notice-btn" onClick={onClearSelection}>
            Clear selection
          </button>
        </div>
      )}

      <div className="nm-detail-head">
        <div className="nm-detail-id">
          <span className="nm-detail-status">{entryStatusLabel(entry)}</span>
          <span className="nm-detail-method">{entry.transport ?? entry.method}</span>
          <span className="nm-detail-reason">{reasonOf(entry)}</span>
          <span className="nm-detail-gap" />
          {metaOf(entry).map((part) => (
            <span className="nm-detail-meta" key={part}>
              {part}
            </span>
          ))}
        </div>

        {/* The whole route, module dimmed — the same split the row uses, so
            the pane and the row it came from read as the same thing. */}
        <div className="nm-detail-url" title={`${entry.baseURL ?? ""}${entry.url}`}>
          <span className="nm-detail-url-head">
            {entry.baseURL ?? ""}
            {splitRoute(entry).head}
          </span>
          {splitRoute(entry).tail}
        </div>

        {/* Why the primary action is disabled, as text. A disabled button does
            not reliably show its tooltip, so the reason was invisible exactly
            when it mattered. */}
        {primary && !primary.can && primary.reason && (
          <div className="nm-detail-note">{primary.reason}</div>
        )}

        <div className="nm-detail-actions">
          {primary && (
            <button
              type="button"
              className={`nm-dbtn nm-dbtn-primary${armed ? " nm-dbtn-on" : ""}`}
              onClick={runPrimary}
              disabled={!primary.can}
              title={
                primary.reason ??
                (primary.confirm
                  ? "This re-runs a write against the live backend — click twice"
                  : `${primary.label} (Shift+R)`)
              }
            >
              <Icon name="replay" size={11} />
              {armed ? "Run write?" : primary.label}
            </button>
          )}
          <button
            type="button"
            className={`nm-dbtn${entry.pinned ? " nm-dbtn-on" : ""}`}
            onClick={() => onTogglePin(entry.id)}
            title={
              entry.pinned
                ? "Unpin — it will be cleared and evicted normally again"
                : "Pin — keeps this entry through Clear and buffer eviction"
            }
          >
            <Icon name="pin" size={11} />
            {entry.pinned ? "Pinned" : "Pin"}
          </button>
          {isHttp && (
            <button type="button" className="nm-dbtn" onClick={copyCurl} title="Copy as cURL">
              <Icon name="terminal" size={11} />
              {curlCopied ? "Copied" : "cURL"}
            </button>
          )}
          <span className="nm-dbtn-gap" />
          <button
            type="button"
            className="nm-dbtn nm-dbtn-sq"
            onClick={(e) => onMoreMenu(e, entry)}
            aria-label="More actions for this request"
            aria-haspopup="menu"
            title="More actions"
          >
            <Icon name="more" size={12} />
          </button>
        </div>
      </div>

      {/* Keyed by kind as well as tab: switching from a Redux action to an
          HTTP request swaps the whole set, and the new active tab has to be
          re-revealed even when its id happens to be unchanged. */}
      <div className="nm-tabrow">
        <ScrollStrip className="nm-tabs" activeKey={`${kind}:${activeTab}`}>
          {tabs.map((t) => (
            <button
              key={t.id}
              data-strip-active={activeTab === t.id}
              data-accent={sectionOf(entry)}
              className={`nm-tab${activeTab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "messages" && !!entry.frames?.length && (
                <span className="nm-tab-n">{entry.frames.length}</span>
              )}
              {t.id === "raw" && <span className="nm-tab-n nm-tab-aes">AES</span>}
            </button>
          ))}
        </ScrollStrip>
        {/* Filled by whichever payload viewer is mounted below — see
            `PayloadToolbarSlot`. Empty for Headers, Timing and Initiator, and
            the row then holds nothing but tabs. */}
        {sharesTabRow && <div ref={setToolbarSlot} style={{ display: "contents" }} />}
      </div>

      <PayloadToolbarSlot.Provider value={sharesTabRow ? toolbarSlot : null}>
      <div className="nm-tab-body">
        {activeTab === "timing" && (
          <TimingTab
            entry={entry}
            medianMs={timingContext.medianMs}
            slowest={timingContext.slowest}
          />
        )}
        {activeTab === "messages" && (
          <MessagesTab
            entry={entry}
            query={query}
            format={format}
            onFormat={onFormat}
          />
        )}
        {activeTab === "diff" && (
          <DiffTab entry={entry} query={query} format={format} onFormat={onFormat} />
        )}
        {activeTab === "reduxState" && (
          <ReduxStateTab
            entry={entry}
            query={query}
            format={format}
            onFormat={onFormat}
          />
        )}
        {activeTab === "queryState" && <QueryStateTab entry={entry} />}
        {activeTab === "preview" && (
          <DataView
            value={entry.responsePayload ?? entry.error}
            query={query}
            entryId={`${entry.id}:preview`}
            sizeBytes={entry.sizeBytes}
            format={format}
            onFormat={onFormat}
          />
        )}
        {activeTab === "payload" && (
          <DataView
            value={entry.requestPayload}
            query={query}
            entryId={`${entry.id}:payload`}
            format={format}
            onFormat={onFormat}
          />
        )}
        {activeTab === "raw" && (
          <DataView
            value={{
              encryptedRequest: entry.encryptedRequest,
              encryptedResponse: entry.encryptedResponse,
            }}
            query={query}
            entryId={`${entry.id}:raw`}
            format={format}
            onFormat={onFormat}
          />
        )}
        {activeTab === "headers" && (
          <div className="nm-headers nm-scroll">
            <HeadersTable
              title="General"
              rows={[
                ["Request URL", `${entry.baseURL ?? ""}${entry.url}`],
                ["Method", entry.method],
                // Its own row, never in place of the method. Absent on entries
                // captured before the field existed — unknown, so no row.
                ...(entry.client
                  ? ([["Client", entry.client]] as [string, string][])
                  : []),
                [
                  "Status",
                  `${entry.status ?? "—"}${
                    statusText(entry.status) ? ` ${statusText(entry.status)}` : ""
                  }`,
                ],
                ...(entry.durationMs != null
                  ? ([["Duration", `${entry.durationMs} ms`]] as [string, string][])
                  : []),
                ...(isWs
                  ? ([
                      ["Transport", entry.transport ?? "websocket"],
                      ["Frames", String(entry.frames?.length ?? 0)],
                      [
                        "State",
                        entry.state === "pending" ? "open" : "closed",
                      ],
                    ] as [string, string][])
                  : // Evidence only. It used to read "yes" for every request
                    // without `skipEncryption`, which says nothing about whether
                    // anything was encrypted — so a request with neither piece
                    // of evidence gets no row rather than a guess.
                    hasEncrypted(entry)
                    ? ([["Encrypted", "yes — ciphertext captured"]] as [string, string][])
                    : entry.skipEncryption
                      ? ([["Encrypted", "no — request set skipEncryption"]] as [string, string][])
                      : []),
                ...(entry.replayOf
                  ? ([["Replay of", entry.replayOf]] as [string, string][])
                  : []),
              ]}
            />
            {/* Keyed by entry, so an expanded claims chip does not stay open
                onto the next request's token. The raw value is read only while
                masking is off, so masking again hides every full value in the
                same render — before the effect that discards them has run.
                The "never stored" note waits for the request to settle: an
                axios entry re-reads Authorization then, so a value masked when
                the request started can still arrive in full. */}
            <HeadersTable
              key={entry.id}
              title="Request Headers"
              rows={Object.entries(entry.requestHeaders ?? {})}
              authorization={
                isHttp
                  ? {
                      claims: entry.authClaims,
                      raw: authUnmasked ? networkMonitor.getAuthorization(entry.id) : undefined,
                      unmasking: authUnmasked && entry.state !== "pending",
                      state: entry.state,
                      status: entry.status,
                    }
                  : undefined
              }
            />
            <HeadersTable
              title="Response Headers"
              rows={Object.entries(entry.responseHeaders ?? {})}
            />
          </div>
        )}
        {activeTab === "initiator" && (
          <div className="nm-headers nm-scroll">
            {entry.initiator?.length ? (
              <div className="nm-htable">
                <div className="nm-htable-title">
                  Call stack · {summarizeInitiator(entry.initiator)}
                </div>
                <ol className="nm-stack">
                  {entry.initiator.map((frame, i) => (
                    <li key={i} className="nm-stack-frame">
                      {frame.fn && <span className="nm-stack-fn">{frame.fn}</span>}
                      <span className="nm-stack-file">
                        {frame.file}
                        {frame.line ? `:${frame.line}` : ""}
                        {frame.col ? `:${frame.col}` : ""}
                      </span>
                      <button
                        className="nm-tree-chip"
                        onClick={() =>
                          void copyText(
                            `${frame.file}${frame.line ? `:${frame.line}` : ""}`,
                          )
                        }
                      >
                        Copy
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="nm-empty">— no call stack captured —</div>
            )}
          </div>
        )}
      </div>
      </PayloadToolbarSlot.Provider>

      {/* The correlations Blix already observed, as one strip you can step
          through. A request and the query behind it are one story; they used
          to be told in two places, each in one direction only. */}
      {linked.length > 0 && (
        <div className="nm-linked">
          <span className="nm-linked-label">LINKED</span>
          <ScrollStrip className="nm-linked-chips" activeKey={entry.id}>
            {linked.map((other) => (
              <button
                key={other.id}
                className="nm-linked-chip"
                data-accent={sectionOf(other)}
                onClick={() => onSelectEntry(other.id)}
                title={`${sectionOf(other)} — ${other.url}`}
              >
                {linkLabel(other)}
              </button>
            ))}
          </ScrollStrip>
        </div>
      )}

      {/* The two things a reader does next, where they will look for them.
          Not a second bar and not a second readout: the format controls, the
          parsed size and the masked count all stay in the tab row. */}
      <div className="nm-detail-foot">
        <span>alt-click to fold</span>
        <span>↑ ↓ to move</span>
      </div>
    </div>
  );
}
