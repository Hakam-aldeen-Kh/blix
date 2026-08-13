"use client";

/**
 * Dev Tools — frames exchanged on a realtime connection.
 *
 * Mirrors Chrome's Messages tab: a compact list of frames on top, the selected
 * frame's payload below. Direction is colour-coded because on ActionCable the
 * useful signal is usually "what did the server just push at me".
 */

import type { MonitorEntry, WsFrame } from "../../../capture/networkMonitor";
import { useState } from "react";
import { clock, formatBytes } from "../../helpers/format";
import { JsonTree } from "../JsonTree";

function directionLabel(direction: WsFrame["direction"]): string {
  switch (direction) {
    case "in":
      return "↓ recv";
    case "out":
      return "↑ send";
    default:
      return "· sys";
  }
}

export function MessagesTab({
  entry,
  query,
}: {
  entry: MonitorEntry;
  query: string;
}) {
  const frames = entry.frames ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (frames.length === 0) {
    return (
      <div className="nm-empty">
        <p className="nm-empty-title">No frames yet</p>
        <p className="nm-empty-sub">
          Messages on this connection will appear here as they arrive.
        </p>
      </div>
    );
  }

  // Newest last, like a transcript — and default to the newest so an idle
  // connection still shows something useful when the tab is opened.
  const selected =
    frames.find((f) => f.id === selectedId) ?? frames[frames.length - 1];

  return (
    <>
      <div className="nm-frames nm-scroll">
        {frames.map((frame) => (
          <div
            key={frame.id}
            className={`nm-frame${selected.id === frame.id ? " active" : ""}`}
            onClick={() => setSelectedId(frame.id)}
          >
            <span className={`nm-frame-dir nm-frame-${frame.direction}`}>
              {directionLabel(frame.direction)}
            </span>
            <span className="nm-frame-time">{clock(frame.at)}</span>
            <span className="nm-frame-event" title={frame.event}>
              {frame.event}
            </span>
            <span className="nm-frame-size">{formatBytes(frame.sizeBytes)}</span>
          </div>
        ))}
      </div>

      <div className="nm-frame-body">
        <JsonTree
          value={selected.data}
          query={query}
          entryId={`${entry.id}:${selected.id}`}
        />
      </div>
    </>
  );
}
