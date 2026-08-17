// src/lib/cad/libredwg-node.ts
// Server-side DWG → DXF conversion via LibreDWG WASM under Node.
//
// This is what makes `/api/cad/convert` work on Vercel. The route's original
// only strategy was shelling out to an external converter binary named by
// DWG_CONVERTER_PATH — a binary that cannot exist in a serverless function, so
// the tier answered 501 for every upload in production. LibreDWG runs
// in-process as WASM: no child process, no filesystem layout assumptions, and
// the same decoder coverage (through AC1032) as the browser tier.
//
// ASSET LOADING — `LibreDwg.create()` is called with NO argument on purpose.
// With an argument the package builds an emscripten `locateFile` from it,
// which would make the .wasm location depend on the function's cwd. With none,
// emscripten resolves `libredwg-web.wasm` relative to its own glue module via
// `import.meta.url`, so the binary is found wherever node_modules ends up.
// Two build-time settings keep that true in production, both in next.config.ts:
//   - `serverExternalPackages` keeps the package out of the server bundle, so
//     the glue's `import.meta.url` still points into node_modules at runtime.
//   - `outputFileTracingIncludes` ships the .wasm itself, which nothing
//     statically imports and Node File Tracing therefore cannot discover.
//
// License note: LibreDWG is GPL-3.0, loaded unmodified behind this facade.

import "server-only";

interface LibreDwgInstance {
  dwg_write_dxf(buffer: ArrayBuffer | Uint8Array): Uint8Array | null;
}

let instancePromise: Promise<LibreDwgInstance> | null = null;

/**
 * Lazy singleton. The ~10 MB WASM module is instantiated on first conversion
 * (~30 ms, ~15 MB RSS) and reused for the life of the warm function instance.
 * Resets on failure so a transient load error does not poison every later
 * request in that instance.
 */
async function getLibreDwg(): Promise<LibreDwgInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const { LibreDwg } = await import("@mlightcad/libredwg-web");
      return LibreDwg.create() as unknown as LibreDwgInstance;
    })();
  }

  try {
    return await instancePromise;
  } catch (err) {
    instancePromise = null;
    throw err;
  }
}

/**
 * Convert DWG bytes to DXF text.
 *
 * Returns `null` when LibreDWG loaded but declined the file (its own
 * `dwg_write_dxf` reports a non-zero error code — corrupt file, or a format it
 * cannot decode). Throws only when the WASM module itself cannot be loaded,
 * which is a deployment fault rather than a bad upload; the caller
 * distinguishes the two in its diagnostics.
 */
export async function convertDwgToDxfOnServer(
  bytes: ArrayBuffer,
): Promise<string | null> {
  const libredwg = await getLibreDwg();
  const dxfBytes = libredwg.dwg_write_dxf(bytes);
  if (!dxfBytes || dxfBytes.length === 0) return null;
  return new TextDecoder("utf-8").decode(dxfBytes);
}
