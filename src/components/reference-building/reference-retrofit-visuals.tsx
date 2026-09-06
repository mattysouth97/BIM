"use client";

// src/components/reference-building/reference-retrofit-visuals.tsx
// Lane 3B — the model pages answer the green-remodelling click.
//
// A reference building's GLB is not the twin's procedural recipe: the fabric
// ships as ONE merged mesh per IFC-type group (`FABRIC_GROUPS` in
// scripts/lib/ifc-glb.mjs — "wall", "slab", "glazing", …), so "wall" and
// "glazing" are addressable by material name, but "slab" holds every floor
// AND every roof merged together with no per-element split left in the file.
// This module tells them apart at runtime from the manifest's own storey
// elevations, and renders the same proposal language the twin uses
// (`measure-visuals.ts` — same colours, same emissive) so the two pages read
// as one product.
//
// Pure geometry/derivation functions are exported and unit-tested without a
// WebGL context; the components below are the only part that touches THREE.

import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { calculateSolarPotential } from "@/lib/retrofit/solar-potential";
import {
  deriveVisualState,
  hasAnyVisual,
  RENEWED_WALL_COLOR,
  RENEWED_ROOF_COLOR,
  RENEWED_EQUIPMENT_COLOR,
  UPGRADE_GLASS_COLOR,
  UPGRADE_GLASS_OPACITY,
  PROPOSAL_EMISSIVE,
  PROPOSAL_EMISSIVE_INTENSITY,
  type RetrofitVisualState,
} from "@/lib/retrofit/measure-visuals";

export { deriveVisualState, hasAnyVisual };
export type { RetrofitVisualState };

type ServiceLayer = NonNullable<ReferenceBuildingManifest["serviceLayers"]>[number];
type RoofRow = NonNullable<ReferenceBuildingManifest["roofs"]>[number];
type StoreyRow = NonNullable<ReferenceBuildingManifest["storeys"]>[number];

/* ------------------------------------------------------------------ *
 * Pure geometry: telling roof from floor in a merged "slab" mesh
 * ------------------------------------------------------------------ */

/**
 * Triangle indices above / at-or-below a Y threshold, split by centroid.
 *
 * Operates on the shared position buffer without copying vertex data — only
 * the index list is partitioned, so the two buckets can be drawn as two
 * meshes sharing one POSITION/NORMAL accessor.
 */
export function splitTrianglesByElevation(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  thresholdY: number,
): { above: number[]; below: number[] } {
  const above: number[] = [];
  const below: number[] = [];
  for (let i = 0; i + 2 < index.length; i += 3) {
    const ia = index[i];
    const ib = index[i + 1];
    const ic = index[i + 2];
    const centroidY = (positions[ia * 3 + 1] + positions[ib * 3 + 1] + positions[ic * 3 + 1]) / 3;
    const bucket = centroidY >= thresholdY ? above : below;
    bucket.push(ia, ib, ic);
  }
  return { above, below };
}

/**
 * The topmost roof-bearing storey, minus a margin — deliberately the MAX
 * elevation among roof-referencing storeys, not the min.
 *
 * A building can carry a second, lower roof over a set-back wing (the
 * Clinic's EPDM roof sits at the second floor's own elevation, exactly where
 * that floor's own structural slab also sits — the two are indistinguishable
 * by height alone once IfcSlab and IfcRoof are merged into one bucket). Using
 * the minimum would misclassify part of an occupied floor as "roof". Using
 * the maximum instead means a lower roof plane is silently left out of the
 * on-screen preview — understating the paintable roof area — but never
 * mislabels an interior floor as roof. This function feeds ONLY the 3D
 * preview's paint extent; the manifest's own `areas.roofSurfaceSqm` (used by
 * the real energy figures) is untouched by this simplification.
 */
export function roofElevationThresholdM(
  roofs: readonly RoofRow[] | undefined,
  storeys: readonly StoreyRow[] | undefined,
): number | null {
  if (!roofs?.length || !storeys?.length) return null;
  const elevationByStorey = new Map(storeys.map((s) => [s.id, s.elevationM]));
  let max: number | null = null;
  for (const roof of roofs) {
    const elevation = roof.storeyId ? elevationByStorey.get(roof.storeyId) : undefined;
    if (elevation === undefined) continue;
    if (max === null || elevation > max) max = elevation;
  }
  // Half the shortest floor-to-floor height in either published building
  // (Schependomlaan's smallest storey is ~2.6 m) would already clear a roof
  // deck's own thickness; 1.0 m is a deliberately generous margin so a
  // parapet or build-up never dips the deck's vertices below the line.
  return max === null ? null : max - 1.0;
}

