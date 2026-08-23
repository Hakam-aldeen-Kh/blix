/**
 * Dev Tools — saving a generated file.
 *
 * One place for the object-URL dance, because every export format needs it and
 * each copy of it was a leak waiting to happen: the original HAR and JSON
 * exports both revoked the URL immediately after `a.click()`, which races the
 * browser's own read of the blob in Safari and can produce an empty file.
 * Revoking on the next task instead is the documented-safe form.
 */

/** `2026-08-23T14-05-31` — sortable, and legal in a filename on every OS. */
export function fileStamp(at: Date = new Date()): string {
  return at.toISOString().slice(0, 19).replace(/:/g, "-");
}

export function downloadText(
  filename: string,
  mime: string,
  text: string,
): void {
  try {
    // U+FEFF is what makes Excel read a UTF-8 CSV as UTF-8 rather than as the
    // local ANSI codepage, which is how non-ASCII URLs turn to mojibake in a
    // spreadsheet. Harmless to every other consumer. Written as an escape so
    // this file stays plain ASCII — an invisible literal BOM mid-source is a
    // gift to nobody.
    const BOM = String.fromCharCode(0xfeff);
    const body = mime.startsWith("text/csv") ? BOM + text : text;
    const href = URL.createObjectURL(new Blob([body], { type: mime }));
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  } catch {
    /* download blocked (sandboxed iframe, strict CSP) — nothing useful to do */
  }
}
