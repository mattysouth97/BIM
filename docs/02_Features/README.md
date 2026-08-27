---
type: feature
status: partial
last_verified: 2026-08-27
---

# Feature Index

One document per **conceptual feature**, not per component. Each page states its
own status with the evidence for it.

BIMFIT's product spine is four steps:

```text
건물 검색  →  도면 업로드  →  디지털 트윈  →  보고서
 (search)     (upload)       (twin)         (report)
```

Step 1 is the landing page at `/`. Steps 2–4 are all `/building/[id]`, switched by
the stage machine in [stages.ts](../../src/lib/workflow/stages.ts).

## On the product spine

| Feature | Step | Status |
|---|---|---|
| [[Building Register Search]] | 1 · 건물 검색 | implemented |
| [[CAD Drawing Ingest]] | 2 · 도면 업로드 | implemented |
| [[Digital Twin Viewer]] | 3 · 디지털 트윈 | implemented |
| [[Twin Energy Model]] | 3 · the numbers the inputs move | **partial** — labelled 간이 모델 |
| [[Retrofit Economics]] | 3 · CAPEX/ROI HUD | implemented |
| [[Report and Export]] | 4 · 보고서 | implemented |

## Alongside the spine

| Feature | Where it lives | Status |
|---|---|---|
| [[Traceable Energy Diagnostics]] | `/diagnostics/new` — a **second workspace** | implemented |
| [[Twin Fidelity and IFC Engine]] | step 3 속성 dock + report | implemented |
| [[BIM Document Model]] | step 3–4 Revit work rail | **partial** — authoring unreachable |
| [[Generative Schematic Engine]] | drawing entry into diagnostics | **partial** — LLM studio unmounted |
| [[Prediction Data Product]] | `/releases`, `/api/v1/*` | experimental · operator surface |

## The honest part

Two facts shape almost every page here, so they are stated once:

1. **There are two energy paths.** Step 3's numbers come from the older
   simplified path ([[Twin Energy Model]]), which the UI itself badges 간이 모델.
   The source-traceable engine ([[Traceable Energy Diagnostics]]) is real,
   tested, and reachable only at `/diagnostics/new`. Integrating it into step 3
   is the top outstanding work item.
2. **Several subsystems are retained but unreachable.** They compile, they have
   tests, and they inflate any file-count reading of the product. Verified
   zero-importer or zero-entry-point as of 2026-08-27:

| Surface | Why it cannot be reached |
|---|---|
| `src/components/generative/generative-studio.tsx` | no importer; `/studio` is now pure redirects |
| `src/components/workspace/authoring-palette.tsx` | no importer — strands the whole 3D authoring path |
| `src/components/lean/*` | no importer; the `/lean` route was retired |
| `src/components/campus/{portfolio-dashboard,comparison-view}.tsx` | no importer; `campusData` is never passed to BuildingScene |
| `src/components/workspace/cad-workspace.tsx` | no importer, including tests |
| `src/lib/annotations/*` | no importer; 주석 mode changes no rendering |
| `src/lib/upload/{energy-bill-parser,floor-plan-metadata}.ts` | no importer |
| cad-first mode + the `params` stage | `parseBuildingId` requires 5 hyphen-parts; no UI mints a `cad-<uuid>` id |
| `src/lib/plan-symbols/*` | only reachable via `/dev/symbols`; its mount point `PlanOverlay` is inside the unmounted studio |

Whether these are parked for revival or abandoned is not recoverable from code.
Historical rationale not established. Treat them as retired scaffolding, never as
capabilities.

See also [[Current State]] and [[Repository Map]].
