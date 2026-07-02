# Open Questions -- RESOLVED

## Digital Twin Platform Plan - 2026-04-05

All 10 open questions resolved during planning session.

- [x] **PDF generation library choice** -- **Hybrid**: `@react-pdf/renderer` (client-side) now, migrate to server-side later if design quality insufficient. Compatible with Vercel deployment.
- [x] **Korean green certification version** -- **Both**: Support pre-2024 and 2024 updated standards with version selector. Dual scoring tables.
- [x] **Construction cost database source** -- **KICT**: Use 한국건설기술연구원 published annual construction cost indices. No internal GX team database.
- [x] **Solar feed-in tariff rates** -- **User-configurable**: Input field for user to enter current rates per project. No hardcoded defaults.
- [x] **Campus definition scope** -- **Multi-block / custom boundary**: User defines bounding area, not restricted to single 법정동 block. Handles campuses spanning multiple blocks.
- [x] **IFC material extraction depth** -- **Deep investment**: Robust extraction for Revit and ArchiCAD IFC exports specifically. IfcMaterialLayerSet + IfcPropertySet parsing with authoring-tool-specific property maps.
- [x] **Undo system fate** -- **Remove entirely**: Delete `src/lib/undo/` completely. Digital Twin is automation-first; parameter adjustments don't need formal undo.
- [x] **Layer system** -- **Rebuild for Digital Twin**: Replace 15 component layers with 5 purpose-driven layers (Envelope, Structure, MEP, Energy Zones, Retrofit Targets).
- [x] **Deployment target** -- **Vercel**: Stay on serverless. PDF generation client-side, API routes within 10s timeout.
- [x] **Data retention for uploaded client data** -- **Server-side storage**: Vercel Blob or S3-compatible storage with basic auth for GX team. Accessible across devices.

## UI Integration Plan - 2026-04-11

- [ ] **BuildingMetrics adapter for campus mode** — PortfolioDashboard expects `BuildingMetrics` type from `portfolio-aggregator.ts`. Need to verify exact shape and confirm mapping from `BrTitleInfo` + computed energy metrics covers all required fields. Affects Task I5.
- [ ] **Retrofit generator input completeness** — Each retrofit generator (envelope, HVAC, lighting, solar) requires specific building parameters. Need to audit which params are always available from public data vs require uploaded data, and define fallback behavior. Affects Task I3.
- [ ] **Workspace-shell.tsx merge strategy for I2+I4** — Both tasks modify `workspace-shell.tsx` in different sections (I2: prop threading, I4: report stage content). Recommend sequential execution (I2 first) or clear region delineation to avoid merge conflicts.
- [ ] **Campus bounding box default derivation** — Users likely don't know lat/lng. Need to decide: (a) derive default bbox from selected district center + fixed radius, (b) use VWorld geocoding for district centroid, or (c) skip bbox and just query by sigunguCd/bjdongCd. Affects Task I5 UX.
- [ ] **Weather API route existence** — `useWeatherData` fetches from `/api/weather` but need to verify this API route exists. If missing, weather section in Task I2 should show "Weather API not configured" fallback instead of erroring.

## BIM Fidelity Strategy Plan - 2026-04-13

- [ ] **Fidelity manifest render surface** — (a) extend existing fidelity tab, (b) new `/api/fidelity/showcase-report` route, or (c) new panel in workspace-shell report stage. Spec only says "visible in the app" (C3). Lightest option wins.
- [ ] **Override storage at scale** — Option A ships `src/data/showcase-overrides/{pnu}.json` in-repo. Fine at 10–100; wants a database at 1k+. Confirm in-repo shipping is acceptable for this iteration and define the PNU-count threshold that triggers migration.
- [ ] **Step 4 scene-tree snapshot test depth** — Full scene-tree snapshot may be heavier than needed; bounding-box + draw-call assertion on `ProceduralBuilding` output may suffice. Architect preference requested.
- [ ] **HVAC mapping table scope** — Enumerate every `materials.hvac.*` enum value the codebase can emit (~10–15, portfolio-ready) vs. only the values the showcase exercises (faster). Critic preference requested.
- [ ] **Gap report format** — Human-readable markdown vs. structured JSON vs. both. Current plan assumes JSON consumed by markdown view; confirm with GX engineer.
- [ ] **Certified-grade vocabulary** — Official 에너지아이 uses "1등급 … 7등급"; internal `EnergyGrade` union may use letter buckets. Confirm canonical comparison vocabulary in Step 1 (plan risk R7).
- [ ] **Showcase building identity (blocks C1 measurability)** — Which specific building, and does it have a publicly-certified 에너지아이 grade? GX team sign-off required before any downstream step can proceed (plan risk R1, spec risk R1).
- [ ] **GX auditor sign-off for HVAC mapping** — KS F 1900 is paywalled; a GX auditor must review the `eco2-hvac-codes.ts` mapping and record approval in `.omc/research/showcase-building.md`. No other mechanism closes R3.
