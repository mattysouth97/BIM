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

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
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

/** The roof typology a building's energy inputs state (`ReferenceBuildingEnergyInputs.roof.type`). */
export type StatedRoofType = "flat" | "gable" | "hip" | "sawtooth";
/** Whether an hvac/electrical discipline model exists and is switched on. */
export type EquipmentReach = "tinted" | "layer-off" | "not-modeled";

export interface PvLegendSummary {
  planes: number;
  excludedPlanes: number;
  usableSqm: number;
  grossSqm: number;
  modules: number;
  kWp: number;
  /** Excluded planes by reason, e.g. { "north-facing-pitch": 1 }. */
  reasons: Readonly<Record<string, number>>;
}

const PV_REASON_KO: Record<string, string> = {
  "tilt-above-60": "60° 초과",
  "smaller-than-one-module": "모듈 1장 미만",
  "north-facing-pitch": "북향 경사",
  "no-usable-area-after-setback": "이격·여유거리 적용 후 모듈 배치 불가",
  "outline-shape-not-trustworthy": "외곽선 미확정",
  "outline-area-disagrees-with-stated": "외곽선·면적 불일치",
};

/** The one line the legend states about PV from the layout. */
/** The legend's summary of a layout — one object, so the count on the legend is the layout's. */
export function pvLegendSummaryOf(layout: {
  planes: readonly { excludedReason: string | null }[];
  excludedPlanes: number;
  totalUsableSqm: number;
  totalGrossProjectedSqm: number;
  totalModules: number;
  totalKWp: number;
} | null): PvLegendSummary | null {
  if (!layout) return null;
  const reasons: Record<string, number> = {};
  for (const plane of layout.planes) {
    if (plane.excludedReason) reasons[plane.excludedReason] = (reasons[plane.excludedReason] ?? 0) + 1;
  }
  return {
    planes: layout.planes.length,
    excludedPlanes: layout.excludedPlanes,
    usableSqm: layout.totalUsableSqm,
    grossSqm: layout.totalGrossProjectedSqm,
    modules: layout.totalModules,
    kWp: layout.totalKWp,
    reasons,
  };
}

export function pvLegendLine(pv: PvLegendSummary): RetrofitLegendLine {
  const reasonsKo = Object.entries(pv.reasons)
    .map(([k, n]) => `${PV_REASON_KO[k] ?? k} ${n}면`)
    .join(", ");
  const reasonsEn = Object.entries(pv.reasons)
    .map(([k, n]) => `${n} ${k === "no-usable-area-after-setback" ? "no module fits after setbacks / clearances" : k}`)
    .join(", ");
  return {
    key: "pv-layout",
    ko: `태양광: 지붕 ${pv.planes}면 · 사용 가능 ${pv.usableSqm.toFixed(0)} / ${pv.grossSqm.toFixed(0)} m² · 모듈 ${pv.modules}장 · ${pv.kWp.toFixed(1)} kWp${pv.excludedPlanes > 0 ? ` · 제외 ${pv.excludedPlanes}면 (${reasonsKo})` : ""}`,
    en: `PV: ${pv.planes} roof planes · usable ${pv.usableSqm.toFixed(0)} / ${pv.grossSqm.toFixed(0)} m² · ${pv.modules} modules · ${pv.kWp.toFixed(1)} kWp${pv.excludedPlanes > 0 ? ` · ${pv.excludedPlanes} excluded (${reasonsEn})` : ""}`,
  };
}

