# Reference material details — integration handoff

The user requested material texture detail that explains the relation to energy
efficiency. This lane adds `ReferenceMaterialDetails({ manifest, isKo })` for the
existing model sidebar. The root session owns replacing the old Construction
section and validating the complete model route; this worktree has not mounted
the new section on production routes.

## What is delivered

- An expandable construction card with a textured strip proportional to the
  model's layer thicknesses, in source order. It does not claim exterior-to-interior
  direction. Each visible strip says that its materials are illustrative.
- Selectable source material swatches, full IFC layer names, IFC thickness refs,
  and stated thickness. A separate panel identifies the generic thermal property
  used, its mapping assumption, lambda or fixed cavity R, and the layer's share of
  total resistance **including Rsi and Rse**. Incomplete assemblies have no share
  or partial U.
- All five buildings have material details. KIT and FZK's material-only layer
  sets are shown without classifying them as envelope assemblies. Their standalone
  U calculations remain explicitly separate from ground coupling or source-stated
  values used by the energy baseline. No energy constants or calculations changed.
- Appearance resolves exact source names, independently of thermal surrogate IDs.
  Calcium-silicate masonry does not become clay brick, metal studs do not vanish
  into an air-R approximation, and unidentified `Solid` stays unidentified.
- Existing bundled textures are reused for concrete, brick, wood and metal;
  simple patterns illustrate insulation, framing, air, board and unknown material.
  No texture is described as a measured appearance or applied to a merged GLB.

`scripts/lib/ifc-glb.mjs` currently groups fabric by wall/slab/glazing/etc. A bucket
does not retain enough surface material identity to map its outer finish. The
separate architectural-detail extraction lane owns any further source metadata.

## Claim audit

Rendering mapping notes exposed stale hardcoded comparisons. Current runtime
gave Clinic wall U 0.4003 against the note's 0.404; FZK wall U 0.4931 against
0.489; Schependomlaan roof insulation share 93.7% including surfaces against 96%;
its EPS edge concrete share 1.8% against 5%; and Duplex block share 8.2% against
12%. Removed the fragile derived comparisons from mapping prose; the UI now
derives the displayed percentage from the current assembly result. Material
identities, conductivity assumptions and their limitations are preserved.

## Verification

- 157 relevant unit/component tests passed across six files, including 18 new
  source/appearance/resistance/UI tests. The final lambda display uses four decimal
  places, so the shown thickness and lambda reproduce the shown R.
- TypeScript no-emit passed, targeted ESLint passed.
- A temporary isolated preview route rendered all five buildings. Chromium smoke
  passed on a 414 px viewport, including layer selection, texture visibility,
  resistance detail and no horizontal overflow. The fresh pass collected zero
  browser console errors and page errors. Preview route and smoke file were
  removed; the complete model route remains the root integration check.
- Screenshots inspected at `%TEMP%/bimfit-material-insulation.png` and
  `%TEMP%/bimfit-material-fzk.png`. They show the component before final copy and
  lambda precision refinements.

The first browser pass exposed a pre-hydration click mismatch with native
`details`; the delivered accessible button accordion avoids it. Temporary
webpack server on port 3103 was stopped. After removing the preview route, its
stale generated Next type file was renamed `page.ts.stale` inside ignored
`.next/dev/types`, and the regular project type check passed.
