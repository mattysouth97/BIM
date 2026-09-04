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

- **A stated town** — the model carries
  `IfcPostalAddress(... 'Nijmegen' ...)`. A town is a stated fact, and it is
  strictly more than the Clinic has, whose site is redacted behind an authoring
  default with no town at all. A Dutch climate file for Nijmegen is defensible
  on that evidence.
- **Stated thermal performance** — the model carries 97 occurrences of
  `IfcThermalTransmittanceMeasure`. The Clinic carries **zero**. That inverts
  the hardest part of building #1: instead of mapping bare material names onto
  a generic library and calling the conductivity an assumption, U-values can be
  read as *stated* and the era tables become a cross-check rather than the
  source.

**Corrected 2026-09-04, after verification by bim-bf. The original version of
this file claimed a real surveyed site at 52°9′N 5°23′E, Nijmegen. That is
wrong and the correction matters more than the claim did.**

`IfcSite` really does carry `(52,9,0,0)` / `(5,23,0,0)`, but those decode to
52.1500 N, 5.3833 E — about **45 km from Nijmegen**. They are 52°09′/5°23′ to
the whole minute with zero seconds, which no surveyed site is, and that point
is simultaneously the origin of the Dutch RD (Rijksdriehoeksmeting) datum and
the architect's own city: the same file carries a second postal address on
`Amsterdamsestraatweg 43, 3812 RP Amersfoort`. So the coordinates are a stamped
constant, exactly the Clinic's Boston-default trap in a different costume, and
**no orientation or solar geometry may be taken from them**.

What survives is the town, and it is enough — but the honest claim is "a stated
town, hence a real climate", never "a real site at 52°9′N 5°23′E". `RefElevation
20000` (20 m) fits Nijmegen rather than Amersfoort, so the provenance in this
file is genuinely mixed; record that rather than resolving it silently either
way.

Whether the 97 U-values actually cover the **exterior envelope** is a separate
question — 97 values sitting on interior partitions would be worthless, and
"97 exist" is not "the envelope is covered". Verify coverage, not just count.

## Where the file actually is

Two published pointers to this dataset are dead, so this is worth stating
precisely. `openBIMstandards/DataSetSchependomlaan` is now a stub README
redirecting to `buildingSMART/Sample-Test-Files`, and that repository has since
been renamed to `buildingSMART/Certification-datasets` and no longer carries
Schependomlaan at all.

The file lives at **`openBIMstandards/Archive-DataSetSchependomlaan`**, branch
`master`, `Design model IFC/IFC Schependomlaan.ifc` — 49,286,967 bytes,
ArchiCAD IFC2X3, `CoordinationView_V2.0` + `QuantityTakeOff` +
`SpaceBoundary2ndLevel`. Verified by download, not by reading a link.

## Licence — unresolved, and a blocker

**Do not publish derived artifacts until this resolves.** The archive
repository has no `LICENSE` file and GitHub reports NOASSERTION. Building #1
ships CC BY 4.0 with a verbatim attribution string, and the manifest type
requires both a licence and an attribution — neither of which can be invented.
If no explicit grant exists, whether to publish is the user's decision, not
ours.

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
