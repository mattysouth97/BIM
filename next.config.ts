import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The development badge overlaps the mobile bottom navigation. Compile and
  // runtime errors still surface; only the persistent route-status badge hides.
  devIndicators: false,
  /**
   * Dev only: the e2e runner drives the app at http://127.0.0.1:3000 while
   * developers browse http://localhost:3000. Without this, dev assets and HMR
   * are refused for the other host form, so pages served there never hydrate —
   * which silently fails the whole Playwright suite when it reuses a running
   * dev server.
   */
  allowedDevOrigins: ["localhost", "127.0.0.1"],

  /**
   * LibreDWG ships an emscripten ESM glue module that locates its 10 MB
   * `.wasm` sibling through `import.meta.url` and reads it with `createRequire`
   * + `readFileSync`. Bundling that glue into the server output rewrites
   * `import.meta.url` to the bundle's own location, so the binary is looked for
   * in the wrong place. Keeping the package external leaves it a real runtime
   * require out of node_modules, where the glue's self-relative lookup is
   * correct.
   */
  serverExternalPackages: ["@mlightcad/libredwg-web"],

  /**
   * The `.wasm` is loaded at runtime by path, not by any `import` statement, so
   * Node File Tracing has nothing to follow and would leave it out of the
   * serverless function — making `/api/cad/convert` fail on Vercel while
   * working locally. Keys are route globs; values are globs from the project
   * root (Next 16 `outputFileTracingIncludes`).
   */
  outputFileTracingIncludes: {
    "/api/cad/convert": ["node_modules/@mlightcad/libredwg-web/wasm/**"],
    // Dataset routes read only manifest JSON at runtime; include those files
    // explicitly. The matching exclude below is what actually keeps the meshes
    // out — an include cannot do that on its own.
    "/api/reference-buildings/**": ["public/reference-buildings/*/manifest.json"],
  },

  /**
   * Keep the published geometry out of the serverless functions.
   *
   * These routes read `manifest.json` by a path built at runtime, so tracing
   * cannot see which file is wanted and conservatively pulls the whole
   * `public/reference-buildings` tree — 295 MB of GLB meshes and flow graphs
   * that no function ever opens. The tenth model took the
   * `/api/reference-buildings/[id]/dataset` bundle to 296.3 MB and the
   * deployment was refused at Vercel's 250 MB uncompressed limit.
   *
   * The include above was written believing it prevented this; an include only
   * ADDS files, so nothing was keeping the meshes out. The limit had simply not
   * been reached yet.
   *
   * These assets are served statically from the CDN and are not read by any
   * function, so excluding them changes nothing at runtime. Vercel's
   * `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` would also have raised the ceiling, but
   * it would ship the meshes into every function invocation rather than fixing
   * the reason they are there.
   */
  outputFileTracingExcludes: {
    "/api/reference-buildings/**": [
      "public/reference-buildings/**/*.glb",
      "public/reference-buildings/**/*-flow.json",
      "public/reference-buildings/**/*.svg",
      "public/reference-buildings/**/spaces.json",
      "public/reference-buildings/**/openings.json",
      "public/reference-buildings/**/roof-planes.json",
      "public/reference-buildings/**/architectural-details-index.json",
    ],
  },
};

export default nextConfig;
