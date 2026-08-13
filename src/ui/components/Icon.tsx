"use client";

/** Crisp inline icons (lucide-style). Hand-drawn rather than imported so the
 * devtool has no dependency on the host app's icon packs and renders
 * identically at any zoom. */

export type IconName =
  | "search"
  | "clear"
  | "maximize"
  | "restore"
  | "close"
  | "grip"
  | "inbox"
  | "pause"
  | "play"
  | "download"
  | "terminal"
  | "follow"
  | "preserve"
  | "dock-bottom"
  | "dock-right"
  | "dock-float"
  | "replay"
  | "copy"
  | "chevron"
  | "stack"
  | "pin"
  | "keyboard"
  | "bolt"
  | "density"
  | "more"
  | "network"
  | "database";

export function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="nm-ico"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {name === "search" && (
        <>
          <circle cx="7" cy="7" r="4.3" />
          <path d="M13.5 13.5l-3.1-3.1" />
        </>
      )}
      {name === "clear" && (
        <>
          <path d="M3 4.4h10" />
          <path d="M6.4 4.4V3.3a1 1 0 0 1 1-1h1.2a1 1 0 0 1 1 1v1.1" />
          <path d="M4.4 4.4l.5 8.1a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.5-8.1" />
        </>
      )}
      {name === "maximize" && <rect x="3" y="3" width="10" height="10" rx="2.2" />}
      {name === "restore" && (
        <>
          <rect x="5.2" y="5.2" width="7.8" height="7.8" rx="1.8" />
          <path d="M3 10V4.6A1.6 1.6 0 0 1 4.6 3H10" />
        </>
      )}
      {name === "close" && <path d="M4 4l8 8M12 4l-8 8" />}
      {name === "grip" &&
        [4, 8, 12].map((cy) => (
          <g key={cy} fill="currentColor" stroke="none">
            <circle cx="6" cy={cy} r="0.95" />
            <circle cx="10" cy={cy} r="0.95" />
          </g>
        ))}
      {name === "inbox" && (
        <>
          <path d="M2 9.5 3.6 4a1.4 1.4 0 0 1 1.3-1h6.2a1.4 1.4 0 0 1 1.3 1L14 9.5V12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12z" />
          <path d="M2 9.5h3.2l.9 1.6h3.8l.9-1.6H14" />
        </>
      )}
      {name === "pause" && (
        <>
          <rect x="4.5" y="3.5" width="2.4" height="9" rx="0.8" fill="currentColor" stroke="none" />
          <rect x="9.1" y="3.5" width="2.4" height="9" rx="0.8" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "play" && (
        <path
          d="M5 3.6v8.8a.6.6 0 0 0 .92.5l6.6-4.4a.6.6 0 0 0 0-1l-6.6-4.4A.6.6 0 0 0 5 3.6z"
          fill="currentColor"
          stroke="none"
        />
      )}
      {name === "download" && (
        <>
          <path d="M8 2.5v7" />
          <path d="M5 6.8 8 9.8l3-3" />
          <path d="M3 12.5h10" />
        </>
      )}
      {name === "terminal" && (
        <>
          <rect x="2.2" y="3" width="11.6" height="10" rx="1.8" />
          <path d="M5 6.4 7.2 8 5 9.6" />
          <path d="M8.4 9.8h3" />
        </>
      )}
      {name === "follow" && (
        <>
          <path d="M4 3.4 8 7.2l4-3.8" />
          <path d="M4 8.6 8 12.4l4-3.8" />
        </>
      )}
      {name === "preserve" && (
        <>
          <path d="M3 4.2a1.6 1.6 0 0 1 1.6-1.6h5.1L13 5.9v5.9a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 11.8z" />
          <path d="M5.6 2.6v3.1h4V3.1" />
          <path d="M5.6 13.4v-3.5h4.8v3.5" />
        </>
      )}
      {name === "dock-bottom" && (
        <>
          <rect x="2.4" y="2.6" width="11.2" height="10.8" rx="1.8" />
          <path d="M2.4 9.6h11.2" />
        </>
      )}
      {name === "dock-right" && (
        <>
          <rect x="2.4" y="2.6" width="11.2" height="10.8" rx="1.8" />
          <path d="M9.6 2.6v10.8" />
        </>
      )}
      {name === "dock-float" && (
        <>
          <rect x="1.8" y="3.4" width="8.4" height="7.2" rx="1.5" />
          <rect x="5.8" y="5.6" width="8.4" height="7.2" rx="1.5" />
        </>
      )}
      {name === "replay" && (
        <>
          <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75" />
          <path d="M13.4 2.6v3.2h-3.2" />
        </>
      )}
      {name === "copy" && (
        <>
          <rect x="5.4" y="5.4" width="8" height="8" rx="1.6" />
          <path d="M10.6 5.4V4a1.6 1.6 0 0 0-1.6-1.6H4a1.6 1.6 0 0 0-1.6 1.6v5a1.6 1.6 0 0 0 1.6 1.6h1.4" />
        </>
      )}
      {name === "chevron" && <path d="M6 4l4 4-4 4" />}
      {name === "pin" && (
        <>
          <path d="M6.2 2.4h3.6l-.5 3.4 2.3 2.1H4.4l2.3-2.1z" />
          <path d="M8 7.9v5.7" />
        </>
      )}
      {name === "keyboard" && (
        <>
          <rect x="1.6" y="4" width="12.8" height="8" rx="1.6" />
          <path d="M4.4 6.6h.01M6.9 6.6h.01M9.4 6.6h.01M11.9 6.6h.01M4.4 9.4h7.2" />
        </>
      )}
      {name === "bolt" && <path d="M8.8 1.8 3.6 9h3.4l-.8 5.2L12.4 7H9z" />}
      {name === "density" && (
        <>
          <path d="M2.6 4h10.8M2.6 8h10.8M2.6 12h10.8" />
        </>
      )}
      {name === "more" && (
        <g fill="currentColor" stroke="none">
          <circle cx="3.4" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="12.6" cy="8" r="1.25" />
        </g>
      )}
      {name === "stack" && (
        <>
          <path d="M8 1.8 14.2 5 8 8.2 1.8 5z" />
          <path d="M1.8 8 8 11.2 14.2 8" />
          <path d="M1.8 11 8 14.2 14.2 11" />
        </>
      )}
      {name === "network" && (
        <>
          <path d="M3 5.3h8.8M8.6 2.7l2.6 2.6-2.6 2.6" />
          <path d="M13 10.7H4.2M6.4 13.3l-2.6-2.6 2.6-2.6" />
        </>
      )}
      {name === "database" && (
        <>
          <ellipse cx="8" cy="4.1" rx="5.1" ry="2" />
          <path d="M2.9 4.1v3.8c0 1.1 2.3 2 5.1 2s5.1-.9 5.1-2V4.1" />
          <path d="M2.9 7.9v3.8c0 1.1 2.3 2 5.1 2s5.1-.9 5.1-2V7.9" />
        </>
      )}
    </svg>
  );
}
