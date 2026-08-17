// src/lib/layers/analysis/zone-overlay.ts
//
// 에너지존 (Energy zones) analysis overlay — snapshot Room elements grouped by
// program, one zone per (level × program), drawn as translucent extruded room
// volumes and shaded by a demand proxy.
//
// ── Intensity formula (추정 / estimated) ───────────────────────────────────
//
//   zoneAreaSqm        = Σ areaM2 of the rooms in the zone            (snapshot)
//   totalZoneAreaSqm   = Σ zoneAreaSqm over every zone                (snapshot)
//   zoneAreaShare      = zoneAreaSqm ÷ totalZoneAreaSqm
//   zoneDemandKwhYr    = zoneAreaShare × hvacDemandKwhYr              (physics)
//   zoneIntensityKwhM2 = zoneDemandKwhYr ÷ zoneAreaSqm
//
// `hvacDemandKwhYr` is `AnnualDemand.totalDemand` — the heating + cooling site
// demand the degree-day engine produced. The apportionment is UNIFORM: zones
// differ by floor area only. Per-program intensity factors (an office bay vs a
// server room) are not modelled anywhere in this codebase, so weighting by
// program here would invent a number. That is why every zone's
// `intensityKwhPerSqm` comes out equal to the building's own HVAC intensity,
// and why the colour banding ranks zones by demand (i.e. by area) rather than
// by intensity. Callers must label the readout 추정 / estimated.
//
// Pure module: no React, no store access. Deterministic for a given input.

import * as THREE from "three";
import type { BimLevel, BimModelSnapshot } from "@/lib/bim/model/types";
import {
  analysisBandColor,
  analysisBandIndex,
  overlayMaterial,
  ZONE_OVERLAY_GROUP,
} from "./overlay-types";

const ROOM_CATEGORY = "Rooms";

/** Fraction of the storey height a zone volume occupies, leaving a visual gap. */
const ZONE_HEIGHT_FRACTION = 0.8;

const ZONE_OPACITY = 0.3;

/** SpaceType → Korean label. Keys are the `SpaceType` enum in building-spec.ts. */
export const SPACE_TYPE_LABELS_KO: Record<string, string> = {
  "office-open": "개방형 사무공간",
  "office-cellular": "개별 사무실",
  meeting: "회의실",
  lobby: "로비",
  reception: "접수",
  corridor: "복도",
  restroom: "화장실",
  pantry: "탕비실",
  storage: "창고",
  mechanical: "기계실",
  electrical: "전기실",
  laboratory: "실험실",
  classroom: "강의실",
  retail: "판매시설",
  "residential-unit": "주거 세대",
  atrium: "아트리움",
  circulation: "동선",
  service: "서비스",
};

export interface ZoneRoom {
  id: string;
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  areaSqm: number;
}