export interface FaceSetAnalysis {
  /** Sum of upward-facing triangle areas — a one-sheet surface figure, matching the extractor's own "upward faces" convention. */
  areaSqm: number;
  /** Area-weighted mean angle from horizontal, degrees, over upward faces only. */
  tiltDeg: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Highest vertex Y among the analysed upward faces — where a panel array is placed. */
  apexY: number;
}

const UP_FACE_MIN_COS = 0.05; // matches the sub-5.7° cutoff the extractor uses for "upward"

/**
 * Area, tilt and footprint of a triangle set's upward-facing skin.
 *
 * Downward and near-vertical faces (a soffit, a fascia, a wall clipped into
 * the same subset) are excluded so they cannot cancel the tilt or inflate the
 * footprint — the same reason the extractor's own `tiltDeg`/`upFacingProjectedSqm`
 * only ever sum upward faces.
 */
export function analyzeUpwardFaces(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
): FaceSetAnalysis | null {
  let areaSqm = 0;
  let tiltWeighted = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let apexY = -Infinity;

  for (let i = 0; i + 2 < index.length; i += 3) {
    const ia = index[i] * 3;
    const ib = index[i + 1] * 3;
    const ic = index[i + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) continue;

    const normalY = ny / len;
    if (normalY <= UP_FACE_MIN_COS) continue;

    const area = len / 2;
    const tiltDeg = (Math.acos(Math.min(1, Math.max(-1, normalY))) * 180) / Math.PI;
    areaSqm += area;
    tiltWeighted += tiltDeg * area;
    minX = Math.min(minX, ax, bx, cx);
    maxX = Math.max(maxX, ax, bx, cx);
    minZ = Math.min(minZ, az, bz, cz);
    maxZ = Math.max(maxZ, az, bz, cz);
    apexY = Math.max(apexY, ay, by, cy);
  }

  if (areaSqm <= 0) return null;
  return { areaSqm, tiltDeg: tiltWeighted / areaSqm, minX, maxX, minZ, maxZ, apexY };
}

/* ------------------------------------------------------------------ *
 * Pure layout: an instanced panel array sized by kWp, tilted by the roof
 * ------------------------------------------------------------------ */

// Same module dimensions as src/components/viewer/solar-panels.tsx (owned by
// Lane 3A), duplicated rather than imported so this file has no dependency on
// a sibling lane's in-flight viewer component; keep the two in step by eye.
const PANEL_W = 1.7;
const COL_PITCH = PANEL_W + 0.15;
const ROW_PITCH = 2.4;
const EDGE_MARGIN = 1.0;
/** Typical commercial/residential module, used only to turn a kWp figure into a panel COUNT for this preview. */
export const PV_PANEL_RATED_KWP = 0.4;
/** Korean fixed-tilt rack convention — matches solar-panels.tsx's TILT_RAD, applied only when the roof itself is flat. */
export const PV_FIXED_RACK_TILT_DEG = 30;
export const PV_FLAT_TILT_THRESHOLD_DEG = 5;
const MAX_PV_INSTANCES = 400;

export function classifyRoofTypeForSizing(tiltDeg: number): "flat" | "gable" {
  return tiltDeg < PV_FLAT_TILT_THRESHOLD_DEG ? "flat" : "gable";
}

export interface PanelInstance {
  x: number;
  y: number;
  z: number;
  quaternion: readonly [number, number, number, number];
}

export interface PanelLayout {
  instances: readonly PanelInstance[];
  systemSizeKWp: number;
  tiltDeg: number;
}

/**
 * Lay out an instanced PV array over a roof's measured footprint.
 *
 * `overrideSystemSizeKWp` is the seam for Lane 3A's `retrofit-delta.ts` —
 * once `computeRetrofitDelta(...).after.materials.renewable.solarPV.capacity`
 * is wired through, pass it here and this stops estimating its own kWp from
 * roof area. Until then the estimate uses the same `calculateSolarPotential`
 * the economics engine uses, at a fixed "seoul" irradiance — a stated
 * simplification for the ON-SCREEN array size only; it prices nothing.
 */
