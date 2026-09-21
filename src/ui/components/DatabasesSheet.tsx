"use client";

/**
 * Dev Tools — every Blix database on this origin.
 *
 * IndexedDB is scoped to the origin, so the panel's own database is only ever
 * one of several: a developer running five projects on `localhost:3000`
 * accumulates one per project, plus the unprefixed `nm-devtools` that all of
 * them shared before names were prefixed. Nothing else in the panel can see
 * past the active database, which made those leftovers invisible and
 * unremovable from inside the tool that created them.
 *
 * The active row is deliberately not deletable here. Deleting a database out
 * from under a live connection is a different problem — the connection has to
 * be closed first and the panel's in-memory budget reset — and the purge
 * control already does exactly that.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteDatabaseByName,
  listDatabases,
  peekDatabase,
  type BlixDatabase,
  type DatabaseListing,
  type PeekEntry,
} from "../../capture/monitorDatabases";
import { clock, formatBytes, shortUrl } from "../helpers/format";
import { Icon } from "./Icon";

type Status = "loading" | "ready";

/** `MonitorKind` → the source identity that colours it, matching the rail.
 * Duplicated rather than imported from `sectionOf`: that works on a live
 * `MonitorEntry`, and a peek row is a projection of a persisted record from a
 * database this build did not necessarily write. */
const SECTION_OF: Record<string, string> = {
  http: "network",
  ws: "realtime",
  redux: "redux",
  query: "query",
};

/** A peek is a snapshot, loaded on demand and thrown away when the row closes.
 * Caching it would only mean showing a stale list the second time. */
type Peek = { state: "loading" } | { state: "ready"; entries: PeekEntry[] };

