/** Dev Tools — "Copy as cURL", mirroring Chrome DevTools. */

import type { MonitorEntry } from "../../capture/networkMonitor";

/**
 * Reconstructs a runnable `curl` command from the plaintext body and the
 * sanitized headers we captured.
 *
 * Note the captured `Authorization` header is masked, so the emitted command
 * carries a placeholder rather than a working token — that is deliberate, and
 * the reason a real re-run should use Replay instead.
 */
export function toCurl(entry: MonitorEntry): string {
  const url = `${entry.baseURL ?? ""}${entry.url ?? ""}`;
  const parts = [`curl '${url}'`, `  -X ${entry.method}`];

  for (const [k, v] of Object.entries(entry.requestHeaders ?? {})) {
    parts.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
  }

  if (entry.requestPayload !== undefined) {
    const body =
      typeof entry.requestPayload === "string"
        ? entry.requestPayload
        : JSON.stringify(entry.requestPayload);
    parts.push(`  --data-raw '${body.replace(/'/g, "'\\''")}'`);
  }

  return parts.join(" \\\n");
}
