---
type: qa
status: partial
last_verified: 2026-08-27
---

# Testing and QA

What is verified, by what kind of check, and which parts of BIMFIT break quietly when touched.

Related: [[Testing Strategy]] (the runner mechanics) · [[Build and Run]] · [[Integration Rules]] · [[Deployment and Environment]]

## Four kinds of check — do not conflate them

| Kind | What it is here | Where | Runs automatically? |
|---|---|---|---|
| **Automated unit test** | pure functions and store logic in `happy-dom`, no network, no WASM | `src/**/__tests__/*.test.ts(x)` | Yes — CI `test:coverage` |
| **Integration test** | a real route handler or a real subsystem chain, still in-process: API route tests, the CadDocument→footprint chain, `runEngine` with a counting write session | `src/app/api/*/__tests__/`, `src/lib/*/__tests__/` | Yes — same vitest run |
| **Runtime smoke test** | a real browser against a real server, with upstream network **mocked** | `e2e/*.spec.ts` (Playwright, chromium) | **No — CI has no Playwright step** |
| **Manual acceptance** | a human (or a scripted capture) driving the deployed app against live upstreams | [QA-Checklist.md](../../QA-Checklist.md), `qa-evidence/`, `scripts/qa_*.py` | No |

The gap that matters: nothing automated ever touches a live data.go.kr or VWorld response. Every
automated check runs against fixtures. Live-upstream behaviour is only ever established by manual
acceptance — which is why the intermittent-502 rules in [[Integration Rules]] are documented rather
than tested.

## Current state (2026-08-27)

- vitest: **3952 passed, 4 skipped, 362 files**
- Playwright: **35 / 35** (chromium)
- `tsc --noEmit`: exit 0
- Coverage: not measured today. Floors are `src/lib/**` 52 lines / 57 functions; raising them to
  70/70 is work item P1-09, `not-started`.
- `pnpm lint`: not run today — ESLint cleanliness is unverified as of this date.

## Critical user journeys

The product is four steps. These are the journeys any change must not break.

```mermaid
flowchart LR
  S["1 · 건축물대장 검색<br/>/"] --> U["2 · 도면 업로드<br/>stage: upload"]
  U --> T["3 · 디지털 트윈<br/>stage: twin"]
  T --> R["4 · 보고서<br/>stage: report"]
  U -. "continue without CAD<br/>(cadSkipped)" .-> T
```

**J1 — 건축물대장 search (`/`).** 시도/시군구/법정동 or address → results table → a row routes to
`/building/<id>`. Covered by `ledger-baseline.spec.ts` ("the register lookup is the landing page",
"exists in exactly one place") and `first-door.spec.ts`. Live-upstream behaviour is manual only.

**J2 — 도면 업로드.** `.dxf` / `.dwg` / `.pdf` into
[upload-stage.tsx](../../src/components/upload/upload-stage.tsx). This is the only gating stage:
`STAGE_GUARDS.upload` needs an outer ring of ≥3 points, or an explicit "continue without CAD".
Covered for DWG/DXF/SVG import by `energy-diagnostics.spec.ts`; the *stage guard itself* is unit-tested
in [src/lib/workflow/](../../src/lib/workflow/).

**J3 — 디지털 트윈 typed inputs.** The 3D twin plus
[config-panel.tsx](../../src/components/viewer/config-panel.tsx) and its `config-tabs/`; the envelope
tab's 벽체/창호/지붕 U-value, SHGC, 창면적비 and ACH50 sliders must each move the grade/demand/CO₂
read-out on the next render, through [use-energy-metrics.ts](../../src/hooks/use-energy-metrics.ts).
Partially covered (`building-flow.spec.ts` asserts the energy-card DOM); **no automated test asserts
that a slider change changes a number.**

**J4 — 보고서.** PDF / CSV / JSON export from
[report-stage.tsx](../../src/components/report/report-stage.tsx). **No e2e coverage at all.** The only
evidence for the export path is QA-Checklist J4, dated 2026-08-14, which predates the current
workspace. This is the largest QA gap in the product.

**J5 — the traceable diagnosis workspace** at `/diagnostics/new?method=ledger|upload|create|sample`.
A second workspace, not part of the four steps. Well covered: `energy-diagnostics.spec.ts` (10),
`ledger-baseline.spec.ts` (6), `ledger-refinement.spec.ts` (2).

## Regression-sensitive areas

Ranked by how quietly they fail.

1. **Provenance invariants** — `createEnergyFact` throws without `sourceRefs` / an `assumptionId` /
   `extractionMethod === "user_input"`. Any new fact source must route through `ingestDrawingSet`,
   not a private side door. Each named trap keeps a regression test: ACH50 ÷ 20; `classifyEraExplicit`
   on a blank date (plain `classifyEra` silently returns `1990-1999`); a documented zero emitting
   **no** fact; ingestion not stamping a synthesised rectangle as `dimensioned_vector_geometry`.
2. **Two energy paths that must not be confused.** Steps 3–4 still compute from the older simplified
   path (the UI labels it **간이 모델** in
   [status-bar.tsx](../../src/components/workspace/status-bar.tsx)); the source-traceable canonical
   engine ([ledger-baseline-model.ts](../../src/lib/energy-diagnostics/ledger-baseline-model.ts) +
   `refinement.ts`) is reachable only at `/diagnostics/new`. A change to one does not move the other.
   Integrating them is the top outstanding work item — until then, verify both after any physics change.
