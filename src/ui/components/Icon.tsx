"use client";

/** Crisp inline icons (lucide-style). Hand-drawn rather than imported so the
 * devtool has no dependency on the host app's icon packs and renders
 * identically at any zoom. */

export type IconName =
  | "search"
  | "search-off"
  | "rows"
  | "clear"
  | "maximize"
  | "restore"
  | "close"
  | "grip"
  | "pause"
  | "play"
  | "download"
  | "terminal"
  | "follow"
  | "preserve"
  | "dock-bottom"
  | "dock-right"
  | "dock-top"
  | "dock-left"
  | "dock-float"
  | "replay"
  | "copy"
  | "wrap"
  | "chevron"
  | "pin"
  | "keyboard"
  | "bolt"
  | "density"
  | "more"
  | "globe"
  | "redux"
  | "query"
  | "database"
  | "theme"
  | "check"
  | "link"
  | "lock"
  | "columns"
  | "corner"
  | "purge"
  | "command";

/**
 * The two sources that are somebody else's product wear that product's own
 * mark, which a React developer already recognises faster than any glyph drawn
 * here. They are filled logos on their own viewBoxes, so they are separate
 * elements rather than two more branches of the stroked 16px set below.
 */
function ReduxMark({ size }: { size: number }) {
  // One colour, so it takes the theme's Redux colour rather than a fixed
  // brand violet that sits at 3:1 on the dark grounds.
  return (
    <svg className="nm-ico" width={size} height={size} viewBox="0 0 128 128" fill="currentColor" aria-hidden>
      <path d="M88.69 88.11c-9 18.4-24.76 30.78-45.61 34.85a39.73 39.73 0 0 1-9.77 1.14c-12 0-23-5-28.34-13.19C-2.2 100-4.64 76.87 19 59.76c.48 2.61 1.46 6.19 2.11 8.31A38.24 38.24 0 0 0 10 81.1c-4.4 8.64-3.91 17.27 1.3 25.25 3.6 5.38 9.3 8.65 16.63 9.65a44 44 0 0 0 26.55-5c12.71-6.68 21.18-14.66 26.72-25.57a9.32 9.32 0 0 1-2.61-6A9.12 9.12 0 0 1 87.37 70h.34a9.15 9.15 0 0 1 1 18.25zm28.67-20.2c12.21 13.84 12.54 30.13 7.82 39.58-4.4 8.63-16 17.27-31.6 17.27a50.48 50.48 0 0 1-21-5.05c2.29-1.63 5.54-4.24 7.33-5.87a41.54 41.54 0 0 0 16 3.42c10.1 0 17.75-4.72 22.31-13.35 2.93-5.7 3.1-12.38.33-19.22a43.61 43.61 0 0 0-17.27-20.85 62 62 0 0 0-34.74-10.59h-2.93a9.21 9.21 0 0 1-8 5.54h-.31a9.13 9.13 0 0 1-.3-18.25h.33a9 9 0 0 1 8 4.89h2.61c20.8 0 39.06 7.98 51.42 22.48zm-82.75 23a7.31 7.31 0 0 1 1.14-4.73c-9.12-15.8-14-35.83-6.51-56.68C34.61 13.83 48.13 3.24 62.79 3.24c15.64 0 31.93 13.69 33.88 40.07-2.44-.81-6-2-8.14-2.44-.53-8.63-7.82-30.13-25.09-29.81-6.19.17-15.31 3.1-20 9.12a43.69 43.69 0 0 0-9.64 25.25 59.61 59.61 0 0 0 8.47 36.16 2.75 2.75 0 0 1 1.14-.16h.32a9.121 9.121 0 0 1 .33 18.24h-.33a9.16 9.16 0 0 1-9.12-8.79z" />
    </svg>
  );
}

