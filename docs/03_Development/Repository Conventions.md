---
type: reference
status: implemented
last_verified: 2026-08-27
---

# Repository Conventions

The rules that are actually enforced, plus the traps that have each cost a debugging session and are
now guarded by a comment or a test.

Related: [[Build and Run]] · [[Development Workflow]] · [[Testing Strategy]] · [[Integration Rules]]

## Rule zero — this is not the Next.js you know

[AGENTS.md](../../AGENTS.md), four lines, imported into [CLAUDE.md](../../CLAUDE.md) as `@AGENTS.md`:
read the relevant guide in `node_modules/next/dist/docs/` **before** writing Next-specific code, and
heed deprecation notices. Nothing enforces this. App Router APIs, config keys and file conventions in
`next@16.2.10` differ from most training data — `allowedDevOrigins`, `serverExternalPackages` and
`outputFileTracingIncludes` in [next.config.ts](../../next.config.ts) are all examples.

## Naming and layout

- kebab-case directories and file names; camelCase functions; `use`-prefixed hooks;
  `handle`-prefixed event handlers; `UPPER_SNAKE_CASE` exported constants.
- Tests live in a sibling `__tests__/` folder next to the module (`*.test.ts` / `*.test.tsx`).
- Path alias `@/*` → `src/*` ([tsconfig.json](../../tsconfig.json), mirrored in
  [vitest.config.ts](../../vitest.config.ts)).
- Intended layering: `components → hooks → store → lib`, with `lib` pure. It mostly holds — there
  are nine deliberate `lib → store` imports (api clients, `i18n`, the generative→twin handoff
  modules); adding a tenth needs a reason.

## TypeScript

`strict: true`, plus **both** `noUnusedLocals` and `noUnusedParameters` (turned on by work item
P2-08 with a repo-wide clean `tsc`). `tsc --noEmit` also covers `e2e/*.spec.ts`,
`vitest.config.ts` and `playwright.config.ts`.

The escape hatch is the underscore prefix: `_name` marks an intentionally unused binding, which both
`tsc` and the ESLint rule below exempt.

## ESLint rules that actually bite

[eslint.config.mjs](../../eslint.config.mjs) is flat config over
`eslint-config-next/core-web-vitals` + `/typescript`, with one override:
`@typescript-eslint/no-unused-vars` set to `warn` with every ignore pattern set to `^_`.

`globalIgnores` is re-declared (it overrides the Next defaults) and covers build output, `coverage`,
`playwright-report`, `test-results`, **`qa-evidence`**, `.claude/worktrees/**` and **`public/**`**
(vendored emscripten WASM glue is deliberately not linted).

React 19's compiler-era hook rules are the ones that fire in this codebase. Real suppressions, each
next to a comment explaining why:

| Rule | Where it legitimately fires |
|---|---|
| `react-hooks/set-state-in-effect` | [use-hydration.ts:13](../../src/hooks/use-hydration.ts), [procedural-building-model.tsx:195](../../src/components/viewer/procedural-building-model.tsx) |
| `react-hooks/immutability` | Three.js object mutation inside R3F — [building-scene.tsx:87,100](../../src/components/viewer/building-scene.tsx) |
| `react-hooks/refs` | imperative Three.js group handling — [building-layers.tsx:408](../../src/components/viewer/building-layers.tsx) |
| `react-hooks/exhaustive-deps` | expensive scene rebuilds keyed on a narrower dep set — loaders, post-processing, `use-energy-delta.ts` |

Suppress with a one-line disable **and** a reason. A blanket `// eslint-disable-next-line` with no
rule name (as at `equipment-hover-card.tsx:132`) is not the convention.

## Known traps

Each of these is a real, repeat-offender failure mode. Most carry a guard comment or a regression
test in the file named.

### Zustand persist + SSR hydration mismatch

Reading a persisted store during the first render produces a hydration mismatch. Guard with
[`useHydration()`](../../src/hooks/use-hydration.ts) and render a skeleton until it is `true`.
Nine modules do this, including `workspace-shell.tsx`, `workflow-stepper.tsx` and `ledger-lookup.tsx`.

Every persisted store must also declare `version` + `migrate` (fitness function AFF-3);
[persist-migrate.ts](../../src/store/persist-migrate.ts) provides the shared `versionedMigrate`.

### three-stdlib vs drei OrbitControls typing