export function panelLayoutForRoof(
  face: FaceSetAnalysis,
  overrideSystemSizeKWp?: number,
): PanelLayout | null {
  const roofTypeForSizing = classifyRoofTypeForSizing(face.tiltDeg);
  const systemSizeKWp =
    overrideSystemSizeKWp ??
    calculateSolarPotential(face.areaSqm, roofTypeForSizing, "seoul", 0).systemSizeKWp;
  const targetCount = Math.min(MAX_PV_INSTANCES, Math.floor(systemSizeKWp / PV_PANEL_RATED_KWP));
  if (targetCount <= 0) return null;

  const spanX = face.maxX - face.minX;
  const spanZ = face.maxZ - face.minZ;
  // Assumption, named: the ridge runs along the roof footprint's longer
  // horizontal axis, and the slope runs across the shorter one. Correct for
  // a simple gable/mono-pitch box; a hip or multi-wing roof gets one
  // representative plane rather than a per-facet layout.
  const ridgeAlongX = spanX >= spanZ;
  const isFlat = roofTypeForSizing === "flat";
  const tiltDeg = isFlat ? PV_FIXED_RACK_TILT_DEG : face.tiltDeg;
  const tiltRad = THREE.MathUtils.degToRad(tiltDeg);

  const alongSpan = (ridgeAlongX ? spanX : spanZ) - 2 * EDGE_MARGIN;
  const acrossSpan = (ridgeAlongX ? spanZ : spanX) - 2 * EDGE_MARGIN;
  const cols = Math.max(1, Math.floor(alongSpan / COL_PITCH));
  const rows = Math.max(1, Math.floor(acrossSpan / ROW_PITCH));
  const count = Math.min(targetCount, cols * rows);
  if (count <= 0) return null;

  const cx = (face.minX + face.maxX) / 2;
  const cz = (face.minZ + face.maxZ) / 2;
  // 0.15 m clearance above the highest measured roof vertex — a flat rack's
  // trailing edge or a flush-mounted panel's own thickness.
  const y = face.apexY + 0.15;

  const quaternion = (
    ridgeAlongX
      ? new THREE.Quaternion().setFromEuler(new THREE.Euler(-tiltRad, 0, 0))
      : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tiltRad))
  ).toArray() as [number, number, number, number];

  const instances: PanelInstance[] = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < count; r += 1) {
    for (let c = 0; c < cols && placed < count; c += 1) {
      const u = (c - (cols - 1) / 2) * COL_PITCH;
      const v = (r - (rows - 1) / 2) * ROW_PITCH;
      const [x, z] = ridgeAlongX ? [cx + u, cz + v] : [cx + v, cz + u];
      instances.push({ x, y, z, quaternion });
      placed += 1;
    }
  }
  return { instances, systemSizeKWp, tiltDeg };
}

/* ------------------------------------------------------------------ *
 * Pure status: what an equipment measure can reach on THIS building
 * ------------------------------------------------------------------ */

export type EquipmentReach = "tinted" | "layer-off" | "not-modeled";

/**
 * Whether an hvac/electrical discipline model exists for this building and,
 * if so, whether the reader currently has it switched on — three states, not
 * two, because "this building carries no such file" and "the file exists but
 * is off" are different facts and must not collapse into one caption.
 */
export function equipmentLayerReach(
  services: readonly Pick<ServiceLayer, "id">[],
  active: ReadonlySet<string>,
  layerId: string,
): EquipmentReach {
  if (!services.some((s) => s.id === layerId)) return "not-modeled";
  return active.has(layerId) ? "tinted" : "layer-off";
}

/* ------------------------------------------------------------------ *
 * Pure legend text — assembled from facts, not asserted independently of
 * them, so a test can parse it back and check it reproduces the state.
 * ------------------------------------------------------------------ */

export interface RetrofitLegendLine {
  key: string;
  ko: string;
  en: string;
}

