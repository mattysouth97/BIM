// Unit tests for the 에너지존 analysis overlay builders.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { BimElement, BimModelSnapshot } from "@/lib/bim/model/types";
import {
  buildEnergyZones,
  buildZoneOverlay,
  hasRoomElements,
  summariseZonesByProgram,
  SPACE_TYPE_LABELS_KO,
  ZONE_RESULT_SEMANTICS,
  zoneRoomInstanceId,
} from "../analysis/zone-overlay";

const HVAC_KWH = 120_000;

function room(input: {
  id: string;
  levelId: string;
  programId: string;
  spaceType: string;
  name: string;
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  canonicalZoneId?: string;
}): BimElement {
  return {
    id: input.id,
    origin: "generated",
    kind: "room",
    category: "Rooms",
    family: "Room",
    typeId: "generated-room",
    buildingPk: "GEN-0001",
    levelId: input.levelId,
    hostId: null,
    mark: input.id,
    instanceParameters: {
      name: input.name,
      spaceType: input.spaceType,
      programId: input.programId,
      areaM2: input.widthM * input.depthM,
      widthM: input.widthM,
      depthM: input.depthM,
      ...(input.canonicalZoneId
        ? { canonicalZoneId: input.canonicalZoneId }
        : {}),
    },
    placement: { x: input.x, y: 0, z: input.z, rotationY: 0 },
    phaseCreated: "new",
    visible: true,
  } as BimElement;
}

function makeSnapshot(overrides: Partial<BimModelSnapshot> = {}): BimModelSnapshot {
  return {
    buildingPk: "GEN-0001",
    levels: [
      { id: "level:1", name: "1F", elevation: 0, height: 4, floorNo: 1, associatedViewId: "v1" },
      { id: "level:2", name: "2F", elevation: 4, height: 3, floorNo: 2, associatedViewId: "v2" },
    ],
    grids: [],
    types: {},
    elements: [
      // 1F: 300 m² office + 100 m² corridor
      room({ id: "R1", levelId: "level:1", programId: "open-office", spaceType: "office-open", name: "Open office", x: -5, z: 0, widthM: 20, depthM: 10 }),
      room({ id: "R2", levelId: "level:1", programId: "open-office", spaceType: "office-open", name: "Open office", x: 10, z: 0, widthM: 10, depthM: 10 }),
      room({ id: "R3", levelId: "level:1", programId: "corridor", spaceType: "corridor", name: "Corridor", x: 0, z: 8, widthM: 20, depthM: 5 }),
      // 2F: 100 m² office
      room({ id: "R4", levelId: "level:2", programId: "open-office", spaceType: "office-open", name: "Open office", x: 0, z: 0, widthM: 10, depthM: 10 }),
      // non-room element must be ignored
      {
        id: "COL-1",
        origin: "generated",
        kind: "column",
        category: "Structural Columns",
        family: "c",
        typeId: "t",
        buildingPk: "GEN-0001",
        levelId: "level:1",
        hostId: null,
        mark: "COL-1",
        instanceParameters: {},
        placement: { x: 0, y: 0, z: 0, rotationY: 0 },
        phaseCreated: "new",
        visible: true,
      } as BimElement,
    ],
    documents: [],
    visibility: {},
    ...overrides,
  };
}

describe("hasRoomElements", () => {
  it("is true only when Room elements exist", () => {
    expect(hasRoomElements(makeSnapshot())).toBe(true);
    expect(hasRoomElements(null)).toBe(false);
    expect(hasRoomElements(makeSnapshot({ elements: [] }))).toBe(false);
  });
});

