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
import type { Corner, MonitorState } from "../capture/monitorTypes";
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
import { StatusBar } from "./components/StatusBar";
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
} from "./constants/ui";
import { Menu, MenuItem, type MenuAnchor } from "./components/Menu";
import { ExportMenu, type ExportScope } from "./components/ExportMenu";
import { ThemeMenu } from "./components/ThemeMenu";
import { BX_PALETTES, bxTokens } from "./themes/bx";
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
    icon: "network",
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
    icon: "stack",
    title: "No Redux actions yet",
    sub: "Actions dispatched anywhere in the app appear here, with a bounded diff of what each one changed.",
    snippets: [
      {
        code: "middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(createReduxMonitorMiddleware())",
      },
    ],
  },
  query: {
    icon: "database",
    title: "No query activity yet",
    sub: "Cache lifecycle — fetch, success, invalidate, garbage-collect — appears here once the query client is tapped.",
    // From an effect, as the README says: under Strict Mode a client created
    // in a `useState` initializer is created twice, and the tap has to land
    // on the one React keeps.
    snippets: [{ code: "useEffect(() => tapQueryClient(queryClient), [queryClient])" }],
  },
};
import { copyText, formatBytes } from "./helpers/format";
import { niceScale, rowTiming, type RowTiming } from "./helpers/waterfall";
import { buildLinkGraph, linkedEntries, sectionOf } from "./helpers/entryLinks";
import { useHostTheme } from "./hooks/useHostTheme";
import { useContextMenu } from "./hooks/useContextMenu";
import { useDockGeometry } from "./hooks/useDockGeometry";
import { useFabDrag } from "./hooks/useFabDrag";
import { useMonitorClock } from "./hooks/useMonitorClock";
import { hidingReasons, useMonitorList } from "./hooks/useMonitorList";
import { useMonitorSelection } from "./hooks/useMonitorSelection";
import { usePanelSize } from "./hooks/usePanelSize";
import { useVirtualRows } from "./hooks/useVirtualRows";
import { parseFilter } from "./services/filterQuery";
import { canReplay, replayEntry } from "./services/replayRequest";
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
  const { sectionEntries, sectionCounts } = useMemo(() => {
    const counts: Record<Section, number> = { network: 0, realtime: 0, redux: 0, query: 0 };
    const filtered: MonitorEntry[] = [];
    for (const e of entries) {
      const s = sectionOf(e);
      counts[s] += 1;
      if (s === section) filtered.push(e);
    }
    return { sectionEntries: filtered, sectionCounts: counts };
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

      // The palette is reachable from anywhere in the panel, including from
      // inside the filter field — it is the one shortcut that has to work
      // while typing, since half of what it offers is filter syntax.
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowPalette((p) => !p);
        return;
      }

      // Something inside the panel already acted on this key. Without this,
      // the payload tree's arrow keys moved the tree *and* stepped the list
      // selection underneath it — which swapped the entry out from under the
      // tree the developer was walking. Any inner widget that handles a key
      // now suppresses the global shortcut for it, which is the behaviour a
      // focused control should have anyway.
      if (e.defaultPrevented) return;

      if (e.key === "Escape") {
        // The context menu has its own Escape listener (`useContextMenu`)
        // that closes just the menu — without this branch, that listener and
        // this one both fire on the same keypress, and the panel closed
        // underneath the menu the developer was still using.
        if (showPalette) setShowPalette(false);
        else if (showDatabases) setShowDatabases(false);
        else if (showShortcuts) setShowShortcuts(false);
        else if (kb.current.menuOpen) menu.close();
        else if (menuState || columnAnchor) closeMenus();
        else setOpen(false);
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
  }, [dock, menuState, columnAnchor, closeMenus, onSection, showShortcuts, showPalette, showDatabases, togglePause, togglePin, menu.close]);

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
        closeMenus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, menu, closeMenus]);

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
  const splitExtent =
    dock.splitAxis === "x" ? panel.width - railWidth : panel.height;
  const [minSelf, minOther] =
    dock.splitAxis === "x" ? [MIN_LIST_W, MIN_DETAIL_W] : [MIN_LIST_H, MIN_DETAIL_H];
  const listSize =
    panel.measured && splitExtent > minSelf + minOther
      ? Math.min(dock.splitSize, Math.max(minSelf, splitExtent - minOther))
      : dock.splitSize;


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
          run: () => {
            if (selectedEntry && apiClient) {
              void replayEntry(selectedEntry, apiClient).catch(() => {});
            }
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
          run: () =>
            onMode(dock.mode === "bottom" ? "right" : dock.mode === "right" ? "float" : "bottom"),
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
          errors={list.counts.error}
          pending={list.counts.pending}
          onPointerDown={fab.start}
        />
      )}

      {fab.dragPos && (
        <FabDragPreview pos={fab.dragPos} paused={paused} total={entries.length} />
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
                persistedLabel:
                  prefs.preserveLog && hydration === "ready"
                    ? formatBytes(persisted.bytes)
                    : hydration === "loading"
                      ? "restoring…"
                      : null,
              }}
              onSection={onSection}
              onToggle={onToggleRail}
              onOpenPalette={openPalette}
            />

            <div className={`nm-body-panes${dock.splitAxis === "y" ? " nm-body-v" : ""}`}>
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
                  onSelect={selection.pin}
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
                          <Icon name="search" size={20} />
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
                  selection.pin(id);
                }}
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
              prefs.preserveLog && hydration === "ready"
                ? `${persisted.count} saved · ${formatBytes(persisted.bytes)}`
                : null
            }
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
          {/* LOG — everything that changes what is in the buffer. Clear lives
              here rather than in the header: it is destructive, it is a
              keystroke away, and a button beside Export that empties the log
              is one mis-click nobody wants. */}
          <div className="nm-menu-group">
            <span>LOG</span>
          </div>
          <MenuItem
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
            disabled={entries.length === 0}
            onSelect={() => moreAnchor && setExportAnchor(moreAnchor)}
          >
            Export…
          </MenuItem>

          {panel.tinyToolbar && (
            <MenuItem
              value
              state={dock.mode.toUpperCase()}
              onSelect={() => {
                onMode(
                  dock.mode === "bottom" ? "right" : dock.mode === "right" ? "float" : "bottom",
                );
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
            state="⌘K"
            onSelect={() => {
              closeMenus();
              openPalette();
            }}
          >
            All commands
          </MenuItem>
          <MenuItem
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