export function buildRetrofitLegendLines(args: {
  selectedMeasureIds: readonly string[] | null;
  visual: RetrofitVisualState;
  hvacReach: EquipmentReach;
  lightingReach: EquipmentReach;
  roofGeometryAvailable: boolean;
}): RetrofitLegendLine[] {
  const { selectedMeasureIds, visual, hvacReach, lightingReach, roofGeometryAvailable } = args;

  if (selectedMeasureIds === null) {
    return [
      {
        key: "no-scenario",
        ko: "그린리모델링 시나리오가 아직 평가되지 않음 — 미리보기 없음.",
        en: "No green-remodelling scenario evaluated yet — nothing to preview.",
      },
    ];
  }
  if (selectedMeasureIds.length === 0) {
    return [
      {
        key: "empty-selection",
        ko: "현재 예산·트랙에서 선택된 개선 항목 없음.",
        en: "No measures selected under the current budget and track.",
      },
    ];
  }
  if (!hasAnyVisual(visual)) {
    return [
      {
        key: "no-visual-mapping",
        ko: `선택된 개선 항목 ${selectedMeasureIds.length}개 — 이 화면에 표시할 시각 변화 없음.`,
        en: `${selectedMeasureIds.length} measure(s) selected — none map to a visible change on this page.`,
      },
    ];
  }

  const lines: RetrofitLegendLine[] = [
    {
      key: "header",
      ko: `제안 미리보기 · ${selectedMeasureIds.length}개 개선 항목 · 시공 전 예상 모습`,
      en: `Proposed preview · ${selectedMeasureIds.length} measure(s) · not yet built`,
    },
  ];

  const shown: string[] = [];
  if (visual.wallsUpgraded) shown.push("벽체 마감");
  if (visual.windowsUpgraded) shown.push("창호(로이유리)");
  if (visual.roofUpgraded) shown.push(roofGeometryAvailable ? "지붕 마감" : "지붕(형상 없음)");
  const shownEn: string[] = [];
  if (visual.wallsUpgraded) shownEn.push("wall finish");
  if (visual.windowsUpgraded) shownEn.push("glazing (low-e)");
  if (visual.roofUpgraded) shownEn.push(roofGeometryAvailable ? "roof finish" : "roof (no geometry to show)");
  if (shown.length > 0) {
    lines.push({
      key: "envelope",
      ko: `외피: ${shown.join(" · ")}`,
      en: `Envelope: ${shownEn.join(" · ")}`,
    });
  }

  // The ground slab has no visual on this page — it sits below grade, under
  // the ground plane, where no camera angle here ever looks. Named rather
  // than silently omitted, since `hasAnyVisual` cannot tell "has a visual
  // here" from "has a visual on the twin".
  if (visual.floorsUpgraded) {
    lines.push({
      key: "floor",
      ko: "바닥 단열: 지면 아래 슬래브라 이 화면에는 표시되지 않음",
      en: "Floor insulation: below-grade slab, not visible from this camera",
    });
  }

  if (visual.solarInstalled) {
    lines.push(
      roofGeometryAvailable
        ? {
            key: "solar",
            ko: "태양광: 지붕 위 패널 배열 표시 · 화면 표시일 뿐 에너지 등급에는 반영되지 않음",
            en: "Solar PV: panel array shown on the roof · visual only — does not move the energy grade",
          }
        : {
            key: "solar-no-roof",
            ko: "태양광: 지붕 형상 정보가 없어 패널을 배치할 수 없음",
            en: "Solar PV: no roof geometry available to place panels on",
          },
    );
  }

  // Only named when its OWN measure is part of the selection — otherwise a
  // solar-only selection would report on HVAC/lighting reach that has
  // nothing to do with what the reader actually chose.
  for (const [on, reach, labelKo, labelEn] of [
    [visual.hvacUpgraded, hvacReach, "HVAC", "HVAC"],
    [visual.lightingUpgraded, lightingReach, "조명(전기 계통)", "Lighting (via the electrical model)"],
  ] as const) {
    if (!on) continue;
    if (reach === "tinted") {
      lines.push({
        key: `equipment-${labelEn}`,
        ko: `${labelKo}: 새 장비 색상으로 표시`,
        en: `${labelEn}: shown as renewed equipment`,
      });
    } else if (reach === "layer-off") {
      lines.push({
        key: `equipment-${labelEn}`,
        ko: `${labelKo}: 해당 계통 레이어가 꺼져 있어 반영 지점을 표시할 수 없음`,
        en: `${labelEn}: its discipline layer is switched off — nothing to point at`,
      });
    } else {
      lines.push({
        key: `equipment-${labelEn}`,
        ko: `${labelKo}: 이 모델에는 해당 계통 파일이 없음`,
        en: `${labelEn}: this file carries no such discipline model`,
      });
    }
  }

  return lines;
}

/* ------------------------------------------------------------------ *
 * Components
 * ------------------------------------------------------------------ */