3. **Envelope quantities are whole-building.**
   [envelope-quantities.ts](../../src/lib/energy/envelope-quantities.ts) derives gross wall area from
   one ring × total height. Per-storey plans cannot move the number until it sums per storey. A test
   that "proves" per-storey sensitivity today is testing the wrong thing.
4. **The 3D render path.** `building-scene.tsx` imports seven stores plus a dozen layers; the
   InstancedMesh budget (facade 4 + slabs 1 + columns 1 + roof 1 = 7 draw calls) holds only on the
   rectangular path — polygon footprints fall back to per-face Groups. Disposal/clone discipline for
   GLB assets is easy to break silently; see [[Repository Conventions]].
5. **Workflow stage guards.** `getBlockingStage` walks every intermediate guard on a forward jump;
   `WorkflowStageRecovery` rescues a persisted stage that no longer belongs to the current mode.
   Both are invisible until a persisted store puts a user somewhere impossible.
6. **Zustand persist + SSR hydration.** Reading a persisted store before `useHydration()` produces a
   mismatch that often only appears in production builds.
7. **DWG/WASM on Vercel.** The two `next.config.ts` settings that make `/api/cad/convert` work in
   production are invisible locally — the route works fine in dev without them.

## Manual acceptance material in the repo

### QA-Checklist.md — reusable skeleton, stale content

[QA-Checklist.md](../../QA-Checklist.md) at the repo root, dated **2026-08-14**, 183 lines: journeys
J1–J8 and edges E1–E13, each with Status / numbered Steps / Result and a `Fix:` line where a defect
was resolved. Method-honest ("Playwright Chromium against the live UI… No browser MCP was
available") with an explicit list of surfaces not reached.

Do **not** cite it as current evidence:

- it predates the `/diagnostics/new` workspace entirely — no journey touches it;
- it still uses the pre-BIMFIT product name;
- its one BLOCKED item (J7 register search, `401 Missing x-api-key header`) reflects a **local
  machine with no `DATA_GO_KR_API_KEY`**, not production, where register search is verified working.

It is also **tool-owned**: `.grok/workflows/twin-stage-qa.rhai` writes and overwrites that exact root
path. Leave the path alone; copy, never move. Anything worth keeping should be copied out before the
next run overwrites it.

Use its structure — journey id, steps, result, fix — for a current checklist covering the four steps
and `/diagnostics/new`. No such checklist exists yet.

### qa-evidence/ — 81 MB of runtime evidence, untracked

234 files, 81 MB, untracked but **not** in `.gitignore` (so permanently `?? qa-evidence/`), excluded
from ESLint and from Vercel upload. Two conventions worth keeping:

- Directories are named for what was verified, and production checks are **suffixed with the verified
  commit SHA**: `production-51c9201`, `production-623c58f`, `production-3d0c5ab`.
- Screenshots are zero-padded and ordered by journey step (`01-landing-desktop.png` …
  `12b-spatial-result-mobile.png`), with desktop/mobile named in the file.

Machine-readable evidence sits beside the images as `runtime-evidence.json`: baseUrl, empty
`pageErrors` / `consoleErrors` / `requestFailures`, the asserted UI state, canvas dimensions,
per-screenshot SHA-256 hashes, and pixel deltas between states (e.g. `focusedToRefocused 3.118`
vs `beforeToFocused 83.234` — numeric proof that re-focusing is idempotent).

`qa-evidence/energy-diagnostics-qa-findings.md` (2026-08-25) is the model for a QA report here: a
severity-tagged findings ledger F1–F10, journeys with PASS/FAIL verdicts and real engine numbers, and
an "AFTER — implementation pass" table pairing each fix with its runtime verification.

**Caveat:** no threshold is defined anywhere for those pixel deltas, so the visual comparisons are
evidence of a past run, not a repeatable gate.

### Python QA drivers — unreproducible environment

[scripts/qa_energy_diagnostic.py](../../scripts/qa_energy_diagnostic.py) (deliberately independent of
the Playwright runner so it can drive any running local or preview deployment; seeds the persisted
store and embeds a recovery DXF inline) and
[scripts/qa_spatial_focus.py](../../scripts/qa_spatial_focus.py) (computes the `image_delta` via
Pillow `ImageChops` + `ImageStat`).

They import `playwright.sync_api` and `PIL`, and the repo has **no** `requirements.txt`,
`pyproject.toml` or `Pipfile`. Pin that environment before relying on them. They also default to
different ports (`:3141` and `:3000`/`:3001` across the `.mjs` capture scripts); pass `--base-url`
explicitly.

## Known QA gaps

- No automated coverage of step 4 (report/export).
- No automated assertion that a step-3 input change changes an energy number.
- CI runs no Playwright and, more importantly, triggers only on `main` — so on the working branch
  `master` **no** automated gate runs at all. See [[Development Workflow]].
- No current manual checklist for the four-step workflow or `/diagnostics/new`.
- Live-upstream behaviour (data.go.kr intermittency, VWorld dataset selection) is documented but not
  monitored; nothing alerts on it.
- The `playwright-report/` on disk is from 2026-08-25 and is not today's run.
