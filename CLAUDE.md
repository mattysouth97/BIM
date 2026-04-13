  @AGENTS.md

  ## Commands

  - `pnpm dev` — Start dev server (port 3000)
  - `pnpm build` — Production build (use to check for type errors)
  - `pnpm lint` — ESLint

  ## Architecture

  Next.js 16 App Router + React 19 + TypeScript. Korean Building Ledger (건축물대장) query app with 3D viewer.

  - `src/app/api/bldrgst/*` — Server-side proxy routes to data.go.kr (solves CORS)
  - `src/components/viewer/` — Three.js 3D building viewer (React Three Fiber v9)
  - `src/components/viewer/building-scene.tsx` — Main R3F Canvas with renderer config, SAOPass, lighting
  - `src/components/viewer/procedural-building-model.tsx` — R3F wrapper for ProceduralBuilding class
  - `src/lib/building-geometry.ts` — Pure functions converting API data → 3D geometry
  - `src/lib/procedural/` — Procedural building generation pipeline:
    - `types.ts` — BuildingRecipe, FacadeConfig, FloorSpec, MaterialRefs
    - `recipe.ts` — Era-based recipe factory with getRecipe(), applyOverrides()
    - `facade-generator.ts` — InstancedMesh glass/mullions/panels (4 draw calls)
    - `structure-generator.ts` — InstancedMesh slabs + columns (2 draw calls)
    - `procedural-building.ts` — ProceduralBuilding class composing all generators (7 draw calls total)
  - `src/lib/pbr-materials.ts` — PBR texture mapping per structure type + era
  - `src/lib/korean-building-codes.ts` — Structure codes, use type codes, wall layer data
  - `src/lib/api-proxy.ts` — Server-side fetch to data.go.kr, returns `{data, error}`
  - `src/lib/api-client.ts` — Client-side fetch wrapper, reads API key from Zustand store
  - `src/data/bjdong-codes.json` — 20K+ 법정동 codes (sourced from github.com/FinanceData gist)
  - `src/data/region-codes.json` — 시도/시군구 hierarchy (250 districts)
  - `src/store/app-store.ts` — Zustand persist store (API key, language)
  - `src/store/material-store.ts` — Zustand store for material property overrides

  ## 3D Renderer Settings

  - Shadows: VSMShadowMap (soft variance shadows)
  - Background: solid #f5f5f5 (no HDR background)
  - Lighting: HemisphereLight("#b1e1ff", "#b97a20", 0.6) + DirectionalLight(white, 2.0)
  - Post-processing: SAOPass (from three/examples/jsm/postprocessing)
  - Materials: MeshStandardMaterial for all components
  - HDR: studio.hdr at `/hdr/studio.hdr` for reflections only
  - Era boundary: pre-2000 = weathered textures, 2000+ = clean textures
  - PBR textures: 7 sets in `public/textures/` (concrete_rough, concrete_clean, brick, metal_panel, wood, roof_tile, roof_flat)

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
  - SAOPass not in @react-three/postprocessing — import from three/examples/jsm/postprocessing/SAOPass.js
  - useTexturedMaterial must always return roughness value — Three.js defaults to 1.0 when roughnessMap present but roughness prop omitted
