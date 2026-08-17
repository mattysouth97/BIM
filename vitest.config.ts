import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next", ".planning"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts"],
      // P0-05: floors set at the measured 2026-07-21 baseline (52.78% lines /
      // 57.54% functions — below the 70% target). Ratchet upward via P1-09;
      // never lower these to make a change pass.
      thresholds: {
        "src/lib/**": { lines: 52, functions: 57 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws by design outside an RSC environment. Stub it so
      // server modules (the Claude provider and the generative API routes) are
      // testable in Node; the real guard still protects the Next.js build.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
});
