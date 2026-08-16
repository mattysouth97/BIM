"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import type { BuildingGeometry, FloorGeometry } from "@/lib/building-geometry";
import { toRecipe } from "@/lib/building-geometry";
import { ProceduralBuilding } from "@/lib/procedural/procedural-building";
import { resolvePickedFloor } from "@/lib/procedural/floor-picking";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { GroundPlane } from "./ground-plane";
import { useLayerStore } from "@/store/layer-store";
import { InfoEdges } from "./info-edges";
import { useOutlineHover } from "@/hooks/use-outline-hover";
import { useEquipmentAssets } from "@/hooks/use-equipment-assets";
import { useScenarioStore } from "@/store/scenario-store";
import {
  deriveEquipmentScenario,
  equipmentScenarioKey,
} from "@/lib/layers/equipment-scenario";
import { useSelectionStore } from "@/store/selection-store";
import {
  hasAnyVisual,
  NO_RETROFIT_VISUALS,
  UPGRADE_TINT,
  UPGRADE_GLASS_COLOR,
  UPGRADE_GLASS_OPACITY,
  RENEWED_WALL_COLOR,
  RENEWED_ROOF_COLOR,
  PROPOSAL_EMISSIVE,
  PROPOSAL_EMISSIVE_INTENSITY,
  type RetrofitVisualState,
} from "@/lib/retrofit/measure-visuals";
import { classifyElement } from "@/lib/bim/ifc-classification";

interface ProceduralBuildingModelProps {
  geometry: BuildingGeometry;
  /** If provided, use this recipe instead of computing from geometry */
  recipeOverride?: BuildingRecipe;
  onFloorSelect?: (floor: FloorGeometry | null) => void;
  /** When true, suppresses the GroundPlane rendered beneath the building (for campus mode) */
  hideGroundPlane?: boolean;
  /**
   * P2-20 — applied-retrofit visual state. Renewed elements (glass, walls,
   * roof, slabs) are re-tinted so clicking scenario measures visibly
   * transforms the model. Omit (campus mode) for baseline appearance.
   */
  retrofitVisuals?: RetrofitVisualState;
  /**
   * P2-22 — structural isolation view. Non-load-bearing elements (per IFC
   * classification: glazing, mullions, infill walls) ghost to transparent
   * gray while load-bearing structure stays solid — the Revit
   * structural-discipline filter rendered in the Solibri/xeokit x-ray idiom.
   */
  structuralIsolation?: boolean;
  /**
   * Category of a HITL-flagged element to highlight (from a fidelity-panel flag
   * click). Category-level, not per-element: the procedural building has no
   * per-IFC-element meshes, so the flag's kind maps to a mesh category
   * (window→glass, wall→facade panels/mullions, slab→slabs; door has no
   * distinct mesh and is not highlightable).
   */
  reviewHighlightKind?: "wall" | "slab" | "window" | "door" | null;
}

/** Ghost appearance for non-structural context in isolation view. */
const GHOST_COLOR = "#9ca3af";
const GHOST_OPACITY = 0.12;

/** HITL review highlight — amber emissive glow on the flagged element category. */
const REVIEW_HIGHLIGHT_EMISSIVE = "#f59e0b";
const REVIEW_HIGHLIGHT_INTENSITY = 0.5;

/** True when a mesh belongs to the flagged element category. */
function meshMatchesReviewKind(
  obj: THREE.Mesh,
  kind: "wall" | "slab" | "window" | "door"
): boolean {
  const type = obj.userData?.type as string | undefined;
  switch (kind) {
    case "window":
      return type === "glass";
    case "wall":
      return type === "solidPanel" || type === "hMullion" || type === "vMullion";
    case "slab":
      return type === "slab" || hasAncestorNamed(obj, "slabs");
    case "door":
      return false; // no distinct door mesh in the procedural building
    default:
      return false;
  }
}

/** True when obj or any ancestor group carries the given name. */
function hasAncestorNamed(obj: THREE.Object3D, name: string): boolean {
  let p: THREE.Object3D | null = obj;
  while (p) {
    if (p.name === name) return true;
    p = p.parent;
  }
  return false;
}

/** Convert a FloorSpec back to a FloorGeometry for compatibility with existing UI */
function floorSpecToGeometry(spec: FloorSpec, geo: BuildingGeometry): FloorGeometry | null {
  return geo.floors.find(f => f.floorNo === spec.floorNo) ?? null;
}

/**
 * Collect informational meshes from a group for edge overlay rendering.
 * Criteria (skip InstancedMesh — EdgesGeometry degrades for instanced):
 *   - Plain THREE.Mesh only
 *   - userData.type === "slab" OR name starts with "facade" OR userData.informational === true
 */
function collectInformationalMeshes(group: THREE.Group): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh) return;
    const ud = obj.userData;
    if (
      ud?.type === "slab" ||
      obj.name.startsWith("facade") ||
      ud?.informational === true
    ) {
      result.push(obj);
    }
  });
  return result;
}

