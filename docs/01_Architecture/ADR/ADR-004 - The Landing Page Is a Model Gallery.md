---
type: adr
status: implemented
last_verified: 2026-09-04
---

# ADR-004 — The Landing Page Is a Model Gallery

## Status

Accepted — 2026-09-04. Amends, but does not overturn,
[[ADR-001 - Register-First Product Direction]]: the four steps and the register's
primacy *within* them stand. What changes is what sits in front of them.

## Context

[[ADR-001 - Register-First Product Direction]] made the landing page *be* the
건축물대장 search, on the premise that choosing a real building is enough to
produce a real multi-storey energy model with no further input. That premise is
the whole argument, and on 2026-09-04 it stopped holding cleanly. Two measured
defects, both recorded the same day:

- The twin extrudes 건축면적 over every storey. For 서울청운초등학교 that gives
  19,247.6 m² against a **stated** 연면적 of 12,957.58 m² — 48.5% high — so the
  headline intensity reads 51.2 kWh/m²·yr where the register's own area gives
  76.1. The register returned 2 of its 4 endpoints for that building, so 층별개요
  may simply be absent.
- With no interior subdivision, the same school comes out as 7 rooms averaging
  2,749.7 m² — one whole floor plate each — and **2 doors**. The MEP graph's
  plant→riser→main→branch→terminal chain has no terminals to serve.

So the front door was offering, as its first and only act, a baseline that can
be half again too large and a building with no rooms in it. Meanwhile the work
that fixes this is real BIM ingestion, and the first such model — a
buildingSMART medical/dental clinic IFC — was being taken in the same day.

There is a second, blunter reason, and it should be recorded as itself rather
than dressed up: the user asked for a gallery. Twice, and specifically —
"remove everything else from the landing page, even the background image."

## Decision

`/` is a gallery of the building models this project has actually taken in, and
nothing else. No hero plate, no 처리절차 strip, no form, no background image.

The 건축물대장 search **moves rather than disappears**. It now lives at
`/diagnostics/new?method=ledger`, which previously bounced a building-less
`method=ledger` back to `/`. That bounce would have become a loop into a page
with nothing to start, so the route renders the sheet directly and a bare
`/diagnostics/new` redirects into it.

Three commitments make the gallery honest, and they are the same commitments
[[ADR-002 - Provenance as a Construction-Time Invariant]] imposes elsewhere:

1. **Every figure on a card names what states it.** `GalleryFigure.read` carries
   the IFC entity class or quantity set — `IfcWindow`, `260 × GSA BIM Area` — and
   is rendered under the value, not hidden in a tooltip.

2. **A figure names what it excludes, not only what it counts.** This is not
   decoration. Summing all 269 `GSA BIM Area` quantities in the clinic gives
   6,935.8 m², which is what an obvious extraction produces and is **58% high**
   as a floor area: six spaces named `ROOF` (2,299.2 m²) and three named
   `OPEN TO BELOW` (242.4 m²) are not floor. The true figure is 4,394.3 m² over
   260 rooms. Nothing in the file flags this — the space names are the only
   signal — so the exclusion rule travels with the number.

3. **A card with nothing to open does not link somewhere else.** The clinic is
   marked `모델링 중` and navigates nowhere. Pointing it at `/building/demo`
   would be the same lie as illustrating it with another building's render,
   which is also why the plate is a drawn section diagram rather than a stock
   image.

## Alternatives

1. **Gallery replaces the register search outright.** Rejected. It is the most
   literal reading of the instruction, but it would delete the only entry to the
   건축물대장 flow — the primary door for the entire national building stock —
   to satisfy a layout change. Moving it costs one route and keeps it.
2. **Gallery above, register search below, on one page.** Rejected: explicitly
   contrary to the instruction, and it rebuilds the two-competing-doors shape
   `AGENTS.md` warns about, just stacked vertically.
3. **Catalog inside the existing `?method=sample` door, landing untouched.**
   This was chosen at ~11:50 the same day and reversed at ~13:05. Recorded here
   because a reader finding traces of it deserves to know it was a real decision
   and not an abandoned draft.
4. **Wait for the generated manifest before shipping any card.** Rejected as
   the ordering, not the goal — see Consequences.

## Consequences

**Easier**

- The product leads with buildings it can actually model, which is what the two
  defects above argue for.
- A gallery grows by appending to `GALLERY_ITEMS`; it does not need a new page
  per model.
- The register lookup gained a stable, linkable address. Commit 94c53da's
  "건물 검색으로 이동" CTA now reaches it directly instead of via a redirect.

**Harder**

- `/` no longer starts a diagnosis. The header's diagnostic action and API-key
  control are hidden on the gallery by request, so from `/` the register search
  is reached by URL or by the wordmark → any other page. **This is the sharpest
  edge of this decision** and the thing most likely to need revisiting.
- `AGENTS.md` still reads "The landing page (`/`) is step 1" and forbids a
  second entry screen. That text is now wrong and has NOT been changed here — an
  agent instruction file is the user's to amend, not a side effect of an ADR.
  Until it is, a future session will read it and revert this.
- The card's numbers are literals in `src/lib/landing/gallery.ts`. They were each
  read from the IFC and are pinned against each other by
  `landing-gallery.test.tsx` (rooms + excluded = 269; storey areas sum to the
  stated total), but a literal cannot notice that the extraction moved under it.
  When `public/reference-buildings/<id>/manifest.json` lands, every numeric field
  should be read from it and only the editorial fields kept by hand.

**Risk accepted**

- One model in a gallery looks thin. The grid uses `auto-fill` rather than
  `auto-fit` precisely so the single card keeps its own width instead of
  stretching across the page and advertising the emptiness.

## Verification

- `/` renders the gallery and carries no `<img>` and no CSS `url()` background;
  `/diagnostics/new?method=ledger` renders the register sheet — both asserted in
  `e2e/first-door.spec.ts`.
- The 6,935.8 m² area-plan total is asserted **absent** from the page, so the
  wrong-but-plausible figure cannot come back quietly.
- tsc clean; ESLint 0 errors; 4,365 unit tests pass. The 4 failures in
  `cad-request-panel.test.tsx` are pre-existing (OSM mock mismatch) and untouched
  by this change.
