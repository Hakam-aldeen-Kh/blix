/** Dev Tools — export the captured log to a JSON file. */

import type { MonitorEntry } from "../../capture/networkMonitor";

export function exportLog(entries: MonitorEntry[]): void {
  try {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `network-log-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(href);
  } catch {
    /* download blocked — ignore */
  }
}
