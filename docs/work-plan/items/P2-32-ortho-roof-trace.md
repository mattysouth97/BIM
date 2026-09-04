---
id: P2-32
title: Trace the roof from ortho imagery as a fourth outline candidate
priority: P2
area: geometry
status: todo
owner: unassigned
effort: L
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-05, UC-12]
---

# P2-32 — The photo is on screen; nothing reads it yet

On 2026-09-04 the reconstruction gained a fourth evidence source: aerial
imagery. It shipped in the **weak** form, deliberately.

`/api/imagery/ortho` proxies VWorld's WMTS and `ReconstructionPreview` draws the
tiles under the plan (`0ba9c38`), so a person can see the reconstructed outline
sitting on the real roof and judge it. The toggle says 치수 근거 아님. **No value
in the model derives from the imagery and it produces no outline candidate.**

That boundary was the point. An image a human eyeballs cannot quietly become a
source something else cites; a traced roof is a different thing entirely,
because it would compete with VWorld and OSM inside `reconcileOutlines` and
would have to earn a grade.

This item is that second thing, and it was left undecided rather than guessed.

## The question the user has not answered

Asked on 2026-09-04, they chose "overlay for visual checking" over "full raster
trace", with "both — overlay first, then trace" as the third option. The overlay
is shipped. Whether the trace is wanted at all is **open**, and it should be
asked again before anyone writes a contour extractor.

The honest case against building it: OSM and VWorld already give two independent
observed outlines, `reconcileOutlines` already compares them, and the failure
mode a trace would fix — both map sources absent or both wrong — is now partly
covered by the plausibility gate (`e3e1534`) falling back to an honest solved
rectangle. A trace earns its cost only where map coverage is genuinely missing.

## 1. Requirement (RE)

- A roof outline extracted from ortho imagery becomes an `OutlineCandidate` with
  `origin: "ortho_trace"`, entering `reconcileOutlines` alongside VWorld and OSM.
- It is **observed**, but it is the *least* authoritative observation: a trace of
  a photo, made by us, with no external party standing behind it. Below OSM
  (authority 4), so authority 5, and it must never outrank a government or
  crowd-sourced ring that agrees with 건축면적.
- A trace that cannot be validated — low contrast, tree cover, shadow, snow,
  a roof the same tone as its surroundings — must produce **nothing**, not a
  low-confidence polygon. This is the same rule `regularizeRing` follows: return
  no answer rather than a wrong one.

## 2. Specification (SDD)

Where it plugs in is already built and does not need changing:

- `outline-candidates.ts` — add `"ortho_trace"` to `OutlineOrigin` and
  `ORIGIN_PRIORITY`. Everything else (plausibility gate, IoU agreement,
  conflicts with geometry attached) works unmodified.
- `ortho-tiles.ts` — tile selection and georeferencing already exist and are
  tested; the trace consumes the same tiles the overlay draws.
- `evidence.ts` — one more `SourceRecord`, `sourceType: "ortho_trace"`.

What does not exist: the extractor. Sketch, not a decision —

1. Fetch the tiles covering the plan at the deepest available zoom.
2. Composite to a canvas in the model's own mm frame (the overlay already
   computes that placement).
3. Segment roof from ground. Simple thresholding will not survive a Korean
   dense-urban block; expect to need edge detection plus a region grow seeded
   from the register's 건축면적 centroid.
4. Contour → polygon → `simplifyRing` → `regularizeRing`, both of which exist.
5. **Validate before returning**: area within the plausibility band of 건축면적,
   no self-intersection, vertex count sane. Fail closed.

## 3. Constraints (CDD)

- May touch: `outline-candidates.ts`, `evidence.ts`, a new `ortho-trace.ts`,
  a new route if the trace runs server-side.
- Must not touch: the overlay's scoping. The overlay stays a verification aid
  even after a trace exists — they are different features with different grades,
  and collapsing them would put an unlabelled inference on screen.
- ADR-003 applies with full force: a trace is a reconstruction, never CAD
  evidence, and never `dimensioned_vector_geometry`.

## 4. Evaluation (EDD)

- Red-first, and the *negative* cases are the important ones: a tree-covered
  roof, a flat roof on flat ground, a snow-covered roof, an image that fails to
  load. Each must yield no candidate.
- A fixture set of real Korean buildings with known 건축면적, scored on how often
  the trace lands inside the plausibility band — and on how often it returns
  nothing when it should.
- The gate is not "does it usually work". It is **"when it is wrong, does it
  say nothing"**, because a wrong observed ring outranks an honest inferred
  rectangle right up until the plausibility gate catches it, and the gate only
  catches gross errors.

## Prior art in this repo, worth reading first

- `src/lib/cad/pdf-to-polygon.ts` — raster → polygon already exists for traced
  PDFs. It may be reusable, and its failure modes are already known.
- `outline-regularize.ts` — squaring and its three refusal guards.
- The 2026-09-04 lesson recorded in the feature doc: **every outline source this
  app has tried has, at least once, handed back something that isn't the
  building.** A trace will too. Design for that from the start.