export interface EnergyZone {
  /** `${levelId}::${programKey}` — stable within a snapshot. */
  key: string;
  /** programId when the room carries one, else its spaceType, else "unassigned". */
  programKey: string;
  labelKo: string;
  labelEn: string;
  levelId: string | null;
  floorNo: number;
  elevationM: number;
  storeyHeightM: number;
  rooms: ZoneRoom[];
  areaSqm: number;
  /** zoneAreaSqm ÷ totalZoneAreaSqm, 0..1. */
  areaShare: number;
  /** areaShare × hvacDemandKwhYr — 추정. */
  demandKwhPerYear: number;
  /** demandKwhPerYear ÷ areaSqm — 추정. */
  intensityKwhPerSqm: number;
  /** 0..4, monotone in demandKwhPerYear. */
  bandIndex: number;
  color: string;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** True when the snapshot carries Room elements the zone overlay can group. */
export function hasRoomElements(snapshot: BimModelSnapshot | null | undefined): boolean {
  return !!snapshot && snapshot.elements.some((el) => el.category === ROOM_CATEGORY);
}

/**
 * Group Room elements into (level × program) zones and apportion the building's
 * HVAC demand across them by floor-area share.
 *
 * @param snapshot         BIM snapshot holding the Room elements.
 * @param hvacDemandKwhYr  `AnnualDemand.totalDemand` — heating + cooling, kWh/yr.
 */
export function buildEnergyZones(
  snapshot: BimModelSnapshot,
  hvacDemandKwhYr: number,
): EnergyZone[] {
  const levels = new Map<string, BimLevel>(snapshot.levels.map((l) => [l.id, l]));
  const byKey = new Map<string, EnergyZone>();

  for (const el of snapshot.elements) {
    if (el.category !== ROOM_CATEGORY) continue;
    const level = el.levelId ? levels.get(el.levelId) : undefined;
    if (!level) continue;

    const spaceType = str(el.instanceParameters.spaceType);
    const programKey = str(el.instanceParameters.programId) ?? spaceType ?? "unassigned";
    const key = `${level.id}::${programKey}`;

    const widthM = num(el.instanceParameters.widthM);
    const depthM = num(el.instanceParameters.depthM);
    const areaSqm = num(el.instanceParameters.areaM2, widthM * depthM);

    let zone = byKey.get(key);
    if (!zone) {
      const name = str(el.instanceParameters.name);
      zone = {
        key,
        programKey,
        labelKo:
          (spaceType ? SPACE_TYPE_LABELS_KO[spaceType] : undefined) ??
          name ??
          programKey,
        labelEn: name ?? spaceType ?? programKey,
        levelId: level.id,
        floorNo: level.floorNo,
        elevationM: level.elevation,
        storeyHeightM: level.height,
        rooms: [],
        areaSqm: 0,
        areaShare: 0,
        demandKwhPerYear: 0,
        intensityKwhPerSqm: 0,
        bandIndex: 0,
        color: analysisBandColor(0),
      };
      byKey.set(key, zone);
    }

    zone.rooms.push({
      id: el.id,
      x: el.placement.x,
      z: el.placement.z,
      widthM,
      depthM,
      areaSqm,
    });
    zone.areaSqm += areaSqm;
  }

  const zones = [...byKey.values()].sort(
    (a, b) => a.floorNo - b.floorNo || (a.programKey < b.programKey ? -1 : a.programKey > b.programKey ? 1 : 0),
  );

  const totalArea = zones.reduce((sum, z) => sum + z.areaSqm, 0);
  const demand = Number.isFinite(hvacDemandKwhYr) && hvacDemandKwhYr > 0 ? hvacDemandKwhYr : 0;
  const maxDemand = totalArea > 0
    ? zones.reduce((max, z) => Math.max(max, (z.areaSqm / totalArea) * demand), 0)
    : 0;

  for (const zone of zones) {
    zone.areaShare = totalArea > 0 ? zone.areaSqm / totalArea : 0;
    zone.demandKwhPerYear = zone.areaShare * demand;
    zone.intensityKwhPerSqm =
      zone.areaSqm > 0 ? zone.demandKwhPerYear / zone.areaSqm : 0;
    const fraction = maxDemand > 0 ? zone.demandKwhPerYear / maxDemand : 0;
    zone.bandIndex = analysisBandIndex(fraction);
    zone.color = analysisBandColor(fraction);
  }

  return zones;
}

/* ------------------------------------------------------------------ */
/* Legend                                                              */
/* ------------------------------------------------------------------ */

export interface ZoneProgramSummary {
  programKey: string;
  labelKo: string;
  labelEn: string;
  /** Zones (level × program) rolled into this program. */
  zoneCount: number;
  roomCount: number;
  areaSqm: number;
  demandKwhPerYear: number;
  color: string;
}

/**
 * Roll zones up to one row per program for the legend. The colour is the band
 * of the program's own share of the largest program — the same ramp the
 * geometry uses, applied at the rolled-up level.
 */
export function summariseZonesByProgram(
  zones: readonly EnergyZone[],
): ZoneProgramSummary[] {
  const byProgram = new Map<string, ZoneProgramSummary>();
  for (const zone of zones) {
    let row = byProgram.get(zone.programKey);
    if (!row) {
      row = {
        programKey: zone.programKey,
        labelKo: zone.labelKo,
        labelEn: zone.labelEn,
        zoneCount: 0,
        roomCount: 0,
        areaSqm: 0,
        demandKwhPerYear: 0,
        color: analysisBandColor(0),
      };
      byProgram.set(zone.programKey, row);
    }
    row.zoneCount += 1;
    row.roomCount += zone.rooms.length;
    row.areaSqm += zone.areaSqm;
    row.demandKwhPerYear += zone.demandKwhPerYear;
  }

  const rows = [...byProgram.values()].sort(
    (a, b) => b.demandKwhPerYear - a.demandKwhPerYear || (a.programKey < b.programKey ? -1 : 1),
  );
  const max = rows.reduce((m, r) => Math.max(m, r.demandKwhPerYear), 0);
  for (const row of rows) {
    row.color = analysisBandColor(max > 0 ? row.demandKwhPerYear / max : 0);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the 에너지존 overlay group — one InstancedMesh per zone, one instance
 * per room, so a zone is a single draw call and keeps a single colour.
 */
export function buildZoneOverlay(zones: readonly EnergyZone[]): THREE.Group {
  const group = new THREE.Group();
  group.name = ZONE_OVERLAY_GROUP;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (const zone of zones) {
    const rooms = zone.rooms.filter((r) => r.widthM > 0 && r.depthM > 0);
    if (rooms.length === 0) continue;

    const height = Math.max(zone.storeyHeightM * ZONE_HEIGHT_FRACTION, 0.05);
    const material = overlayMaterial(zone.color, ZONE_OPACITY);
    // Interior volumes: x-ray through the facade rather than hide behind it.
    material.depthTest = false;

    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      material,
      rooms.length,
    );
    mesh.name = `energy-zone:${zone.key}`;
    mesh.renderOrder = 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    rooms.forEach((room, i) => {
      position.set(room.x, zone.elevationM + height / 2, room.z);
      scale.set(room.widthM, height, room.depthM);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData = {
      type: "analysis-energy-zone",
      zoneKey: zone.key,
      programKey: zone.programKey,
      demandKwhPerYear: zone.demandKwhPerYear,
    };
    group.add(mesh);
  }

  return group;
}