/**
 * Clone-and-restore tint on a single named material, mirroring
 * `procedural-building-model.tsx`'s own `tint`/`restoreAll` idiom exactly —
 * same constants, same emissive accent, so the two pages speak one language.
 * Safe to call on a mesh whose material is shared by nothing else, which is
 * true of every FABRIC_GROUPS bucket (one merged mesh per group).
 */
function tintNamedMaterial(
  scene: THREE.Object3D,
  materialName: string,
  apply: (m: THREE.MeshStandardMaterial) => void,
): () => void {
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
    if (mesh.material.name !== materialName) return;
    originals.set(mesh, mesh.material);
    const clone = mesh.material.clone();
    apply(clone);
    mesh.material = clone;
  });
  return () => {
    for (const [mesh, original] of originals) {
      const current = mesh.material;
      if (!Array.isArray(current) && current !== original) current.dispose();
      mesh.material = original;
    }
  };
}

/**
 * Tints the fabric GLB's own "wall" and "glazing" materials in place — no
 * geometry split needed, because each is already its own merged mesh.
 * Mounted independently of `Fabric`'s x-ray effect: both mutate the same
 * cached `useGLTF` scene, but touch different material properties
 * (opacity/transparent/depthWrite there, colour/emissive here), so the two
 * effects compose without either clobbering the other's restore.
 */
export function EnvelopeRetrofitTint({
  url,
  visual,
}: {
  url: string;
  visual: RetrofitVisualState;
}) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    const restores: Array<() => void> = [];
    if (visual.wallsUpgraded) {
      restores.push(
        tintNamedMaterial(scene, "wall", (m) => {
          m.color.set(RENEWED_WALL_COLOR);
          m.roughness = 0.55;
          m.emissive.set(PROPOSAL_EMISSIVE);
          m.emissiveIntensity = PROPOSAL_EMISSIVE_INTENSITY;
        }),
      );
    }
    if (visual.windowsUpgraded) {
      restores.push(
        tintNamedMaterial(scene, "glazing", (m) => {
          m.color.set(UPGRADE_GLASS_COLOR);
          m.transparent = true;
          m.opacity = UPGRADE_GLASS_OPACITY;
          m.roughness = 0.05;
        }),
      );
    }
    return () => {
      for (const restore of restores) restore();
    };
  }, [scene, visual.wallsUpgraded, visual.windowsUpgraded]);

  return null;
}

/** Clone-and-restore tint over every `MeshStandardMaterial` in a scene, no name filter. */
function tintEntireScene(
  scene: THREE.Object3D,
  apply: (m: THREE.MeshStandardMaterial) => void,
): () => void {
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
    originals.set(mesh, mesh.material);
    const clone = mesh.material.clone();
    apply(clone);
    mesh.material = clone;
  });
  return () => {
    for (const [mesh, original] of originals) {
      const current = mesh.material;
      if (!Array.isArray(current) && current !== original) current.dispose();
      mesh.material = original;
    }
  };
}

/**
 * Tints an entire discipline GLB (hvac.glb, electrical.glb, …) as "renewed
 * equipment" — every material in that file belongs to the one discipline the
 * file represents, so unlike the fabric there is no group to filter by name.
 */
export function EquipmentRetrofitTint({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    return tintEntireScene(scene, (m) => {
      m.color.lerp(new THREE.Color(RENEWED_EQUIPMENT_COLOR), 0.65);
      m.metalness = Math.max(m.metalness, 0.45);
      m.roughness = Math.min(m.roughness, 0.35);
      m.emissive.set(PROPOSAL_EMISSIVE);
      m.emissiveIntensity = 0.15;
    });
  }, [scene]);
  return null;
}

