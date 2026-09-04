"use client";

import { useState, useRef, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { useEnvironment } from "@react-three/drei";
import type { BrTitleInfo, BrFloorInfo } from "@/lib/types";
import { generateBuildingGeometry, toRecipe, type FloorGeometry } from "@/lib/building-geometry";
import { inferMaterialProperties } from "@/lib/material-inference";
import { saveModel, loadModel } from "@/lib/model-storage";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useScenarioStore } from "@/store/scenario-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useLayerStore } from "@/store/layer-store";
import { useReviewHighlightStore } from "@/store/review-highlight-store";
import { deriveVisualState } from "@/lib/retrofit/measure-visuals";
import { classifyElement, ifcDisplayLine } from "@/lib/bim/ifc-classification";
import { SolarPanels } from "./solar-panels";
import { RetrofitHvacUnits } from "./retrofit-hvac-units";
import { ContextMassing } from "./context-massing";
import { applyOverrides } from "@/lib/procedural/recipe";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BimModelSnapshot } from "@/lib/bim/model/types";
import { workspaceBuildingPk } from "@/lib/generative/design-storage";
import { floorNoFromPlanLevelId } from "@/lib/interior/visible-floors";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useLedgerReconstruction } from "@/hooks/use-ledger-reconstruction";
import { useBuildingZoning } from "@/hooks/use-building-zoning";
import { useBuildingParcel } from "@/hooks/use-building-parcel";
import {
  applyLevelPlates,
  provenancePatchForModel,
} from "@/lib/cad-reconstruction/ledger-bridge";
import { useBimModelStore } from "@/store/bim-model-store";
import { Loader2 } from "lucide-react";
import { createSceneProjection } from "@/lib/gis/gis-transform";
import { useT } from "@/lib/i18n";
import { formatArea } from "@/lib/constants";
import type { CampusData } from "@/lib/campus/campus-types";
import { computeSiteLayout } from "@/lib/campus/site-layout";
import { getCampusBuildingConfigs } from "@/lib/campus/campus-scene";
import type { FootprintOutline } from "./ground-plane";
import { GroundPlane } from "./ground-plane";
import { SiteContext } from "./site-context";
import { useTwinProvenanceStore } from "@/store/twin-provenance-store";
import { DEMO_BUILDING_PK } from "@/lib/constants";
import { ProceduralBuildingModel } from "./procedural-building-model";
import { BuildingLayers } from "./building-layers";
import { InteriorLayer } from "./interior-layer";
import { EnvelopeLayer } from "./envelope-layer";
import type { EnvelopeAnalysis } from "./envelope-layer";
import { StructureLayer } from "./structure-layer";
import { EnergyZoneLayer } from "./energy-zone-layer";
import type { EnergyZone } from "@/lib/layers/analysis/zone-overlay";
import { AnalysisLegend } from "./analysis-legend";
import { SceneControls, type SceneControlsRef } from "./scene-controls";
import { DiagnosticSelectionLayer } from "./diagnostic-selection-layer";
import type { DiagnosticSpatialTarget } from "./diagnostic-selection-types";
import { useViewStore } from "@/lib/bim/views/view-store";
import { ContextualToolbar } from "@/components/workspace/contextual-toolbar";
import { LayerPanel } from "./layer-panel";
import { ModelUploader } from "./model-uploader";
import { ErrorBoundary, ViewerErrorBoundary } from "@/components/error-boundary";
import { StructuralTooltip } from "./structural-tooltip";
import { EquipmentClickHandler } from "./equipment-click-handler";
import { EquipmentHoverCard } from "./equipment-hover-card";
import { EquipmentInteractionHandler } from "./equipment-interaction-handler";
import { AuthoringFamilyLayer } from "./authoring-family-layer";
import { SceneHighlightProcessing } from "./scene-highlight-processing";
import { ConfigPanel } from "./config-panel";
import { ArchitecturalEnvironment } from "./architectural-environment";
import { ArchitecturalTextureBridge } from "./architectural-texture-bridge";
import { RenderModeOverlay } from "./render-mode-overlay";
import { useRenderStore } from "@/store/render-store";
import { isRealisticMode } from "@/lib/rendering/runtime";
import { TwinStageOverlay } from "@/components/twin/twin-stage-overlay";
import type { FootprintGeometry } from "@/lib/portfolio/types";