export function ProceduralBuildingModel({ geometry, recipeOverride, onFloorSelect, hideGroundPlane, retrofitVisuals, structuralIsolation, reviewHighlightKind }: ProceduralBuildingModelProps) {
  const builderRef = useRef<ProceduralBuilding | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const selectedRef = useRef<number | null>(null);
  const [group, setGroup] = useState<THREE.Group | null>(null);

  const baseRecipe = useMemo(() => toRecipe(geometry), [geometry]);
  const recipe = recipeOverride ?? baseRecipe;

  // Detailed Blender structural kit (columns, beams, mullions, panels, roof
  // furniture) — regenerate once the GLB cache is preloaded.
  const equipmentAssetsReady = useEquipmentAssets();

  // Green-retrofit envelope scenario: the knapsack-selected measures decide
  // WHICH facade hardware renders (baseline vs thermally-broken mullions,
  // plain vs externally-insulated spandrel panels). Measure-selection churn
  // (e.g. toggling a measure that maps to no hardware, like
  // envelope-roof-insulation) still produces a new selectedMeasureIds
  // identity, but deriveEquipmentScenario's OUTPUT is what actually matters
  // for regeneration. `equipmentScenario` below is stabilized on
  // equipmentScenarioKey (its stable semantic fingerprint) using React's
  // "adjust state during render" pattern, so it keeps the SAME object
  // reference — and the generate effect below does not re-run — whenever
  // the derived scenario is unchanged.
  const selectedMeasureIds = useScenarioStore((s) => s.selectedMeasureIds);
  const derivedScenario = useMemo(
    () => deriveEquipmentScenario(selectedMeasureIds),
    [selectedMeasureIds]
  );
  const derivedScenarioKey = equipmentScenarioKey(derivedScenario);
  const [scenarioKey, setScenarioKey] = useState(derivedScenarioKey);
  const [equipmentScenario, setEquipmentScenario] = useState(derivedScenario);
  if (derivedScenarioKey !== scenarioKey) {
    setScenarioKey(derivedScenarioKey);
    setEquipmentScenario(derivedScenario);
  }

  // Generate building geometry — setGroup triggers re-render so <primitive> picks it up
  useEffect(() => {
    // Clean up previous
    if (groupRef.current && groupRef.current.parent) {
      groupRef.current.parent.remove(groupRef.current);
    }
    if (builderRef.current) {
      builderRef.current.dispose();
    }

    const builder = new ProceduralBuilding(recipe, equipmentScenario);
    const g = builder.generate();

    builderRef.current = builder;
    groupRef.current = g;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGroup(g);

    return () => {
      builder.dispose();
      builderRef.current = null;
      groupRef.current = null;
      setGroup(null);
    };
  }, [recipe, equipmentAssetsReady, equipmentScenario]);

  // Sync Digital Twin layer visibility to named mesh groups.
  // Depends on `group` state so it re-runs after building generation completes.
  const layerVisibility = useLayerStore((s) => s.visibility);
  useEffect(() => {
    if (!group) return;

    group.traverse((child) => {
      const n = child.name;

      // Envelope layer: facade panels, glass, mullions, parapet, roof
      if (
        n === "facade" ||
        n.startsWith("facade-section-") ||
        n === "roof" ||
        n === "roof-furniture"
      ) {
        child.visible = layerVisibility["envelope"] ?? true;
      }

      // Structure layer: floor slabs, columns, and beams
      if (n === "slabs" || n === "columns" || n === "beams") {
        child.visible = layerVisibility["structure"] ?? true;
      }

      // MEP / energy-zones / retrofit-targets: no geometry yet — no-op
    });
  }, [group, layerVisibility]);

  // P2-20 — retint renewed elements when applied measures change. Materials
  // are cloned per-mesh before tinting (they are shared across meshes, so
  // mutating in place would bleed the tint to unrelated elements); originals
  // are restored and clones disposed on every change and on unmount.
  const tintOriginalsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  useEffect(() => {
    if (!group) return;
    const originals = tintOriginalsRef.current;

    const restoreAll = () => {
      for (const [mesh, original] of originals) {
        if (mesh.material !== original && !Array.isArray(mesh.material)) {
          mesh.material.dispose();
        }
        mesh.material = original;
      }
      originals.clear();
    };

    restoreAll();
    const v = retrofitVisuals ?? NO_RETROFIT_VISUALS;
    const isolate = structuralIsolation === true;
    if (!hasAnyVisual(v) && !isolate && !reviewHighlightKind) return;

    const tint = (mesh: THREE.Mesh, apply: (m: THREE.MeshStandardMaterial) => void) => {
      if (Array.isArray(mesh.material)) return;
      if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      originals.set(mesh, mesh.material);
      const clone = mesh.material.clone();
      apply(clone);
      mesh.material = clone;
    };

    // P2-23 — realistic post-retrofit finishes + shared "proposed" accent
    const propose = (m: THREE.MeshStandardMaterial) => {
      m.emissive.set(PROPOSAL_EMISSIVE);
      m.emissiveIntensity = PROPOSAL_EMISSIVE_INTENSITY;
    };
    const renewWall = (m: THREE.MeshStandardMaterial) => {
      m.color.set(RENEWED_WALL_COLOR); // fresh plaster/EIFS finish
      m.roughness = 0.55;
      propose(m);
    };
    const renewRoof = (m: THREE.MeshStandardMaterial) => {
      m.color.set(RENEWED_ROOF_COLOR); // new membrane
      m.roughness = 0.5;
      propose(m);
    };
    const renewSlab = (m: THREE.MeshStandardMaterial) => {
      m.color.lerp(new THREE.Color(UPGRADE_TINT), 0.2); // interior — subtle
      propose(m);
    };

    const ghost = (mesh: THREE.Mesh) =>
      tint(mesh, (m) => {
        m.color.set(GHOST_COLOR);
        m.emissive.set("#000000");
        m.emissiveIntensity = 0;
        m.transparent = true;
        m.opacity = GHOST_OPACITY;
        m.depthWrite = false;
      });

    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const type = obj.userData?.type as string | undefined;

      // HITL review highlight takes precedence for matching meshes — an amber
      // emissive glow on the flagged element category (category-level).
      if (reviewHighlightKind && meshMatchesReviewKind(obj, reviewHighlightKind)) {
        tint(obj, (m) => {
          m.emissive.set(REVIEW_HIGHLIGHT_EMISSIVE);
          m.emissiveIntensity = REVIEW_HIGHLIGHT_INTENSITY;
        });
        return;
      }

      // P2-22 — isolation ghosts every non-load-bearing element first
      // (Revit filters on LoadBearing; masonry walls stay solid because the
      // IFC classification marks them bearing). Ghost wins over retrofit
      // tints for these meshes; load-bearing structure below keeps them.
      if (isolate && type) {
        const cls = classifyElement(type, { strctCd: recipe.strctCd, curtainWall: !!recipe.curtainWall?.enabled });
        if (cls && !cls.loadBearing) {
          ghost(obj);
          return;
        }
      }

      if (v.windowsUpgraded && type === "glass") {
        // New low-e glazing — the realistic change IS the material swap
        tint(obj, (m) => {
          m.color.set(UPGRADE_GLASS_COLOR);
          m.opacity = UPGRADE_GLASS_OPACITY;
          m.roughness = 0.05;
        });
      } else if (
        v.wallsUpgraded &&
        (type === "solidPanel" || type === "hMullion" || type === "vMullion")
      ) {
        tint(obj, renewWall);
      } else if (v.roofUpgraded && hasAncestorNamed(obj, "roof")) {
        tint(obj, renewRoof);
      } else if (
        v.floorsUpgraded &&
        (type === "slab" || hasAncestorNamed(obj, "slabs"))
      ) {
        tint(obj, renewSlab);
      }
    });

    return restoreAll;
  }, [group, retrofitVisuals, structuralIsolation, recipe, reviewHighlightKind]);

  // Floor selection via raycaster on slabs — handles both the rectangular
  // InstancedMesh path (instanceId) and the polygon Group path (plain meshes
  // carrying userData.floorNo). Resolution lives in resolvePickedFloor.
  const handleClick = useCallback((event: THREE.Event & { instanceId?: number; object?: THREE.Object3D }) => {
    if (!builderRef.current) return;
    // The native MEP coordinator resolves its click on pointerup, before this
    // R3F click event. Do not let the building floor replace that more precise
    // equipment selection.
    if (useSelectionStore.getState().selectedEquipment) return;

    const floorSpec = resolvePickedFloor(
      { object: event.object, instanceId: event.instanceId },
      builderRef.current
    );
    if (!floorSpec) return;

    const newSelection = selectedRef.current === floorSpec.floorNo ? null : floorSpec.floorNo;
    selectedRef.current = newSelection;

    if (onFloorSelect) {
      if (newSelection !== null) {
        onFloorSelect(floorSpecToGeometry(floorSpec, geometry));
      } else {
        onFloorSelect(null);
      }
    }
  }, [geometry, onFloorSelect]);

  // Collect informational meshes after group is generated
  const informationalMeshes = useMemo<THREE.Mesh[]>(() => {
    if (!group) return [];
    return collectInformationalMeshes(group);
  }, [group]);

  const { onPointerOver, onPointerMove, onPointerOut } = useOutlineHover();

  return (
    <>
      {!hideGroundPlane && (
        <GroundPlane siteWidth={geometry.siteWidth} siteDepth={geometry.siteDepth} era={geometry.era} />
      )}
      {group && (
        <primitive
          object={group}
          onClick={handleClick}
          onPointerOver={onPointerOver}
          onPointerMove={onPointerMove}
          onPointerOut={onPointerOut}
        />
      )}
      {informationalMeshes.map((mesh, i) => (
        <InfoEdges key={i} mesh={mesh} />
      ))}
    </>
  );
}
