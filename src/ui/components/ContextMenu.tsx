"use client";

/** Dev Tools — right-click menu. HTTP replay gets an inline confirm step
 * (it can re-run a write against the live backend); Redux re-dispatch and the
 * Query cache actions don't need one — see the per-service rationale in
 * `services/reduxActions.ts` / `services/queryActions.ts`. */

import { useContext, useLayoutEffect, useRef, useState } from "react";
import { copyText } from "../helpers/format";
import { toCurl } from "../services/curl";
import { canReplay, replayEntry } from "../services/replayRequest";
import {
  canRedispatch,
  getCurrentState,
  ignoreActionType,
  redispatchAction,
} from "../services/reduxActions";
import {
  canActOnQuery,
  invalidateQuery,
  refetchQuery,
  removeQuery,
  resetQuery,
} from "../services/queryActions";
import type { ContextMenuState } from "../hooks/useContextMenu";
import { BlixContext } from "../BlixContext";
import { Icon } from "./Icon";

const MENU_W = 232;
// Fallback estimate used only for the first paint, before the menu's real
// height can be measured (its content varies a lot by entry kind and by
// whether a confirm/warn/note row is showing).
const MENU_H_ESTIMATE = 210;

export function ContextMenu({
  state,
  onClose,
  onArm,
  onFilterToType,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onArm: () => void;
  /** Sets the search box to a filter that isolates one Redux action type. */
  onFilterToType: (value: string) => void;
}) {
  const { store, apiClient } = useContext(BlixContext);
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuH, setMenuH] = useState(MENU_H_ESTIMATE);
  const { entry } = state;
  const kind = entry.kind ?? "http";
  const isHttp = kind === "http";
  const isRedux = kind === "redux";
  const isQuery = kind === "query";
  const isWs = kind === "ws";

  // Harmless to compute for a non-HTTP entry — it's simply never rendered or
  // acted on outside the `isHttp` block below.
  const replay = canReplay(entry, apiClient);
  const redispatch = canRedispatch(entry, store);
  const queryCheck = canActOnQuery(entry);

  // Flip the menu back inside the viewport when it would overflow an edge.
  // Height varies a lot by entry kind (1 button for ws vs 6+ for redux/query)
  // and by whether a confirm/warn/note row is showing, so a fixed constant
  // clips or leaves a gap — measure the real rendered height below and use
  // that instead, falling back to MENU_H_ESTIMATE only for the first paint.
  const placement = {
    left: Math.max(8, Math.min(state.x, window.innerWidth - MENU_W - 8)),
    top: Math.max(8, Math.min(state.y, window.innerHeight - menuH - 8)),
  };

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const h = node.getBoundingClientRect().height;
    if (h && Math.abs(h - menuH) > 1) setMenuH(h);
    // Re-measure whenever the visible content changes shape (entry kind,
    // confirm step, or an inline error note appearing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, state.confirming, error]);

  const run = (fn: () => unknown) => () => {
    try {
      const result = fn();
      if (result instanceof Promise) {
        void result.catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Failed");
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const doReplay = () => {
    if (!apiClient) return;
    // Errors are intentionally swallowed here: a replay that fails is captured
    // as its own error row, which is the useful place to read it.
    void replayEntry(entry, apiClient).catch(() => {});
    onClose();
  };

  return (
    <div
      ref={ref}
      className="nm-menu"
      style={{ left: placement.left, top: placement.top, width: MENU_W }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="nm-menu-head" title={entry.url}>
        {/* Redux/Query: `method` is already the slice/type prefix of `url`
            (e.g. "permissions" + "permissions/setUserInfo") — showing both
            would just repeat itself. */}
        {isRedux || isQuery ? entry.url : `${entry.method} ${entry.url}`}
      </div>

      {state.confirming ? (
        <>
          <div className="nm-menu-warn">
            This re-runs a write against the live backend.
          </div>
          <button className="nm-menu-item nm-menu-danger" onClick={doReplay}>
            <Icon name="replay" size={13} />
            Replay anyway
          </button>
          <button className="nm-menu-item" onClick={onClose}>
            Cancel
          </button>
        </>
      ) : (
        <>
          {isHttp && (
            <>
              <button
                className="nm-menu-item"
                onClick={run(() => copyText(`${entry.baseURL ?? ""}${entry.url}`))}
              >
                <Icon name="copy" size={13} />
                Copy URL
              </button>
              <button className="nm-menu-item" onClick={run(() => copyText(toCurl(entry)))}>
                <Icon name="terminal" size={13} />
                Copy as cURL
              </button>
              <button
                className="nm-menu-item"
                onClick={run(() =>
                  copyText(
                    JSON.stringify(entry.responsePayload ?? entry.error ?? null, null, 2),
                  ),
                )}
              >
                <Icon name="copy" size={13} />
                Copy response
              </button>
              <button
                className="nm-menu-item"
                onClick={run(() =>
                  copyText(JSON.stringify(entry.requestPayload ?? null, null, 2)),
                )}
              >
                <Icon name="copy" size={13} />
                Copy request
              </button>

              <div className="nm-menu-sep" />

              <button
                className="nm-menu-item"
                disabled={!replay.can}
                title={replay.reason}
                onClick={replay.needsConfirm ? onArm : doReplay}
              >
                <Icon name="replay" size={13} />
                Replay request
                {replay.needsConfirm && <span className="nm-menu-hint">write</span>}
              </button>
              {!replay.can && <div className="nm-menu-note">{replay.reason}</div>}
            </>
          )}

          {isRedux && (
            <>
              <button
                className="nm-menu-item"
                onClick={run(() =>
                  copyText(
                    JSON.stringify(
                      { type: entry.redux?.type, payload: entry.redux?.payload },
                      null,
                      2,
                    ),
                  ),
                )}
              >
                <Icon name="copy" size={13} />
                Copy action
              </button>
              <button
                className="nm-menu-item"
                disabled={!entry.redux?.diff?.changes.length}
                onClick={run(() => copyText(JSON.stringify(entry.redux?.diff ?? null, null, 2)))}
              >
                <Icon name="copy" size={13} />
                Copy diff
              </button>
              <button
                className="nm-menu-item"
                onClick={run(() => copyText(JSON.stringify(getCurrentState(store), null, 2)))}
              >
                <Icon name="copy" size={13} />
                Copy current state
              </button>

              <div className="nm-menu-sep" />

              <button className="nm-menu-item" onClick={run(() => onFilterToType(`url:${entry.url}`))}>
                <Icon name="search" size={13} />
                Filter to this action type
              </button>
              <button className="nm-menu-item" onClick={run(() => ignoreActionType(entry.url))}>
                <Icon name="clear" size={13} />
                Ignore this action type
              </button>

              <div className="nm-menu-sep" />

              <button
                className="nm-menu-item"
                disabled={!redispatch.can}
                title={redispatch.reason}
                onClick={run(() => store && redispatchAction(entry, store))}
              >
                <Icon name="replay" size={13} />
                Re-dispatch
              </button>
              {!redispatch.can && <div className="nm-menu-note">{redispatch.reason}</div>}
            </>
          )}

          {isQuery && (
            <>
              <button
                className="nm-menu-item"
                onClick={run(() => copyText(JSON.stringify(entry.query?.key ?? [], null, 2)))}
              >
                <Icon name="copy" size={13} />
                Copy key
              </button>
              <button
                className="nm-menu-item"
                onClick={run(() =>
                  copyText(
                    JSON.stringify(entry.responsePayload ?? entry.error ?? null, null, 2),
                  ),
                )}
              >
                <Icon name="copy" size={13} />
                Copy data
              </button>

              <div className="nm-menu-sep" />

              <button
                className="nm-menu-item"
                disabled={!queryCheck.can}
                title={queryCheck.reason}
                onClick={run(() => invalidateQuery(entry))}
              >
                <Icon name="replay" size={13} />
                Invalidate
              </button>
              <button
                className="nm-menu-item"
                disabled={!queryCheck.can}
                title={queryCheck.reason}
                onClick={run(() => refetchQuery(entry))}
              >
                <Icon name="replay" size={13} />
                Refetch
              </button>
              <button
                className="nm-menu-item"
                disabled={!queryCheck.can}
                title={queryCheck.reason}
                onClick={run(() => resetQuery(entry))}
              >
                <Icon name="clear" size={13} />
                Reset
              </button>
              <button className="nm-menu-item" onClick={run(() => removeQuery(entry))}>
                <Icon name="clear" size={13} />
                Remove from cache
              </button>
              {!queryCheck.can && <div className="nm-menu-note">{queryCheck.reason}</div>}
            </>
          )}

          {isWs && (
            <button
              className="nm-menu-item"
              onClick={run(() => copyText(JSON.stringify(entry.frames ?? [], null, 2)))}
            >
              <Icon name="copy" size={13} />
              Copy frames
            </button>
          )}
        </>
      )}

      {error && <div className="nm-menu-note nm-menu-err">{error}</div>}
    </div>
  );
}