export function DatabasesSheet({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>("loading");
  const [listing, setListing] = useState<DatabaseListing>({
    databases: [],
    partial: false,
  });
  /** Row awaiting its second click. Destructive and irreversible, so it asks
   * twice — the same bargain the status bar's purge label strikes. */
  const [armed, setArmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** One row open at a time. Each peek holds a connection only while it reads,
   * but a screenful of simultaneously-open logs is also just noise. */
  const [opened, setOpened] = useState<string | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  /** Which row's peek is still wanted — see `togglePeek`. */
  const peekFor = useRef<string | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    void listDatabases().then((next) => {
      setListing(next);
      setStatus("ready");
    });
  }, []);

  useEffect(load, [load]);

  const togglePeek = (db: BlixDatabase) => {
    if (opened === db.name) {
      peekFor.current = null;
      setOpened(null);
      setPeek(null);
      return;
    }
    // The row can be closed, or another opened, while this read is in flight.
    // The ref names whose result is still wanted, so a peek that arrives for a
    // row nobody is looking at is dropped instead of replacing what is on
    // screen.
    peekFor.current = db.name;
    setOpened(db.name);
    setPeek({ state: "loading" });
    void peekDatabase(db.name).then((entries) => {
      if (peekFor.current !== db.name) return;
      setPeek({ state: "ready", entries });
    });
  };

  const remove = (db: BlixDatabase) => {
    if (armed !== db.name) {
      setArmed(db.name);
      setError(null);
      return;
    }
    setArmed(null);
    setBusy(db.name);
    // Close the peek first: a delete that succeeds leaves its entries on
    // screen describing a database that no longer exists.
    if (opened === db.name) {
      peekFor.current = null;
      setOpened(null);
      setPeek(null);
    }
    void deleteDatabaseByName(db.name).then((outcome) => {
      setBusy(null);
      setError(outcome.ok ? null : outcome.message);
      load();
    });
  };

  return (
    <>
      <div className="nm-sheet-scrim" onClick={onClose} />
      <div
        className="nm-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Databases on this origin"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="nm-sheet-head">
          <h3>Databases on this origin</h3>
          <button type="button" className="nm-sheet-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="nm-db-lead">
          IndexedDB belongs to the origin, not to your app. Every app served from
          this one writes here, and each keeps its own database only if it was
          given a <code>dbName</code>.
        </div>

        <div className="nm-db-body nm-scroll">
          {listing.partial && (
            <div className="nm-db-warn">
              This browser does not implement <code>indexedDB.databases()</code>, so
              this list is built from the databases Blix has opened in it and may be
              incomplete. Databases written by another browser profile, or before
              this version, will not appear.
            </div>
          )}

          {error && <div className="nm-db-error">{error}</div>}

          {status === "loading" && listing.databases.length === 0 && (
            <div className="nm-db-empty">Reading the origin…</div>
          )}

          {status === "ready" && listing.databases.length === 0 && (
            <div className="nm-db-empty">
              No Blix database on this origin yet — one is created the first time
              you turn on Preserve log.
            </div>
          )}

          <div className="nm-db-list">
            {listing.databases.map((db) => (
              <div
                className={`nm-db-item${opened === db.name ? " nm-db-open" : ""}`}
                key={db.name}
              >
                <div className="nm-db-row">
                  <div className="nm-db-main">
                    <div className="nm-db-name">{db.name}</div>
                    <div className="nm-db-note">
                      {db.bytes === null ? "size unknown" : `~${formatBytes(db.bytes)}`}
                      {db.active && " · use Purge saved log to clear this one"}
                      {db.legacy &&
                        !db.active &&
                        " · shared by every app here before dbName was prefixed"}
                    </div>
                  </div>

                  {/* Where the menus print a state, and for the same reason:
                      it is a fact about the row, not a thing you press. */}
                  {db.active && <span className="nm-db-tag">this panel</span>}
                  {db.legacy && <span className="nm-db-tag nm-db-tag-legacy">legacy</span>}

                  <button
                    type="button"
                    className="nm-db-btn"
                    onClick={() => togglePeek(db)}
                    aria-expanded={opened === db.name}
                    title={
                      opened === db.name
                        ? "Hide the recent entries"
                        : `Show the newest entries in ${db.name}`
                    }
                  >
                    {opened === db.name ? "Hide" : "Peek"}
                  </button>
                  <button
                    type="button"
                    className={`nm-db-btn nm-db-del${armed === db.name ? " nm-db-armed" : ""}`}
                    disabled={db.active || busy !== null}
                    onClick={() => remove(db)}
                    title={
                      db.active
                        ? "The database this panel is using cannot be deleted from here — it is open. Use Purge saved log."
                        : `Delete ${db.name}`
                    }
                  >
                    {busy === db.name
                      ? "Deleting…"
                      : armed === db.name
                        ? "Delete?"
                        : "Delete"}
                  </button>
                </div>

                {opened === db.name && (
                  <div className="nm-db-peek">
                    {peek?.state === "loading" && (
                      <div className="nm-db-peek-msg">Reading…</div>
                    )}
                    {peek?.state === "ready" && peek.entries.length === 0 && (
                      <div className="nm-db-peek-msg">
                        No entries saved in this database — Preserve log was most
                        likely never switched on for it.
                      </div>
                    )}
                    {peek?.state === "ready" && peek.entries.length > 0 && (
                      <>
                        {peek.entries.map((entry) => (
                          <div className="nm-db-peek-row" key={entry.id}>
                            <span
                              className="nm-db-peek-dot"
                              data-src={SECTION_OF[entry.kind] ?? "network"}
                            />
                            <span className="nm-db-peek-when">{clock(entry.at)}</span>
                            <span className="nm-db-peek-method">{entry.method}</span>
                            <span className="nm-db-peek-url" title={entry.url}>
                              {shortUrl(entry.url)}
                            </span>
                            <span
                              className={`nm-db-peek-status${
                                entry.state === "error" ? " nm-db-peek-bad" : ""
                              }`}
                            >
                              {entry.status ?? entry.state}
                            </span>
                          </div>
                        ))}
                        <div className="nm-db-peek-msg">
                          Newest {peek.entries.length}, read once — a snapshot, not a
                          live view. Open the panel in that project for the full log.
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
