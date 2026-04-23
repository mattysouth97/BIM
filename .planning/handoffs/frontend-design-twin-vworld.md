# Handoff — Frontend-Design for Twin Stage + VWorld 3D Buildings

**Status:** Deferred. Not started. Open this file in the fresh session to brief the `/frontend-design` skill.

**Date:** 2026-04-24

## Request (from user)

1. Renew the UI/UX at the Twin stage so that the "data" we are selling is clearly visible.
2. Use VWorld API to render 3D buildings that are more similar to the real-life buildings.

## Strategic framing (from session context)

The product was reframed this session as a **portfolio energy-prediction data product** (v7.0 Prediction; plan at `.omc/plans/consensus-v7-phase35-portfolio.md`). The Twin stage is currently a procedural building viewer — it should evolve into a surface that visibly communicates the data product:

- Prediction release version + generated-at timestamp
- Calibration tier (MAPE / Kendall tau from `public/releases/<version>/calibration.json`)
- Coverage indicator (this twin is part of release v0.1.0 / v0.1.1 / …)
- Feature provenance: which of the 20 `PortfolioFeatureVector` fields drove the prediction
- Link back to the `/releases` explorer page (Phase 35 Task 11) once that ships

## What exists today (minimal inventory from session)

- `src/components/twin/fidelity-badge.tsx` — shows L1/L2/L3 fidelity level with a tooltip listing available data sources. Three levels hardcoded, colored badges, no data-product metadata surfaced.
- `src/components/twin/fidelity-detail-panel.tsx` — detail panel (not inspected in depth this session).
- `src/components/workspace/workspace-shell.tsx` — hosts the Twin stage. The 3D canvas is the `children` passed in when `stage === "twin"`.
- Current building rendering is procedural via `src/lib/procedural/*` (era-based recipes, InstancedMesh facade/structure generators). Geometry is synthesized, not real.
- VWorld integration today: `src/app/api/vworld/footprint/route.ts` — 2D cadastral footprint polygons only (LP_PA_CBND_BUBUN). No 3D buildings dataset wired. VWorld has 736 spatial datasets per project memory; 3D buildings datasets exist (project memory lists "3D buildings" among VWorld's offerings) but no route exists.
- Hooks consuming VWorld: `src/hooks/use-building-footprint.ts`, `src/hooks/use-campus-buildings.ts`, `src/hooks/use-composite-building.ts`.

## Work items (suggested scope for the fresh session)

### Item 1 — Twin stage data surfacing
- **Hero area:** release version + calibration tier + "last updated" timestamp prominently visible.
- **Feature panel:** show the building's 20-field `PortfolioFeatureVector` inline (grouped by bldrgst / geometry / era_prior / location), with source links where possible (e.g., era prior → link to `korean-building-codes.ts` reference).
- **Prediction panel:** predicted kWh/m²/yr + grade + confidence placeholder. Link to `/releases/<version>` when Phase 35 Task 11 ships.
- **Fidelity badge** already exists — extend its tooltip to include the data product metadata, or replace it with a richer "release tier" chip.

### Item 2 — VWorld 3D building rendering
- Add a new route `src/app/api/vworld/buildings-3d/route.ts` (or similar) that queries VWorld's 3D buildings dataset. Investigate the exact dataset ID in the fresh session — candidate datasets per VWorld docs include `building_3d_bl` and others. API key already in env (`VWORLD_API_KEY`, domain `VWORLD_DOMAIN`).
- The response is typically per-building with: footprint + height + roof type + building ID. Compare with our existing procedural pipeline, which uses era + structure-type to guess geometry — real VWorld 3D would replace guessed geometry with real.
- Add a toggle: "Procedural" vs "VWorld 3D" — user can flip between the current procedural view and the real-geometry view. In a data-product context, the VWorld view should probably be default for released-tier twins; procedural stays for pre-release preview.
- Reuse existing three.js/R3F machinery (`src/components/viewer/building-scene.tsx` is the Canvas host per CLAUDE.md).

## Constraints to honor

- Do not break the workflow-stage routing in `workspace-shell.tsx`.
- Do not regress the existing procedural pipeline — the VWorld 3D path is additive.
- Match project style: Next.js 16 App Router, React 19, strict TS, tailwind, shadcn/ui.
- No `"use client"` in server components unnecessarily; follow existing patterns.
- Respect the v7.0 data-product moat framing — UI should communicate "you're looking at versioned, calibrated data," not "this is a free-form design tool."

## Not in scope

- Interactive prediction sliders / what-if controls (forbidden per v7.0 plan's moat thesis).
- Modifying the CAD upload stage (that's a separate paused track).
- Modifying v6.0 Audit Deliverables phases 29–34.

## Recommended fresh-session invocation

```
/frontend-design Renew Twin stage UI to surface the v7.0 data product
(prediction release metadata + calibration tier + 20-field feature vector) and
add VWorld 3D building rendering as an optional toggle against the existing
procedural pipeline. See .planning/handoffs/frontend-design-twin-vworld.md
for full brief.
```
