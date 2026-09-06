# Superseded CURRENT.md sections

Historical snapshots and prior work-in-progress; verify against current code.

## Handoff — what the day landed, and what the next session picks up

Two briefs carry the full record with shas and verification per lane:
`2026-09-06-gallery-consistency-visuals-brief.md` (three user tasks + the
measure-first row + the optional budget) and
`2026-09-06-pv-roof-placement-methodology.md` (PV placement, five stages, all
implemented). Read them before touching the energy frame, the model pages or
the PV path.

**State of the product on `21835a7`:**

- **Four reference buildings** at `/models/<id>`: Clinic, Schependomlaan,
  Duplex Apartment, FZK Haus (DigitalHub refused — no licence). Every page
  renders one contract (`docs/02_Features/Reference Buildings.md`).
- **Grades on the table the use code selects** — dwellings 주거: apartment
  1++, Duplex 4, FZK 2; kWh/m² unchanged. Ledger dwellings move the same way.
- **Retrofit priced against the engine's own demand** on measured areas, with
  the HRV gap and LED/PV not moving the grade stated on the page.
- **The 그린리모델링 row picks WORK** (one chip per measure, bilingual, with
  its one-line claim); financing is a secondary 지원 재원 row that re-prices
  and never re-picks. `appliedMeasureIds` is the user's set;
  `useProposalVisualIds()` is the single 3D gate.
- **Budget is optional** (Lane 3D): `capexBudgetKrw: number | null`, null by
  default, per building, not persisted; null → recommendation = NPV-positive
  set, no knapsack; a value → the knapsack. The slider band is gone.
- **PV modules are drawn where measured roof planes put them** on the twin and
  the model pages: `roof-planes.json` + `roof-planes-qa.svg` per building
  (strip-merged, sky-occluded, skylights as obstructions), `pv-layout.ts`
  (setbacks, clearances, north pitches refused, solstice row pitch),
  `use-pv-layout.ts` as the one source for the modules drawn, the legend's
  count (`data-pv-modules` = `data-pv-drawn`) and the kWp the economics
  prices. The bounding-box path is deleted.

**Open, in priority order:**

1. Obstructions for roof-mounted plant and parapets (openings are done).
2. Follow-ups outside these briefs: the engine cannot reproduce the HRV
   table's saving (`mechanicalAch` 0 while type is natural); LED/PV never move
   kWh or grade (`delivered-from-demand.ts`); a sourced Nijmegen climate.

**2026-09-07 local milestone:** the four reference models' exterior/roof
screenshots were inspected. PV layout now retains every disconnected outer,
correctly accounts clipped/overlapping removals and gives the renderer exact
portrait poses and roof clearance. The Clinic holds 453 modules / 181.2 kWp
(was 447); apartment 10 / 4.0, Duplex 14 / 5.6, FZK 22 / 8.8. The per-plane
table, sidebar economics, chip capacity and module-surface-area claim all use
this layout. Reference shadows are enabled and fitted to model size; sidebar
exterior/roof/focus controls expose the full model. See the new execution
record for validation and deployment status. This milestone is live as
`23f8f49`, deployed from a clean detached worktree.

**Traps found today, all recorded where they bit:** rebuilding artifacts
churns CRLF on every JSON (check `git diff --ignore-cr-at-eol`, restore the
untouched ones; byte-identity is checked against the git blob);
`calculateSolarPotential`'s kWp is the SIXTH argument; outline rings on disk
are tagged and read by tag; a plane's outline can be a multipolygon; a
python/bash heredoc containing template literals fails to parse in this
shell — write the script to a file; any change to a rendered string or
number runs `e2e/reference-buildings.spec.ts`, the only check that reads the
page; equal numbers on screen are not evidence of a shared source — reconcile
with a figure computed a different way.

**Fleet:** every session from 2026-09-06 is released or out of context;
`SESSION-LOCKS.md` says nothing is claimed.

## Work in Progress

**The working tree is dirty and not all of it is mine.** A concurrent design pass
is restyling the landing and search surfaces toward the design-system tokens
(`border-border`, `bg-card`, `rounded-[8px]`, `shadow-xs`). Affected at time of
writing: `src/components/landing/{cad-sheet,resume-diagnostic}.tsx`,
`src/components/energy-diagnostics/ledger-lookup.tsx`,
`src/components/search/{address,region}-search-form.tsx`,
`src/components/layout/header.tsx`, `src/app/globals.css`, and
`e2e/first-door.spec.ts`.

Run `git status` before assuming anything about the tree, and do not revert those
files.

**Reference buildings (2026-09-04, 23:10 state — production `7b9e0f8`).** Two
authored models are published under `/models/<id>` from
`public/reference-buildings/<id>/` (manifest, spaces.json, openings.json,
GLBs), built by `scripts/build-reference-building.mjs`. Both pages carry the
demo's full energy frame (`EnergyInstrumentHud`) on measured envelope figures
via `BuildingRecipe.measuredEnvelope`, solved constructions, and the
외피/에너지 존 legend. Every envelope figure is now measured by the extractor
generically — walls, glazing per opening binned by host-wall orientation,
exterior doors, roof surface per family, ground slab union + exposed
perimeter, space volumes — and the Clinic's committed constants were
corrected by that pass (glazing 267.16 → 262.73, doors 37.06 → 36.08, ground
2,621.08 → 2,577.42 after excluding a 43.66 m² outdoor pad, roof 2,669.21 →
2,667.38 as true surface with the seam at 455.00). The apartment has six
subcontractor layers from its archive's coordination set (no MEP model
exists), and three of its figures remain stand-ins — glazing aperture, its
split, exterior doors — marked on the frame with the direction of their bias.
Delegation record and lane shas: `schependomlaan-parity-brief.md`; Clinic
detail: `clinic-glazing-and-usage-sources.md`. The ISO 13790 monthly kernel
(`feat/iso-13790-monthly-kernel`, `iso-13790-monthly-kernel-brief.md`) is
done, unwired. Open: the apartment's wall-set scope (A-WALL-SET-SCOPE, a
measurement in progress), an area-weighted WWR mean in heat-loss.ts (moves
both buildings; not decided), a sourced Nijmegen climate.
