// src/lib/cad/libredwg-converter.ts
// Tier-2 client-side DWG → DXF conversion via LibreDWG WASM
// (@mlightcad/libredwg-web).
//
// libdxfrw (tier 1) reads DWG R14–2013 reliably but chokes on the modern
// AC1032 (AutoCAD 2018+) format that current CAD tools save by default.
// LibreDWG has much broader modern-format read coverage, at the cost of a
// ~10 MB WASM binary — so it is lazy-loaded only when tier 1 has already
// failed, and cached for the session afterwards.
//
// The WASM binary is served from /wasm/libredwg-web.wasm (copied from the
// npm package into public/wasm/ — keep in sync when bumping the package).
//
// License note: LibreDWG is GPL-3.0. It is loaded as an unmodified,
// dynamically-imported module isolated behind this facade.

interface LibreDwgModule {
  dwg_write_dxf(buffer: ArrayBuffer): Uint8Array | null;
}

/** Directory (URL path) the emscripten loader fetches the .wasm from. */
const WASM_DIR = "/wasm";

let libredwgPromise: Promise<LibreDwgModule> | null = null;

/**
 * Lazy singleton for the LibreDWG WASM instance. Resets on failure so the
 * next upload retries instead of caching a rejected promise forever
 * (mirrors the libdxfrw loader in dwg-parser.ts).
 */
async function getLibreDwg(): Promise<LibreDwgModule> {
  if (!libredwgPromise) {
    libredwgPromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error("LibreDWG WASM conversion requires a browser environment");
      }
      // Built as a string so the bundler does not fail the whole workspace
      // when the optional ~10 MB package is not installed.
      const spec = "@mlightcad/" + "libredwg-web";
      const mod = (await import(/* webpackIgnore: true */ spec)) as {
        LibreDwg: { create: (dir: string) => LibreDwgModule };
      };
      return mod.LibreDwg.create(WASM_DIR);
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