const IFCModel = lazy(() =>
  import("./ifc-loader").then((m) => ({ default: m.IFCModel }))
);
const GLTFModel = lazy(() =>
  import("./gltf-loader").then((m) => ({ default: m.GLTFModel }))
);

type ModelSource = "parametric" | "uploaded";

/**
 * Neutral HDR environment for image-based lighting (reflections only).
 * Background is set to solid color, not HDR.
 */
function SceneSetup() {
  const { scene, gl } = useThree();

  // Solid neutral background for BIM visualization
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    scene.background = new THREE.Color(0xf5f5f5);
  }, [scene]);

  // Load HDR for environment reflections only (not background)
  const envMap = useEnvironment({ files: "/hdr/studio.hdr" });

  useEffect(() => {
    if (!envMap) return;
    // PMREMGenerator pre-filters the equirectangular HDR into a mip-mapped
    // environment map used for image-based reflections (WebGL pipeline).
    const pmrem = new THREE.PMREMGenerator(gl);
    const processed = pmrem.fromEquirectangular(envMap);
    // eslint-disable-next-line react-hooks/immutability
    scene.environment = processed.texture;
    // Do NOT set scene.background to envMap — keep solid color
    pmrem.dispose();
  }, [envMap, scene, gl]);

  return null;
}

// P2-08: the legacy SAOPass post-processing component was defined here but never
// mounted — the live pipeline is OutlinePass-based via <SceneHighlightProcessing />
// (scene-highlight-processing.tsx). Removed along with its dead SAOPass/EffectComposer
// imports.

// ─── Campus rendering ────────────────────────────────────────────────────────

interface CampusSceneContentProps {
  campusData: CampusData;
  onBuildingSelect?: (buildingPk: string | null) => void;
  activeBuildingPk?: string | null;
}

/**
 * Renders all campus buildings on a shared ground plane.
 * Each building is independently clickable.
 */
function CampusSceneContent({ campusData, onBuildingSelect, activeBuildingPk }: CampusSceneContentProps) {
  const siteLayout = useMemo(() => computeSiteLayout(campusData), [campusData]);
  const buildingConfigs = useMemo(() => getCampusBuildingConfigs(siteLayout), [siteLayout]);

  // Collect footprint outlines for ground-plane markings
  const footprintOutlines = useMemo<FootprintOutline[]>(() => {
    return buildingConfigs
      .filter((c) => c.footprintVertices && c.footprintVertices.length >= 3)
      .map((c) => ({
        vertices: c.footprintVertices!,
        offsetX: 0,
        offsetZ: 0,
      }));
  }, [buildingConfigs]);

  const handleBuildingClick = useCallback((pk: string) => {
    if (onBuildingSelect) {
      onBuildingSelect(activeBuildingPk === pk ? null : pk);
    }
  }, [onBuildingSelect, activeBuildingPk]);

  return (
    <>
      {/* Shared campus ground plane */}
      <GroundPlane
        siteWidth={siteLayout.extents.width}
        siteDepth={siteLayout.extents.depth}
        campusExtents={siteLayout.extents}
        footprintOutlines={footprintOutlines}
      />

      {/* One building per config, positioned at its campus coordinate */}
      {buildingConfigs.map((config) => (
        <group
          key={config.key}
          position={[config.worldPosition.x, config.worldPosition.y, config.worldPosition.z]}
          onClick={() => handleBuildingClick(config.key)}
        >
          <ProceduralBuildingModel
            geometry={config.geometry}
            recipeOverride={config.recipe}
            hideGroundPlane
          />
        </group>
      ))}
    </>
  );
}

// ─── Single-building scene ────────────────────────────────────────────────────

interface FootprintResult {
  polygon: number[][][] | null;
  /** Which VWorld layer produced the polygon (P2-25): building outline or parcel fallback. */
  source?: "building" | "parcel" | null;
  /** Measured attributes from GIS건물통합정보 — null per field when unavailable. */
  attributes?: {
    height: number | null;
    groundFloors: number | null;
    undergroundFloors: number | null;
  } | null;
  error: string | null;
}

