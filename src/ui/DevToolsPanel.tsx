"use client";

/**
 * DevTools — a Chrome-DevTools-style panel over everything that decides what
 * the host app renders: HTTP, realtime, Redux and TanStack Query (development
 * only). Four sections, one buffer, one selection/search/pin model shared
 * across all of them.
 *
 * When the host encrypts payloads on the wire, the browser's own Network tab
 * shows nothing but ciphertext. The Network section subscribes to the
 * `networkMonitor` store, which the axios interceptors feed with the
 * *plaintext* request (captured before encryption) and the *decrypted*
 * response, alongside the raw encrypted forms actually exchanged. Realtime
 * traffic — invisible to the browser's tooling once the transport has framed
 * it — gets its own section, and so do Redux actions (`reduxCapture.ts`) and
 * TanStack Query cache activity (`queryCapture.ts`).
 *
 * It is mounted through `DevToolsLoader`, which dynamic-imports this
 * module only in development, so none of it reaches a production bundle.
 */

import { setInitiatorCapture } from "../capture/monitorInitiator";
import {
  bootPersistence,
  getPersistedStats,
  installFlushOnHide,
  prefsStore,
  purgeStorage,
  savePrefs,
  setPreserveLog,
} from "../capture/monitorPersistence";
import type { Corner } from "../capture/monitorTypes";
import { networkMonitor, type MonitorEntry } from "../capture/networkMonitor";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { BlixContext } from "./BlixContext";
import { ContextMenu } from "./components/ContextMenu";
import { DetailPane } from "./components/DetailPane";
import { Icon, type IconName } from "./components/Icon";
import { CORNER_STYLE, FabDragPreview, MonitorFab } from "./components/MonitorFab";
import { MonitorToolbar } from "./components/MonitorToolbar";
import { RequestTable, columnsFor } from "./components/RequestTable";
import { ShortcutsSheet } from "./components/ShortcutsSheet";
import { StatusBar } from "./components/StatusBar";
import { DENSITY_ROW_H, NEUTRAL, STATE_COLORS, type Density } from "./constants/ui";

const DENSITY_ORDER: Density[] = ["compact", "normal", "comfy"];