/** An instanced array of tilted PV panels, shared by both roof sources below. */
function usePvPanelMesh(face: FaceSetAnalysis | null, solarInstalled: boolean) {
  const panels = useMemo(
    () => (solarInstalled && face ? panelLayoutForRoof(face) : null),
    [solarInstalled, face],
  );
  const panelMesh = useMemo(() => {
    if (!panels || panels.instances.length === 0) return null;
    const geo = new THREE.BoxGeometry(PANEL_W, 0.06, 1.1);
    const mat = new THREE.MeshStandardMaterial({
      color: "#1e3a5f",
      metalness: 0.6,
      roughness: 0.25,
      emissive: new THREE.Color(PROPOSAL_EMISSIVE),
      emissiveIntensity: 0.12,
    });
    const im = new THREE.InstancedMesh(geo, mat, panels.instances.length);
    im.name = "reference-retrofit-pv-array";
    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    panels.instances.forEach((inst, i) => {
      quat.set(...inst.quaternion);
      m4.compose(new THREE.Vector3(inst.x, inst.y, inst.z), quat, scale);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [panels]);
  useEffect(() => {
    return () => {
      if (!panelMesh) return;
      panelMesh.geometry.dispose();
      (panelMesh.material as THREE.Material).dispose();
    };
  }, [panelMesh]);
  return panelMesh;
}

function findMeshByMaterialName(scene: THREE.Object3D, materialName: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  scene.traverse((obj) => {
    if (found) return;
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material?.name === materialName) {
      found = mesh;
    }
  });
  return found;
}

/**
 * Roof + PV where this building keeps its roof covering as its own dedicated
 * discipline GLB (Schependomlaan's `roofing.glb`) — that file IS the whole
 * roof already, so it is tinted in place exactly like wall/glazing, with no
 * elevation split needed.
 */
function RoofingLayerRetrofitVisual({
  roofingUrl,
  visual,
  centre,
}: {
  roofingUrl: string;
  visual: RetrofitVisualState;
  centre: THREE.Vector3;
}) {
  const { scene } = useGLTF(roofingUrl);

  useEffect(() => {
    if (!visual.roofUpgraded) return;
    return tintEntireScene(scene, (m) => {
      m.color.set(RENEWED_ROOF_COLOR);
      m.roughness = 0.5;
      m.emissive.set(PROPOSAL_EMISSIVE);
      m.emissiveIntensity = PROPOSAL_EMISSIVE_INTENSITY;
    });
  }, [scene, visual.roofUpgraded]);

  const face = useMemo<FaceSetAnalysis | null>(() => {
    if (!visual.solarInstalled) return null;
    let found: FaceSetAnalysis | null = null;
    scene.traverse((obj) => {
      if (found) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.attributes.position?.array;
      const idx = mesh.geometry.index?.array;
      if (!pos || !idx) return;
      found = analyzeUpwardFaces(pos, idx);
    });
    return found;
  }, [scene, visual.solarInstalled]);

  const panelMesh = usePvPanelMesh(face, visual.solarInstalled);

  return (
    <group position={[-centre.x, -centre.y, -centre.z]}>
      {panelMesh ? <primitive object={panelMesh} /> : null}
    </group>
  );
}

/**
 * Roof + PV where the roof is merged into the fabric's own "slab" bucket
 * alongside every floor plate (the Clinic's IfcRoof elements). Reuses the
 * SAME cached `useGLTF(fabricUrl)` scene `Fabric` already loaded — no extra
 * fetch — and splits it by `roofElevationThresholdM`. The roof-only
 * triangles are drawn as a NEW overlay mesh with `polygonOffset` so it wins
 * the depth test against the untouched slab mesh underneath, rather than
 * re-tinting the whole bucket (which would also paint every floor plate
 * green — see `roofElevationThresholdM`'s own doc comment for why a single
 * elevation line cannot always tell the two apart, and what this deliberately
 * gives up to stay safe).
 */
function FabricSlabRetrofitVisual({
  fabricUrl,
  roofs,
  storeys,
  visual,
  centre,
}: {
  fabricUrl: string;
  roofs: ReferenceBuildingManifest["roofs"];
  storeys: ReferenceBuildingManifest["storeys"];
  visual: RetrofitVisualState;
  centre: THREE.Vector3;
}) {
  const { scene } = useGLTF(fabricUrl);

  const roofTriangles = useMemo(() => {
    const threshold = roofElevationThresholdM(roofs, storeys);
    if (threshold === null) return null;
    const slabMesh = findMeshByMaterialName(scene, "slab");
    if (!slabMesh) return null;
    const pos = slabMesh.geometry.attributes.position?.array as Float32Array | undefined;
    const nrm = slabMesh.geometry.attributes.normal?.array as Float32Array | undefined;
    const idx = slabMesh.geometry.index?.array;
    if (!pos || !nrm || !idx) return null;
    const { above } = splitTrianglesByElevation(pos, idx, threshold);
    if (above.length === 0) return null;
    return { pos, nrm, above };
  }, [scene, roofs, storeys]);

  const face = useMemo<FaceSetAnalysis | null>(() => {
    if (!roofTriangles) return null;
    return analyzeUpwardFaces(roofTriangles.pos, roofTriangles.above);
  }, [roofTriangles]);

  const overlay = useMemo(() => {
    if (!visual.roofUpgraded || !roofTriangles) return null;
    const { pos, nrm, above } = roofTriangles;
    const overlayGeo = new THREE.BufferGeometry();
    overlayGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    overlayGeo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    overlayGeo.setIndex(
      above.length > 65535 ? new THREE.Uint32BufferAttribute(above, 1) : new THREE.Uint16BufferAttribute(above, 1),
    );
    const material = new THREE.MeshStandardMaterial({
      color: RENEWED_ROOF_COLOR,
      roughness: 0.5,
      emissive: new THREE.Color(PROPOSAL_EMISSIVE),
      emissiveIntensity: PROPOSAL_EMISSIVE_INTENSITY,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(overlayGeo, material);
    mesh.name = "roof-retrofit-overlay";
    return mesh;
  }, [visual.roofUpgraded, roofTriangles]);

  useEffect(() => {
    return () => {
      if (!overlay) return;
      overlay.geometry.dispose();
      (overlay.material as THREE.Material).dispose();
    };
  }, [overlay]);

  const panelMesh = usePvPanelMesh(face, visual.solarInstalled);

  return (
    <group position={[-centre.x, -centre.y, -centre.z]}>
      {overlay ? <primitive object={overlay} /> : null}
      {panelMesh ? <primitive object={panelMesh} /> : null}
    </group>
  );
}

/**
 * Picks which of the two roof sources above applies to THIS building and
 * mounts only that one, in its own Suspense boundary — each inner component
 * calls `useGLTF` unconditionally on a URL known good for it, so neither ever
 * requests an empty or invalid path. Renders nothing when no roof/PV measure
 * is selected, and nothing (after the fact) when the chosen source turns out
 * to carry no analysable roof geometry.
 */
export function RoofRetrofitVisualBoundary({
  fabricUrl,
  roofingUrl,
  roofs,
  storeys,
  visual,
  centre,
}: {
  fabricUrl: string;
  /** URL of a dedicated "roofing" service layer GLB, or null when this building has none. */
  roofingUrl: string | null;
  roofs: ReferenceBuildingManifest["roofs"];
  storeys: ReferenceBuildingManifest["storeys"];
  visual: RetrofitVisualState;
  centre: THREE.Vector3;
}) {
  if (!visual.roofUpgraded && !visual.solarInstalled) return null;
  return (
    <Suspense fallback={null}>
      {roofingUrl ? (
        <RoofingLayerRetrofitVisual roofingUrl={roofingUrl} visual={visual} centre={centre} />
      ) : (
        <FabricSlabRetrofitVisual fabricUrl={fabricUrl} roofs={roofs} storeys={storeys} visual={visual} centre={centre} />
      )}
    </Suspense>
  );
}

/** Blends a flow line's resting colour toward the shared "proposed" accent. */
export function blendFlowColourTowardProposal(hex: string, amount = 0.55): string {
  return `#${new THREE.Color(hex).lerp(new THREE.Color(PROPOSAL_EMISSIVE), amount).getHexString()}`;
}

/**
 * The canvas's own caption: what is shown as proposed, under which
 * selection, and — for the two categories the engine cannot yet price
 * (`retrofit-delta.ts`'s `pricedByEngine` is false for LED and PV; see the
 * cross-lane note this was written against) — that the picture moves without
 * the energy grade moving.
 */
export function RetrofitLegend({
  selectedMeasureIds,
  visual,
  hvacReach,
  lightingReach,
  roofGeometryAvailable,
  isKo,
}: {
  selectedMeasureIds: readonly string[] | null;
  visual: RetrofitVisualState;
  hvacReach: EquipmentReach;
  lightingReach: EquipmentReach;
  roofGeometryAvailable: boolean;
  isKo: boolean;
}) {
  const lines = buildRetrofitLegendLines({
    selectedMeasureIds,
    visual,
    hvacReach,
    lightingReach,
    roofGeometryAvailable,
  });
  if (lines.length === 0) return null;
  return (
    <div
      data-testid="reference-retrofit-legend"
      className="pointer-events-none absolute bottom-3 right-3 z-20 max-w-[19rem] rounded-md border border-emerald-500/40 bg-emerald-950/80 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-emerald-200 shadow-sm backdrop-blur"
    >
      {lines.map((line) => (
        <p key={line.key}>{isKo ? line.ko : line.en}</p>
      ))}
    </div>
  );
}
