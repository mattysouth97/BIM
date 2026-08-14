# Project CORE Memory

_Last updated: 2026-08-14. First verb now opens the twin._

## One sentence

BIMFIT turns a Korean building ledger record (or a CAD plan) into a 3D twin you can rotate, an energy number you can trust, and a retrofit investment answer you can take away.

## Transformation

A person arrives with an address, a 대장, or a drawing. They leave with a building they can see, an energy grade, and a CAPEX/ROI story for 그린리모델링 — without Revit, without ECO2, without an API key on the first visit.

## Jobs (in this order)

1. **See a building as a twin** — open one building and believe the 3D model is *that* building (ledger floors, footprint, era, use).
2. **Know what retrofit is worth** — move a budget, see NPV/IRR and which measures get picked, on the same building.
3. **Take an answer away** — energy-audit / compliance report, PDF/CSV/JSON, reopen the same building tomorrow.
4. **Start from a drawing** — upload DXF/DWG/PDF or draw a plan in the browser, then use it as the twin footprint.
5. **Look up a real 대장** — region or address search via data.go.kr, once a key exists.
6. **Compare a campus** — batch a 법정동 and compare a few buildings (energy only after twins exist).

## Doors (first verbs)

1. **데모 건물 둘러보기** — `/building/demo`, no key, no network. Primary CTA. Always opens the Twin stage (`doorStage("demo")`), even if a previous visit left the workflow on upload.
2. **CAD 도면으로 시작하기** — same demo building, land on the upload/draw stage (`doorStage("cad")`).
3. **지역/주소 검색** — needs an API key (user or `DATA_GO_KR_API_KEY`).
4. **캠퍼스 모드** — batch lookup after a key exists.

## Surfaces

- `/` — BIMFIT journal landing (promise → cost → twin → method → begin) plus the same search + campus lookup. Primary CTA is still 데모 건물 둘러보기.
- `/building/[id]` — workspace: Search → Upload CAD → Twin → Report (persisted stage). No marketing header. Stepper follows language. First-visit tour only on Twin, names the four real stages. Ledger materials and the base recipe seed when the 대장 title loads, so energy numbers exist even if the 3D canvas has not mounted (CAD door, report).
- `/building/demo` — reserved fixture twin
- `/releases` — prediction-release identity (secondary)
- `/dev/assets` — internal asset bench, not a door

## Voice

Korean-first instrument named BIMFIT. White-card numbers, ledger nouns (표제부, 연면적, 건폐율), not BIM jargon. Demo data is always labeled. English is a toggle, not a second product. The landing is an architecture-journal issue; the workspace stays an instrument.

## Invariants

- Zero values from the 대장 mean “unknown,” shown as “-”.
- Demo never calls data.go.kr or VWorld.
- Workflow stages are four: search, upload, twin, report. Do not invent a fifth product stage.
- Energy and retrofit numbers come from the existing engines in `src/lib/energy` and `src/lib/retrofit`. Do not add a second engine.
- This is not a BIM authoring tool, not a CAD competitor, not a government portal clone.

## Ship

1. `pnpm test` — Vitest must pass.
2. `pnpm build` — production typecheck/build must pass.
3. There is no named production alias in this repo. Do not invent a domain. Local ship = gates green. Production deploy only if `vercel` is authenticated and the worktree is intended for prod.

## Still unbuilt

- A real occupant’s own building without a public API key (beyond the one demo).
- Calibrated actuals for the demo (demo degrades like a building with no energy records).
- Campus energy before twins exist — do not fake kWh on the landing comparison.
- A second simulation engine, a full BIM editor, or a CAD product.

## Where truth lives

- Workflow: `src/lib/workflow/stages.ts`, `src/lib/workflow/doors.ts`, `src/store/workflow-store.ts`
- Building seed: `src/lib/building-seed.ts`
- Demo: `src/lib/demo/demo-building.ts`, `src/lib/constants.ts`
- Twin investment: `src/components/twin/*`, `src/store/scenario-store.ts`, `src/lib/retrofit/`
- Energy: `src/lib/energy/`, `src/hooks/use-energy-metrics.ts`
- CAD: `src/lib/cad/`, `src/components/cad-viewer/`, `src/components/upload/upload-stage.tsx`
- Ledger search: `src/app/page.tsx`, `src/app/api/bldrgst/*`
- Workspace: `src/components/workspace/workspace-shell.tsx`
