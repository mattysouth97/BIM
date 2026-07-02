---
title: "fix: DWG WASM conversion fails — wrong API, broken caching, silent fallback"
type: fix
status: active
date: 2026-04-14
---

# fix: DWG WASM conversion fails — wrong API, broken caching, silent fallback

## Overview

DWG file uploads appear to process but always fail with the error "Export the DWG as DXF in your CAD tool." The root cause is threefold: the WASM conversion function uses the wrong libdxfrw API path, the WASM module cache poisons on first failure, and the server fallback always returns 501. This plan fixes all three so DWG→DXF conversion works end-to-end in the browser.

## Problem Frame

User uploads a .dwg file → `parseDwgFile()` tries WASM conversion → fails → falls back to server `/api/cad/convert` → server has no converter binary → returns 501 → user sees "Export as DXF" hint. The WASM path was the intended fix but has three bugs preventing it from ever succeeding.

## Requirements Trace

- R1. DWG files (R14–2020) upload and convert to DXF text client-side via WASM
- R2. Conversion produces footprint candidates identical to direct DXF upload
- R3. Clear error messages distinguish WASM load failure from conversion failure
- R4. Server route remains as a working fallback when converter binary IS available

## Scope Boundaries

- Not changing the DXF parser, PDF tracer, or upload-stage UI
- Not adding new file format support
- Not modifying the server route logic (it's correct for when a binary IS configured)

## Key Technical Decisions

- **Use `fileImport` + `fileExport` instead of `DRW_DwgR.read()` + `fileExport`**: The libdxfrw example's DWG→DXF conversion uses `fileHandler.fileImport(data, db, false, false)` then `fileHandler.fileExport(version, false, db, false)`. Our code uses `DRW_DwgR.read(handler)` which is the entity-inspection path, not the conversion path. The `fileExport` writer depends on internal state set by `fileImport`.
- **Invalidate WASM cache on failure**: The singleton `wasmModulePromise` caches even failed promises, poisoning all subsequent DWG uploads in the session.
- **Improve diagnostics**: Surface which stage failed (script load, WASM init, DWG read, DXF export) instead of a generic "conversion unavailable" message.

## Implementation Units

- [x] **Unit 1: Fix WASM conversion API and module caching**

**Goal:** Make `convertDwgToDxf()` use the correct `fileImport`/`fileExport` API, fix the singleton cache, and surface clear diagnostics.

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Modify: `src/lib/cad/dwg-parser.ts`
- Test: `src/lib/cad/__tests__/dwg-parser.test.ts`

**Approach:**
- Replace `DRW_DwgR.read()` + `fileExport()` with `fileHandler.fileImport(buffer, db, false, false)` + `fileHandler.fileExport(DRW_Version.AC1021, false, db, false)` — matching the working example
- Wrap `getWasmModule()` so a failed promise resets `wasmModulePromise` to null, allowing retry
- Add a post-init sanity check (verify `DRW_FileHandler` constructor exists)
- Include the failure stage in warning messages: "WASM load failed", "DWG read failed", "DXF export returned empty"

**Patterns to follow:**
- `node_modules/@mlightcad/libdxfrw-web/dist/index.html` lines 146–178 (the working convert-button handler)

**Test scenarios:**
- Happy path: `readDwgHeader` returns version info for all known AC versions (existing, unchanged)
- Happy path: `parseDwgFile` with mocked fetch returns candidates when server fallback produces DXF text (existing)
- Edge case: invalid header returns warning without attempting conversion (existing)
- Error path: WASM load failure resets cache — second call retries instead of returning stale rejection

**Verification:**
- All existing DWG/DXF/PDF tests pass
- DWG upload in the browser converts to DXF and shows footprint candidates

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `fileImport` parameter semantics differ from the example | Parameters match the example exactly; the example is the library author's own demo |
| WASM binary not served by Next.js dev server | `public/wasm/` is standard Next.js static serving; verified config is default |
