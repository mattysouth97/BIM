---
type: adr
status: implemented
last_verified: 2026-09-02
---

# ADR-003 — Reconstruction Is Not Evidence

## Status

Accepted. Implemented in `src/lib/cad-reconstruction/` and
`src/components/upload/upload-stage.tsx`.

## Context

Most buildings that need an energy retrofit have no surviving CAD. The 도면
업로드 step therefore had a dead end: users without a drawing could only press
`CAD 없이 계속` and accept a rectangle synthesised from 건축면적.

We can do much better than that rectangle. The register states floor areas,
storey counts, height, use, structure and dates; VWorld returns an observed
building outline; the era tables supply plausible floor heights and window
ratios; and the user usually knows *something* — a frontage they have measured,
which side the entrance is on.

Assembling those into a drawing is straightforward. The danger is what happens
next. A DXF looks like a survey. Once a synthesised outline is in a `.dxf` with
layers and dimensions, every downstream consumer — the fidelity badge, the
ISO 19650 status, the report, the next agent to read the code — has every
reason to treat it as a measured drawing. [[ADR-002 - Provenance as a
Construction-Time Invariant]] made that distinction non-negotiable for energy
facts; it has to hold for geometry too, and geometry is harder because a
drawing carries no visible confidence by default.

`AGENTS.md` already names the specific failure: *"A synthesised outline is an
inference, never `dimensioned_vector_geometry`."*

## Decision

Build the reconstruction, and make it **structurally impossible for its output
to be mistaken for evidence**. Four commitments:

1. **Grade every object.** `A-VERIFIED` / `B-OBSERVED` / `C-CALCULATED` /
   `D-INFERRED` / `X-UNRESOLVED`, carried on the model and expressed in the DXF
   itself: inferred geometry on `X-VERIFY`, contradictions on `X-CONFLICT`, and
   any dimension not backed by a measurement annotated `≈… (추정)`.

2. **A higher-confidence control constrains lower-confidence geometry, never
   the reverse.** A per-level plate is scaled to its registered area because the
   area is verified and the shape is not. An *observed* GIS outline is never
   rescaled to hit the registered area — the disagreement is recorded as a
   conflict and both values survive.

3. **The reconstruction leaves through the ordinary ingestion boundary.** The
   panel hands the upload stage a DXF string; the upload stage parses it with
   `parseDxfText`, exactly as it would an uploaded file. The twin's footprint is
   read back out of the generated file. A reconstruction that cannot survive
   the app's own importer never reaches the twin.

4. **The twin is told the truth.** Committing a reconstruction sets
   `reconstructedFootprint: true` and leaves `hasCadFootprint` and `hasCadPlan`
   false, and writes no `serviceCore` or `cadRooms` override. The footprint
   improves; the stated precision does not.

## Alternatives

**Set `hasCadFootprint: true` because a real DXF exists.** Rejected: the flag
means "a drawing of this building was ingested", and a drawing the app invented
is not that. It would raise the fidelity badge on inference.

**Hand the geometry to the twin directly and skip the round trip.** Rejected:
it is faster but removes the strongest available check that the DXF is real.
The round trip is the reason `QA-RT-*` can assert that the file a user
downloads contains the geometry the model claims.

**Let the reasoning model emit geometry.** Rejected, consistent with
`src/lib/generative/provider/types.ts`: a provider returns intent, never
coordinates. The model reads a sentence into typed claims; a deterministic
solver owns every dimension. This also keeps reconstruction reproducible and
keeps the feature working with no API key.

**Fill the plan with plausible partitions.** Rejected. There is no evidence for
room boundaries. An invented plan that looks finished is the exact failure this
ADR exists to prevent, so the tenant area is left open and the omission is
stated in the QA report.

## Consequences

Easier: a user with no drawing gets a defensible model instead of a dead end;
every line in the output can be traced to a source, a calculation or a named
assumption; conflicts between the register and GIS become visible rather than
silently resolved.

Harder: the reconstruction is more work to consume — a caller must read the
grades. The twin does not get "better" fidelity from a reconstruction, which
will look like a missed opportunity to anyone who has not read this ADR. And
every future contributor must resist the one-line change that folds
`reconstructedFootprint` into `hasCadFootprint`.

## Implementation

- `src/lib/cad-reconstruction/types.ts` — the grade vocabulary
- `src/lib/cad-reconstruction/evidence.ts` — source inventory, C1–C14 control
  network, conflict detection
- `src/lib/cad-reconstruction/reconstruct.ts` — the constraint ordering
- `src/lib/cad-reconstruction/qa.ts` — round trip through `parseDxfText`
- `src/components/upload/upload-stage.tsx` — `handleUseReconstruction`,
  `commitAndAdvance` provenance branch
- `src/store/twin-provenance-store.ts` — `reconstructedFootprint`
- `e2e/cad-reconstruction.spec.ts` — "a reconstruction is never recorded as CAD
  evidence" is a regression test, not a convention

## Related

[[ADR-002 - Provenance as a Construction-Time Invariant]] ·
[[Evidence-to-CAD Reconstruction]] · [[CAD Drawing Ingest]]
