  @AGENTS.md

  ## Commands

  - `pnpm dev` — Start dev server (port 3000)
  - `pnpm build` — Production build (use to check for type errors)
  - `pnpm lint` — ESLint

  ## Architecture

  Next.js 16 App Router + React 19 + TypeScript. BIMFIT: a building-energy app whose
  PRIMARY entry is the 건축물대장 (Korean building register). Pick a real building →
  its register becomes a multi-storey baseline energy model with zero further input →
  the user refines that baseline toward a digital twin with DWG/DXF plans, hand-drawn
  floor plans and MEP/electrical data, watching the energy delta move. The generative
  engine (prompt, schematic, CAD import) is now REFINEMENT input and a secondary door,
  not the front door.

  Everything the register states is an evidence-backed fact; everything it does not
  state (U-values, window ratio, airtightness, HVAC, lighting, occupancy) is a named,
  visible, reversible assumption from the era-indexed Korean code tables. That
  distinction is a construction-time invariant, not a convention — see
  `src/lib/energy-diagnostics/ledger-baseline-model.ts`.

  Routes: `/` landing → `/diagnostics/new` (methods ledger|upload|create|sample|resume)
  → `/building/[id]` legacy twin workspace (still routable for real ledger ids).

  - `src/components/generative/` — Generative studio: prompt panel, schematic editor,
    command bar, and the mount point of the energy-diagnosis workspace
  - `src/lib/generative/` — Blueprint→spec→polygon-BIM engine (geom kernel, solver,
    compiler, CAD/SVG import adapters, design storage in IndexedDB `gen-design:*`)
  - `src/components/energy-diagnostics/` + `src/lib/energy-diagnostics/` — Source-traceable
    design-stage energy diagnosis (P0-06): drawing-set ingestion with provenance facts,
    Tier-1 screening builder, preflight validation, degree-day adapter over the real
    engine, findings, improvement scenarios, retrofit-bridge (economics), IndexedDB
    persistence — see docs/design-stage-energy-diagnostics.md
  - `src/lib/mep/` — Canonical MEP graph engine: deterministic building-services
    networks (plant→riser→main→branch→terminal), rule catalog (rules.ts cites
    docs/05_Research/MEP Design Practice Research.md), coordination + §28
    self-repair, clash/gravity/connectivity validation with regression
    thresholds. Layer generators render FROM it via `src/lib/layers/mep-render.ts`;
    visual-QA harness at `/dev/mep` — see docs/02_Features/MEP Systems.md
  - `src/lib/energy/` — Physics core: ISO-13789-style heat loss, degree-day annual
    demand, system breakdown, climate data, CO₂/grades
  - `src/lib/energy-standards/` — Verified Korean standards library: 별표1 U-value
    ceilings (제2025-738호), ZEB 등급표 (제2024-893호), ISO-6946 layer→U assembly
    physics, generic material library. Every value cites
    docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md — change values only with that ledger
  - `src/app/api/bldrgst/*` — server-side proxy routes to data.go.kr (건축물대장).
    The PRIMARY data source. `resolveDataGoKrKey` accepts the caller's own
    `x-api-key`, else falls back to `DATA_GO_KR_API_KEY` for same-origin requests
    (rate-limited per IP) so the app works without the visitor holding a key.
  - `src/lib/ledger/floor-rows.ts` — shared register helpers: `normalizeFloorRows`,
    use/height categories, and `classifyEraExplicit` (which reports whether a date
    was actually read; `classifyEra` silently returns 1990-1999 for a blank date,
    and era drives every U-value, WWR, airtightness and floor height)
  - `src/lib/energy-diagnostics/ledger-source.ts` — register → DrawingSourceInput,
    entering the SAME ingestion boundary as any drawing (source document #0)
  - `src/lib/energy-diagnostics/ledger-baseline-model.ts` — register → multi-storey
    CanonicalEnergyModel. A sibling of tier-one-model, never an extension of it
  - `src/lib/energy-diagnostics/ledger-climate.ts` — 시군구코드 → weather region
  - `src/components/viewer/` — Three.js 3D building viewer (React Three Fiber v9)
  - `src/components/viewer/building-scene.tsx` — Main R3F Canvas with renderer config, OutlinePass post-processing (`<SceneHighlightProcessing />`), lighting
  - `src/components/viewer/procedural-building-model.tsx` — R3F wrapper for ProceduralBuilding class
  - `src/lib/building-geometry.ts` — Pure functions converting API data → 3D geometry
  - `src/lib/procedural/` — Procedural building generation pipeline:
    - `types.ts` — BuildingRecipe, FacadeConfig, FloorSpec, MaterialRefs
    - `recipe.ts` — Era-based recipe factory with getRecipe(), applyOverrides()
    - `facade-generator.ts` — InstancedMesh glass/mullions/panels (4 draw calls)
    - `structure-generator.ts` — InstancedMesh slabs + columns (2 draw calls)
    - `procedural-building.ts` — ProceduralBuilding class composing all generators (7 draw calls on the rectangular InstancedMesh path: facade 4 + slabs 1 + columns 1 + roof 1; polygon-footprint towers fall back to per-face Groups and emit more)
  - `src/lib/cad/` — CAD footprint ingest (DXF parse, DWG→DXF WASM conversion, PDF tracing) — see `src/lib/cad/README.md`
  - `src/lib/cad/doc/` — CadDocument model: full DXF entity mapping, tessellation, snap, viewport math, footprint conversion (pure modules, meters/DXF-XY/radians)
  - `src/lib/cad-reconstruction/` — Evidence→CAD reconstruction for buildings with
    NO drawing: 건축물대장 + VWorld GIS outline + era tables + the user's prompt
    statement → graded canonical geometry (A-VERIFIED…X-UNRESOLVED) → AC1015 DXF,
    evidence register, assumption ledger, conflict register, QA (incl. a round trip
    through the app's own `parseDxfText`). A reconstruction is NEVER recorded as CAD
    evidence — see docs/01_Architecture/ADR/ADR-003. Prompt module lives in
    `src/components/upload/cad-request-panel.tsx`
  - `src/components/cad-viewer/` — In-browser DWG/DXF viewer + 2D drafting: ortho R3F scene + SVG markup overlay driven by one ViewState; layer toggles, measure, note/leader/cloud markups (idb-keyval), draw tools (line/polyline/rect/circle, grid/ortho snap, undo/redo via `cad-draft-store`), use-as-footprint
  - `src/lib/retrofit/` — Retrofit measures + DCF economic model (NPV/IRR, knapsack, 그린리모델링 presets)
  - `src/store/scenario-store.ts` — Shared CAPEX/ROI scenario state (budget, program track, building inputs)
  - `src/lib/pbr-materials.ts` — PBR texture mapping per structure type + era
  - `src/lib/korean-building-codes.ts` — Structure codes, use type codes, wall layer data
  - `src/lib/api-proxy.ts` — Server-side fetch to data.go.kr, returns `{data, error}`
  - `src/lib/api-client.ts` — Client-side fetch wrapper, reads API key from Zustand store
  - `src/data/bjdong-codes.json` — 20K+ 법정동 codes (sourced from github.com/FinanceData gist)
  - `src/data/region-codes.json` — 시도/시군구 hierarchy (250 districts)
  - `src/store/app-store.ts` — Zustand persist store (API key, language)
  - `src/store/material-store.ts` — Zustand store for material property overrides

  ## 3D Renderer Settings

  **Read this section as two arms, not one.** `building-scene.tsx:617` branches on
  `realisticViewport`, and `render-store.ts:29` defaults `mode` to `"realistic"` — so
  the **realistic arm is what runs by default**, and the BIM arm is the `else`. Until
  2026-09-04 the lines below described only the BIM arm while reading as if they were
  the whole renderer; every line was true, of the branch nobody hits by default.

  Applies to BOTH arms:

  - Shadows: VSMShadowMap (soft variance shadows) — set on the Canvas itself
    (`building-scene.tsx:613`), so it is not branch-specific
  - Materials: MeshStandardMaterial for all components
  - Post-processing: OutlinePass via `<SceneHighlightProcessing />` (scene-highlight-processing.tsx) — dual OutlinePass (orange hover, teal selection) plus GTAO/SMAA in realistic modes. (Two never-mounted components, SAOPass and `<ScenePostProcessing />`/outline-post-processing.tsx, were removed in P2-08 and 2026-09-04 respectively.)

  Realistic arm (`mode !== "bim"`, the default) — `<ArchitecturalEnvironment />`:

  - Background: **none** — `scene.background = null` plus `THREE.FogExp2(sun.fogColor,
    sun.fogDensity)` (`architectural-environment.tsx:61-62`)
  - Lighting: Preetham sky (`three/examples/jsm/objects/Sky.js`) with sun-driven
    turbidity/rayleigh/mie and a sun direction from `evaluateSun(timeOfDay, weather)`
  - Tone mapping: `ACESFilmicToneMapping` with sun-driven `toneMappingExposure`
    (`architectural-environment.tsx:64-65`). The BIM arm sets neither
  - Environment: built procedurally from that sky, not from an HDR file —
    `envFromSky` is `true` in all five quality tiers in `quality-tiers.ts`

  BIM arm (`mode === "bim"`, the `else` at `building-scene.tsx:626`):

  - Background: solid #f5f5f5 (`SceneSetup`, `building-scene.tsx:98`)
  - Lighting: HemisphereLight("#b1e1ff", "#b97a20", 0.6) at :631 + DirectionalLight(white, 2.0) at :637
  - HDR: studio.hdr at `/hdr/studio.hdr` for reflections only
  - `effectiveBudget(mode, tier)` (`quality-tiers.ts:82-96`) overrides the tier here,
    forcing `envFromSky: false`, `triplanar: false`, `weathering: false`,
    `stochastic: false`, `gtao/smaa/contactShadows/vegetation: false`. **The switch is
    mode, not tier** — every tier is otherwise identical on these flags
  - Era boundary: drives era-based recipe materials for the building AND the ground texture set (pre-2000 weathered vs 2000+ clean)
  - PBR textures: 7 sets in `public/textures/` (concrete_rough, concrete_clean, brick, metal_panel, wood, roof_tile, roof_flat), 18 MB total. TWO independent consumers — an earlier note here claimed only the first, which was drift (corrected 2026-09-04):
    1. The ground plane, via `TexturedGround` → `useTexturedMaterial` → `pbr-materials.ts`, which builds `/textures/<set>/{color,normal,roughness}.jpg` URLs directly. Its only call site is `ground-plane.tsx:65`, hardcoded to `"ground"`.
    2. **The building itself, on by default.** `render-store.ts` defaults `mode` to `"realistic"`, so `realisticViewport` is true and `building-scene.tsx:617-619` mounts `<ArchitecturalTextureBridge />`, which `useTexture()`s all 21 URLs via `rendering/texture-atlas.ts`; `rendering/architectural-material.ts:45-53` then binds `texSet.color` → `mat.map` and `texSet.roughness` → `mat.roughnessMap`. This is separate from the recipe-driven MeshStandardMaterial colour/roughness the procedural generators emit — the atlas overrides those maps in realistic mode.
  - The atlas's `normal` field is populated but never read: `architectural-material.ts` skips `normalMap` under triplanar, and `triplanar` is `true` in every quality tier — the only thing that sets it `false` is BIM mode, where the atlas is not mounted at all. So wherever the atlas is live, the normal maps are dead. Only the BIM-mode ground reads normal maps, and it does so outside the atlas.

  ## API Gotchas (건축HUB)

  - Base URL: `https://apis.data.go.kr/1613000/BldRgstHubService` (NOT BldRgstService_v2)
  - `bjdongCd` is REQUIRED — omitting it returns empty body, not an error
  - `mainPurpsCd` filter param is IGNORED by the API — filter client-side after fetch
  - API key passed via `x-api-key` header to our proxy, proxy forwards as `serviceKey` query param
  - 전라북도 uses NEW codes (52xxx) not old (45xxx) — already mapped in region-codes.json
  - Zero values (platArea=0, heit=0, bcRat=0) mean data unavailable, display as "-"
  - `fetchFromDataGoKr()` returns `{data, error}` — always destructure before passing to extractItems

  ## Known Issues

  - Zustand persist + SSR hydration mismatch — use `useHydration()` hook before reading store in render
  - Zod v4 `zodResolver` has type inference issues — use plain TS interfaces for form values
  - Three.js `three-stdlib` types conflict with drei v10 OrbitControls — use `any` ref type
  - Duplicate floor keys from API — floors can have same flrNo, use array index in React key
  - InstancedMesh `setMatrixAt` must be followed by `instanceMatrix.needsUpdate = true`
  - Post-processing uses OutlinePass from three/examples/jsm/postprocessing (not @react-three/postprocessing); see scene-highlight-processing.tsx
  - useTexturedMaterial must always return roughness value — Three.js defaults to 1.0 when roughnessMap present but roughness prop omitted

  ## Tracked Work Plan

  All remediation/feature work lives in `docs/work-plan/` (23 items, P0→P2, from the 2026-07-21 review).
  Before executing any work item, follow `docs/work-plan/AI_PROCESS.md` (RE → SDD → CDD → EDD loop);
  item specs are in `docs/work-plan/items/`, domain knowledge in `docs/work-plan/knowledge/`,
  status dashboard in `docs/work-plan/README.md`. Update item frontmatter + dashboard changelog when done.