/** Which top-level section an entry belongs to. */
function sectionOf(entry: MonitorEntry): Section {
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

const SECTION_LABEL: Record<Section, string> = {
  network: "Network",
  realtime: "Realtime",
  redux: "Redux",
  query: "Query",
};

const EMPTY_COPY: Record<Section, { icon: IconName; title: string; sub: string }> = {
  network: {
    icon: "inbox",
    title: "No requests yet",
    sub: "Captured requests will appear here.",
  },
  realtime: {
    icon: "bolt",
    title: "No realtime connections",
    sub: "Open the conversations screen to bring a socket up.",
  },
  redux: {
    icon: "stack",
    title: "No Redux actions yet",
    sub: "Actions dispatched anywhere in the app will appear here.",
  },
  query: {
    icon: "database",
    title: "No query activity yet",
    sub: "Navigate to a screen that fetches or mutates data to see it here.",
  },
};
import { copyText, formatBytes } from "./helpers/format";
import { computeTimelines } from "./helpers/waterfall";
import { useAppTheme } from "./hooks/useAppTheme";
import { useContextMenu } from "./hooks/useContextMenu";
import { useDockGeometry } from "./hooks/useDockGeometry";
import { useFabDrag } from "./hooks/useFabDrag";
import { useMonitorClock } from "./hooks/useMonitorClock";
import { hidingReasons, useMonitorList } from "./hooks/useMonitorList";
import { useMonitorSelection } from "./hooks/useMonitorSelection";
import { usePanelSize } from "./hooks/usePanelSize";
import { useVirtualRows } from "./hooks/useVirtualRows";
import { exportLog } from "./services/exportLog";
import { describeTokens, parseFilter, tokenToRaw } from "./services/filterQuery";
import { exportHar } from "./services/harExport";
import { canReplay, replayEntry } from "./services/replayRequest";
import { MONITOR_STYLES } from "./styles/monitorStyles";
import type {
  ColumnId,
  Section,
  Sort,
  SortKey,
  StateFilter,
} from "./types/monitorUi";

export default function DevTools() {
  const { apiClient } = useContext(BlixContext);
  const entries = useSyncExternalStore(
    networkMonitor.subscribe,
    networkMonitor.getSnapshot,
    networkMonitor.getServerSnapshot,
  );
  const { prefs, hydration } = useSyncExternalStore(
    prefsStore.subscribe,
    prefsStore.getSnapshot,
    prefsStore.getServerSnapshot,
  );
  const theme = useAppTheme();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [deepSearch, setDeepSearch] = useState(
    () => prefsStore.getSnapshot().prefs.deepSearch,
  );
  const [section, setSection] = useState<Section>(
    () => (prefsStore.getSnapshot().prefs.section as Section) ?? "network",
  );
  const [density, setDensity] = useState<Density>(
    () => (prefsStore.getSnapshot().prefs.density as Density) ?? "normal",
  );
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [sort, setSort] = useState<Sort>({ key: "time", dir: "desc" });
  const [paused, setPaused] = useState(() => networkMonitor.isPaused);
  const [purgeArmed, setPurgeArmed] = useState(false);
  type Anchor = { top: number; right: number };
  // A single piece of state rather than two independent `useState`s: the
  // export and "more" toggle buttons each only clear *their own* anchor when
  // opening (see MonitorToolbar's `onExportMenu(exportOpen ? null : ...)`),
  // so two separate booleans let both menus end up open at once — open
  // export, then click "more", and export never closes. Only one of the two
  // can ever be visible, so model it as one nullable union and keep the rest
  // of this file's `exportAnchor`/`moreAnchor`/`setExportAnchor`/
  // `setMoreAnchor` call sites unchanged via the derived values below.
  const [menuState, setMenuState] = useState<
    { which: "export" | "more"; anchor: Anchor } | null
  >(null);
  const exportAnchor = menuState?.which === "export" ? menuState.anchor : null;
  const moreAnchor = menuState?.which === "more" ? menuState.anchor : null;
  const setExportAnchor = useCallback((a: Anchor | null) => {
    setMenuState(a ? { which: "export", anchor: a } : null);
  }, []);
  const setMoreAnchor = useCallback((a: Anchor | null) => {
    setMenuState(a ? { which: "more", anchor: a } : null);
  }, []);

  // Refs live here rather than inside the hooks: a hook that returns a ref
  // makes every property of its result count as a ref access during render
  // under `react-hooks/refs`.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Measured panel size drives every layout decision — the panel resizes
  // independently of the viewport, so window media queries would be wrong.
  const panel = usePanelSize(panelRef, open);
  const dock = useDockGeometry(open, panelRef, panel.stacked);
  const menu = useContextMenu();

  // Open the database, restore the log if "Preserve log" is on, and start
  // flushing. Deliberately on mount rather than at module scope, so a developer
  // who never opens the devtool pays no IndexedDB cost at all.
  useEffect(() => {
    void bootPersistence();
    return installFlushOnHide();
  }, []);

  useEffect(() => {
    setInitiatorCapture(prefs.captureInitiator !== false);
  }, [prefs.captureInitiator]);

  // Each section is its own view over the buffer — every kind of traffic has
  // different columns and a different notion of a row. Computed in one pass
  // over `entries` rather than three separate `useMemo`s (each re-scanning
  // the whole buffer and re-deriving `sectionOf(e)` per item): the buffer can
  // hold hundreds of entries and this recomputes on every captured event.
  const { sectionEntries, sectionCounts, sectionLive } = useMemo(() => {
    const counts: Record<Section, number> = { network: 0, realtime: 0, redux: 0, query: 0 };
    // Redux rows are born terminal (there is no "in-flight" dispatch to show
    // live), so only realtime and query ever show the live dot.
    const live: Partial<Record<Section, boolean>> = {};
    const filtered: MonitorEntry[] = [];
    for (const e of entries) {
      const s = sectionOf(e);
      counts[s] += 1;
      if (s === section) filtered.push(e);
      if (e.state === "pending" && (s === "realtime" || s === "query")) live[s] = true;
    }
    return { sectionEntries: filtered, sectionCounts: counts, sectionLive: live };
  }, [entries, section]);

  const parsedFilter = useMemo(() => parseFilter(query), [query]);
  const list = useMonitorList(
    sectionEntries,
    query,
    deepSearch,
    stateFilter,
    sort,
  );
  const selection = useMonitorSelection(entries, list.filtered, list.visibleIds);

  const rowHeight = DENSITY_ROW_H[density];
  const virtual = useVirtualRows(list.rows.length, scrollerRef, rowHeight);

  // One ticker for the whole panel, running only while something is pending.
  const nowAbs = useMonitorClock(list.counts.pending > 0);
  const timelines = useMemo(
    () => computeTimelines(list.filtered, nowAbs),
    [list.filtered, nowAbs],
  );

  const columns = useMemo(() => columnsFor(section), [section]);
  const columnWidths = (prefs.columnWidths ?? {}) as Partial<
    Record<ColumnId, number>
  >;

  const onResizeColumn = useCallback(
    (id: ColumnId, width: number) => {
      savePrefs({
        columnWidths: { ...(prefsStore.getSnapshot().prefs.columnWidths ?? {}), [id]: width },
      });
    },
    [],
  );

  const onQuery = useCallback((value: string) => setQuery(value), []);
  const onDeepSearch = useCallback((value: boolean) => {
    setDeepSearch(value);
    savePrefs({ deepSearch: value });
  }, []);
  const onSection = useCallback((next: Section) => {
    setSection(next);
    savePrefs({ section: next });
  }, []);
  const onDensity = useCallback((next: Density) => {
    setDensity(next);
    savePrefs({ density: next });
  }, []);

  // Changing the dock moves the toolbar, which invalidates the export menu's
  // measured anchor — dismiss it as part of the interaction rather than
  // reacting to the change afterwards.
  const closeMenus = useCallback(() => {
    setExportAnchor(null);
    setMoreAnchor(null);
  }, []);

  const onMode = useCallback(
    (next: Parameters<typeof dock.setMode>[0]) => {
      closeMenus();
      dock.setMode(next);
    },
    [closeMenus, dock],
  );
  const onToggleMaximize = useCallback(() => {
    closeMenus();
    dock.toggleMaximize();
  }, [closeMenus, dock]);

  const onSort = useCallback((key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      networkMonitor.setPaused(!p);
      return !p;
    });
  }, []);

  const togglePin = useCallback((id: string) => networkMonitor.togglePin(id), []);

  const openPanel = useCallback(() => {
    setOpen(true);
    dock.ensureFloatPos();
  }, [dock]);

  const onDockCorner = useCallback((corner: Corner) => dock.setCorner(corner), [dock]);
  const fab = useFabDrag(openPanel, onDockCorner);

  /* ── Keyboard ─────────────────────────────────────────────────────────
     Everything is read through a ref so the listeners attach once instead of
     being torn down and re-attached on every captured request. */
  const kb = useRef({
    open: false,
    selection,
    list,
    section,
    paused,
    preserveLog: prefs.preserveLog,
    menuOpen: false,
  });
  useEffect(() => {
    kb.current = {
      open,
      selection,
      list,
      section,
      paused,
      preserveLog: prefs.preserveLog,
      menuOpen: menu.menu !== null,
    };
  }, [open, selection, list, section, paused, prefs.preserveLog, menu.menu]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const tag = (target as HTMLElement | null)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA";
    };

    const onKey = (e: KeyboardEvent) => {
      // Ctrl+` toggles the panel from anywhere, even while typing.
      if (e.key === "`" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => {
          if (!o) dock.ensureFloatPos();
          return !o;
        });
        return;
      }

      if (!kb.current.open) return;

      if (e.key === "Escape") {
        // The context menu has its own Escape listener (`useContextMenu`)
        // that closes just the menu — without this branch, that listener and
        // this one both fire on the same keypress, and the panel closed
        // underneath the menu the developer was still using.
        if (showShortcuts) setShowShortcuts(false);
        else if (kb.current.menuOpen) menu.close();
        else if (exportAnchor || moreAnchor) {
          setExportAnchor(null);
          setMoreAnchor(null);
        } else setOpen(false);
        return;
      }

      if (isTyping(e.target)) return;

      const { selection: sel, list: rows } = kb.current;
      const selected = sel.resolved.entry;

      switch (e.key) {
        case "?":
          e.preventDefault();
          setShowShortcuts((s) => !s);
          return;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          return;
        case "1":
          onSection("network");
          return;
        case "2":
          onSection("realtime");
          return;
        case "3":
          onSection("redux");
          return;
        case "4":
          onSection("query");
          return;
        case "ArrowDown":
        case "j":
          e.preventDefault();
          sel.step(1, rows.filtered);
          return;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          sel.step(-1, rows.filtered);
          return;
        case "g":
          if (rows.filtered[0]) sel.pin(rows.filtered[0].id);
          return;
        case "G":
          if (rows.filtered.length) {
            sel.pin(rows.filtered[rows.filtered.length - 1].id);
          }
          return;
        case "x":
          sel.clear();
          return;
        case " ":
          e.preventDefault();
          togglePause();
          return;
        case "L":
          setPreserveLog(!kb.current.preserveLog);
          return;
        case "C":
          networkMonitor.clear();
          sel.clear();
          return;
      }

      if (!selected) return;

      switch (e.key) {
        case "p":
          togglePin(selected.id);
          break;
        case "u":
          void copyText(`${selected.baseURL ?? ""}${selected.url}`);
          break;
        case "c":
          void copyText(
            JSON.stringify(selected.responsePayload ?? selected.error ?? null, null, 2),
          );
          break;
        case "r":
          // The `apiClient &&` is redundant with canReplay's own check, but
          // narrows the type for replayEntry's non-optional parameter.
          if (apiClient && canReplay(selected, apiClient).can) {
            void replayEntry(selected, apiClient).catch(() => {});
          }
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `menu.close` is a `useCallback` with an empty dep array — stable across
    // renders. Depending on `menu` itself (a fresh object literal every
    // render) would defeat the point of this effect: attach the listener
    // once, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dock, exportAnchor, moreAnchor, onSection, showShortcuts, togglePause, togglePin, menu.close]);

  // The anchor is a viewport coordinate, so anything that moves the toolbar
  // invalidates it. Cheaper and less surprising than re-measuring.
  useEffect(() => {
    if (!exportAnchor && !moreAnchor) return;
    const dismiss = () => {
      setExportAnchor(null);
      setMoreAnchor(null);
    };
    window.addEventListener("resize", dismiss);
    return () => window.removeEventListener("resize", dismiss);
  }, [exportAnchor, moreAnchor]);

  // Click outside closes. Captured on `pointerdown` so it fires even while a
  // Radix modal dialog has the rest of the page pointer-locked. The badge opens
  // via a click, so the opening interaction never reaches here.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      // Scoped to the monitor root rather than the panel. The context menu,
      // export menu and shortcut sheet are siblings of the panel, and the
      // listener is registered in the capture phase — so a `stopPropagation`
      // inside them fires too late and every menu click closed the panel.
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        setOpen(false);
        menu.close();
        setExportAnchor(null);
        setMoreAnchor(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, menu]);

  // Keep the selected row in view. Arithmetic rather than `scrollIntoView`,
  // because a virtualized row may not be mounted at all.
  const activeRowId = selection.activeRowId;
  const rowsRef = useRef(list.rows);
  useEffect(() => {
    rowsRef.current = list.rows;
  }, [list.rows]);

  // `useVirtualRows` returns a fresh object every render, so it can't sit in a
  // dependency array below without re-firing on every render that touches it —
  // including the ones scrolling itself causes via `onScroll` → `setWindow`.
  // That re-fire re-ran `scrollToIndex`/`scrollToTop` on each such render,
  // snapping the view straight back to the selected/top row and making it
  // impossible to scroll away from it. Stash it in a ref instead, so these
  // effects only run when what they actually care about changes.
  const virtualRef = useRef(virtual);
  useEffect(() => {
    virtualRef.current = virtual;
  });

  useEffect(() => {
    if (!open || !activeRowId) return;
    const index = rowsRef.current.findIndex(
      (r) => r.kind === "row" && r.entry.id === activeRowId,
    );
    if (index >= 0) virtualRef.current.scrollToIndex(index);
  }, [open, activeRowId]);

  // Following the newest request sticks the list to the top — but only when the
  // user is already there, so it can never fight an active scroll.
  const newestId = list.filtered[0]?.id;
  useEffect(() => {
    if (!open || !selection.isFollowing) return;
    if (virtualRef.current.isNearTop()) virtualRef.current.scrollToTop();
  }, [open, selection.isFollowing, newestId]);

  if (!networkMonitor.enabled) return null;

  const persisted = getPersistedStats();
  const dotColor = list.counts.error
    ? STATE_COLORS.error
    : list.counts.pending
      ? STATE_COLORS.pending
      : STATE_COLORS.success;

  const pendingLabel =
    section === "realtime" ? "Open" : section === "query" ? "Fetching" : "Pending";
  const segments: [StateFilter, string, number, string][] = [
    ["all", "All", list.counts.all, NEUTRAL],
    ["success", "OK", list.counts.success, STATE_COLORS.success],
    ["error", "Errors", list.counts.error, STATE_COLORS.error],
    ["pending", pendingLabel, list.counts.pending, STATE_COLORS.pending],
  ];
  // "Aborted" earns a segment only once there is something in it — it exists
  // solely for requests restored mid-flight from a previous page load.
  if (list.counts.aborted > 0) {
    segments.push(["aborted", "Aborted", list.counts.aborted, STATE_COLORS.aborted]);
  }

  const selectedEntry = selection.resolved.entry;
  // The selection can also be "hidden" simply by being in another section,
  // which is not a filter at all — say so, and offer to switch rather than
  // suggesting the user clear a filter that isn't the cause.
  const selectedSection: Section = selectedEntry ? sectionOf(selectedEntry) : "network";
  const hiddenBySection =
    selection.resolved.status === "hidden-by-filter" &&
    selectedEntry != null &&
    selectedSection !== section;

  const hiding =
    selection.resolved.status === "hidden-by-filter" && selectedEntry && !hiddenBySection
      ? hidingReasons(selectedEntry, stateFilter, list.normalizedQuery, deepSearch)
      : [];
  const hidingLabel = hiddenBySection
    ? `${SECTION_LABEL[selectedSection]} section`
    : hiding.length === 2
      ? "filters"
      : hiding[0] === "state"
        ? "state filter"
        : "search";

  const revealSelected = () => {
    if (hiddenBySection) {
      onSection(selectedSection);
      return;
    }
    if (hiding.includes("state")) setStateFilter("all");
    if (hiding.includes("query")) setQuery("");
  };

  const chips = describeTokens(parsedFilter);
  const slowestMs = list.filtered.reduce(
    (max, e) => Math.max(max, e.durationMs ?? 0),
    0,
  );
  const pinnedCount = entries.filter((e) => e.pinned).length;

  const ui = (
    <div
      ref={rootRef}
      className={`nm-root${theme === "light" ? " nm-light" : ""}`}
      style={
        {
          ...CORNER_STYLE[dock.corner],
          "--nm-row-h": `${rowHeight}px`,
        } as React.CSSProperties
      }
    >
      {/* React 19 hoists and dedupes this into <head>. */}
      <style precedence="nm">{MONITOR_STYLES}</style>

      {!open && !fab.dragPos && (
        <MonitorFab
          dotColor={dotColor}
          total={entries.length}
          errors={list.counts.error}
          pending={list.counts.pending}
          docking={fab.docking}
          onPointerDown={fab.start}
        />
      )}

      {fab.dragPos && (
        <FabDragPreview pos={fab.dragPos} dotColor={dotColor} total={entries.length} />
      )}

      {open && (
        <div
          ref={panelRef}
          className={`nm-panel nm-dock-${dock.mode} nm-density-${density}${
            dock.maximized ? " nm-max" : ""
          }${dock.animating ? " nm-anim" : ""}`}
          style={dock.panelStyle}
        >
          {/* Dock edge grips. The floating panel keeps its corner grip instead. */}
          {!dock.maximized && dock.mode === "bottom" && (
            <div
              className="nm-dock-grip nm-dock-grip-h"
              onPointerDown={dock.startDockResize}
              title="Drag to resize"
            />
          )}
          {!dock.maximized && dock.mode === "right" && (
            <div
              className="nm-dock-grip nm-dock-grip-v"
              onPointerDown={dock.startDockResize}
              title="Drag to resize"
            />
          )}

          <MonitorToolbar
            dotColor={dotColor}
            section={section}
            onSection={onSection}
            counts={sectionCounts}
            live={sectionLive}
            query={query}
            onQuery={onQuery}
            searchRef={searchRef}
            onSearchFocus={setSearchFocused}
            deepSearch={deepSearch}
            onDeepSearch={onDeepSearch}
            searching={list.searching}
            paused={paused}
            onTogglePause={togglePause}
            preserveLog={prefs.preserveLog}
            onTogglePreserve={() => setPreserveLog(!prefs.preserveLog)}
            following={selection.isFollowing}
            onToggleFollow={selection.toggleFollow}
            onExportMenu={setExportAnchor}
            exportOpen={exportAnchor !== null}
            exportDisabled={entries.length === 0}
            compact={panel.compactToolbar}
            tiny={panel.tinyToolbar}
            onMoreMenu={setMoreAnchor}
            moreOpen={moreAnchor !== null}
            onClear={() => {
              networkMonitor.clear();
              selection.clear();
            }}
            density={density}
            onDensity={onDensity}
            mode={dock.mode}
            onMode={onMode}
            maximized={dock.maximized}
            onToggleMaximize={onToggleMaximize}
            onClose={() => setOpen(false)}
            onPointerDown={dock.startPanelDrag}
          />

          {/* Filter-syntax hints, only while the search box has focus. */}
          {searchFocused && (
            <div className="nm-hints">
              {[
                ["-token", "exclude"],
                ["method:post", ""],
                ["status:5xx", ""],
                ["is:error", "ok · pending · pinned · replay"],
                ["type:redux", "http · ws · redux · query"],
                ["larger-than:10k", ""],
                ["slower-than:500", ""],
                ["has:frames", "initiator · error"],
              ].map(([token, hint]) => (
                <button
                  key={token}
                  className="nm-hint"
                  // Mousedown, not click: the search input would blur first and
                  // the hint row would unmount before the click landed.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery((q) => (q ? `${q.trimEnd()} ${token}` : token));
                    searchRef.current?.focus();
                  }}
                >
                  {token}
                  {hint && <span>{hint}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="nm-filters">
            <div className="nm-seg" role="tablist">
              {segments.map(([key, label, n, color]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={stateFilter === key}
                  className={`nm-seg-btn${stateFilter === key ? " active" : ""}`}
                  onClick={() => setStateFilter(key)}
                >
                  <span className="nm-seg-dot" style={{ background: color }} />
                  <span className="nm-seg-label">{label}</span>
                  <span className="nm-seg-n">{n}</span>
                </button>
              ))}
            </div>

            {chips.length > 0 && (
              <div className="nm-chips">
                {chips.map((chip, i) => (
                  <span className="nm-chip" key={`${chip}-${i}`}>
                    {chip}
                    <button
                      className="nm-chip-x"
                      title="Remove"
                      onClick={() =>
                        setQuery(
                          parsedFilter.tokens
                            .filter((_, index) => index !== i)
                            .map(tokenToRaw)
                            .join(" "),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <span className="nm-filters-spacer" />

            {hydration === "loading" && (
              <span className="nm-restoring">Restoring saved log…</span>
            )}
            {paused && (
              <span className="nm-paused-pill" title="Capturing is paused">
                <Icon name="pause" size={10} />
                Paused
              </span>
            )}
            <span className="nm-shown">
              {list.filtered.length} / {sectionEntries.length}
            </span>
          </div>

          <div className={`nm-body${dock.splitAxis === "y" ? " nm-body-v" : ""}`}>
            <div
              className="nm-list"
              style={
                dock.splitAxis === "x"
                  ? { width: dock.splitSize, flexBasis: dock.splitSize }
                  : { height: dock.splitSize, flexBasis: dock.splitSize }
              }
            >
              <RequestTable
                rows={list.rows}
                columns={columns}
                widths={columnWidths}
                onResizeColumn={onResizeColumn}
                timelines={timelines}
                nowAbs={nowAbs}
                activeRowId={selection.activeRowId}
                sort={sort}
                onSort={onSort}
                onSelect={selection.pin}
                onTogglePin={togglePin}
                onContextMenu={menu.open}
                virtual={virtual}
                scrollerRef={scrollerRef}
                theme={theme}
                empty={
                  <div className="nm-empty nm-empty-list">
                    <span className={`nm-empty-ico nm-empty-ico-${section}`}>
                      <Icon name={EMPTY_COPY[section].icon} size={26} />
                    </span>
                    <p className="nm-empty-title">
                      {sectionEntries.length === 0
                        ? EMPTY_COPY[section].title
                        : "Nothing matches"}
                    </p>
                    <p className="nm-empty-sub">
                      {sectionEntries.length === 0
                        ? EMPTY_COPY[section].sub
                        : "Try a different filter or search."}
                    </p>
                  </div>
                }
              />
            </div>

            <div
              className={`nm-split${dock.splitAxis === "y" ? " nm-split-v" : ""}`}
              onPointerDown={dock.startSplit}
              title="Drag to resize panes"
            />

            <DetailPane
              resolved={selection.resolved}
              hidingLabel={hidingLabel}
              onReveal={revealSelected}
              onClearSelection={selection.clear}
              onTogglePin={togglePin}
              onSelectEntry={selection.pin}
              query={list.normalizedQuery}
              theme={theme}
            />
          </div>

          <StatusBar
            counts={list.counts}
            shown={list.filtered.length}
            totalBytes={list.totalBytes}
            slowestMs={slowestMs}
            pinnedCount={pinnedCount}
            persistedLabel={
              prefs.preserveLog && hydration === "ready"
                ? `${persisted.count} saved · ${formatBytes(persisted.bytes)}`
                : null
            }
            purgeArmed={purgeArmed}
            onPurge={() => {
              if (purgeArmed) {
                void purgeStorage();
                setPurgeArmed(false);
              } else {
                setPurgeArmed(true);
                window.setTimeout(() => setPurgeArmed(false), 3000);
              }
            }}
            onShowErrors={() => setStateFilter("error")}
            onShowPinned={() => setQuery("is:pinned")}
            onOpenShortcuts={() => setShowShortcuts(true)}
          />

          {!dock.maximized && dock.mode === "float" && (
            <div
              className="nm-resize"
              onPointerDown={dock.startPanelResize}
              title="Drag to resize"
            />
          )}
        </div>
      )}

      {exportAnchor && (
        <div
          className="nm-menu"
          style={{ top: exportAnchor.top, right: exportAnchor.right, width: 236 }}
        >
          <button
            className="nm-menu-item"
            onClick={() => {
              exportHar(entries);
              setExportAnchor(null);
            }}
          >
            <Icon name="download" size={13} />
            Export as HAR
          </button>
          <div className="nm-menu-note">
            Opens in Chrome DevTools, Charles or Insomnia — with the decrypted
            bodies.
          </div>
          <div className="nm-menu-sep" />
          <button
            className="nm-menu-item"
            onClick={() => {
              exportLog(entries);
              setExportAnchor(null);
            }}
          >
            <Icon name="download" size={13} />
            Export raw JSON
          </button>
          <div className="nm-menu-note">
            Everything this panel captured, including frames and timings.
          </div>
        </div>
      )}

      {moreAnchor && (
        <div
          className="nm-menu"
          style={{ top: moreAnchor.top, right: moreAnchor.right, width: 232 }}
        >
          <button
            className="nm-menu-item"
            onClick={() => {
              setPreserveLog(!prefs.preserveLog);
              setMoreAnchor(null);
            }}
          >
            <Icon name="preserve" size={13} />
            Preserve log
            {prefs.preserveLog && <span className="nm-menu-hint">on</span>}
          </button>
          <button
            className="nm-menu-item"
            onClick={() => {
              selection.toggleFollow();
              setMoreAnchor(null);
            }}
          >
            <Icon name="follow" size={13} />
            Follow newest
            {selection.isFollowing && <span className="nm-menu-hint">on</span>}
          </button>
          <button
            className="nm-menu-item"
            onClick={() => {
              onDensity(
                DENSITY_ORDER[
                  (DENSITY_ORDER.indexOf(density) + 1) % DENSITY_ORDER.length
                ],
              );
            }}
          >
            <Icon name="density" size={13} />
            Density
            <span className="nm-menu-hint">{density}</span>
          </button>

          <div className="nm-menu-sep" />

          <button
            className="nm-menu-item"
            disabled={entries.length === 0}
            onClick={() => {
              exportHar(entries);
              setMoreAnchor(null);
            }}
          >
            <Icon name="download" size={13} />
            Export as HAR
          </button>
          <button
            className="nm-menu-item"
            disabled={entries.length === 0}
            onClick={() => {
              exportLog(entries);
              setMoreAnchor(null);
            }}
          >
            <Icon name="download" size={13} />
            Export raw JSON
          </button>

          {panel.tinyToolbar && (
            <>
              <div className="nm-menu-sep" />
              <button
                className="nm-menu-item"
                onClick={() => {
                  onMode(dock.mode === "bottom" ? "right" : dock.mode === "right" ? "float" : "bottom");
                  setMoreAnchor(null);
                }}
              >
                <Icon name="dock-bottom" size={13} />
                Dock position
                <span className="nm-menu-hint">{dock.mode}</span>
              </button>
            </>
          )}

          <div className="nm-menu-sep" />
          <button
            className="nm-menu-item"
            onClick={() => {
              setShowShortcuts(true);
              setMoreAnchor(null);
            }}
          >
            <Icon name="keyboard" size={13} />
            Keyboard shortcuts
            <span className="nm-menu-hint">?</span>
          </button>
        </div>
      )}

      {menu.menu && (
        <ContextMenu
          state={menu.menu}
          onClose={menu.close}
          onArm={menu.arm}
          onFilterToType={setQuery}
        />
      )}
      {showShortcuts && <ShortcutsSheet onClose={() => setShowShortcuts(false)} />}
    </div>
  );

  // Portal to <body> so the monitor escapes any stacking/transform context and
  // sits above modal dialogs.
  return createPortal(ui, document.body);
}
