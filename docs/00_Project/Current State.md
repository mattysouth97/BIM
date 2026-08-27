---
type: project
status: implemented
last_verified: 2026-08-27
---

# Current State

Verified implementation status. Claims here rest on code, tests and runtime
behaviour — **not** on planning documents. Where a planning document disagrees
with this page, this page wins; where the running app disagrees with this page,
the app wins and this page is stale.

Last verified against a production deployment on **2026-08-27**.

## Validation at time of writing

| Check | Result |
|---|---|
| Unit tests (vitest) | **3952 passed**, 4 skipped, 362 files |
| End-to-end (Playwright, chromium) | **35 passed** |
| Typecheck (`tsc --noEmit`) | clean |
| Production | live at `https://bim-self.vercel.app` |

## The four steps

| Step | Status | Evidence |
|---|---|---|
| 1. 건물 검색 (register search) | **Implemented** | `/` renders the lookup; real search verified live against 강남구 개포동 |
| 2. 도면 업로드 | **Implemented** | upload stage in `WorkspaceShell`, guarded on a ≥3-point footprint polygon |
| 3. 디지털 트윈 | **Partial** — see below | twin renders with layers and typed inputs; energy source is the older path |
| 4. 보고서 | **Implemented** | `report-stage.tsx` — PDF, CSV, JSON |

### Step 3 is the honest gap

The twin renders, the layers work, and the typed inputs (벽체/창호/지붕 열관류율,
SHGC, 창면적비, CAPEX) recompute the profile. But the numbers come from the
**older simplified path** — the UI labels it `간이 모델` — backed by
`material-store`, not by the source-traceable canonical engine.

The traceable engine ([[Ledger Baseline Energy Model]], [[Energy Fact Provenance]])
exists, is tested, and runs — but at `/diagnostics/new?method=ledger&building=…`,
which is a **second workspace off the main path**. Integrating it into step 3 is
the top outstanding work item. Until then, the twin's numbers do not carry
provenance and the assumption/refinement honesty is not visible where users are.

## Implemented

- **Register lookup** — 시/도 → 시/군/구 → 법정동 and address search, against
  `/api/bldrgst/*`. Works for visitors without their own key via a shared
  server key (same-origin only, rate-limited per IP).
- **Ledger baseline energy model** — a register record becomes a multi-storey
  `CanonicalEnergyModel` with no user input. Verified on the bundled demo
  (10F/B2 2008 office): 10 storeys, 42 surfaces, 40 openings, EUI ≈ 331.9
  kWh/m²·yr, and on a real 15-storey 강남구 apartment (EUI ≈ 227.1).
- **Provenance invariants** — era defaults carry no source refs and no
  confidence; synthesised outlines are labelled as inference; ACH50 is converted
  to a natural rate; an unreadable date yields a stated era fallback. Each has a
  regression test.
- **Refinement** — replacing an assumed value with a stated or document-read one,
  preserving fact identity, retiring the assumption it replaces, refusing values
  that would make the model unsimulatable, and never mutating the baseline.
- **Retrofit economics** — measures with 투자비 / 회수 / 절감 / NPV, CAPEX
  knapsack, and the 그린리모델링 program tracks under a DCF model.
- **Report export** — energy audit and compliance previews with PDF/CSV/JSON.
- **CAD import** — DXF parsing, DWG→DXF via WASM, SVG and PDF paths.

## Partial

- **Twin energy provenance** — as above.
- **Geometry refinement (measured outlines)** — a ring measured off a drawing can
  replace the register-derived rectangle and does change the answer (verified: an
  L-shape produces 60 exterior walls vs 40, and a different annual figure). Not
  yet surfaced in the twin's own UI.
- **Report content coverage** — export works; how much of the traceable model
  reaches the report has not been re-verified since the engine changed.

## Retained but not reachable at runtime

These exist, compile, and are tested, but a user cannot get to them. Do not
describe them as features.

| Subsystem | Why unreachable |
|---|---|
| `AuthoringFamilyLayer` | Explicitly suppressed whenever `diagnosticsMode` is on |
| `InteriorLayer` | Defaults off behind a persisted toggle |
| Campus / portfolio comparison | Deliberately not restored to the front door — reported energy as `0` behind a placeholder badge |
| Manual 3D family authoring (작성) | Removed as a product mode; the 102 authoring GLBs were retained |

## Known constraints in the engine

- The degree-day core is **whole-building**. Zone results are area-apportioned
  and the adapter declares that as an approximation rather than implying
  per-zone calculation.
- `envelopeQuantities` derives the whole envelope from **one ring × total
  height**. Until it sums per storey, uploading per-storey floor plans cannot
  change the answer — it would be a progress bar over a constant.
- The VWorld outline is **lon/lat degrees** and is deliberately not wired into
  the baseline; handing degrees to a metres builder would produce a nonsense
  building.
- No ISO 13370 ground-coupling path exists, which is why basements are recorded
  but not extruded.

## External data reality

The four register endpoints (`title`, `recap`, `floors`, `areas`) fail
**independently and intermittently** — the same call will 502 and then return
data. The lookup therefore succeeds on a 표제부 alone; requiring all four threw
away buildings that were perfectly retrievable. See [[Integration Map]].

## Highest-priority next actions

1. Bring the traceable canonical engine into step 3 so the twin's numbers carry
   provenance, and mount the refinement inputs there.
2. Project the VWorld outline to metres so measured footprints reach the baseline.
3. Teach `envelopeQuantities` to sum per storey, so per-storey plans can move the
   number.

## Related

- [[CURRENT]] — the working handoff, updated more often than this page
- [[Project Overview]] · [[Product Intent]] · [[System Architecture]]
