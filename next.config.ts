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
   * These assets are served from `public/` while they are on disk and, after
   * the Blob migration, through the `rewrites()` destination below — they are
   * not read by any function, so excluding them changes nothing at runtime.
   * Vercel's
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

  /**
   * Post-migration delivery path for the published reference-building GLBs.
   *
   * The 52 meshes (470 MB) live in the `bim` public Vercel Blob store, keyed
   * `reference-buildings/<id>/<file>.glb`; this rewrite keeps the public URL
   * contract `/reference-buildings/:id/:file.glb` serving those bytes without
   * streaming them through a function. The default array form is afterFiles
   * order, so a file present in `public/` (a restored local copy, or the
   * pre-migration tree) wins and the rewrite only fires once the GLBs are out
   * of the checkout. Inert wherever `BLOB_PUBLIC_BASE_URL` is unset.
   *
   * The source is constrained to `.glb` on purpose: it is not an open proxy
   * into the store — manifests, JSON, SVG and licences stay on `public/`.
   */
  async rewrites() {
    const blobBase = process.env.BLOB_PUBLIC_BASE_URL?.replace(/\/+$/, "");
    if (!blobBase) return [];
    return [
      {
        source: "/reference-buildings/:id/:file([^/]+\\.glb)",
        destination: `${blobBase}/reference-buildings/:id/:file`,
      },
    ];
  },
};

export default nextConfig;