interface BuildingSceneProps {
  title: BrTitleInfo;
  floors: BrFloorInfo[];
  /** When provided, renders all campus buildings instead of a single building */
  campusData?: CampusData;
  /**
   * Pre-fetched footprint data from the page level (hoisted out of BuildingScene
   * so both ledger and footprint fetches start simultaneously at page mount).
   * When provided, BuildingScene uses this instead of fetching internally.
   */
  footprintData?: FootprintResult;
  /**
   * When true, shows a loading overlay covering the Canvas.
   * Set to true while either ledger or footprint data is still in flight.
   * Overlay disappears automatically when this becomes false.
   */
  isCompositeLoading?: boolean;
  /**
   * A recipe that REPLACES the one derived from `title`/`floors`.
   *
   * The ledger and CAD paths never pass this: their building IS the ledger
   * row, so deriving the recipe from it is right. A GENERATED building has
   * no ledger row — its footprint polygon, storey stack and facade were
   * solved by the engine, and the synthetic title carries only totals, so
   * deriving from it would show a box that merely has the right area. The
   * reserved demo office also passes its spec-compiled recipe so the 외피
   * (walls, floors, roof) sits on the same 34 × 24 m plate as the schematic
   * BIM, not the ledger area-estimate box. This is the same prop
   * `ProceduralBuildingModel` already takes, and the studio viewport already
   * uses.
   *
   * Config-panel overrides still apply on top, exactly as they do to a derived
   * recipe — an override edits whichever recipe is in play.
   */
  recipeOverride?: BuildingRecipe;
  /**
   * Store key. Required when `title.mgmBldrgstPk` is empty (generated designs
   * carry an empty ledger pk on purpose). Falls back to the active-building
   * store, then to the title pk.
   */
  buildingPk?: string;
  /**
   * Solved BIM snapshot. The workspace also hydrates `bim-model-store`; this
   * prop lets the interior layer paint on the first frame without waiting.
   */
  snapshot?: BimModelSnapshot | null;
  /**
   * Embedded canonical-energy workspace mode. It keeps the existing scene and
   * analysis layers, but hides controls that edit only the legacy store and
   * would otherwise diverge from the source-traceable scenario model.
   */
  diagnosticsMode?: boolean;
  /** Stable canonical zone selection emitted by the existing 3D zone layer. */
  onEnergyZoneSelect?: (zoneId: string, roomId: string | null) => void;
  /** Exact selected-run envelope analysis; undefined keeps the ordinary viewer hook. */
  envelopeAnalysisOverride?: EnvelopeAnalysis | null;
  /** Exact selected-run zone analysis; undefined keeps the ordinary viewer hook. */
  energyZoneAnalysisOverride?: readonly EnergyZone[] | null;
  /** Evidence-backed finding geometry and camera target for diagnostic mode. */
  diagnosticSpatialTarget?: DiagnosticSpatialTarget | null;
}

