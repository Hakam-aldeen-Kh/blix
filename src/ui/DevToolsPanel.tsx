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

import { setAuthorizationMasking } from "../capture/monitorAuth";
import { getActiveDbName, isSharedDefaultDb } from "../capture/monitorConfig";
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
import type { Corner, DockMode, MonitorState } from "../capture/monitorTypes";
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
import { CommandPalette, type CommandGroup } from "./components/CommandPalette";
import { ContextMenu } from "./components/ContextMenu";
import { DatabasesSheet } from "./components/DatabasesSheet";
import { DetailPane } from "./components/DetailPane";
import { Icon, type IconName } from "./components/Icon";
import { CORNER_STYLE, FabDragPreview, MonitorFab } from "./components/MonitorFab";
import { MonitorToolbar } from "./components/MonitorToolbar";
import { RequestTable } from "./components/RequestTable";
import { ShortcutsSheet } from "./components/ShortcutsSheet";
import { SourcesRail, SECTION_DEFS } from "./components/SourcesRail";
import { StatusBar, STORAGE_NOTES, type StorageNote } from "./components/StatusBar";
import {
  DENSITY_ROW_H,
  MIN_DETAIL_H,
  MIN_DETAIL_W,
  MIN_LIST_H,
  MIN_LIST_W,
  FAB_RADIUS,
  normalizeFabRadius,
  type FabRadius,
  parseHiddenColumns,
  RAIL_W,
  RAIL_W_MINI,
  TOGGLEABLE_COLUMNS,
  type ColumnId,
  type Density,
  PALETTE_KEY,
} from "./constants/ui";
import { Menu, MenuItem, type MenuAnchor } from "./components/Menu";
import { ExportMenu, type ExportScope } from "./components/ExportMenu";
import { ThemeMenu } from "./components/ThemeMenu";
import { BX_PALETTES, bxTokens, legacyAliases } from "./themes/bx";
import { assertThemes } from "./themes/check";
import {
  normalizeThemePref,
  resolveTheme,
  themeTokens,
  type ThemePref,
} from "./themes/themes";

const DENSITY_ORDER: Density[] = ["compact", "normal", "comfy"];

const SECTION_LABEL: Record<Section, string> = {
  network: "Network",
  realtime: "Realtime",
  redux: "Redux",
  query: "Query",
};

/**
 * Empty states, per source.
 *
 * Three of the four sources need something installed before they can show
 * anything, and an empty list is exactly where a developer finds that out —
 * so the setup call is *in* the empty state, one click from the clipboard,
 * rather than in a README they would have to know to go looking for. The
 * caveat is there for the same reason: capture has to be installed where the
 * adapter or store is constructed, and "module scope, not a component" is the
 * mistake this panel cannot detect on the developer's behalf.
 */
const EMPTY_COPY: Record<
  Section,
  {
    icon: IconName;
    title: string;
    sub: string;
    /** Each one must compile against `capture/index.ts` as written — two of
     * these named exports that did not exist, which is the worst possible
     * first thing to copy. A `label` names which setup a snippet is for when
     * there is more than one. */
    snippets?: { code: string; label?: string }[];
  }
> = {
  network: {
    icon: "globe",
    title: "No requests yet",
    sub: "Captured requests appear here as the app makes them. If nothing arrives, Blix may not be attached to the HTTP client this app actually uses.",
    snippets: [
      { label: "axios", code: "attachHttpMonitor(apiClient)" },
      { label: "fetch", code: "attachFetchMonitor()" },
    ],
  },
  realtime: {
    icon: "bolt",
    title: "No realtime traffic yet",
    sub: "Frames appear once an adapter is tapped. Capture must be installed where the adapter singleton is constructed — module scope, not a component.",
    // The wrapped adapter is the return value; a bare call taps nothing.
    snippets: [{ code: 'const realtime = tapRealtimeAdapter(adapter, "pusher")' }],
  },
  redux: {
    icon: "redux",
    title: "No Redux actions yet",
    sub: "Actions dispatched anywhere in the app appear here, with a bounded diff of what each one changed.",
    snippets: [
      {
        code: "middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(createReduxMonitorMiddleware())",
      },
    ],
  },
  query: {
    icon: "query",
    title: "No query activity yet",
    sub: "Cache lifecycle — fetch, success, invalidate, garbage-collect — appears here once the query client is tapped.",
    // From an effect, as the README says: under Strict Mode a client created
    // in a `useState` initializer is created twice, and the tap has to land
    // on the one React keeps.
    snippets: [{ code: "useEffect(() => tapQueryClient(queryClient), [queryClient])" }],
  },
};
import { copyText, formatBytes, responseCopyText } from "./helpers/format";
import { niceScale, rowTiming, type RowTiming } from "./helpers/waterfall";
import { buildLinkGraph, linkedEntries, sectionOf } from "./helpers/entryLinks";
import { useHostTheme } from "./hooks/useHostTheme";
import { useContextMenu } from "./hooks/useContextMenu";
import { useDockGeometry } from "./hooks/useDockGeometry";
import { useFabDrag } from "./hooks/useFabDrag";
import { useMonitorClock } from "./hooks/useMonitorClock";
import { hidingReasons, useMonitorList } from "./hooks/useMonitorList";
import { useMonitorSelection } from "./hooks/useMonitorSelection";
import { PANEL_CHROME_H, TINY_PANEL_BELOW, usePanelSize } from "./hooks/usePanelSize";
import { useVirtualRows } from "./hooks/useVirtualRows";
import { parseFilter } from "./services/filterQuery";
import { isInside, isTypingEvent, shortcutKey } from "./services/keyboard";
import { canReplay, requestReplay } from "./services/replayRequest";
import { toCurl, toFetch } from "./services/snippets";
import { MONITOR_STYLES } from "./styles/monitorStyles";
import {
  normalizeDataFormat,
  SECTION_NOUNS,
  type DataFormat,
  type Section,
  type Sort,
  type SortKey,
  type StateFilter,
} from "./types/monitorUi";

/** The order "Cycle dock position" steps through. */
const DOCK_CYCLE: DockMode[] = ["bottom", "right", "top", "left", "float"];
const nextDock = (mode: DockMode): DockMode =>
  DOCK_CYCLE[(DOCK_CYCLE.indexOf(mode) + 1) % DOCK_CYCLE.length];

