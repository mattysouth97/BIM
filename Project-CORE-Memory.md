# Project CORE Memory

_Last updated: 2026-08-17. Twin + Revit-class BIM model: levels, types/instances, live views/schedules/sheets, and 현황/개보수 phases._

## One sentence

BIMFIT turns a Korean building ledger record (or a CAD plan) into a 3D twin you can rotate, an energy number you can trust, and a retrofit investment answer you can take away.

## Transformation

A person arrives with an address, a 대장, or a drawing. They leave with a building they can see, Revit-class views/일람표/sheets generated from that twin, an energy grade, and a CAPEX/ROI story for 그린리모델링 — without authoring in Revit, without ECO2, without an API key on the first visit.

## Jobs (in this order)

1. **See a building as a twin** — open one building and believe the 3D model is *that* building (ledger floors, footprint, era, use). Corrections persist. 층 편집 fixes the stack; 객체 편집 parks the service core and confirms plant specs. The twin hydrates a BIM model (levels, types, instances). Plan / elevation / section / 일람표 / 현황·개보수 come from that model — they are not drafted as separate drawings. Authoring places hosted families on the live twin; type edits update every instance.
2. **Know what retrofit is worth** — move a budget, see NPV/IRR and which measures get picked, on the same building. Selected measures carry DCF. On a phone a strip lists the picks. Budget and 그린리모델링 track persist so tomorrow reopens the same answer.
3. **Take an answer away** — energy-audit / compliance report, PDF/CSV/JSON, reopen the same building tomorrow. The energy-audit **개보수 권장 사항** is the same knapsack (per-measure NPV, 실효 투자비). Korean-first titles. Preview PDF is the real download.
4. **Start from a drawing** — upload DXF/DWG/PDF, draw a plan, or **샘플 도면으로 시작** then continue to the twin.
5. **Look up a real 대장** — region or address search via data.go.kr, once a key exists.
6. **Compare a campus** — batch a 법정동 and compare a few buildings (energy only after twins exist).

## Doors (first verbs)

1. **데모 건물 둘러보기** — `/building/demo`, no key, no network. Primary CTA. Always opens the Twin stage (`doorStage("demo")`), even if a previous visit left the workflow on upload.
2. **CAD 도면으로 시작하기** — `/building/drawing`, a blank 1-floor host (not the demo office tower). Lands on the upload/draw stage (`doorStage("cad")`). A sample DXF completes the loop without owning a file.
3. **지역/주소 검색** — needs an API key (user or `DATA_GO_KR_API_KEY`).
4. **캠퍼스 모드** — batch lookup after a key exists.

## Surfaces

- `/` — Cinematic BIM hero: the same office peels through 렌더 / 구조 / 기계 / 전체 on an automatic cycle. Studio plates (concrete frame, floor-by-floor MEP, brick envelope, peeled all). Layer rail shows plate thumbs. Pointer tilt, 1–4 keys. Twin-style bottom door bar. Search/campus open as a card overlay. Primary CTA is still 데모 건물 둘러보기.
- `/building/[id]` — workspace: Search → Upload CAD → Twin → Report (persisted stage). No marketing header. Stepper follows language. First-visit tour only on Twin, names the four real stages. Ledger materials and the base recipe seed when the 대장 title loads, so energy numbers exist even if the 3D canvas has not mounted (CAD door, report). Recipe/material/equipment overrides persist. Left dock is layers + retrofit recs; right dock is correction (floor stack / core slot / schedule) then 충실도. CAD ingest can pin a service core.
- `/building/demo` — reserved fixture twin (데모 오피스 타워)
- `/building/drawing` — drawing-origin host for the CAD door (1 floor, no demo tower)
- `/releases` — prediction-release identity (secondary)
- `/dev/assets` — internal asset bench, not a door

## Voice

Korean-first instrument named BIMFIT. White-card numbers, ledger nouns (표제부, 연면적, 건폐율), not BIM jargon. Demo data is always labeled. English is a toggle, not a second product. Landing and workspace share the same instrument chrome.

## Invariants

- Zero values from the 대장 mean “unknown,” shown as “-”.
- Demo never calls data.go.kr or VWorld.
- Workflow stages are four: search, upload, twin, report. Do not invent a fifth product stage.
- Energy and retrofit numbers come from the existing engines in `src/lib/energy` and `src/lib/retrofit`. Do not add a second engine.
- BIM authoring extends the twin: semantic levels/types/instances, project browser, type/instance properties, hosted placement. It does not replace the ledger→twin→energy loop or clone Revit’s UI.

## Ship

1. `pnpm test` — Vitest must pass.
2. `pnpm build` — production typecheck/build must pass.
3. There is no named production alias in this repo. Do not invent a domain. Local ship = gates green. Production deploy only if `vercel` is authenticated and the worktree is intended for prod.

## Still unbuilt

- A real occupant’s own building without a public API key (beyond the one demo).
- Calibrated actuals for the demo (demo degrades like a building with no energy records).
- Campus energy before twins exist — do not fake kWh on the landing comparison.
- Live neighboring 지적 fetch on a single twin (demo uses static neighbor boxes; no VWorld).
- BMS / sensor data (fidelity still reports unavailable).
- A second simulation engine or a CAD competitor.
- Full family editor, worksharing, fabrication LOD, or freeform MEP routing. Sketch walls, hosted doors/windows, snaps, IFC/EMS identity, quantities, and issues exist; those stay scoped.

## Where truth lives

- Workflow: `src/lib/workflow/stages.ts`, `src/lib/workflow/doors.ts`, `src/store/workflow-store.ts`
- Building seed: `src/lib/building-seed.ts`
- Demo: `src/lib/demo/demo-building.ts`, `src/lib/constants.ts`
- Twin authoring: `src/store/twin-provenance-store.ts`, `src/hooks/use-twin-fidelity.ts`, `src/lib/cad/doc/classify-plan.ts`, `src/lib/energy/equipment-schedule.ts`, `src/components/workspace/floor-stack-editor.tsx`
- BIM model: `src/lib/bim/model/`, `src/store/bim-model-store.ts`, `src/hooks/use-bim-model.ts`, `src/components/workspace/bim-properties-inspector.tsx`
- Family catalog (Figma + 102 GLBs): `src/lib/bim/family-catalog.ts`, `src/lib/bim/family-semantics.ts`, `public/models/authoring/`
- Autonomous BIM document: `src/lib/bim/derive/twin-elements.ts`, `src/lib/bim/phases/apply-phase.ts`, `src/lib/bim/views/`, `src/lib/bim/schedules/`, `src/lib/bim/sheets/compose-default-sheets.ts`, `src/hooks/use-twin-document.ts`
- Twin investment: `src/components/twin/*`, `src/store/scenario-store.ts`, `src/lib/retrofit/`
- Energy: `src/lib/energy/`, `src/hooks/use-energy-metrics.ts`
- CAD: `src/lib/cad/`, `src/components/cad-viewer/`, `src/components/upload/upload-stage.tsx`
- Ledger search: `src/app/page.tsx`, `src/app/api/bldrgst/*`
- Workspace: `src/components/workspace/workspace-shell.tsx`
