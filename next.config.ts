import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
};

export default nextConfig;