function QueryMark({ size }: { size: number }) {
  // Four colours of its own, so it does not follow the theme.
  return (
    <svg className="nm-ico" width={size} height={size} viewBox="0 0 256 230" aria-hidden>
      <path fill="#00435B" d="m157.98 142.487l-4.91 8.527a8.288 8.288 0 0 1-7.182 4.151H108.27a8.288 8.288 0 0 1-7.182-4.151l-4.911-8.527h61.802Zm13.747-23.87l-8.658 15.034h-71.98l-8.658-15.034h89.296Zm-8.34-23.342l8.354 14.506H82.417l8.354-14.506h72.616Zm-17.5-22.066a8.288 8.288 0 0 1 7.183 4.151l5.228 9.079H95.86l5.229-9.079a8.288 8.288 0 0 1 7.182-4.151h37.617Z" />
      <path fill="#002B3B" d="M53.523 69.252c-4.167-20.206-5.062-35.704-2.368-46.957c1.602-6.693 4.53-12.153 8.984-16.093c4.702-4.159 10.646-6.2 17.326-6.2c11.018 0 22.602 5.025 34.98 14.57c5.05 3.894 10.29 8.587 15.732 14.082c.434-.557.923-1.083 1.469-1.57c15.386-13.71 28.34-22.23 39.42-25.514c6.588-1.954 12.773-2.14 18.405-.244c5.946 2 10.683 6.137 14.026 11.93c5.516 9.561 6.97 22.124 4.914 37.637c-.838 6.323-2.271 13.21-4.296 20.673c.764.092 1.53.262 2.288.513c19.521 6.47 33.345 13.426 41.714 21.377c4.98 4.73 8.231 9.996 9.407 15.826c1.24 6.153.03 12.324-3.308 18.113c-5.506 9.548-15.63 17.077-30.052 23.041c-5.79 2.395-12.343 4.564-19.664 6.515c.334.754.594 1.555.767 2.395c4.167 20.206 5.061 35.704 2.368 46.957c-1.602 6.693-4.531 12.153-8.985 16.093c-4.701 4.159-10.646 6.2-17.325 6.2c-11.019 0-22.602-5.025-34.98-14.57c-5.104-3.936-10.402-8.687-15.907-14.258a11.737 11.737 0 0 1-2.084 2.442c-15.386 13.712-28.34 22.23-39.42 25.515c-6.588 1.954-12.773 2.14-18.405.244c-5.946-2-10.683-6.137-14.026-11.93c-5.516-9.561-6.97-22.124-4.914-37.637c.869-6.551 2.376-13.709 4.518-21.485a11.732 11.732 0 0 1-2.51-.537c-19.521-6.47-33.345-13.426-41.714-21.377c-4.98-4.73-8.231-9.996-9.407-15.826c-1.24-6.153-.03-12.325 3.308-18.114c5.506-9.547 15.63-17.077 30.052-23.04c5.963-2.467 12.734-4.693 20.32-6.689a11.81 11.81 0 0 1-.633-2.082Z" />
      <path fill="#FF4154" d="M189.647 161.333a3.684 3.684 0 0 1 4.235 2.81l.023.112l.207 1.075c6.71 35.276 1.983 52.915-14.18 52.915c-15.813 0-35.944-15.051-60.392-45.153a3.684 3.684 0 0 1 2.777-6.005h.114l1.288.009c10.288.056 20.289-.303 30.004-1.076c11.467-.913 23.442-2.475 35.924-4.687ZM78.646 134.667l.062.105l.646 1.127c5.177 9 10.57 17.542 16.18 25.627c6.608 9.52 14.038 19.158 22.29 28.914a3.684 3.684 0 0 1-.309 5.082l-.093.083l-.83.715c-27.307 23.397-45.055 28.068-53.244 14.012c-8.017-13.757-5.11-38.773 8.719-75.047a3.683 3.683 0 0 1 6.579-.618Zm124.857-52.054l.112.037l1.028.354c33.705 11.725 46.51 24.61 38.416 38.655c-7.916 13.736-30.93 23.738-69.041 30.004a3.683 3.683 0 0 1-3.773-5.501c5.458-9.286 10.375-18.524 14.749-27.717c4.96-10.425 9.615-21.616 13.965-33.57a3.684 3.684 0 0 1 4.432-2.295l.112.033ZM84.446 76.71a3.683 3.683 0 0 1 1.31 5.042c-5.46 9.285-10.376 18.524-14.75 27.717c-4.96 10.425-9.615 21.615-13.965 33.57a3.684 3.684 0 0 1-4.544 2.262l-.112-.037l-1.028-.355c-33.705-11.724-46.51-24.61-38.416-38.654c7.916-13.737 30.93-23.738 69.041-30.004c.85-.14 1.722.022 2.464.459Zm108.206-57.748c8.017 13.758 5.11 38.774-8.719 75.048a3.683 3.683 0 0 1-6.579.618l-.062-.105l-.646-1.127c-5.177-9-10.57-17.542-16.18-25.627c-6.608-9.52-14.038-19.158-22.29-28.914a3.684 3.684 0 0 1 .309-5.082l.093-.083l.83-.715c27.307-23.397 45.055-28.068 53.244-14.013ZM77.45 10.59c15.814 0 35.945 15.05 60.392 45.152a3.684 3.684 0 0 1-2.777 6.005h-.114l-1.288-.008c-10.287-.056-20.289.303-30.003 1.076c-11.468.913-23.443 2.475-35.925 4.687a3.684 3.684 0 0 1-4.234-2.81l-.024-.113l-.207-1.074C56.56 28.228 61.286 10.59 77.45 10.59Z" />
      <path fill="#FFD94C" d="M111.295 73.67h31.576a12.89 12.89 0 0 1 11.181 6.475l15.855 27.626a12.892 12.892 0 0 1 0 12.834l-15.855 27.626a12.892 12.892 0 0 1-11.181 6.475h-31.576c-4.618 0-8.883-2.47-11.182-6.475L84.26 120.605a12.892 12.892 0 0 1 0-12.834l15.854-27.626a12.892 12.892 0 0 1 11.182-6.475Zm26.763 8.338c4.62 0 8.888 2.473 11.185 6.481l11.056 19.288a12.892 12.892 0 0 1 0 12.822l-11.056 19.288a12.892 12.892 0 0 1-11.185 6.48h-21.95c-4.62 0-8.888-2.472-11.185-6.48l-11.056-19.288a12.892 12.892 0 0 1 0-12.822l11.056-19.288a12.892 12.892 0 0 1 11.184-6.48h21.951Zm-5.187 9.12h-11.576a12.892 12.892 0 0 0-11.179 6.47l-5.842 10.167a12.892 12.892 0 0 0 0 12.846l5.842 10.168a12.892 12.892 0 0 0 11.179 6.47h11.576c4.616 0 8.88-2.468 11.179-6.47l5.842-10.168a12.892 12.892 0 0 0 0-12.846l-5.842-10.168a12.892 12.892 0 0 0-11.179-6.47Zm-4.994 8.729c4.612 0 8.873 2.464 11.173 6.46l.829 1.44a12.892 12.892 0 0 1 0 12.862l-.829 1.44a12.892 12.892 0 0 1-11.173 6.46h-1.588a12.892 12.892 0 0 1-11.173-6.46l-.829-1.44a12.892 12.892 0 0 1 0-12.862l.829-1.44a12.892 12.892 0 0 1 11.173-6.46h1.588Zm-.792 8.599a5.738 5.738 0 0 0-4.97 2.866a5.729 5.729 0 0 0 0 5.732a5.738 5.738 0 0 0 9.937 0a5.729 5.729 0 0 0 0-5.732a5.736 5.736 0 0 0-4.967-2.866Zm-46.509 5.732h10.32" />
    </svg>
  );
}