export function buildRetrofitLegendLines(args: {
  selectedMeasureIds: readonly string[] | null;
  /**
   * The `제안 미리보기` switch (`RetrofitDeltaStrip`, mounted on this same
   * page inside `EnergyInstrumentHud`) — the gate behind `visual`, which is
   * derived from `useProposalVisualIds()` rather than `selectedMeasureIds`
   * directly. When this is off, `visual` is already all-false regardless of
   * the selection, so the legend says so instead of reading as "nothing is
   * selected".
   */
  previewProposal: boolean;
  visual: RetrofitVisualState;
  hvacReach: EquipmentReach;
  lightingReach: EquipmentReach;
  roofGeometryAvailable: boolean;
  /**
   * The measured-roof layout's totals, when the building has published
   * planes. The legend states them because the picture alone cannot say
   * which planes were refused and why.
   */
  pv?: PvLegendSummary | null;
}): RetrofitLegendLine[] {
  const { selectedMeasureIds, previewProposal, visual, hvacReach, lightingReach, roofGeometryAvailable, pv } = args;

  if (!previewProposal) {
    return [
      {
        key: "preview-off",
        ko: "3D 미리보기가 꺼져 있어 모델은 현재 상태를 보여줍니다. 에너지 패널의 '제안 미리보기'로 켤 수 있습니다.",
        en: "3D preview is off, so the model shows the building as it stands. Turn on \"Preview proposal\" in the energy panel to see it here.",
      },
    ];
  }
  if (selectedMeasureIds === null) {
    return [
      {
        key: "no-scenario",
        ko: "개보수 시나리오가 아직 평가되지 않아 미리보기가 없습니다.",
        en: "No retrofit scenario evaluated yet — nothing to preview.",
      },
    ];
  }
  if (selectedMeasureIds.length === 0) {
    return [
      {
        key: "empty-selection",
        ko: "선택한 공사가 없습니다. 모델 상단 패널에서 공사를 선택할 수 있습니다.",
        en: "No work is selected. Choose work in the panel above the model.",
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

  if (visual.solarInstalled && pv) {
    // The layout is the fact; the two generic lines below are for a building
    // that has published no planes at all.
    lines.push(pvLegendLine(pv));
  } else if (visual.solarInstalled) {
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
}: {
  roofingUrl: string;
  visual: RetrofitVisualState;
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

  // PV is drawn by `PvModulesVisual` from the measured-roof layout, not here.
  return null;
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

  return (
    <group position={[-centre.x, -centre.y, -centre.z]}>
      {overlay ? <primitive object={overlay} /> : null}
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
  // Kept on the signature so the viewer's call site is unchanged; PV placement
  // now reads the measured planes, not a stated typology.
  statedRoofType: _statedRoofType,
}: {
  fabricUrl: string;
  /** URL of a dedicated "roofing" service layer GLB, or null when this building has none. */
  roofingUrl: string | null;
  roofs: ReferenceBuildingManifest["roofs"];
  storeys: ReferenceBuildingManifest["storeys"];
  visual: RetrofitVisualState;
  centre: THREE.Vector3;
  /** `ReferenceBuildingEnergyInputs.roof?.type` — the same fact the PV measure's own name/utilisation factor are built from. Undefined falls back to this module's own geometric tilt. */
  statedRoofType: StatedRoofType | undefined;
}) {
  if (!visual.roofUpgraded && !visual.solarInstalled) return null;
  return (
    <Suspense fallback={null}>
      {roofingUrl ? (
        <RoofingLayerRetrofitVisual roofingUrl={roofingUrl} visual={visual} />
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
  previewProposal,
  visual,
  hvacReach,
  lightingReach,
  roofGeometryAvailable,
  pv,
  isKo,
}: {
  selectedMeasureIds: readonly string[] | null;
  previewProposal: boolean;
  visual: RetrofitVisualState;
  hvacReach: EquipmentReach;
  lightingReach: EquipmentReach;
  roofGeometryAvailable: boolean;
  pv?: PvLegendSummary | null;
  isKo: boolean;
}) {
  // Compact on every screen, without a viewport-dependent hydration change.
  // Keep the user's disclosure choice through view, layer and measure changes.
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const legendRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ bottom: 48, detailsHeight: 200 });
  useEffect(() => {
    const legend = legendRef.current;
    const canvas = legend?.closest<HTMLElement>('[data-testid="reference-model-canvas"]');
    if (!legend || !canvas) return;
    const measure = () => {
      const bounds = canvas.getBoundingClientRect();
      const panelBounds = (position: string) => {
        const panel = canvas.querySelector<HTMLElement>(`[data-twin-panel="${position}"]`);
        const rect = panel?.getBoundingClientRect();
        return rect && rect.height > 0 ? rect : null;
      };
      const topPanel = panelBounds("top");
      const bottomPanel = panelBounds("bottom");
      const top = topPanel ? Math.max(12, topPanel.bottom - bounds.top + 8) : 12;
      const bottom = bottomPanel ? Math.max(12, bounds.bottom - bottomPanel.top + 8) : 12;
      const buttonHeight = legend.querySelector("button")?.getBoundingClientRect().height ?? 44;
      const detailsHeight = Math.max(0, Math.min(224, bounds.height - top - bottom - buttonHeight - 2));
      setInsets((current) => current.bottom === bottom && current.detailsHeight === detailsHeight
        ? current : { bottom, detailsHeight });
    };
    const observed = new Set<Element>();
    const resize = new ResizeObserver(measure);
    const observePanels = () => {
      for (const element of [canvas, legend.querySelector("button"), ...canvas.querySelectorAll("[data-twin-panel]")]) {
        if (element && !observed.has(element)) {
          resize.observe(element);
          observed.add(element);
        }
      }
    };
    observePanels(); // ResizeObserver delivers the initial measurement.
    const changes = new MutationObserver(() => { observePanels(); measure(); });
    changes.observe(canvas, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    return () => { resize.disconnect(); changes.disconnect(); };
  }, []);
  const lines = buildRetrofitLegendLines({
    selectedMeasureIds,
    previewProposal,
    visual,
    hvacReach,
    lightingReach,
    roofGeometryAvailable,
    pv,
  });
  if (lines.length === 0) return null;
  const proposed = lines[0].key === "header";
  const status = proposed
    ? (isKo ? "제안 · 시공 전" : "Proposed · not built")
    : !previewProposal
      ? (isKo ? "현재 모델 · 미리보기 꺼짐" : "Existing model · preview off")
      : selectedMeasureIds === null
        ? (isKo ? "현재 모델 · 제안 평가 전" : "Existing model · no proposal yet")
      : selectedMeasureIds?.length
        ? (isKo ? "현재 모델 · 시각 변화 없음" : "Existing model · no visual change")
        : (isKo ? "현재 모델 · 선택한 공사 없음" : "Existing model · no work selected");
  const action = expanded
    ? (isKo ? "상세 접기" : "Hide details")
    : (isKo ? "상세 보기" : "Show details");
  const countLabel = `${selectedMeasureIds?.length ?? 0}${isKo ? "개 항목" : selectedMeasureIds?.length === 1 ? " measure" : " measures"}`;
  return (
    <div
      ref={legendRef}
      data-testid="reference-retrofit-legend"
      data-pv-modules={visual.solarInstalled && pv ? pv.modules : undefined}
      style={{ bottom: insets.bottom }}
      className="pointer-events-auto absolute right-3 z-20 w-[19rem] max-w-[calc(100%-1.5rem)] rounded-md border border-emerald-500/40 bg-emerald-950/90 font-mono text-[10px] leading-relaxed text-emerald-200 shadow-sm backdrop-blur"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={`${status}${proposed ? ` · ${countLabel}` : ""} — ${action}`}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-emerald-900/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
      >
        <span className="min-w-0 flex-1 text-[11px] font-semibold">{status}</span>
        {proposed && <span className="shrink-0 text-emerald-300">{countLabel}</span>}
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <div
        id={detailsId}
        hidden={!expanded}
        role="region"
        aria-label={isKo ? "제안 미리보기 상세" : "Proposal preview details"}
        tabIndex={0}
        style={{ maxHeight: insets.detailsHeight }}
        className="overflow-y-auto border-t border-emerald-500/30 px-2.5 py-2 focus-visible:outline-2 focus-visible:outline-emerald-300"
      >
        {lines.map((line) => (
          <p key={line.key}>{isKo ? line.ko : line.en}</p>
        ))}
      </div>
    </div>
  );
}
