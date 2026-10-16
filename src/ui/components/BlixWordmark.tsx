"use client";

/**
 * Dev Tools — the wordmark, as the outlined path from the brand assets.
 *
 * Never set in a font: the face is Cascadia Mono Bold, which the panel does
 * not load and must not, and the brand book forbids retyping it. Takes the
 * colour of whatever it sits in.
 */

/** Width over height of the outlined path's box. */
const ASPECT = 4142.92 / 1569;

export function BlixWordmark({ height, title }: { height: number; title?: string }) {
  return (
    <svg
      className="nm-wordmark"
      width={Math.round(height * ASPECT * 10) / 10}
      height={height}
      viewBox="146 -1549 4142.92 1569"
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d="M447 20Q371 20 297 14.5Q223 9 146 0V-1500H417V-868H445Q472-1080 697-1080Q897-1080 1006.5-955Q1116-830 1116-600Q1116-305 941.5-142.5Q767 20 447 20ZM417-236Q453-235 489-235Q656-235 747.5-330.5Q839-426 839-600Q839-708 788.5-766.5Q738-825 645-825Q417-825 417-596ZM1814.64 20Q1614.64 20 1526.14-90Q1437.64-200 1437.64-442V-1251H1137.64V-1500H1707.64V-452Q1707.64-386 1721.64-344Q1735.64-302 1775.64-282Q1815.64-262 1894.64-262Q1982.64-262 2116.64-300L2147.64-22Q2062.64 0 1983.64 10Q1904.64 20 1814.64 20ZM2256.28 0V-250H2648.28V-810H2316.28V-1060H2918.28V-250H3232.28V0ZM2771.28-1203Q2694.28-1203 2646.28-1251Q2598.28-1299 2598.28-1376Q2598.28-1453 2646.28-1501Q2694.28-1549 2771.28-1549Q2848.28-1549 2896.28-1501Q2944.28-1453 2944.28-1376Q2944.28-1299 2896.28-1251Q2848.28-1203 2771.28-1203ZM3250.92 0 3639.92-524 3250.92-1060H3573.92L3769.92-728L3965.92-1060H4288.92L3894.92-532L4288.92 0H3965.92L3765.92-332L3573.92 0Z" />
    </svg>
  );
}
