import Papa from "papaparse";

/**
 * Export an array of objects as a CSV file.
 * Adds a UTF-8 BOM so Excel opens Korean text correctly.
 */
export function exportToCsv(
  data: Record<string, unknown>[],
  filename: string,
): void {
  const csv = Papa.unparse(data);
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

/**
 * Export arbitrary data as a formatted JSON file.
 */
export function exportToJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

/**
 * Copy data as JSON to the clipboard (for BIM tool integration).
 * Returns true on success, false on failure.
 */
export async function copyBimJson(data: unknown): Promise<boolean> {
  try {
    const json = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Internal helper
// ─────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