export function BuildingScene({
  title,
  floors,
  campusData,
  footprintData: footprintDataProp,
  isCompositeLoading,
  recipeOverride,
  buildingPk: buildingPkProp,
  snapshot: snapshotProp,
  diagnosticsMode = false,
  onEnergyZoneSelect,
  envelopeAnalysisOverride,
  energyZoneAnalysisOverride,
  diagnosticSpatialTarget,
}: BuildingSceneProps) {
  const [selectedFloor, setSelectedFloor] = useState<FloorGeometry | null>(null);
  const [modelSource, setModelSource] = useState<ModelSource>("parametric");
  const [activeCampusBuilding, setActiveCampusBuilding] = useState<string | null>(null);

  // Panel open state — extracted to workspace-store per D-06.
  // The toolbar toggles layerPanelOpen directly on the store; this component
  // only reads it to mount the LayerPanel (single source of truth).
  const configPanelOpen = useWorkspaceStore((s) => s.configPanelOpen);
  const layerPanelOpen = useWorkspaceStore((s) => s.layerPanelOpen);
  const uploadDialogOpen = useWorkspaceStore((s) => s.uploadDialogOpen);
  const setConfigPanelOpen = useWorkspaceStore((s) => s.setConfigPanelOpen);
  const setLayerPanelOpen = useWorkspaceStore((s) => s.setLayerPanelOpen);
  const setUploadDialogOpen = useWorkspaceStore((s) => s.setUploadDialogOpen);
  const [uploadedModel, setUploadedModel] = useState<{
    buffer: ArrayBuffer;
    fileName: string;
    fileType: "ifc" | "gltf" | "glb";
  } | null>(null);
  const controlsRef = useRef<SceneControlsRef>(null);

  const activePk = useActiveBuildingPk();
  const buildingPk = workspaceBuildingPk({
    generationId: buildingPkProp,
    titlePk: title.mgmBldrgstPk,
    activePk,
  });
  const storeSnapshot = useBimModelStore((s) => s.snapshot);
  const bimSnapshot =
    snapshotProp ??
    (storeSnapshot?.buildingPk === buildingPk ? storeSnapshot : null);
  const activeViewId = useViewStore((s) => s.activeViewId);
  const views = useViewStore((s) => s.views);
  const interiorFloors = useMemo(() => {
    const view = views.find((v) => v.id === activeViewId);
    if (!view || view.kind !== "plan") return null;
    const floorNo = floorNoFromPlanLevelId(view.levelId);
    return floorNo === null ? null : [floorNo];
  }, [views, activeViewId]);

  // Footprint data is provided by the page (hoisted parallel fetch).
  // If absent (e.g. component used standalone), footprintPolygon stays undefined
  // and ProceduralBuildingModel renders a rectangular box automatically.
  const footprintPolygon = footprintDataProp?.polygon ?? undefined;

  // P2-26: WGS84 centroid of the subject outer ring — used as the context-massing query center.
  const contextCenter = useMemo<[number, number] | null>(() => {
    if (!footprintPolygon || footprintPolygon.length < 1 || footprintPolygon[0].length < 3) {
      return null;
    }
    const outer = footprintPolygon[0];
    const lng = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    const lat = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    return [lng, lat];
  }, [footprintPolygon]);

  // P2-26: subject outer ring for neighbor exclusion (WGS84 [lng, lat] pairs).
  const subjectOuterRing = useMemo<[number, number][] | null>(() => {
    if (!footprintPolygon || footprintPolygon.length < 1) return null;
    return footprintPolygon[0] as [number, number][];
  }, [footprintPolygon]);

  // P2-25: VWorld measured height fills the gap when the ledger heit is 0.
  // Chain (named in building-geometry.ts): ledger heit → measured → era estimate.
  const measuredHeightM = footprintDataProp?.attributes?.height ?? undefined;

  // P2-29: one producer of ledger geometry. The reconstruction resolves the
  // outline — GIS trace when VWorld answered, a ring solved from 건축면적 when
  // it did not — and projects it to local metres itself, so the twin and the
  // traceable engine can no longer describe different buildings.
  // P2-31: 용도지역 decides whether a step can be attributed to 일조권. Failure
  // is expected and harmless — the setback falls back to lot geometry.
  const zoningQuery = useBuildingZoning(contextCenter);
  // P2-31: the lot, asked for separately and only when the first call already
  // spent its one ring on the building. Without it there is no slack to read
  // and the setback direction stays undetermined.
  const parcelQuery = useBuildingParcel(
    title?.platPlcNm || title?.newPlatPlc,
    footprintDataProp?.source === "building",
  );
  const reconstruction = useLedgerReconstruction(
    title,
    floors,
    footprintDataProp,
    zoningQuery.data,
    parcelQuery.data,
  );

  // S4: record that the outline is a reconstruction when it is one — never
  // that it is CAD evidence, and never over an uploaded drawing.
  useEffect(() => {
    if (!buildingPk || recipeOverride) return;
    const store = useTwinProvenanceStore.getState();
    const patch = provenancePatchForModel(
      reconstruction?.twin ?? null,
      store.get(buildingPk),
    );
    if (!patch) return;
    if (store.get(buildingPk).reconstructedFootprint === patch.reconstructedFootprint) {
      return;
    }
    store.patch(buildingPk, patch);
  }, [buildingPk, recipeOverride, reconstruction]);

  const geometry = useMemo(() => {
    // A generated design already has a solved recipe. Deriving geometry from
    // the synthetic title invents a 100 m² box (archArea is 0) and must not
    // be what the camera, shadows or massing are measured from.
    if (recipeOverride) return null;
    const geo = generateBuildingGeometry(title, floors, { measuredHeightM });

    const twin = reconstruction?.twin;
    if (twin) {
      geo.footprintPolygon = twin.footprintPolygon;
      geo.footprintWidth = twin.footprintWidthM;
      geo.footprintDepth = twin.footprintDepthM;
      // P2-30: each storey renders on its own plate, so a setback the
      // register states in 층별개요 is a shape, not just a number.
      applyLevelPlates(geo, twin.levels);
    }
    // When the model is blocked — no stated dimension and no GIS — `geo` keeps
    // the rectangle `generateBuildingGeometry` derived. That is the only path
    // on which the twin still invents its own shape, and it is a shape nothing
    // in the register supports; the fidelity badge reports it as such.

    return geo;
  }, [recipeOverride, title, floors, reconstruction, measuredHeightM]);

  // ── Portfolio-feature-vector geometry shape (area / perimeter / aspect)
  // Used by the TwinStageOverlay to derive the 20-field feature vector.
  const portfolioFootprint = useMemo<FootprintGeometry | null>(() => {
    if (!footprintPolygon || footprintPolygon.length === 0 || footprintPolygon[0].length < 3) {
      return null;
    }
    const outer = footprintPolygon[0];
    // Project to local metres for accurate area/perimeter.
    const lng0 = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    const lat0 = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    let proj;
    try {
      proj = createSceneProjection(lng0, lat0);
    } catch {
      return null;
    }
    const localOuter: Array<[number, number]> = outer.map(
      ([lng, lat]) => proj!.project(lng, lat) as [number, number]
    );

    // Shoelace area
    let areaAcc = 0;
    for (let i = 0; i < localOuter.length; i++) {
      const [x1, z1] = localOuter[i];
      const [x2, z2] = localOuter[(i + 1) % localOuter.length];
      areaAcc += x1 * z2 - x2 * z1;
    }
    const areaSqm = Math.abs(areaAcc) / 2;

    // Perimeter
    let perimeterM = 0;
    for (let i = 0; i < localOuter.length; i++) {
      const [x1, z1] = localOuter[i];
      const [x2, z2] = localOuter[(i + 1) % localOuter.length];
      perimeterM += Math.hypot(x2 - x1, z2 - z1);
    }

    const xs = localOuter.map((p) => p[0]);
    const zs = localOuter.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...zs) - Math.min(...zs);
    const aspectRatio = w === 0 || d === 0 ? 1 : Math.max(w, d) / Math.min(w, d);

    return {
      outerRing: outer as Array<[number, number]>,
      areaSqm,
      perimeterM,
      aspectRatio,
    };
  }, [footprintPolygon]);

  const setProperties = useMaterialStore((s) => s.setProperties);
  const existingProps = useMaterialStore((s) => s.properties[buildingPk]);

  useEffect(() => {
    if (!existingProps) {
      const inferred = inferMaterialProperties(title, floors);
      setProperties(buildingPk, inferred);
    }
  }, [buildingPk, existingProps, title, floors, setProperties]);

  useEffect(() => {
    loadModel(buildingPk).then((stored) => {
      if (stored) {
        setUploadedModel({
          buffer: stored.buffer,
          fileName: stored.fileName,
          fileType: stored.fileType,
        });
        setModelSource("uploaded");
        if (stored.fileType === "ifc") {
          useTwinProvenanceStore.getState().patch(buildingPk, { hasIfcModel: true });
        }
      }
    });
  }, [buildingPk]);

  const handleFileLoaded = useCallback(
    async (buffer: ArrayBuffer, fileName: string, fileType: "ifc" | "gltf" | "glb") => {
      setUploadedModel({ buffer, fileName, fileType });
      setModelSource("uploaded");
      await saveModel(buildingPk, buffer, fileName, fileType);
      if (fileType === "ifc") {
        useTwinProvenanceStore.getState().patch(buildingPk, { hasIfcModel: true });
      }
    },
    [buildingPk]
  );

  // Store base recipe and apply overrides from config panel
  const setBaseRecipe = useRecipeStore((s) => s.setBaseRecipe);
  const recipeOverrides = useRecipeStore((s) => s.overrides[buildingPk]);

  // A generated design supplies its own solved recipe; everything else derives
  // one from the ledger geometry. Config-panel overrides apply on top of
  // whichever it is, so `recipe` below is unchanged for every existing path.
  const baseRecipe = useMemo(() => {
    if (recipeOverride) return recipeOverride;
    if (!geometry) return null;
    return toRecipe(geometry);
  }, [recipeOverride, geometry]);

  // Register base recipe so config tabs can read effective values.
  // A generated design is already published under this pk — re-registering
  // the same solved recipe is idempotent and keeps config tabs in sync.
  useEffect(() => {
    if (!baseRecipe) return;
    setBaseRecipe(buildingPk, baseRecipe);
  }, [buildingPk, baseRecipe, setBaseRecipe]);

  const recipe = useMemo(() => {
    if (!baseRecipe) return null;
    return recipeOverrides ? applyOverrides(baseRecipe, recipeOverrides) : baseRecipe;
  }, [baseRecipe, recipeOverrides]);

  // P2-20 — applied retrofit measures drive the visual state (tints + PV).
  const appliedMeasureIds = useScenarioStore((s) => s.appliedMeasureIds);
  const retrofitVisuals = useMemo(
    () => deriveVisualState(appliedMeasureIds),
    [appliedMeasureIds]
  );

  // P2-22 — structural isolation view (load-bearing solid, rest ghosted).
  const structuralIsolation = useLayerStore((s) => s.structuralIsolation);
  const mepIsolation = useLayerStore((s) => s.mepIsolation);

  // HITL review highlight — a fidelity-panel flag click pulses the matching
  // element category (category-level, not per-element).
  const reviewHighlightKind = useReviewHighlightStore((s) => s.highlightKind);

  const { t, lang } = useT();
  const renderMode = useRenderStore((s) => s.mode);
  const realisticViewport = isRealisticMode(renderMode);

  const extentW = recipe?.footprintWidth ?? geometry?.footprintWidth ?? 20;
  const extentD = recipe?.footprintDepth ?? geometry?.footprintDepth ?? 20;
  const extentH = recipe?.totalHeight ?? geometry?.totalHeight ?? 20;
  const cameraDistance = Math.max(extentH, extentW, extentD) * 2.3;

  // Campus camera: position far enough to see all buildings
  const campusSiteLayout = useMemo(
    () => campusData ? computeSiteLayout(campusData) : null,
    [campusData]
  );
  const campusCameraDistance = campusSiteLayout
    ? Math.max(campusSiteLayout.extents.width, campusSiteLayout.extents.depth) * 1.2
    : cameraDistance;

  const activeCameraDistance = campusData ? campusCameraDistance : cameraDistance;
  const activeTotalHeight = campusData ? 20 : extentH;

  // P2-11: shadow camera frustum derived from site extents (no hardcoded ±60).
  // Campus mode: use the larger of width/depth so all buildings cast shadows.
  // Single-building mode: use footprint dimensions + height with a 20% margin.
  const shadowHalfExtent = useMemo(() => {
    if (campusSiteLayout) {
      return Math.max(campusSiteLayout.extents.width, campusSiteLayout.extents.depth) / 2 * 1.2;
    }
    return Math.max(extentW, extentD, extentH) * 0.5 + 60;
  }, [campusSiteLayout, extentW, extentD, extentH]);

  const handleViewChange = (view: "front" | "side" | "top" | "iso") => {
    controlsRef.current?.setView(view);
  };

  const initializeDefaultViews = useViewStore((s) => s.initializeDefaultViews);
  useEffect(() => {
    if (campusData || !recipe) return;
    const halfW = recipe.footprintWidth / 2;
    const halfD = recipe.footprintDepth / 2;
    const bbox = new THREE.Box3(
      new THREE.Vector3(-halfW, 0, -halfD),
      new THREE.Vector3(halfW, recipe.totalHeight, halfD),
    );
    initializeDefaultViews(recipe.floors, bbox, buildingPk);
  }, [campusData, recipe, buildingPk, initializeDefaultViews]);

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      {/* Contextual toolbar strip — replaces ViewerOverlay */}
      {!diagnosticsMode && (
        <ContextualToolbar
          onViewChange={handleViewChange}
          buildingName={recipe?.buildingName ?? geometry?.buildingName}
          era={recipe?.era ?? geometry?.era}
          selectedFloor={modelSource === "parametric" ? selectedFloor : null}
        />
      )}

      {/* 3D Canvas — fills remaining space */}
      <div className="relative flex-1 min-h-0">
      {/* Composite loading overlay — visible while ledger or footprint fetch is in flight */}
      {isCompositeLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">건물 데이터 로딩 중…</p>
          </div>
        </div>
      )}
      <ViewerErrorBoundary>
      <Canvas
        camera={{
          position: [
            activeCameraDistance * 0.7,
            activeTotalHeight * 0.6 + activeCameraDistance * 0.3,
            activeCameraDistance * 0.7,
          ],
          fov: campusData ? 45 : 35,
          near: 0.1,
          far: activeCameraDistance * 10,
        }}
        gl={{
          antialias: true,
          outputColorSpace: THREE.SRGBColorSpace,
          localClippingEnabled: true,
        }}
        shadows={{ type: THREE.VSMShadowMap }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          {realisticViewport ? (
            <>
              <ArchitecturalTextureBridge />
              <ArchitecturalEnvironment
                siteExtent={Math.max(extentW, extentD, 24)}
                buildingHeight={extentH}
              />
            </>
          ) : (
            <>
              {/* Scene setup: solid background + HDR env for reflections */}
              <SceneSetup />

              {/* Hemisphere light — subtle sky/ground ambient fill */}
              <hemisphereLight
                args={["#b1e1ff", "#b97a20", 0.6]}
              />

              {/* Single directional light with soft VSM shadows.
                  P2-11: frustum bounds derived from shadowHalfExtent (site extents), not hardcoded ±60. */}
              <directionalLight
                position={[40, 60, 30]}
                intensity={2.0}
                color="#ffffff"
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-far={shadowHalfExtent * 4}
                shadow-camera-left={-shadowHalfExtent}
                shadow-camera-right={shadowHalfExtent}
                shadow-camera-top={shadowHalfExtent}
                shadow-camera-bottom={-shadowHalfExtent}
                shadow-bias={-0.0004}
                shadow-radius={4}
              />
            </>
          )}

          {/* Model rendering — campus mode or single-building mode */}
          {campusData ? (
            <CampusSceneContent
              campusData={campusData}
              activeBuildingPk={activeCampusBuilding}
              onBuildingSelect={setActiveCampusBuilding}
            />
          ) : (
            modelSource === "parametric" && (
              <>
                {recipe && (
                  <>
                    <ProceduralBuildingModel geometry={geometry ?? undefined} recipeOverride={recipe} onFloorSelect={setSelectedFloor} retrofitVisuals={retrofitVisuals} structuralIsolation={structuralIsolation} mepIsolation={mepIsolation} reviewHighlightKind={reviewHighlightKind} />
                    <SiteContext recipe={recipe} showDemoNeighbors={buildingPk === DEMO_BUILDING_PK} />
                    {retrofitVisuals.solarInstalled && <SolarPanels recipe={recipe} />}
                    {retrofitVisuals.hvacUpgraded && <RetrofitHvacUnits recipe={recipe} />}
                  </>
                )}
                <BuildingLayers buildingPk={buildingPk} />
                {/* The solved interior, from the BIM snapshot the workspace
                    already hydrated (WorkspaceShell → useBimModel). Self-gated
                    on the persisted 내부 요소 toggle, off by default — the
                    massing shell is opaque, so this is geometry the user asks
                    for. `selectable` because a click here resolves to a real
                    element in the same store the inspector reads. */}
                <InteriorLayer snapshot={bimSnapshot} floors={interiorFloors} selectable />
                {/* Semantic analysis overlays — 외피 / 구조 / 에너지존.
                    Each mounts its own group and self-gates on the layer
                    store's analysisOverlays slice. */}
                <EnvelopeLayer
                  buildingPk={buildingPk}
                  analysisOverride={envelopeAnalysisOverride}
                />
                <StructureLayer buildingPk={buildingPk} />
                <EnergyZoneLayer
                  buildingPk={buildingPk}
                  onSelectZone={onEnergyZoneSelect}
                  analysisOverride={energyZoneAnalysisOverride}
                />
                {diagnosticsMode && (
                  <DiagnosticSelectionLayer target={diagnosticSpatialTarget ?? null} />
                )}
                {recipe && !diagnosticsMode && (
                  <AuthoringFamilyLayer recipe={recipe} />
                )}
                <StructuralTooltip />
                <EquipmentClickHandler />
                <EquipmentHoverCard />
                <EquipmentInteractionHandler />
                {footprintPolygon && (
                  <ContextMassing
                    centerLngLat={contextCenter}
                    subjectOuterRing={subjectOuterRing}
                  />
                )}
              </>
            )
          )}
          {!campusData && modelSource === "uploaded" && uploadedModel && (
            <Suspense fallback={null}>
              {uploadedModel.fileType === "ifc" ? (
                <IFCModel fileBuffer={uploadedModel.buffer} />
              ) : (
                <GLTFModel fileBuffer={uploadedModel.buffer} fileName={uploadedModel.fileName} />
              )}
            </Suspense>
          )}

          <SceneControls
            ref={controlsRef}
            targetHeight={activeTotalHeight}
            distance={activeCameraDistance}
            focusTarget={diagnosticSpatialTarget?.focus ?? null}
          />

          {/* Outline + post-processing — OutlinePass via the WebGL EffectComposer. */}
          <SceneHighlightProcessing />
        </Suspense>
      </Canvas>
      </ViewerErrorBoundary>

      {!diagnosticsMode && <RenderModeOverlay />}

      {/* Floor info — mid-left, above the budget strip */}
      {selectedFloor && modelSource === "parametric" && (
        <div className="absolute left-3 bottom-28 z-10 rounded-lg border bg-card/95 backdrop-blur p-3 shadow-sm max-w-xs">
          <p className="text-sm font-semibold">
            {selectedFloor.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({selectedFloor.type === "below" ? t("지하", "Underground") : t("지상", "Above ground")})
            </span>
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>{t("면적", "Area")}</span>
            <span className="font-medium text-foreground">{formatArea(selectedFloor.area)}</span>
            <span>{t("용도", "Use")}</span>
            <span className="font-medium text-foreground">{selectedFloor.use || "-"}</span>
            <span>{t("구조", "Structure")}</span>
            <span className="font-medium text-foreground">{selectedFloor.structure || "-"}</span>
            <span>IFC</span>
            <span className="font-medium text-foreground">
              {ifcDisplayLine(classifyElement("slab", { strctCd: recipe?.strctCd })!, lang)}
            </span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute right-3 bottom-28 z-10 text-[10px] text-muted-foreground/60">
        {t("클릭: 층 선택 · 드래그: 회전 · 스크롤: 줌", "Click: select floor · Drag: rotate · Scroll: zoom")}
      </div>

      {/* Twin-stage data-product overlay — release rail, prediction readout,
          feature vector. Only for single-building mode. */}
      {!campusData && !diagnosticsMode && (
        <ErrorBoundary>
          <TwinStageOverlay
            title={title}
            footprintGeometry={portfolioFootprint}
          />
        </ErrorBoundary>
      )}

      {!diagnosticsMode && (
        <ErrorBoundary>
          <ConfigPanel
            buildingPk={buildingPk}
            visible={configPanelOpen}
            onClose={() => setConfigPanelOpen(false)}
          />
        </ErrorBoundary>
      )}

      {!campusData && (
        <ErrorBoundary>
          <AnalysisLegend
            buildingPk={buildingPk}
            envelopeAnalysisOverride={envelopeAnalysisOverride}
            zoneAnalysisOverride={energyZoneAnalysisOverride}
          />
        </ErrorBoundary>
      )}

      {!diagnosticsMode && (
        <>
          <LayerPanel
            visible={layerPanelOpen}
            onClose={() => setLayerPanelOpen(false)}
          />

          <ModelUploader
            open={uploadDialogOpen}
            onOpenChange={setUploadDialogOpen}
            onFileLoaded={handleFileLoaded}
          />
        </>
      )}
      </div>
    </div>
  );
}
