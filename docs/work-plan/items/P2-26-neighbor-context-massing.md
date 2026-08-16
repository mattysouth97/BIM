---
id: P2-26
title: Neighbor context massing — surrounding buildings as gray extrusions for solar/shading context
priority: P2
area: geometry
status: in-review
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-05]
---

# P2-26 — Neighbor context massing

Renders surrounding buildings as gray extrusions around the single-building digital twin
so shading and solar-access context is visible — key credibility for GX scenarios.

## 1. Requirement (RE)

- The single-building viewer shows up to 30 neighbor building massing volumes around the
  subject, fetched from VWorld GIS건물통합정보 (`LT_C_SPBD`), projected into local scene
  coordinates, and rendered as gray extruded solids with correct shadow casting.
- Neighbor height chain: measured `buld_hg` → `gro_flo_co × 3.3m` → default 6m.
- The subject building itself (re-returned by the bbox query) is excluded via point-in-polygon.
- Campus mode is unaffected.

## 2. Specification (SDD) — BDD scenarios

**S1 — contextMode API.** Given `GET /api/vworld/footprint?contextMode=true&lat=…&lng=…`,
when the upstream `LT_C_SPBD` query succeeds, then the response is
`{ neighbors: Array<{ pnu, polygon, height, groundFloors }>, truncated, error: null }`.
`truncated = neighbors.length >= 30`. Bad params → 400, no key → 503, upstream failure → 502
(no parcel fallback — neighbors are best-effort; empty is acceptable, upstream throw is not).

**S2 — subject exclusion.** Given a neighbor whose outer-ring centroid lies inside the
subject outer ring, when `toLocalNeighbors` is called, then that neighbor is excluded.

**S3 — height resolution.** Given `height` and `groundFloors` combinations, `resolveNeighborHeight`
follows: measured > floors × 3.3m > 6m default.

**S4 — scene rendering.** Given `footprintData.polygon` exists in single-building mode, when
the scene mounts, then a `<group name="context-massing">` appears with one `<mesh>` per
neighbor, using `ExtrudeGeometry` and `MeshStandardMaterial({ color: '#cfcfcf', roughness: 0.95 })`,
with `castShadow` and `receiveShadow` enabled.

## 3. Constraints (CDD)

- **May touch**: `src/app/api/vworld/footprint/route.ts` (+ its test),
  `src/lib/context-massing.ts` (new pure module), `src/hooks/use-neighbor-massing.ts` (new),
  `src/components/viewer/context-massing.tsx` (new), `src/components/viewer/building-scene.tsx`,
  `docs/work-plan/knowledge/domain-glossary.md`, dashboard README.
- **Must not**: rename or remove any existing response field; change bboxMode or single-footprint
  behavior; add `'use client'` to `src/lib/context-massing.ts` (AFF-1); echo API key in error
  (AFF-2); fabricate absent/zero attribute values (AFF-6).
- **Fitness**: all pre-existing route tests pass unmodified; contextMode has NO parcel fallback.

## 4. Evaluation (EDD)

- **Tests written first (TDD)**:
  - Route: 400 NaN lat, 503 no key, 502 upstream throw, 502 upstream non-OK, 200 parses
    neighbors + pnu + height + groundFloors, truncated=true at 30, AFF-6 null-not-fabricated,
    radius clamping (no 400), default radius captured in URL with LT_C_SPBD + size=30
  - `context-massing.ts`: height chain (measured/floors/default), constants exported at correct
    values, zero floors → default, point-in-polygon exclusion (inside/outside/mixed),
    projection output shape (points array, meter scale, height resolved), empty input

- **Gates**:
  - Targeted vitest: 41/41 ✓
  - Full `pnpm vitest run`: see evaluation notes
  - `pnpm lint`: 0 errors
  - `pnpm build`: ✓

- **Acceptance criteria**:
  - [x] `GET /api/vworld/footprint?contextMode=true` returns neighbors with pnu/polygon/height/groundFloors
  - [x] 400/503/502 HTTP contracts enforced (AFF-2)
  - [x] `toLocalNeighbors` excludes subject building via ray-cast point-in-polygon
  - [x] `resolveNeighborHeight` chain: measured → floors × 3.3 → 6m default
  - [x] `ContextMassing` mounts in single-building path only when `footprintData.polygon` exists
  - [x] All pre-existing route tests pass unmodified
  - [x] No `'use client'` in `src/lib/context-massing.ts` (AFF-1)
  - [x] No fabricated attributes (AFF-6) — zero/absent → null

- **Security checklist**: input validated with zod (lat/lng finite); radius silently clamped;
  no API key or env value in any response or error (AFF-2). AbortSignal.timeout(15000) on upstream fetch.

- **Honesty checklist**: absent/zero attributes → explicit null, never fabricated (AFF-6);
  `truncated` flag signals when more neighbors may exist; no unverifiable metric displayed.

- **Evaluation notes (2026-07-23)**: targeted vitest 41/41 (24 P2-26 new + 17 pre-existing route).
  Full suite + lint + build results in §Gates above.

- **Done when**: a single-building twin with a footprint polygon renders neighbor gray massing
  volumes that cast and receive shadows.

## Follow-ups (out of scope here)

- Layer panel toggle for the `context-massing` group (add `"context-massing"` LayerId).
- Animate neighbor opacity (fade in after main building loads).
- Filter by building height for tall-building shadow studies.
