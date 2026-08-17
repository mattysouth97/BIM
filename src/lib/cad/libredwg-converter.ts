// src/lib/cad/libredwg-converter.ts
// Tier-2 client-side DWG → DXF conversion via LibreDWG WASM
// (@mlightcad/libredwg-web).
//
// libdxfrw (tier 1) reads DWG R14–2013 reliably but cannot read the modern
// AC1032 (AutoCAD 2018+) format that current CAD tools save by default.
// LibreDWG covers AC1032, at the cost of a ~10 MB WASM binary — so it is
// lazy-loaded only when tier 1 could not handle the file, and cached for the
// rest of the session.
//
// The WASM binary is served from /wasm/libredwg-web.wasm (copied from the npm
// package into public/wasm/ — keep in sync when bumping the package).
//
// HOW THIS MODULE IS LOADED — the previous version built the specifier at
// runtime (`"@mlightcad/" + "libredwg-web"`) behind a `webpackIgnore` comment.
// That left a BARE specifier in the browser bundle, and browsers cannot
// resolve bare specifiers without an import map: every call threw
// "Failed to resolve module specifier" before any DWG byte was read, so tier 2
// never ran once. The import below is a plain static-analyzable dynamic
// import, which the bundler resolves at build time and emits as a lazy chunk —
// the package is a real dependency, so there is nothing to guard against.
//
// License note: LibreDWG is GPL-3.0. It is loaded as an unmodified,
// dynamically-imported module isolated behind this facade.

/** Directory (URL path) the emscripten loader fetches the .wasm from. */
const WASM_DIR = "/wasm";

interface LibreDwgInstance {
  dwg_write_dxf(buffer: ArrayBuffer): Uint8Array | null;
}

let libredwgPromise: Promise<LibreDwgInstance> | null = null;

/**
 * Lazy singleton for the LibreDWG WASM instance. Resets on failure so the
 * next upload retries instead of caching a rejected promise forever
 * (mirrors the libdxfrw loader in dwg-parser.ts).
 */
async function getLibreDwg(): Promise<LibreDwgInstance> {
  if (!libredwgPromise) {
    libredwgPromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error("LibreDWG WASM conversion requires a browser environment");
      }
      const { LibreDwg } = await import("@mlightcad/libredwg-web");
      return LibreDwg.create(WASM_DIR) as unknown as LibreDwgInstance;
    })();
  }

  try {
    return await libredwgPromise;
  } catch (err) {
    libredwgPromise = null;
    throw err;
  }
}

/**
 * Convert a DWG binary buffer to DXF text using LibreDWG.
 *
 * Returns `null` when LibreDWG loaded fine but produced no DXF output for
 * this file (caller should continue to the next fallback tier). Throws when
 * the WASM module itself cannot be loaded or conversion crashes.
 */
export async function convertDwgViaLibreDwg(
  buffer: ArrayBuffer,
): Promise<string | null> {
  const libredwg = await getLibreDwg();

  const dxfBytes = libredwg.dwg_write_dxf(buffer);
  if (!dxfBytes || dxfBytes.length === 0) return null;

  return new TextDecoder("utf-8").decode(dxfBytes);
}