describe("buildEnergyZones", () => {
  it("groups rooms into one zone per level × program", () => {
    const zones = buildEnergyZones(makeSnapshot(), HVAC_KWH);
    expect(zones.map((z) => z.key)).toEqual([
      "level:1::corridor",
      "level:1::open-office",
      "level:2::open-office",
    ]);
    const office1F = zones.find((z) => z.key === "level:1::open-office")!;
    expect(office1F.rooms).toHaveLength(2);
    expect(office1F.areaSqm).toBeCloseTo(300, 6);
  });

  it("uses canonical zone ids when supplied while preserving fallback grouping", () => {
    const snapshot = makeSnapshot({
      elements: [
        room({ id: "C1", levelId: "level:1", programId: "office", spaceType: "office-open", name: "West", x: -5, z: 0, widthM: 10, depthM: 10, canonicalZoneId: "zone-west" }),
        room({ id: "C2", levelId: "level:1", programId: "office", spaceType: "office-open", name: "Core", x: 5, z: 0, widthM: 10, depthM: 10, canonicalZoneId: "zone-core" }),
        room({ id: "F1", levelId: "level:2", programId: "office", spaceType: "office-open", name: "Fallback", x: 0, z: 0, widthM: 10, depthM: 10 }),
      ],
    });

    const zones = buildEnergyZones(snapshot, HVAC_KWH);
    expect(zones.map((zone) => zone.key)).toEqual([
      "zone-core",
      "zone-west",
      "level:2::office",
    ]);
    expect(zones.find((zone) => zone.key === "zone-west")?.keySource).toBe(
      "canonical_zone_id",
    );
    expect(zones.find((zone) => zone.key === "level:2::office")?.keySource).toBe(
      "level_program_fallback",
    );
  });

  it("apportions demand by floor-area share and leaves intensity uniform", () => {
    const zones = buildEnergyZones(makeSnapshot(), HVAC_KWH);
    const total = zones.reduce((sum, z) => sum + z.areaSqm, 0);
    expect(total).toBeCloseTo(500, 6);

    const shareSum = zones.reduce((sum, z) => sum + z.areaShare, 0);
    expect(shareSum).toBeCloseTo(1, 10);

    const demandSum = zones.reduce((sum, z) => sum + z.demandKwhPerYear, 0);
    expect(demandSum).toBeCloseTo(HVAC_KWH, 6);

    // Uniform apportionment: every zone lands on the building's own intensity.
    const buildingIntensity = HVAC_KWH / 500;
    for (const zone of zones) {
      expect(zone.intensityKwhPerSqm).toBeCloseTo(buildingIntensity, 8);
    }
  });

  it("bands monotonically with zone demand", () => {
    const zones = [...buildEnergyZones(makeSnapshot(), HVAC_KWH)].sort(
      (a, b) => a.demandKwhPerYear - b.demandKwhPerYear,
    );
    for (let i = 1; i < zones.length; i += 1) {
      expect(zones[i].bandIndex).toBeGreaterThanOrEqual(zones[i - 1].bandIndex);
    }
    // The largest zone tops the ramp.
    expect(zones[zones.length - 1].bandIndex).toBe(4);
  });

  it("uses the catalog's Korean label for a known space type", () => {
    const zones = buildEnergyZones(makeSnapshot(), HVAC_KWH);
    const corridor = zones.find((z) => z.programKey === "corridor")!;
    expect(corridor.labelKo).toBe(SPACE_TYPE_LABELS_KO.corridor);
    expect(corridor.labelEn).toBe("Corridor");
  });

  it("skips rooms whose level cannot be resolved", () => {
    const snapshot = makeSnapshot();
    snapshot.elements[0].levelId = "level:99";
    const zones = buildEnergyZones(snapshot, HVAC_KWH);
    expect(zones.find((z) => z.key === "level:1::open-office")!.rooms).toHaveLength(1);
  });

  it("produces zero demand rather than NaN when the physics has none", () => {
    const zones = buildEnergyZones(makeSnapshot(), 0);
    for (const zone of zones) {
      expect(zone.demandKwhPerYear).toBe(0);
      expect(zone.intensityKwhPerSqm).toBe(0);
      expect(zone.bandIndex).toBe(0);
    }
  });

  it("is deterministic", () => {
    expect(buildEnergyZones(makeSnapshot(), HVAC_KWH)).toEqual(
      buildEnergyZones(makeSnapshot(), HVAC_KWH),
    );
  });
});

describe("summariseZonesByProgram", () => {
  it("rolls level zones up to one row per program, largest first", () => {
    const rows = summariseZonesByProgram(buildEnergyZones(makeSnapshot(), HVAC_KWH));
    expect(rows.map((r) => r.programKey)).toEqual(["open-office", "corridor"]);
    const office = rows[0];
    expect(office.zoneCount).toBe(2);
    expect(office.roomCount).toBe(3);
    expect(office.areaSqm).toBeCloseTo(400, 6);
    expect(office.demandKwhPerYear).toBeCloseTo(HVAC_KWH * 0.8, 6);
  });
});

