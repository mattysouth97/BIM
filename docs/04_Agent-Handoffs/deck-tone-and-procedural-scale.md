# Deck tone, and why procedural surface detail did not render

**Written 2026-09-04 by the asset-pipeline session (cyan). Parked, not solved.**
Open task: the flat roof deck at `/building/demo` reads as an abstract grey slab
rather than the top of the building. Nothing was shipped for it — this is the
diagnosis, so tomorrow starts from evidence instead of from the amplitude knob.

## Start here: the branch is not running

**Do not raise any amplitude until this is resolved.** It is the first thing to
check and it invalidates every tuning attempt made before it.

Test performed: `useProcedural` in `architectural-material.ts` was forced to
`true` unconditionally, and `ARCH_COLOR_AFTER` was given a diagnostic
`diffuseColor.rgb *= vec3(1.0, 0.2, 0.2)` inside its `uArchProcedural > 0.5`
block. Every realistic surface should have turned red.

**Nothing turned red** — not the roof, not the facade, not the columns. So
`applyProgram`'s procedural branch is not reaching any rendered material in the
dev build. The problem is upstream of amplitude *and* upstream of family
selection. Candidates not yet eliminated:

- `createArchitecturalMaterial` taking its early `!isRealisticMode(runtime.mode)`
  return. `runtime.ts` holds a module-local snapshot updated only by
  `pushRuntime`, which is called from the store's setters — check whether
  rehydration pushes it, and what `getRenderRuntime().mode` actually is at the
  moment materials are built (it is not necessarily the persisted store value).
- Materials being memoised from a previous render and not rebuilt.
- The visible deck not being `generateRoof`'s mesh at all. `structure-generator.ts:602`
  builds it with `role: "roof"`, but the top slab (`role: "slab"`) and the
  parapet are adjacent; confirm which mesh the visible surface belongs to before
  assuming the roof material governs it.

## The scale finding — this part is solid and reusable

Surface detail authored at material-sample scale cannot render at building scale.

At the default camera a 34 m deck spans roughly 250 px, so **one pixel is about
14 cm**. Therefore:

| Feature | Real size | On screen | Verdict |
|---|---|---|---|
| Welded membrane seam (as authored) | 12 mm | 0.09 px | invisible, aliases only |
| Widened seam | 40 mm | 0.3 px | still invisible |
| Bay-scale mottle | ~3 m | ~22 px | visible — this is what carries the wide shot |

Seams, joints, aggregate and grain are **close-range** detail. They are correct
to have, and they will never fix how a facade or deck reads from the default
camera. Only metre-scale tonal variation does that.

**This caveat extends to `f8b6a09`.** The concrete, brick, metal, wood and tile
branches in `ARCH_PROCEDURAL_PARS` are authored at the same sample scale —
board-form lines, 190×75 brick courses, 1.2 m panel seams. They are almost
certainly too fine to read at building distance too. If a facade looks unchanged
under `window.__bimProceduralSurfaces(true)`, that is **this bug, not a null
result** — check the red-tint diagnostic above before concluding the toggle works.

That flag remains **off by default** and nothing about it is in production, so
there is no user-facing regression to unwind.

## The candidate change, if the branch is fixed

Reverted from the working tree rather than shipped. Replace the `else` branch
(roof membrane) in `ARCH_PROCEDURAL_PARS`:

```glsl
float bay = archFbm(uv * 0.32 + uArchSeed) - 0.5;   // ~3 m features
float ponding = archFbm(uv * 0.9 + 11.0) - 0.5;     // ~1 m stains
float seam = abs(fract(uv.x / 1.05) - 0.5);
seam = 1.0 - smoothstep(0.0, 0.038, seam * 1.05);   // 4 cm weld
tint *= 1.0 + bay * 0.20 + ponding * 0.10 + grit * 0.03;
tint *= 1.0 - seam * 0.10;
rough += bay * 0.10 + ponding * 0.05 + seam * 0.10;
```

and route roof surfaces through it regardless of the global switch:

```ts
const useProcedural = (proceduralBase || args.role === "roof") && budget.triplanar;
```

Routing the roof this way costs nothing: `roof_flat` is md5-identical to
`concrete_rough`, so the deck was sampling concrete pixels either way.

The original diagnosis (from the coordinator, measured): deck 33.8 × 23.8 m,
inset 0.124 m inside the facade, concentric, nothing overhanging. The slab read
is a **tone** problem — a flat mid-grey against a light half-metallic facade with
no scale cue at the edge — not a geometry problem. Do not change
`facade.parapetHeight` or any geometry.

## Two traps that cost hours today

**A recompiling dev server is not a measurement of the app.** A texture request
timed at 10.2 s with the "Compiling…" badge on screen; the same files from
production measured 0.4–1.4 s. A "blank viewport on cold load" finding was
raised and retracted on this basis. Measure against `bim-self.vercel.app`, or at
least against a settled dev server.

**The viewer really can render blank, but for an unrelated reason.** R3F leaves
the canvas at its `300×150` HTML default because `react-use-measure` never fires
on initial mount; the container is correctly sized and the canvas is not.
Dispatching a single `window.resize` makes it `1105×2110` and the scene appears.
Reproduced independently by two sessions. It is a race, so the same page renders
fine sometimes and blank others — and it is *not* a Suspense or texture problem
(`ArchitecturalTextureBridge` wraps itself in its own `<Suspense>`, so its
suspension cannot reach the outer boundary). Routed to the session holding the
plan-view spec.

## Related, still open

- Five landing images are byte-identical pairs under names implying different
  content (`layer-shape` = `layer-shape-plinth`, `layer-structure` =
  `layer-structure-frame`, `layer-mechanical` = `layer-mechanical-floors`,
  `layer-rendered` = `layer-rendered-brick`, `hero-promise` = `layer-all-peel`).
  Four banner transitions show the same picture twice. The distinct images do not
  exist; this is a design decision, not a deduplication.
- `pnpm check:assets` reports the full duplicate set — 3.41 MB across 20 groups,
  including eleven GLB pairs shipped under two URLs each.