export default function DevTools() {
  const { apiClient } = useContext(BlixContext);
  const entries = useSyncExternalStore(
    networkMonitor.subscribe,
    networkMonitor.getSnapshot,
    networkMonitor.getServerSnapshot,
  );
  const { prefs, hydration, storage } = useSyncExternalStore(
    prefsStore.subscribe,
    prefsStore.getSnapshot,
    prefsStore.getServerSnapshot,
  );
  // Theme is three values, not one: what the developer *chose* (which may be
  // "follow the app"), what they are currently hovering in the picker, and
  // what that resolves to. The picker's check mark tracks the choice; the root
  // element paints the preview when there is one, so hovering a row repaints
  // the panel without ever changing what is stored.
  const host = useHostTheme();
  const [previewPref, setPreviewPref] = useState<ThemePref | null>(null);
  const dataFormat = normalizeDataFormat(prefs.dataFormat);
  const themePref = normalizeThemePref(prefs.theme);
  const theme = resolveTheme(previewPref ?? themePref, host);
  // Written to the root's `style` rather than shipped as one CSS block per
  // theme — see `BASE_THEME_CSS`. Memoized on the resolved theme so hovering
  // down the picker doesn't rebuild ~80 properties per pointer event.
  // Two vocabularies for the length of the redesign: `--bx-*` is the slot
  // contract every rebuilt surface reads, `--nm-*` the derived set the ones
  // still waiting their phase read. The second retires with the last of them.
  const themeStyle = useMemo(
    () => ({
      ...themeTokens(theme.palette),
      ...legacyAliases(BX_PALETTES[theme.id], theme.base),
      ...bxTokens(BX_PALETTES[theme.id], theme.base),
    }),
    [theme],
  );

  // Once, in development: a theme that cannot fill every slot, and text below
  // 4.5:1 on a ground it actually lands on. Reports; never corrects.
  useEffect(assertThemes, []);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showDatabases, setShowDatabases] = useState(false);
  /** Where the column picker opens, or null. Anchored like the header's menus
   * so it lands under whatever asked for it — the column head, or the row in
   * the overflow menu. */
  const [columnAnchor, setColumnAnchor] = useState<MenuAnchor | null>(null);
  /** A purge that did not happen — almost always another tab holding the
   * database open. Shown rather than swallowed: the three purge controls all
   * claimed success unconditionally before `destroyDb` observed its request. */
  const [purgeError, setPurgeError] = useState<string | null>(null);
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
  // Which entries an export covers. Session state rather than a stored pref:
  // it belongs to the export you are about to do, and defaulting to "shown"
  // every time is the safer of the two — a too-small export is obvious, a
  // too-large one is not.
  const [exportScope, setExportScope] = useState<ExportScope>("shown");
  // A single piece of state rather than one `useState` per menu: each toggle
  // button only clears *its own* anchor when opening (see MonitorToolbar's
  // `onExportMenu(exportOpen ? null : ...)`), so independent booleans let two
  // menus end up open at once — open export, then click "more", and export
  // never closes. Only one can ever be visible, so model it as one nullable
  // union and keep this file's per-menu call sites unchanged via the derived
  // values below.
  type Which = "export" | "more" | "theme";
  const [menuState, setMenuState] = useState<
    { which: Which; anchor: MenuAnchor } | null
  >(null);
  const anchorFor = (which: Which) =>
    menuState?.which === which ? menuState.anchor : null;
  const exportAnchor = anchorFor("export");
  const moreAnchor = anchorFor("more");
  const themeAnchor = anchorFor("theme");
  const openMenu = useCallback(
    (which: Which) => (a: MenuAnchor | null) =>
      setMenuState(a ? { which, anchor: a } : null),
    [],
  );
  const setExportAnchor = useMemo(() => openMenu("export"), [openMenu]);
  const setMoreAnchor = useMemo(() => openMenu("more"), [openMenu]);
  const setThemeAnchor = useMemo(() => openMenu("theme"), [openMenu]);

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

  // The same arrangement for `Authorization` masking: the pref is the source
  // of truth, pushed into the capture layer — which starts masked, so nothing
  // captured before this effect runs is ever kept in full.
  const authUnmasked = prefs.maskAuthorization === false;
  useEffect(() => {
    setAuthorizationMasking(!authUnmasked);
  }, [authUnmasked]);
  const toggleAuthMasking = useCallback(() => {
    savePrefs({
      maskAuthorization: prefsStore.getSnapshot().prefs.maskAuthorization === false,
    });
  }, []);

  // The purge notice is informational, not a dialog — it goes away on its own
  // rather than making the developer dismiss it.
  useEffect(() => {
    if (!purgeError) return;
    const timer = window.setTimeout(() => setPurgeError(null), 8000);
    return () => window.clearTimeout(timer);
  }, [purgeError]);

  // Each section is its own view over the buffer — every kind of traffic has
  // different columns and a different notion of a row. Computed in one pass
  // over `entries` rather than three separate `useMemo`s (each re-scanning
  // the whole buffer and re-deriving `sectionOf(e)` per item): the buffer can
  // hold hundreds of entries and this recomputes on every captured event.
  // `allErrors`/`allPending` span every source: the launcher badge summarizes
  // the whole log, whereas `list.counts` only covers the source last open.
  const { sectionEntries, sectionCounts, sectionErrors, allErrors, allPending } = useMemo(() => {
    const counts: Record<Section, number> = { network: 0, realtime: 0, redux: 0, query: 0 };
    const errorsBySection: Record<Section, number> = { network: 0, realtime: 0, redux: 0, query: 0 };
    const filtered: MonitorEntry[] = [];
    let errors = 0;
    let pending = 0;
    for (const e of entries) {
      const s = sectionOf(e);
      counts[s] += 1;
      if (s === section) filtered.push(e);
      if (e.state === "error") {
        errors += 1;
        errorsBySection[s] += 1;
      } else if (e.state === "pending") pending += 1;
    }
    return {
      sectionEntries: filtered,
      sectionCounts: counts,
      sectionErrors: errorsBySection,
      allErrors: errors,
      allPending: pending,
    };
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

  /**
   * A stacked panel too short for two panes shows one at a time.
   *
   * Which one is a view state, not the selection: the selection is stored and
   * restored, so deriving the pane from it would reopen the panel on a detail
   * pane with no list behind it. Picking a row goes to the detail; its Back
   * button returns to the list and leaves the selection where it was.
   */
  const [shortView, setShortView] = useState<"list" | "detail">("list");
  const pinSelection = selection.pin;
  const selectRow = useCallback(
    (id: string) => {
      pinSelection(id);
      setShortView("detail");
    },
    [pinSelection],
  );

  /**
   * Which columns the developer has switched off.
   *
   * Stored as a list of what is *off* rather than a map of what is on, so a
   * column added in a later version arrives visible instead of arriving
   * hidden for everyone who ever opened this menu.
   */
  const hiddenColumns = useMemo(
    () => parseHiddenColumns(prefs.hiddenColumns),
    [prefs.hiddenColumns],
  );
  const toggleColumn = useCallback(
    (id: ColumnId) => {
      const next = new Set(hiddenColumns);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      savePrefs({ hiddenColumns: [...next].join(",") });
    },
    [hiddenColumns],
  );

  const fabRadius = normalizeFabRadius(prefs.fabRadius);

  const rowHeight = DENSITY_ROW_H[density];
  const virtual = useVirtualRows(list.rows.length, scrollerRef, rowHeight, open);

  // One ticker for the whole panel, running only while something is pending.
  const nowAbs = useMonitorClock(list.counts.pending > 0);

  // Cross-source correlation, indexed once per buffer change rather than
  // re-derived per row — see `helpers/entryLinks.ts`.
  const links = useMemo(() => buildLinkGraph(entries), [entries]);

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
  const onDataFormat = useCallback((next: DataFormat) => {
    savePrefs({ dataFormat: next });
  }, []);
  // Read straight from prefs rather than mirroring it in local state: prefs
  // already re-render this component through `useSyncExternalStore`, and the
  // mirror only created a second source of truth to keep in step.
  const railCollapsed = prefs.railCollapsed === true;
  const onToggleRail = useCallback(() => {
    savePrefs({ railCollapsed: !prefsStore.getSnapshot().prefs.railCollapsed });
  }, []);
  const onTheme = useCallback((next: ThemePref) => {
    savePrefs({ theme: next });
    // Left open on purpose: picking a theme is a comparison, and closing the
    // menu after every pick would mean reopening it to try the next one.
    // The hover preview is left alone too — the pointer is still on the row
    // that was just picked, and clearing it would flash.
  }, []);

  /**
   * Go to the next pinned entry, wherever it is.
   *
   * The status bar's count used to apply an `is:pinned` filter, which answers
   * "which are pinned" — but you pinned them precisely so you could come back
   * to *one*, and a filter makes you find it again inside a shorter list.
   * This selects it instead; the effect that keeps the selection in view does
   * the scrolling, and switching source first means a pin you left in Redux is
   * still one click away from the Network tab.
   *
   * Repeated clicks cycle, so two pins are a toggle between them rather than a
   * button that only ever does one thing.
   */
  const goToPinned = useCallback(() => {
    const pinned = entries.filter((e) => e.pinned);
    if (pinned.length === 0) return;
    const at = pinned.findIndex((e) => e.id === selection.activeRowId);
    const next = pinned[(at + 1) % pinned.length];
    const target = sectionOf(next);
    if (target !== section) onSection(target);
    selection.pin(next.id);
  }, [entries, section, onSection, selection]);

  // Changing the dock moves the toolbar, which invalidates the export menu's
  // measured anchor — dismiss it as part of the interaction rather than
  // reacting to the change afterwards.
  const closeMenus = useCallback(() => {
    setMenuState(null);
    setColumnAnchor(null);
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

  // The store call is deliberately *outside* the updater. React runs an
  // updater during the render phase, and `setPaused` emits synchronously to
  // every `useSyncExternalStore` subscriber — which is a setState from inside
  // a render, and React says so.
  const togglePause = useCallback(() => {
    const next = !networkMonitor.isPaused;
    networkMonitor.setPaused(next);
    setPaused(next);
  }, []);

  const togglePin = useCallback((id: string) => networkMonitor.togglePin(id), []);

  const openPanel = useCallback(() => {
    setOpen(true);
    dock.ensureFloatPos();
  }, [dock]);

  const onDockCorner = useCallback((corner: Corner) => dock.setCorner(corner), [dock]);
  const fab = useFabDrag(openPanel, onDockCorner);

  /**
   * Replays an HTTP entry — for the Replay button, the `r` shortcut and the
   * palette alike, so a write is confirmed the same way wherever it was asked
   * for: the first ask arms it, the second sends it. See `requestReplay`.
   *
   * Armed by entry id rather than a bare boolean, so selecting another request
   * never leaves it one keypress from being re-fired.
   */
  const [replayArmedId, setReplayArmedId] = useState<string | null>(null);
  const runReplay = useCallback(
    (entry: MonitorEntry) => {
      const outcome = requestReplay(entry, apiClient, replayArmedId === entry.id);
      if (outcome !== "armed") {
        setReplayArmedId(null);
        return;
      }
      setReplayArmedId(entry.id);
      window.setTimeout(
        () => setReplayArmedId((id) => (id === entry.id ? null : id)),
        3000,
      );
    },
    [apiClient, replayArmedId],
  );

  /* ── Keyboard ─────────────────────────────────────────────────────────
     Two listeners, because there are two scopes. Opening and closing the
     panel works from anywhere on the page; everything else belongs to the
     panel and only runs for a key pressed inside it. */

  // Ctrl+` toggles the panel from anywhere, even while typing — by the
  // physical key, so it is the same key on an Arabic layout, where it types ذ.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutKey(e) === "`" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => {
          if (!o) dock.ensureFloatPos();
          return !o;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock]);

  /**
   * The panel's own shortcuts — `onKeyDown` on the monitor root.
   *
   * These are single unmodified keys, so where they listen is the whole
   * safety story. They used to hang on `window` and fire for a key pressed
   * anywhere on the page: typing in the host app's rich-text editor paused
   * capture and cleared the log, Ctrl+Shift+C wiped it on the way to the
   * browser's element picker, and Ctrl+R re-sent the selected request before
   * reloading. Now a key counts only when it was pressed inside the panel,
   * with no Ctrl, ⌘ or Alt held, and not into text.
   *
   * On the root rather than as a native listener, so it runs *after* the
   * widgets inside it: a payload tree that has already handled an arrow key
   * has called `preventDefault`, and stopping propagation here keeps a key
   * the panel consumed from reaching the host app's own handlers.
   */
  const onPanelKey = (event: React.KeyboardEvent) => {
    if (!open) return;
    const e = event.nativeEvent;
    if (!isInside(rootRef.current, e)) return;

    // The palette is reachable from anywhere in the panel, including from
    // inside the filter field — it is the one shortcut that has to work
    // while typing, since half of what it offers is filter syntax.
    if (shortcutKey(e).toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.altKey) {
      event.preventDefault();
      event.stopPropagation();
      setShowPalette((p) => !p);
      return;
    }

    // Something inside the panel already acted on this key. Without this,
    // the payload tree's arrow keys moved the tree *and* stepped the list
    // selection underneath it — which swapped the entry out from under the
    // tree the developer was walking.
    if (e.defaultPrevented) return;

    // Before the typing check: Escape leaves the filter field too. An Escape
    // that is cancelling an IME composition is the input method's, not ours.
    if (shortcutKey(e) === "Escape") {
      if (e.isComposing) return;
      // Consumed here, so the same keypress does not also close a dialog of
      // the host app's that happens to be open behind the panel.
      event.stopPropagation();
      if (showPalette) setShowPalette(false);
      else if (showDatabases) setShowDatabases(false);
      else if (showShortcuts) setShowShortcuts(false);
      else if (menu.menu) menu.close();
      else if (menuState || columnAnchor) closeMenus();
      else setOpen(false);
      return;
    }

    // Ctrl, ⌘ and Alt combinations are the browser's and the host app's.
    // Shift is allowed: it is what tells `c` from `⇧C`.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingEvent(e)) return;

    const rows = list.filtered;
    const selected = selection.resolved.entry;

    switch (shortcutKey(e)) {
      case "?":
        event.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      case "/":
        event.preventDefault();
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
        event.preventDefault();
        selection.step(1, rows);
        return;
      case "ArrowUp":
      case "k":
        event.preventDefault();
        selection.step(-1, rows);
        return;
      case "g":
        if (rows[0]) selection.pin(rows[0].id);
        return;
      case "G":
        if (rows.length) selection.pin(rows[rows.length - 1].id);
        return;
      case "x":
        selection.clear();
        return;
      case " ":
        event.preventDefault();
        togglePause();
        return;
      case "L":
        setPreserveLog(!prefs.preserveLog);
        return;
      case "C":
        networkMonitor.clear();
        selection.clear();
        return;
    }

    if (!selected) return;

    switch (shortcutKey(e)) {
      case "p":
        togglePin(selected.id);
        break;
      case "u":
        void copyText(`${selected.baseURL ?? ""}${selected.url}`);
        break;
      case "c":
        void copyText(responseCopyText(selected));
        break;
      case "r":
        // The same path as the Replay button: a write is armed by the first
        // press and sent by the second, never sent outright.
        runReplay(selected);
        break;
    }
  };

  // The shortcuts above only hear keys pressed inside the root, so opening
  // the panel has to put focus there — otherwise it opens on a page whose
  // focus is still in the host app and nothing responds until a click.
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) {
      root.focus({ preventScroll: true });
    }
  }, [open]);

  // The palette and the two sheets hold focus while they are up, and take it
  // with them when they go: the element that had it is unmounted, focus falls
  // to `<body>`, and the panel's shortcuts — which only hear keys pressed
  // inside the root — went dead until a click. That included the second `r`
  // of a write confirmation armed from the palette. So when the last of them
  // closes with the panel still open, focus comes back to the root. Only if it
  // would otherwise be on `<body>`: a command that moved focus itself (the
  // filter field) or a press on the host page keeps what it chose.
  const overlayOpen = showPalette || showShortcuts || showDatabases;
  const hadOverlay = useRef(false);
  useEffect(() => {
    if (overlayOpen) {
      hadOverlay.current = true;
      return;
    }
    if (!hadOverlay.current) return;
    hadOverlay.current = false;
    if (!open) return;
    const root = rootRef.current;
    const active = document.activeElement;
    if (root && (!active || active === document.body)) {
      root.focus({ preventScroll: true });
    }
  }, [overlayOpen, open]);

  // And a press on something that takes no focus of its own — the header, a
  // pane's background — would otherwise leave focus on the host page. A press
  // on a control still moves focus on to that control afterwards.
  const keepFocusInside = () => {
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };

  // The anchor is a viewport coordinate, so anything that moves the toolbar
  // invalidates it. Cheaper and less surprising than re-measuring.
  useEffect(() => {
    if (!menuState) return;
    window.addEventListener("resize", closeMenus);
    return () => window.removeEventListener("resize", closeMenus);
  }, [menuState, closeMenus]);

  // A hover preview must not outlive the picker. Keyed off the menu closing
  // rather than cleared at each of the four call sites that can close it
  // (Escape, outside click, the toolbar button, opening another menu) — one of
  // them would eventually be missed and leave the panel stuck in a theme the
  // developer never chose.
  useEffect(() => {
    if (!themeAnchor) setPreviewPref(null);
  }, [themeAnchor]);

  // A press outside the monitor. Captured on `pointerdown` so it fires even
  // while a Radix modal dialog has the rest of the page pointer-locked. The
  // badge opens via a click, so the opening interaction never reaches here.
  //
  // It always dismisses what is transient — the menus, the palette. It closes
  // the *panel* only when the panel floats: a floating panel is in the way of
  // the page under it, while a docked one has its own side of the screen, and
  // exists so the app can be used while the log is read.
  const dockMode = dock.mode;
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      // Scoped to the monitor root rather than the panel. The context menu,
      // export menu and shortcut sheet are siblings of the panel, and the
      // listener is registered in the capture phase — so a `stopPropagation`
      // inside them fires too late and every menu click closed the panel.
      if (rootRef.current && !isInside(rootRef.current, e)) {
        if (dockMode === "float") setOpen(false);
        setShowPalette(false);
        menu.close();
        closeMenus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, dockMode, menu, closeMenus]);

  /**
   * Pressing anywhere that is not a menu closes the open one.
   *
   * The handler above only fires for presses *outside the monitor root*, so
   * with the theme picker open, clicking a request row, the toolbar or the
   * detail pane left it hanging over the panel — it could only be dismissed
   * with Escape or by finding its button again. While the panel is open it is
   * the whole world as far as the developer is concerned, and click-away-to-
   * dismiss is what every menu everywhere does.
   *
   * `pointerdown` in the capture phase, matching the handler above: it
   * dismisses on press like a native menu, and a `stopPropagation` inside a
   * menu cannot suppress it. The press is otherwise left alone — it still
   * selects the row or hits the button underneath, rather than being eaten as
   * a "first click just closes the menu", which costs a click every time.
   *
   * A press on a menu's *own trigger* is left to that button: it already
   * toggles itself, and closing here first would have it re-open what it just
   * closed. The row context menu has no such button, so it always goes.
   */
  useEffect(() => {
    if (!menuState && !menu.menu) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(".nm-menu")) return;
      menu.close();
      if (!target?.closest('[aria-haspopup="menu"]')) closeMenus();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [menuState, menu.menu, menu.close, closeMenus]);

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
  // Said instead of a saved count, never beside one: while the database cannot
  // be written, whatever the count says is not on disk. "Unavailable" only
  // matters to someone who asked for the log to be kept.
  const storageNote: StorageNote | null =
    storage === "blocked"
      ? STORAGE_NOTES.blocked
      : storage === "unavailable" && prefs.preserveLog
        ? STORAGE_NOTES.unavailable
        : null;
  // Worst state wins: the badge and the header logo are a health light, so an
  // error has to outrank an in-flight request outranking "all quiet".
  const nouns = SECTION_NOUNS[section];
  const pendingLabel =
    section === "realtime" ? "Open" : section === "query" ? "Fetching" : "Pending";

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


  // One pass over the visible durations feeds three consumers: the status bar
  // and rail totals, the list's duration bars, and the Timing tab's
  // "is this slow?" comparison.
  const durations = list.filtered
    .filter((e) => e.durationMs != null)
    .map((e) => e as MonitorEntry & { durationMs: number });
  const slowestEntry = durations.reduce<(MonitorEntry & { durationMs: number }) | null>(
    (worst, e) => (worst == null || e.durationMs > worst.durationMs ? e : worst),
    null,
  );
  const slowestMs = slowestEntry?.durationMs ?? 0;

  // One scale for the whole list, so the bars are comparable to each other
  // rather than each to itself, and rounded so it holds still while requests
  // arrive instead of rescaling every row when a new worst case lands.
  const scaleMs = niceScale(slowestMs);
  const timings = useMemo(() => {
    const out = new Map<string, RowTiming>();
    for (const row of list.rows) {
      if (row.kind === "divider") continue;
      out.set(row.entry.id, rowTiming(row.entry, scaleMs, nowAbs));
    }
    return out;
  }, [list.rows, scaleMs, nowAbs]);
  const sortedDurations = durations.map((e) => e.durationMs).sort((a, b) => a - b);
  const medianMs = sortedDurations.length
    ? sortedDurations[Math.floor(sortedDurations.length / 2)]
    : 0;
  const pinnedCount = entries.filter((e) => e.pinned).length;
  const firstFailing = list.filtered.find((e) => e.state === "error");
  const linked = selectedEntry ? linkedEntries(selectedEntry.id, links) : [];

  // Below this the labels cost more than they are worth; the rail keeps its
  // identity dots and hands the width to the list. A developer's own collapse
  // still wins, and re-widening the panel restores what they chose.
  const railMini = railCollapsed || (panel.measured && panel.width < 760);
  const railWidth = railMini ? RAIL_W_MINI : RAIL_W;

  /**
   * The split, clamped to what the panel can actually give it.
   *
   * The stored size is a width the developer once dragged, and the panel it
   * was dragged in may since have been docked, shrunk or reopened on a smaller
   * screen. The drag handler clamps as you drag; nothing clamped on the way
   * back in, so a 580px list inside a 580px panel left the detail pane 40px
   * wide and unreadable. Same bounds as the drag, applied to what is stored.
   */
  // Stacked, the panes share the body, not the panel: the header and the
  // status bar are not theirs to divide.
  const splitExtent =
    dock.splitAxis === "x" ? panel.width - railWidth : panel.height - PANEL_CHROME_H;
  const [minSelf, minOther] =
    dock.splitAxis === "x" ? [MIN_LIST_W, MIN_DETAIL_W] : [MIN_LIST_H, MIN_DETAIL_H];
  // With room for both minimums the list may take anything up to what leaves
  // the detail its own. Without it - a 600px bottom dock is wider than the
  // stacking threshold but, less the sidebar, narrower than the two minimums -
  // the shortfall is shared in proportion. It used to fall through to the
  // stored size, which left the detail pane whatever was over.
  const splitRoom = splitExtent - minOther;
  const listCap =
    splitRoom >= minSelf
      ? splitRoom
      : Math.round((splitExtent * minSelf) / (minSelf + minOther));
  const listSize = panel.measured ? Math.min(dock.splitSize, listCap) : dock.splitSize;

  const singlePane = dock.splitAxis === "y" && panel.shortPanel;
  const singleView = !singlePane
    ? null
    : shortView === "detail" && selection.resolved.entry
      ? "detail"
      : "list";


  const openPalette = () => setShowPalette(true);
  const closePalette = () => setShowPalette(false);

  // All three purge controls route through here, so a delete blocked by
  // another tab is reported the same way wherever it was triggered from.
  const purge = useCallback(() => {
    void purgeStorage().then((outcome) => {
      setPurgeError(outcome.ok ? null : outcome.message);
    });
  }, []);

  /**
   * What the palette offers.
   *
   * Roughly half of these have no other affordance in the redesigned chrome —
   * sort order, density, the copy formats — which is the point: the header
   * spends its width on what you read constantly, and everything you reach for
   * occasionally is one keystroke away instead of one button each.
   */
  const replayCheck = selectedEntry ? canReplay(selectedEntry, apiClient) : null;

  const commands: CommandGroup[] = [
    {
      name: "SESSION",
      items: [
        {
          id: "pause",
          label: paused ? "Resume capture" : "Pause capture",
          key: "Space",
          run: togglePause,
        },
        {
          id: "clear",
          label: "Clear log",
          note: "pinned entries are kept",
          key: "⇧C",
          danger: true,
          run: () => {
            networkMonitor.clear();
            selection.clear();
          },
        },
        {
          id: "preserve",
          label: prefs.preserveLog ? "Stop preserving the log" : "Preserve log across reloads",
          note: "writes to IndexedDB",
          key: "⇧L",
          run: () => setPreserveLog(!prefs.preserveLog),
        },
        {
          id: "mask-auth",
          label: authUnmasked
            ? "Mask Authorization values again"
            : "Show Authorization values in full",
          note: authUnmasked
            ? "unmasked now · never exported or saved"
            : "new requests · never exported or saved",
          run: toggleAuthMasking,
        },
        {
          id: "follow",
          label: selection.isFollowing ? "Stop following the newest" : "Follow the newest entry",
          run: selection.toggleFollow,
        },
      ],
    },
    {
      name: "SOURCES",
      items: SECTION_DEFS.map((s) => ({
        id: `section-${s.id}`,
        label: `Go to ${s.label}`,
        count: String(sectionCounts[s.id]),
        key: s.hotkey,
        run: () => onSection(s.id),
      })),
    },
    {
      name: "SELECTED",
      items: [
        {
          id: "replay",
          label: "Replay request",
          key: "r",
          disabled: !replayCheck?.can,
          // A disabled row with no reason reads as a bug. Fetch entries are the
          // common case now: replay is axios-only.
          note: replayCheck && !replayCheck.can ? replayCheck.reason : undefined,
          // Arms a write rather than sending it — the palette is a keyboard
          // path like `r`, and gets the same confirmation.
          run: () => {
            if (selectedEntry) runReplay(selectedEntry);
          },
        },
        {
          id: "curl",
          label: "Copy as cURL",
          note: "Authorization always masked",
          disabled: !selectedEntry || (selectedEntry.kind ?? "http") !== "http",
          run: () => selectedEntry && void copyText(toCurl(selectedEntry)),
        },
        {
          id: "fetch",
          label: "Copy as fetch",
          disabled: !selectedEntry || (selectedEntry.kind ?? "http") !== "http",
          run: () => selectedEntry && void copyText(toFetch(selectedEntry)),
        },
        {
          id: "copy-url",
          label: "Copy URL",
          key: "u",
          disabled: !selectedEntry,
          run: () =>
            selectedEntry &&
            void copyText(`${selectedEntry.baseURL ?? ""}${selectedEntry.url}`),
        },
        {
          id: "pin",
          label: selectedEntry?.pinned ? "Unpin entry" : "Pin entry",
          key: "p",
          disabled: !selectedEntry,
          run: () => selectedEntry && togglePin(selectedEntry.id),
        },
        ...linked.map((other) => ({
          id: `link-${other.id}`,
          label: `Jump to linked ${sectionOf(other)} entry`,
          note: other.url,
          run: () => {
            onSection(sectionOf(other));
            selection.pin(other.id);
          },
        })),
      ],
    },
    {
      name: "LIST",
      items: (
        [
          ["time", "newest first"],
          ["name", "alphabetical"],
          ["status", "failures together"],
          ["duration", "slowest first"],
          ["size", "largest first"],
        ] as [SortKey, string][]
      ).map(([key, note]) => ({
        id: `sort-${key}`,
        label: `Sort by ${key}`,
        note: sort.key === key ? `${note} · on` : note,
        run: () => onSort(key),
      })),
    },
    {
      name: "FILTER",
      items: (
        [
          ["is:error", "failures only"],
          ["is:pinned", "pinned only"],
          ["status:5xx", "server errors"],
          ["slower-than:500", "over half a second"],
          ["larger-than:100k", "heavy payloads"],
          ["has:initiator", "with a call stack"],
          ["-polling", "exclude a term"],
        ] as [string, string][]
      ).map(([token, note]) => ({
        id: `filter-${token}`,
        label: token,
        note,
        run: () => {
          setQuery((q) => (q ? `${q.trimEnd()} ${token}` : token));
          searchRef.current?.focus();
        },
      })),
    },
    {
      name: "PANEL",
      items: [
        {
          id: "density",
          label: "Cycle row density",
          note: density,
          run: () =>
            onDensity(
              DENSITY_ORDER[(DENSITY_ORDER.indexOf(density) + 1) % DENSITY_ORDER.length],
            ),
        },
        {
          id: "dock",
          label: "Cycle dock position",
          note: dock.mode,
          run: () => onMode(nextDock(dock.mode)),
        },
        {
          id: "rail",
          label: railMini ? "Expand the sources rail" : "Collapse the sources rail",
          run: onToggleRail,
        },
        {
          id: "shortcuts",
          label: "Keyboard shortcuts",
          key: "?",
          run: () => setShowShortcuts(true),
        },
        {
          id: "purge",
          label: "Purge the saved log",
          note: persisted.count ? `${persisted.count} on disk` : "nothing saved",
          danger: true,
          disabled: persisted.count === 0,
          run: purge,
        },
        {
          id: "databases",
          label: "Databases on this origin",
          // The active name is the answer to "am I even looking at my own
          // app's log?", which is the question that sends a developer here.
          note: getActiveDbName(),
          run: () => setShowDatabases(true),
        },
      ],
    },
  ];

  const ui = (
    <div
      ref={rootRef}
      className={`nm-root nm-theme-${theme.id} nm-${theme.base}`}
      // Focusable from script only: see `keepFocusInside`.
      tabIndex={-1}
      onKeyDown={onPanelKey}
      onPointerDownCapture={keepFocusInside}
      style={
        {
          ...CORNER_STYLE[dock.corner],
          ...themeStyle,
          // Tells the browser which way round this subtree is, so its own
          // chrome — native scrollbars, form controls, the caret — matches
          // instead of defaulting to the host page's scheme.
          colorScheme: theme.base,
          // Row height is a setting, not a constant, so it cannot live in
          // `tokens.ts` — `constants/ui.ts` owns the three steps and the
          // number reaches CSS down the same path the theme's colours take.
          // One value, read by both the stylesheet and the virtualizer.
          "--nm-row-h": `${rowHeight}px`,
          "--bx-row": `${rowHeight}px`,
          "--bx-r-fab": FAB_RADIUS[fabRadius].css,
        } as React.CSSProperties
      }
    >
      {/* React 19 hoists and dedupes this into <head>. */}
      <style precedence="nm">{MONITOR_STYLES}</style>

      {!open && !fab.dragPos && (
        <MonitorFab
          paused={paused}
          total={entries.length}
          counts={sectionCounts}
          sourceErrors={sectionErrors}
          errors={allErrors}
          pending={allPending}
          onPointerDown={fab.start}
        />
      )}

      {fab.dragPos && (
        <FabDragPreview pos={fab.dragPos} paused={paused} counts={sectionCounts} />
      )}

      {open && (
        <div
          ref={panelRef}
          className={`nm-panel nm-dock-${dock.mode} nm-density-${density}${
            dock.maximized ? " nm-max" : ""
          }${dock.animating ? " nm-anim" : ""}`}
          // Height is not something the panel's container query can see - it
          // is an inline-size container - so the one height step CSS needs is
          // handed to it as an attribute.
          data-tiny={panel.measured && panel.height < TINY_PANEL_BELOW ? "" : undefined}
          data-short={panel.shortPanel ? "" : undefined}
          style={dock.panelStyle}
        >
          {/* Dock edge grips. The floating panel keeps its corner grip instead. */}
          {!dock.maximized && (dock.mode === "bottom" || dock.mode === "top") && (
            <div
              className="nm-dock-grip nm-dock-grip-h"
              onPointerDown={dock.startDockResize}
              title="Drag to resize"
            />
          )}
          {!dock.maximized && (dock.mode === "right" || dock.mode === "left") && (
            <div
              className="nm-dock-grip nm-dock-grip-v"
              onPointerDown={dock.startDockResize}
              title="Drag to resize"
            />
          )}

          <MonitorToolbar
            query={query}
            onQuery={onQuery}
            searchRef={searchRef}
            deepSearch={deepSearch}
            onDeepSearch={onDeepSearch}
            searching={list.searching}
            shown={list.filtered.length}
            total={list.counts.all}
            paused={paused}
            onTogglePause={togglePause}
            preserveLog={prefs.preserveLog}
            onTogglePreserve={() => setPreserveLog(!prefs.preserveLog)}
            onExportMenu={setExportAnchor}
            exportOpen={exportAnchor !== null}
            exportDisabled={entries.length === 0}
            onClearSection={() => {
              networkMonitor.clear((e) => sectionOf(e) === section);
              selection.clear();
            }}
            clearDisabled={!sectionEntries.some((e) => !e.pinned)}
            sectionLabel={SECTION_DEFS.find((s) => s.id === section)?.label ?? section}
            onThemeMenu={setThemeAnchor}
            themeOpen={themeAnchor !== null}
            themeLabel={theme.label}
            onMoreMenu={setMoreAnchor}
            moreOpen={moreAnchor !== null}
            onOpenPalette={openPalette}
            compact={panel.compactToolbar}
            tiny={panel.tinyToolbar}
            mode={dock.mode}
            onMode={onMode}
            maximized={dock.maximized}
            onToggleMaximize={onToggleMaximize}
            onClose={() => setOpen(false)}
            onPointerDown={dock.startPanelDrag}
          />

          <div className="nm-body">
            <SourcesRail
              width={railWidth}
              mini={railMini}
              section={section}
              counts={sectionCounts}
              stats={{
                captured: entries.length,
                transferred: list.totalBytes,
                slowestMs,
                failing: list.counts.error,
                persistedLabel: storageNote
                  ? storageNote.short
                  : prefs.preserveLog && hydration === "ready"
                    ? formatBytes(persisted.bytes)
                    : hydration === "loading"
                      ? "restoring…"
                      : null,
              }}
              onSection={onSection}
              onToggle={onToggleRail}
              onOpenPalette={openPalette}
            />

            <div
              className={`nm-body-panes${dock.splitAxis === "y" ? " nm-body-v" : ""}${
                singleView ? ` nm-single-${singleView}` : ""
              }`}
            >
              <div
                className="nm-list"
                style={
                  dock.splitAxis === "x"
                    ? { width: listSize, flexBasis: listSize }
                    : { height: listSize, flexBasis: listSize }
                }
              >
                <RequestTable
                  section={section}
                  rows={list.rows}
                  counts={list.counts}
                  stateFilter={stateFilter}
                  onStateFilter={setStateFilter}
                  pendingLabel={pendingLabel}
                  scaleMs={scaleMs}
                  timings={timings}
                  activeRowId={selection.activeRowId}
                  sort={sort}
                  onSort={onSort}
                  onSelect={selectRow}
                  onTogglePin={togglePin}
                  onContextMenu={menu.open}
                  onColumnMenu={(e) =>
                    setColumnAnchor({
                      top: e.clientY + 4,
                      bottom: window.innerHeight - e.clientY + 4,
                      right: Math.max(8, window.innerWidth - e.clientX),
                    })
                  }
                  hidden={hiddenColumns}
                  linkTags={links.tags}
                  virtual={virtual}
                  scrollerRef={scrollerRef}
                  empty={
                    sectionEntries.length === 0 ? (
                      <div className="nm-empty nm-empty-list">
                        <span className="nm-empty-ico" data-accent={section}>
                          <Icon name={EMPTY_COPY[section].icon} size={20} />
                        </span>
                        <div className="nm-empty-copy">
                          <p className="nm-empty-title">{EMPTY_COPY[section].title}</p>
                          <p className="nm-empty-sub">{EMPTY_COPY[section].sub}</p>
                        </div>
                        {EMPTY_COPY[section].snippets && (
                          <div className="nm-empty-setups">
                            {EMPTY_COPY[section].snippets.map((snippet) => (
                              <div className="nm-empty-setup" key={snippet.code}>
                                <code className="nm-empty-snippet">
                                  {snippet.label && (
                                    <span className="nm-empty-label">{snippet.label}</span>
                                  )}
                                  {snippet.code}
                                </code>
                                <button
                                  className="nm-empty-btn"
                                  onClick={() => void copyText(snippet.code)}
                                  aria-label={`Copy the ${snippet.label ?? "setup"} snippet`}
                                >
                                  Copy
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="nm-empty nm-empty-list">
                        <span className="nm-empty-ico" data-accent={section}>
                          <Icon name="search-off" size={20} />
                        </span>
                        <div className="nm-empty-copy">
                          <p className="nm-empty-title">Nothing matches</p>
                          <p className="nm-empty-sub">
                            {sectionEntries.length} {nouns.many} captured in this section.
                            Try a different filter or search.
                          </p>
                        </div>
                        <button className="nm-empty-btn" onClick={() => setQuery("")}>
                          Clear the filter
                        </button>
                      </div>
                    )
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
                onSelectEntry={(id) => {
                  const target = links.byId.get(id);
                  if (target) onSection(sectionOf(target));
                  selectRow(id);
                }}
                onBack={singleView === "detail" ? () => setShortView("list") : undefined}
                onMoreMenu={menu.open}
                linked={linked}
                timingContext={{
                  medianMs,
                  slowest: slowestEntry
                    ? { ms: slowestEntry.durationMs, url: slowestEntry.url }
                    : null,
                }}
                query={list.normalizedQuery}
                nouns={nouns}
                format={dataFormat}
                onFormat={onDataFormat}
                authUnmasked={authUnmasked}
                replayArmedId={replayArmedId}
                onReplay={runReplay}
              />
            </div>
          </div>

          <StatusBar
            authUnmasked={authUnmasked}
            onMaskAuthorization={toggleAuthMasking}
            counts={list.counts}
            shown={list.filtered.length}
            noun={nouns.many}
            totalBytes={list.totalBytes}
            slowestMs={slowestMs}
            failingHint={firstFailing?.url ?? null}
            pinnedCount={pinnedCount}
            persistedCount={persisted.count}
            persistedLabel={
              !storageNote && prefs.preserveLog && hydration === "ready"
                ? formatBytes(persisted.bytes)
                : null
            }
            storageNote={storageNote}
            dbName={getActiveDbName()}
            dbShared={isSharedDefaultDb()}
            onShowDatabases={() => setShowDatabases(true)}
            purgeArmed={purgeArmed}
            onPurge={() => {
              if (purgeArmed) {
                purge();
                setPurgeArmed(false);
              } else {
                setPurgeArmed(true);
                window.setTimeout(() => setPurgeArmed(false), 3000);
              }
            }}
            onShowErrors={() => setStateFilter("error")}
            onShowPinned={goToPinned}
            onOpenPalette={openPalette}
          />

          {showPalette && (
            <>
              {/* Inside the panel, not the root: the root is a zero-sized
                  anchor for the launcher, so a scrim there would cover
                  nothing. */}
              <div className="nm-scrim-full" onClick={closePalette} />
              <CommandPalette groups={commands} onClose={closePalette} />
            </>
          )}

          {purgeError && (
            <div className="nm-purge-note" role="status">
              {purgeError}
            </div>
          )}

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
        <ExportMenu
          anchor={exportAnchor}
          scope={exportScope}
          onScope={setExportScope}
          selected={selectedEntry ?? null}
          shown={list.filtered}
          all={entries}
          onDone={closeMenus}
        />
      )}

      {themeAnchor && (
        <ThemeMenu
          anchor={themeAnchor}
          pref={themePref}
          host={host}
          onPick={onTheme}
          onPreview={setPreviewPref}
        />
      )}

      {moreAnchor && (
        <Menu anchor={moreAnchor} width={320} label="More options">
          {/* LOG — everything that changes what is in the buffer. This Clear
              empties every source; the header's button beside Export only
              empties the one being read, which bounds what a mis-click can
              cost. */}
          <div className="nm-menu-group">
            <span>LOG</span>
          </div>
          <MenuItem
            icon="clear"
            state="⇧C"
            onSelect={() => {
              networkMonitor.clear();
              selection.clear();
              closeMenus();
            }}
          >
            Clear log
          </MenuItem>
          <MenuItem
            icon="preserve"
            state={prefs.preserveLog ? "ON" : "OFF"}
            on={prefs.preserveLog}
            onSelect={() => {
              setPreserveLog(!prefs.preserveLog);
              closeMenus();
            }}
          >
            Preserve log
          </MenuItem>
          {/* A disabled row prints its *reason* where the state goes, rather
              than being red and dead with no explanation. */}
          <MenuItem
            icon="purge"
            disabled={persisted.count === 0}
            state={persisted.count ? formatBytes(persisted.bytes) : "nothing saved"}
            value={persisted.count > 0}
            onSelect={() => {
              purge();
              closeMenus();
            }}
          >
            Purge saved log
          </MenuItem>
          <MenuItem
            icon="database"
            arrow
            state={isSharedDefaultDb() ? "shared" : undefined}
            on={isSharedDefaultDb()}
            onSelect={() => {
              setShowDatabases(true);
              closeMenus();
            }}
          >
            Databases on this origin
          </MenuItem>

          {/* VIEW — settings that change what you see, not what is kept. */}
          <div className="nm-menu-group">
            <span>VIEW</span>
          </div>
          <MenuItem
            icon="lock"
            state={authUnmasked ? "ON" : "OFF"}
            on={authUnmasked}
            onSelect={() => {
              toggleAuthMasking();
              closeMenus();
            }}
          >
            Show Authorization in full
          </MenuItem>
          <MenuItem
            icon="follow"
            state={selection.isFollowing ? "ON" : "OFF"}
            on={selection.isFollowing}
            onSelect={() => {
              selection.toggleFollow();
              closeMenus();
            }}
          >
            Follow the newest entry
          </MenuItem>
          {/* Stays open: density is a setting you cycle until it looks right,
              and closing after each step would mean reopening to compare. */}
          <MenuItem
            icon="columns"
            arrow
            value
            state={`${TOGGLEABLE_COLUMNS.length - hiddenColumns.size} of ${TOGGLEABLE_COLUMNS.length}`}
            onSelect={() => moreAnchor && setColumnAnchor(moreAnchor)}
          >
            Columns
          </MenuItem>
          {/* Beside Density because it is the same kind of thing: one setting
              with a handful of steps, cycled in place. It was at the foot of
              the Appearance menu, which meant scrolling past twelve themes to
              reach it — and previewing each one on the way. */}
          <MenuItem
            icon="corner"
            arrow
            value
            state={FAB_RADIUS[fabRadius].label.toUpperCase()}
            onSelect={() => {
              const order = Object.keys(FAB_RADIUS) as FabRadius[];
              const next = order[(order.indexOf(fabRadius) + 1) % order.length];
              savePrefs({ fabRadius: next });
            }}
          >
            Launcher corners
          </MenuItem>
          <MenuItem
            icon="density"
            arrow
            value
            state={density.toUpperCase()}
            onSelect={() =>
              onDensity(
                DENSITY_ORDER[(DENSITY_ORDER.indexOf(density) + 1) % DENSITY_ORDER.length],
              )
            }
          >
            Density
          </MenuItem>

          <div className="nm-menu-group">
            <span>TAKE IT WITH YOU</span>
          </div>
          {/* Hands off to the export menu rather than duplicating two of its
              six formats. Reuses the same anchor, so it opens where this did. */}
          <MenuItem
            icon="download"
            disabled={entries.length === 0}
            onSelect={() => moreAnchor && setExportAnchor(moreAnchor)}
          >
            Export…
          </MenuItem>

          {panel.tinyToolbar && (
            <MenuItem
              icon="dock-float"
              value
              state={dock.mode.toUpperCase()}
              onSelect={() => {
                onMode(nextDock(dock.mode));
                closeMenus();
              }}
            >
              Dock position
            </MenuItem>
          )}

          <div className="nm-menu-group">
            <span>HELP</span>
          </div>
          <MenuItem
            icon="command"
            state={PALETTE_KEY}
            onSelect={() => {
              closeMenus();
              openPalette();
            }}
          >
            All commands
          </MenuItem>
          <MenuItem
            icon="keyboard"
            state="?"
            onSelect={() => {
              setShowShortcuts(true);
              closeMenus();
            }}
          >
            Keyboard shortcuts
          </MenuItem>
        </Menu>
      )}

      {/* The column picker. Opened from the column head, which is the thing
          it is about, and from the overflow menu for anyone who would never
          think to right-click a header. Stays open: choosing columns is a
          thing you do two or three at a time and want to see the effect of. */}
      {columnAnchor && (
        <Menu anchor={columnAnchor} width={220} label="Columns">
          <div className="nm-menu-group">
            <span>COLUMNS</span>
          </div>
          {TOGGLEABLE_COLUMNS.map((c) => (
            <MenuItem
              key={c.id}
              state={hiddenColumns.has(c.id) ? "OFF" : "ON"}
              on={!hiddenColumns.has(c.id)}
              onSelect={() => toggleColumn(c.id)}
            >
              {c.label}
            </MenuItem>
          ))}
          <div className="nm-menu-foot">
            <span>Route always shows</span>
          </div>
        </Menu>
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
      {showDatabases && (
        <DatabasesSheet onClose={() => setShowDatabases(false)} />
      )}
    </div>
  );

  // Portal to <body> so the monitor escapes any stacking/transform context and
  // sits above modal dialogs.
  return createPortal(ui, document.body);
}
