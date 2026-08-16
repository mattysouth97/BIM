// src/lib/engine/engine-download.ts
//
// Pure browser-download helper for the engine's generated IFC bytes.
// Same Blob + temporary-anchor-click + revokeObjectURL pattern as
// src/lib/export.ts's triggerDownload — kept local to src/lib/engine so the
// engine module tree stays self-contained (no cross-import into lib/export).

/**
 * Triggers a browser download of `bytes` as `filename`. No-op if `document`
 * is undefined (e.g. server-side rendering or a non-DOM test environment).
 */
export function downloadIfc(bytes: Uint8Array, filename: string): void {
  if (typeof document === "undefined") return;

  // Cast: lib.dom's BlobPart typing wants Uint8Array<ArrayBuffer>, but the
  // engine's ifcBytes is typed Uint8Array<ArrayBufferLike> (SaveModel's
  // return type) — the underlying bytes are always a real ArrayBuffer here.
  const blob = new Blob([bytes as BlobPart], { type: "model/ifc" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