describe("buildZoneOverlay", () => {
  const zones = buildEnergyZones(makeSnapshot(), HVAC_KWH);

  it("emits one instanced mesh per zone with one instance per room", () => {
    const group = buildZoneOverlay(zones);
    expect(group.children).toHaveLength(zones.length);
    for (const zone of zones) {
      const mesh = group.getObjectByName(`energy-zone:${zone.key}`) as THREE.InstancedMesh;
      expect(mesh.count).toBe(zone.rooms.length);
    }
  });

  it("exposes stable room instance ids and explicit result semantics", () => {
    const group = buildZoneOverlay(zones);
    const zone = zones.find((candidate) => candidate.rooms.length > 1)!;
    const mesh = group.getObjectByName(
      `energy-zone:${zone.key}`,
    ) as THREE.InstancedMesh;

    expect(mesh.userData.roomIdsByInstance).toEqual(
      zone.rooms.map((roomValue) => roomValue.id),
    );
    expect(mesh.userData.roomInstanceIdsByInstance).toEqual(
      zone.rooms.map((roomValue) =>
        zoneRoomInstanceId(zone.key, roomValue.id),
      ),
    );
    expect(mesh.userData.resultSemantics).toEqual(ZONE_RESULT_SEMANTICS);
    expect(mesh.userData.resultSemantics.unit).toBe("kWh/year");
    expect(mesh.userData.resultSemantics.evidenceStatus).toBe("inferred");
  });

  it("distinguishes a selected zone by wireframe, scale, and peer opacity", () => {
    const selectedZone = zones[1];
    const defaultGroup = buildZoneOverlay(zones);
    const selectedGroup = buildZoneOverlay(zones, {
      selectedZoneKey: selectedZone.key,
    });
    const defaultMesh = defaultGroup.getObjectByName(
      `energy-zone:${selectedZone.key}`,
    ) as THREE.InstancedMesh;
    const selectedMesh = selectedGroup.getObjectByName(
      `energy-zone:${selectedZone.key}`,
    ) as THREE.InstancedMesh;
    const peerMesh = selectedGroup.children.find(
      (child) => child.name !== selectedMesh.name,
    ) as THREE.InstancedMesh;
    const defaultScale = new THREE.Vector3();
    const selectedScale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    defaultMesh.getMatrixAt(0, matrix);
    defaultScale.setFromMatrixScale(matrix);
    selectedMesh.getMatrixAt(0, matrix);
    selectedScale.setFromMatrixScale(matrix);

    expect((selectedMesh.material as THREE.MeshBasicMaterial).wireframe).toBe(true);
    expect((selectedMesh.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(
      (peerMesh.material as THREE.MeshBasicMaterial).opacity,
    );
    expect(selectedScale.x).toBeGreaterThan(defaultScale.x);
    expect(selectedMesh.userData.selected).toBe(true);
    expect(peerMesh.userData.selectionStyle).toBe("dimmed_peer");
  });

  it("highlights every canonical zone linked to a selected result series", () => {
    const selected = zones.slice(0, 2);
    const group = buildZoneOverlay(zones, {
      selectedZoneKeys: selected.map((zone) => zone.key),
    });

    for (const zone of selected) {
      expect(
        group.getObjectByName(`energy-zone:${zone.key}`)?.userData.selected,
      ).toBe(true);
    }
    const peer = zones.find(
      (zone) => !selected.some((candidate) => candidate.key === zone.key),
    );
    expect(
      group.getObjectByName(`energy-zone:${peer?.key}`)?.userData.selectionStyle,
    ).toBe("dimmed_peer");
  });

  it("sits each zone volume on its level", () => {
    const group = buildZoneOverlay(zones);
    const mesh = group.getObjectByName("energy-zone:level:2::open-office") as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    // level:2 elevation 4, storey 3 m, volume height 0.8 × 3 = 2.4 → centre 5.2.
    expect(position.y).toBeCloseTo(5.2, 6);
  });

  it("skips zones whose rooms have no plan extent", () => {
    const snapshot = makeSnapshot({
      elements: [
        room({ id: "R0", levelId: "level:1", programId: "p", spaceType: "storage", name: "S", x: 0, z: 0, widthM: 0, depthM: 0 }),
      ],
    });
    expect(buildZoneOverlay(buildEnergyZones(snapshot, HVAC_KWH)).children).toHaveLength(0);
  });

  it("is deterministic — two builds produce identical instance matrices", () => {
    const dump = () =>
      buildZoneOverlay(zones).children.map((child) =>
        Array.from((child as THREE.InstancedMesh).instanceMatrix.array),
      );
    expect(dump()).toEqual(dump());
  });
});