/** The mark's blades (BRAND_BOOK §2) scaled onto the 16-unit icon grid. */
const DOCK_BLADES = {
  top: [1.6, 1.6, 8.16, 3.84],
  right: [10.56, 1.6, 3.84, 8.16],
  bottom: [6.24, 10.56, 8.16, 3.84],
  left: [1.6, 6.24, 3.84, 8.16],
} as const;

/**
 * The dock switcher draws the mark: the edge a button docks to is the solid
 * blade, the other three sit back at 35%. Monochrome in the button's own
 * colour — these are controls, not the logo. Float has no edge, so every
 * blade sits back and the centre dot is what is left.
 */
function DockMark({ target, size }: { target: string; size: number }) {
  return (
    <svg className="nm-ico" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      {(Object.keys(DOCK_BLADES) as (keyof typeof DOCK_BLADES)[]).map((edge) => {
        const [x, y, width, height] = DOCK_BLADES[edge];
        return (
          <rect
            key={edge}
            x={x}
            y={y}
            width={width}
            height={height}
            rx={0.8}
            opacity={edge === target ? undefined : 0.35}
          />
        );
      })}
      {target === "float" && <circle cx={8} cy={8} r={1.3} />}
    </svg>
  );
}

export function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  if (name === "redux") return <ReduxMark size={size} />;
  if (name === "query") return <QueryMark size={size} />;
  if (name.startsWith("dock-")) return <DockMark target={name.slice(5)} size={size} />;
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
      {/* A search that came back with nothing. */}
      {name === "search-off" && (
        <>
          <circle cx="7" cy="7" r="4.6" />
          <path d="M13.6 13.6l-3.2-3.2" />
          <path d="M5.5 5.5l3 3M8.5 5.5l-3 3" />
        </>
      )}
      {/* A list with one row picked out - "choose one of these". */}
      {name === "rows" && (
        <>
          <path d="M2.6 3.6h10.8M2.6 12.4h10.8" />
          <rect x="2.2" y="6" width="11.6" height="4" rx="1.2" fill="currentColor" fillOpacity="0.3" />
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
      {/* A line that runs out of room and turns back. */}
      {name === "wrap" && (
        <>
          <path d="M2.4 4h11.2" />
          <path d="M2.4 8h9a2.2 2.2 0 0 1 0 4.4H8.2" />
          <path d="M9.8 10.6 8 12.4l1.8 1.8" />
          <path d="M2.4 12.4h2.8" />
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
      {/* A socket: the ring is the open connection, the two darts are a frame
          going each way. The same ring as the globe, so Network and Realtime
          read as a pair - one request out and back, one line held open. */}
      {name === "bolt" && (
        <>
          <circle cx="8" cy="8" r="6.4" fill="currentColor" fillOpacity="0.18" />
          <path d="M11.3 4.3 6.6 7.7h2.3z" fill="currentColor" strokeWidth="1" />
          <path d="M4.7 11.7 9.4 8.3H7.1z" fill="currentColor" strokeWidth="1" />
        </>
      )}
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
      {/* Network and Realtime have no logo to borrow, so they are drawn here —
          filled, to carry the same weight as the Redux and Query marks beside
          them at 12px in the collapsed sidebar and the launcher. */}
      {name === "globe" && (
        <>
          <circle cx="8" cy="8" r="6.4" fill="currentColor" fillOpacity="0.18" />
          <path d="M1.6 8h12.8" />
          <path d="M8 1.6a9.3 9.3 0 0 0 0 12.8 9.3 9.3 0 0 0 0-12.8z" />
        </>
      )}

      {/* Half-filled circle — the universal "appearance" mark, and readable at
          13px where a paint-roller or palette silhouette is not. */}
      {name === "theme" && (
        <>
          <circle cx="8" cy="8" r="5.6" />
          <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "check" && <path d="M3.2 8.4 6.4 11.6 12.8 4.8" />}
      {name === "link" && (
        <>
          <path d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l2-2a2.6 2.6 0 0 0-3.7-3.7l-1.1 1.1" />
          <path d="M9.4 6.6a2.6 2.6 0 0 0-3.9-.3l-2 2a2.6 2.6 0 0 0 3.7 3.7l1.1-1.1" />
        </>
      )}
      {name === "database" && (
        <>
          <ellipse cx="8" cy="4.1" rx="5.1" ry="2" />
          <path d="M2.9 4.1v3.8c0 1.1 2.3 2 5.1 2s5.1-.9 5.1-2V4.1" />
          <path d="M2.9 7.9v3.8c0 1.1 2.3 2 5.1 2s5.1-.9 5.1-2V7.9" />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.4" />
          <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
        </>
      )}
      {name === "columns" && (
        <>
          <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.6" />
          <path d="M6.1 2.8v10.4M9.9 2.8v10.4" />
        </>
      )}
      {name === "corner" && (
        <>
          <path d="M3 13V7.4A4.4 4.4 0 0 1 7.4 3H13" />
          <path d="M8 13h5V8" strokeDasharray="1.4 1.8" />
        </>
      )}
      {/* The database with a cross — distinct from Clear's bin, which empties
          the live log, because Purge deletes what is on disk. */}
      {name === "purge" && (
        <>
          <ellipse cx="7" cy="4.1" rx="4.6" ry="1.8" />
          <path d="M2.4 4.1v7.6c0 1 2 1.8 4.6 1.8" />
          <path d="M11.6 4.1v3.1" />
          <path d="M10 10l3.6 3.6M13.6 10 10 13.6" />
        </>
      )}
      {name === "command" && (
        <path d="M6 6h4v4H6zM6 6V4.5A1.5 1.5 0 1 0 4.5 6H6M10 6V4.5A1.5 1.5 0 1 1 11.5 6H10M6 10v1.5A1.5 1.5 0 1 1 4.5 10H6M10 10v1.5a1.5 1.5 0 1 0 1.5-1.5H10" />
      )}
    </svg>
  );
}
