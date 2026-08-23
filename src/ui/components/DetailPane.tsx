"use client";

/** Dev Tools — the detail pane: request summary plus tabbed payloads. */

import { summarizeInitiator } from "../../capture/monitorInitiator";
import type { MonitorEntry } from "../../capture/networkMonitor";
import { useContext, useState, useSyncExternalStore } from "react";
import { BlixContext } from "../BlixContext";
import { accentKey } from "../constants/ui";
import {
  clock,
  copyText,
  formatBytes,
  formatDuration,
  statusText,
} from "../helpers/format";
import { toCurl } from "../services/snippets";
import type { DataFormat, Resolved, SectionNouns, Tab } from "../types/monitorUi";
import { DiffTab } from "./tabs/DiffTab";
import { DataView } from "./DataView";
import { Icon } from "./Icon";
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

function HeadersTable({
  title,
  rows,
}: {
  title: string;
  rows: [string, string][];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="nm-htable">
      <div className="nm-htable-title">{title}</div>
      <dl className="nm-kv">
        {rows.map(([k, v]) => (
          <div className="nm-kv-row" key={k}>
            <dt className="nm-kv-k">{k}</dt>
            <dd className="nm-kv-v">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Reads the live Redux store rather than anything captured — the entry only
 * carries a bounded diff, never a snapshot, so this is the one place a
 * developer can see the *current* full state, not just what one action
 * changed. Subscribes directly, so it updates while the tab stays open. */
function ReduxStateTab({
  query,
  format,
  onFormat,
}: {
  query: string;
  format: DataFormat;
  onFormat: (format: DataFormat) => void;
}) {
  const { store } = useContext(BlixContext);
  const noop = () => () => {};
  const nullSnapshot = () => null;
  const state = useSyncExternalStore(
    store?.subscribe ?? noop,
    store?.getState ?? nullSnapshot,
    store?.getState ?? nullSnapshot,
  );
  if (!store) return <div className="nm-empty">— Redux store not provided —</div>;
  return (
    <DataView
      value={state}
      query={query}
      entryId="redux:live-state"
      format={format}
      onFormat={onFormat}
    />
  );
}

function QueryStateTab({
  entry,
  onSelectEntry,
}: {
  entry: MonitorEntry;
  onSelectEntry: (id: string) => void;
}) {
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
      {!!q.causedIds?.length && (
        <div className="nm-htable">
          <div className="nm-htable-title">Requests caused</div>
          <div className="nm-caused-list">
            {q.causedIds.map((id) => (
              <button key={id} className="nm-tree-chip" onClick={() => onSelectEntry(id)}>
                {id}
              </button>
            ))}
          </div>
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
        <Icon name="inbox" size={26} />
      </span>
      <p className="nm-empty-title">{title}</p>
      <p className="nm-empty-sub">{sub}</p>
      {action}
    </div>
  );
}

export function DetailPane({
  resolved,
  hidingLabel,
  onReveal,
  onClearSelection,
  onTogglePin,
  onSelectEntry,
  query,
  nouns,
  format,
  onFormat,
}: {
  resolved: Resolved;
  hidingLabel: string;
  onReveal: () => void;
  onClearSelection: () => void;
  onTogglePin: (id: string) => void;
  /** Pins another entry and switches to it — used by cross-section links
   * ("Caused by", "Requests caused"). */
  onSelectEntry: (id: string) => void;
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
    <div className="nm-detail">
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
        <span
          className="nm-method nm-method-lg"
          data-accent={accentKey(entry.kind, entry.method)}
        >
          {entry.transport ?? entry.method}
        </span>
        <span className="nm-status" data-state={entry.state}>
          {entry.status ?? (entry.state === "aborted" ? "⊘" : "—")}
        </span>
        {statusText(entry.status) && (
          <span className="nm-meta nm-status-text">{statusText(entry.status)}</span>
        )}
        {entry.durationMs != null && (
          <span className="nm-meta">{formatDuration(entry.durationMs)}</span>
        )}
        {entry.sizeBytes != null && (
          <span className="nm-meta">{formatBytes(entry.sizeBytes)}</span>
        )}
        <span className="nm-meta">{clock(entry.at)}</span>
        {entry.state === "aborted" && (
          <span className="nm-meta nm-status-text">
            left pending by a previous page load
          </span>
        )}
        <button
          className={`nm-curl${entry.pinned ? " nm-iconbtn-on" : ""}`}
          style={{ marginLeft: "auto" }}
          onClick={() => onTogglePin(entry.id)}
          title={
            entry.pinned
              ? "Unpin — it will be cleared and evicted normally again"
              : "Pin — keeps this request through Clear and buffer eviction"
          }
        >
          <Icon name="pin" size={13} />
          <span>{entry.pinned ? "Pinned" : "Pin"}</span>
        </button>
        {isHttp && (
          <button
            className="nm-curl"
            style={{ marginLeft: 0 }}
            onClick={copyCurl}
            title="Copy as cURL"
          >
            <Icon name="terminal" size={13} />
            <span>{curlCopied ? "Copied" : "cURL"}</span>
          </button>
        )}
        <div className="nm-detail-url" title={entry.url}>
          {entry.baseURL ?? ""}
          {entry.url}
        </div>
      </div>

      {/* Best-effort correlation from `monitorContext.ts` — shown only on an
          actual hit. A miss says nothing, rather than claiming "not from a
          query" when the truth is just "unknown". */}
      {isHttp && entry.ownerId && (
        <div className="nm-notice">
          <span className="nm-notice-txt">
            Caused by {entry.initiatorKind === "mutation" ? "mutation" : "query"}{" "}
            <code>{entry.ownerId}</code>
          </span>
          <button
            className="nm-notice-btn"
            onClick={() => onSelectEntry(entry.ownerId as string)}
          >
            Show it
          </button>
        </div>
      )}

      <div className="nm-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`nm-tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "messages" && !!entry.frames?.length && (
              <span className="nm-section-n">{entry.frames.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="nm-tab-body">
        {activeTab === "timing" && <TimingTab entry={entry} />}
        {activeTab === "messages" && (
          <MessagesTab
            entry={entry}
            query={query}
            format={format}
            onFormat={onFormat}
          />
        )}
        {activeTab === "diff" && <DiffTab entry={entry} />}
        {activeTab === "reduxState" && (
          <ReduxStateTab query={query} format={format} onFormat={onFormat} />
        )}
        {activeTab === "queryState" && (
          <QueryStateTab entry={entry} onSelectEntry={onSelectEntry} />
        )}
        {activeTab === "preview" && (
          <DataView
            value={entry.responsePayload ?? entry.error}
            query={query}
            entryId={`${entry.id}:preview`}
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
                  : ([
                      [
                        "Encrypted",
                        entry.skipEncryption ? "no (skipped)" : "yes",
                      ],
                    ] as [string, string][])),
                ...(entry.replayOf
                  ? ([["Replay of", entry.replayOf]] as [string, string][])
                  : []),
              ]}
            />
            <HeadersTable
              title="Request Headers"
              rows={Object.entries(entry.requestHeaders ?? {})}
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
    </div>
  );
}
