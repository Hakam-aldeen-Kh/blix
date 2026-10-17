"use client";

/**
 * Dev Tools — About Blix: which build this is, what it is wired to, and a
 * block to paste into a bug report.
 *
 * The debug block is the reason the sheet exists. "Which version, which
 * React, which sources were attached" is the first reply to almost every
 * issue, and the panel already knows all of it. It carries the page's origin
 * and nothing else from the log: no URLs, headers or payloads, because it is
 * written to be pasted somewhere public.
 *
 * On screen it reads as two short tables in the shortcuts sheet's idiom; the
 * clipboard gets the same facts as plain `key: value` lines, which is what an
 * issue template wants.
 */

import { useEffect, useRef, useState, version as reactVersion } from "react";
import { BLIX_LINKS, BLIX_VERSION, BLIX_VERSION_LABEL } from "../constants/about";
import { copyText } from "../helpers/format";
import { BlixWordmark } from "./BlixWordmark";
import { Icon } from "./Icon";

export interface AboutDebugInfo {
  dbName: string;
  fetch: boolean;
  apiClient: boolean;
  store: boolean;
  queryClient: boolean;
  counts: Record<"network" | "realtime" | "redux" | "query", number>;
  theme: string;
  dock: string;
  density: string;
}

/** "Chrome 152 on Windows" from a user-agent string. Order matters: Edge and
 * Opera both claim Chrome, and Chrome claims Safari. Unknown → the raw UA. */
export function describeBrowser(ua: string): string {
  const name =
    match(ua, /Edg\/(\d+)/, "Edge") ??
    match(ua, /OPR\/(\d+)/, "Opera") ??
    match(ua, /Firefox\/(\d+)/, "Firefox") ??
    match(ua, /Chrome\/(\d+)/, "Chrome") ??
    match(ua, /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, "Safari");
  if (!name) return ua || "unknown";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${name} on ${os}` : name;
}

function match(ua: string, re: RegExp, label: string): string | null {
  const m = re.exec(ua);
  return m ? `${label} ${m[1]}` : null;
}

type Row = { key: string; value: string; off?: boolean };

function rows(info: AboutDebugInfo) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const c = info.counts;
  const wired = (on: boolean, yes: string, no: string) => ({ value: on ? yes : no, off: !on });
  const environment: Row[] = [
    { key: "blix", value: BLIX_VERSION },
    { key: "react", value: reactVersion },
    { key: "browser", value: describeBrowser(ua) },
    { key: "origin", value: typeof location === "undefined" ? "unknown" : location.origin },
    { key: "database", value: info.dbName },
  ];
  // axios capture leaves no global trace to read, so it is not listed; the
  // two props are, by what they unlock rather than by library.
  const sources: Row[] = [
    { key: "fetch", ...wired(info.fetch, "attached", "not attached") },
    { key: "query", ...wired(info.queryClient, "client tapped", "not tapped") },
    { key: "apiClient", ...wired(info.apiClient, "passed, replay on", "not passed, no replay") },
    { key: "store", ...wired(info.store, "passed, state and re-dispatch on", "not passed") },
    {
      key: "captured",
      value: `${c.network} network · ${c.realtime} realtime · ${c.redux} redux · ${c.query} query`,
    },
  ];
  return { environment, sources, ua };
}

export function debugInfoText(info: AboutDebugInfo): string {
  const { environment, sources, ua } = rows(info);
  return [
    ...environment.map((r) => `${r.key}: ${r.value}`),
    `user-agent: ${ua || "unknown"}`,
    ...sources.map((r) => `${r.key}: ${r.value.replace(/ · /g, ", ")}`),
    `panel: theme ${info.theme}, dock ${info.dock}, density ${info.density}`,
  ].join("\n");
}

const LINKS: { label: string; href: string }[] = [
  { label: "Docs", href: BLIX_LINKS.docs },
  { label: "What's new", href: BLIX_LINKS.changelog },
  { label: "GitHub", href: BLIX_LINKS.repo },
  { label: "blixjs.dev", href: BLIX_LINKS.site },
];

type CopyState = "idle" | "copied" | "failed";

export function AboutSheet({ info, onClose }: { info: AboutDebugInfo; onClose: () => void }) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const [showRaw, setShowRaw] = useState(false);
  const rawRef = useRef<HTMLPreElement>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { environment, sources } = rows(info);
  const text = debugInfoText(info);

  useEffect(() => () => clearTimeout(resetRef.current), []);

  // When the clipboard refuses, the text is still the point: show it and
  // select it, so Ctrl+C is the one step left.
  useEffect(() => {
    if (copy !== "failed" || !rawRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(rawRef.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    rawRef.current.scrollIntoView({ block: "nearest" });
  }, [copy, showRaw]);

  const copyInfo = async (): Promise<boolean> => {
    const ok = await copyText(text);
    setCopy(ok ? "copied" : "failed");
    if (!ok) setShowRaw(true);
    clearTimeout(resetRef.current);
    if (ok) resetRef.current = setTimeout(() => setCopy("idle"), 2000);
    return ok;
  };

  /** Copies first, so the new issue's body is one paste away. The tab opens
   * either way: a refused clipboard leaves the text selected behind it. */
  const report = () => {
    void copyInfo();
    window.open(BLIX_LINKS.issues, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="nm-sheet-scrim" onClick={onClose} />
      <div
        className="nm-sheet nm-about"
        role="dialog"
        aria-modal="true"
        aria-label="About Blix"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="nm-sheet-head">
          <h3>About Blix</h3>
          <button type="button" className="nm-sheet-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="nm-about-body nm-scroll">
          <div className="nm-about-id">
            <BlixWordmark height={22} title="blix" />
            <span className="nm-about-version">{BLIX_VERSION_LABEL}</span>
          </div>
          <p className="nm-about-lead">
            Network, realtime, Redux and TanStack Query, linked, inside your React
            app. It loads in development builds only.
          </p>
          <div className="nm-about-links">
            {LINKS.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
                <Icon name="link" size={11} />
              </a>
            ))}
          </div>

          <AboutTable title="ENVIRONMENT" rows={environment} />
          <AboutTable title="SOURCES" rows={sources} />

          {showRaw && (
            <pre ref={rawRef} className="nm-about-pre nm-scroll">
              {text}
            </pre>
          )}
        </div>

        <div className="nm-about-foot">
          <span className="nm-about-note" aria-live="polite">
            {copy === "copied"
              ? "Copied. No URLs, headers or payloads from the log."
              : copy === "failed"
                ? "The clipboard refused. The text is selected: press Ctrl+C."
                : "Holds no URLs, headers or payloads from the log."}
          </span>
          <button
            type="button"
            className="nm-db-btn"
            onClick={() => setShowRaw((s) => !s)}
            aria-expanded={showRaw}
          >
            {showRaw ? "Hide text" : "Show text"}
          </button>
          <button type="button" className="nm-db-btn" onClick={() => void copyInfo()}>
            <Icon name={copy === "copied" ? "check" : "copy"} size={12} />
            {copy === "copied" ? "Copied" : "Copy debug info"}
          </button>
          <button type="button" className="nm-db-btn nm-about-primary" onClick={report}>
            Report an issue
          </button>
        </div>
      </div>
    </>
  );
}

function AboutTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="nm-about-table">
      <div className="nm-sheet-group">{title}</div>
      {rows.map((row) => (
        <div className="nm-about-row" key={row.key}>
          <span className="nm-sheet-key">{row.key}</span>
          <span className={row.off ? "nm-about-val nm-about-off" : "nm-about-val"}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