The `three-stdlib` types conflict with drei v10's. The convention is an explicit
`useRef<any>(null)` with an `@typescript-eslint/no-explicit-any` disable —
[scene-controls.tsx:98](../../src/components/viewer/scene-controls.tsx).

### InstancedMesh needs an explicit flush

After any `setMatrixAt`, set `instanceMatrix.needsUpdate = true`. Ten-plus call sites across
[src/lib/layers/](../../src/lib/layers/) and the viewer. Omitting it renders the previous frame's
transforms with no error.

### useTexturedMaterial must always return a roughness value

Three.js defaults `roughness` to 1.0 when a `roughnessMap` is present but the prop is omitted, which
flattens the surface. [use-textured-material.ts](../../src/hooks/use-textured-material.ts) always
returns one; its four consumers rely on that.

### Duplicate floor keys from the register

층별개요 rows can repeat `flrNo`. Use the array index in the React key, never `flrNo` alone.

### Disposal and cloning of shared GLB assets

Layer generators and `ProceduralBuilding` dispose **geometry and materials** on every regeneration,
so [equipment-assets.ts](../../src/lib/equipment-assets.ts) hands out deep clones from its preload
cache. Never hand a cached asset out directly.

### Selection state must stay plain JSON

`SelectedEquipmentInfo` in [selection-store.ts](../../src/store/selection-store.ts) must not contain
any `THREE.Object3D`, `Vector3` or other `THREE.*` instance — storing them leaks GPU memory when the
MEP group rebuilds.

### Era classification silently defaults

`classifyEra` returns `"1990-1999"` for a blank or short date. Any source-traceable path must use
`classifyEraExplicit` ([src/lib/ledger/floor-rows.ts](../../src/lib/ledger/floor-rows.ts)). The older
simplified path still imports the unsafe one via
[material-inference.ts](../../src/lib/material-inference.ts) — do not copy that import into new code.

### Stale gotcha: zodResolver

[CLAUDE.md](../../CLAUDE.md) still lists a Zod v4 `zodResolver` type-inference issue.
`grep -rn zodResolver src` returns **zero matches** as of 2026-08-27 — `@hookform/resolvers` is
still a dependency but the resolver is unused, and `react-hook-form` appears in only two search
forms. Ignore the entry; drop it from CLAUDE.md next time that file is edited.

## Honesty conventions (the product's credibility, not style)

These are enforced by code and tests, not by review:

- `createEnergyFact` **throws** unless a non-missing fact carries `sourceRefs`, an `assumptionId`, or
  `extractionMethod === "user_input"` — [facts.ts](../../src/lib/energy-diagnostics/facts.ts).
  Provenance is a construction-time invariant, not a convention. See
  [[ADR-002 - Provenance as a Construction-Time Invariant]].
- Unavailable data renders an explicit state, never a fabricated value (AFF-6). Register zeros
  (`platArea=0`, `heit=0`, `bcRat=0`) mean *unavailable* and display as `-`.
- A documented zero must emit **no fact at all**.
- Savings math stays in pure functions under [src/lib/retrofit/](../../src/lib/retrofit/); components
  only format (AFF-4).
- No `'use client'` anywhere in `src/lib/**` (AFF-1).
- API routes validate input with zod and never echo secrets or `process.env` values in errors (AFF-2);
  any server filesystem join is containment-checked (AFF-7).

The full list is in [work-plan/AI_PROCESS.md](../work-plan/AI_PROCESS.md); the assumption/approximation
vocabulary is in [docs/assumption-catalog.md](../assumption-catalog.md), which is named from a source
comment in `tier-one-model.ts` — do not move it.

## Paths that must not move

`AGENTS.md` (imported by CLAUDE.md), `CLAUDE.md`, `QA-Checklist.md` at the repo root (written and
overwritten by `.grok/workflows/twin-stage-qa.rhai`),
[docs/samples/sample-footprint.dxf](../samples/sample-footprint.dxf) (asserted by
[dxf-parser.test.ts](../../src/lib/cad/__tests__/dxf-parser.test.ts) — moving it fails the unit
suite), [docs/assumption-catalog.md](../assumption-catalog.md),
[docs/design-stage-energy-diagnostics.md](../design-stage-energy-diagnostics.md), and the pinned
folders `docs/work-plan/`, `docs/superpowers/`, `docs/plans/`.
