# Reference building #2 — Schependomlaan

Status: **selected, not started.** The session that verified the selection
(bim-8e) was closed on 2026-09-04 before it committed anything. No branch, no
commits, no artifacts survived. This file exists because that finding lived only
in a session transcript, which is not a place to keep a decision.

## Why this building, and not another

Building #1 (the buildingSMART Medical-Dental Clinic, shipped at
`/models/bs-medical-dental-clinic`) has one gap that no amount of extraction
care can close: **it states no location.** Its `IfcSite` is the authoring tool's
factory default (Boston, MA) and the real site is redacted, so its climate and
its orientation are both assumptions. Every energy figure it produces means
"this envelope, in a climate we chose".

Schependomlaan closes exactly that gap:

- **A real site** — 52°9′N 5°23′E, Nijmegen, Netherlands. Real climate, real
  solar orientation, and a true-north that means something.
- **Stated thermal performance** — the model carries ~97 occurrences of
  `IfcThermalTransmittance`. The Clinic carries **zero**. That inverts the
  hardest part of building #1: instead of mapping bare material names onto a
  generic library and calling the conductivity an assumption, U-values can be
  read as *stated* and the era tables become a cross-check rather than the
  source.

Both numbers above came from bim-8e's verification pass and are the one thing
worth trusting from it — but **re-verify both against the file before building
on them**, because the evidence for them is gone with the session.

## Scope

**Envelope only.** Agreed before bim-8e started, and still right: the Clinic
already carries the MEP story, and #2 earns its place through site and stated
U-values, not through a second duct network.

## The one known adaptation

The Clinic's extractor assumes a single-leaf exterior wall. Schependomlaan is
Dutch residential construction — **cavity walls, two leaves with an air gap**.
`netFaceAreasByElement` takes the thin axis of each element's own bounding box,
so two leaves of one wall are two elements and their areas will both be
counted. Either the outer leaf alone is the envelope surface, or the pair is
collapsed to one. Whichever is chosen must be stated, not silently picked.

## Where to start

1. `scripts/build-reference-building.mjs` — the `CLINIC` config object is the
   template. It is already shaped as a per-building config; a second entry is
   the intended way to add a building, not a fork of the script.
2. `scripts/lib/ifc-envelope.mjs`, `ifc-face-area.mjs`, `ifc-glb.mjs` — reusable
   as-is. `netFaceAreasByElement` is the measurement of record; **space
   boundaries are refuted for this purpose** and the reasons are written into
   `ifc-envelope.mjs`. Do not re-derive that.
3. `src/lib/reference-buildings/manifest.ts` and
   `src/app/models/[id]/page.tsx` — already generic over `id`. A second building
   should need no new route.

## Traps that cost building #1 real time

- **`countsAsFloorArea`.** An architectural area plan is not a floor-area
  schedule. Summing every `IfcSpace` overstated the Clinic by 37 % (ROOF,
  OPEN TO BELOW, MECH. YARD spaces). Floor area is the denominator of every
  intensity figure, so this error makes a building look *better*. Check the
  space names before summing anything.
- **Measures arrive as `_representationValue`, not `value`.** A `.value`-only
  accessor returns null for every length and a clean, wrong **zero** for every
  area. It does not throw.
- **`GetLine(id, ref, false)`** — the flattened form does not expose nested
  refs.
- **web-ifc's `flatTransformation` is already Y-up.** Applying the textbook
  Z-up→Y-up swap reported a 77 m height for a two-storey building.
- **`--generated-at` is required** and must not come from a clock: the
  artifacts are committed, so the same inputs must produce the same bytes.
