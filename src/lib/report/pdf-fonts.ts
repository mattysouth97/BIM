// src/lib/report/pdf-fonts.ts
// P0-03 — registers Noto Sans KR (Regular + Bold) with @react-pdf/renderer so
// Hangul renders as glyphs instead of tofu. Imported for side effect by
// pdf-renderer.tsx; registration happens once at module scope.
//
// Font files are bundled same-origin under public/fonts/ (SIL OFL 1.1 —
// license carried alongside as public/fonts/OFL.txt). No CDN fetch at render
// time: the browser loads /fonts/* from our own origin; test runs (VITEST)
// read the same files from disk so render tests stay offline-deterministic.

import { Font } from "@react-pdf/renderer";

function fontBase(): string {
  if (typeof process !== "undefined" && process.env?.VITEST) {
    return `${process.cwd()}/public/fonts`;
  }
  return "/fonts";
}

Font.register({
  family: "NotoSansKR",
  fonts: [
    { src: `${fontBase()}/NotoSansKR-Regular.otf` },
    { src: `${fontBase()}/NotoSansKR-Bold.otf`, fontWeight: 700 },
  ],
});
