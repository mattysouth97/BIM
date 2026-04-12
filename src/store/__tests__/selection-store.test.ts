import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

// Mock three.js — layers/types imports THREE but we test only plain data
vi.mock("three", () => ({
  default: {},
  Group: class {},
  Mesh: class { isMesh = true; },
  Object3D: class {},
  Vector3: class {},
  BoxGeometry: class {},
  MeshStandardMaterial: class {},
}));

import { useSelectionStore } from "../selection-store";
import type { SelectedEquipmentInfo } from "../selection-store";
import type { EquipmentSpec } from "@/lib/energy/equipment-specs";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockSpec: EquipmentSpec = {
  categoryKo: "냉방기",
  categoryEn: "Cooling System",
  capacity: "15 kW",
  installYear: 2022,
  annualKwh: 12500,
  efficiencyGrade: 1,
  efficiencyGradeLabel: "1등급 (우수)",
  gradeColor: "#16a34a",
  dataSource: "estimated-from-era",
  standardRef: "KS B 6364",
};

const mockEquipmentInfo: SelectedEquipmentInfo = {
  equipmentId: "mep-hvac-floor-2-cooling-branch",
  subLayerId: "mep-hvac",
  componentType: "cooling-branch",
  floorNo: 2,
  specs: mockSpec,
};

// ---------------------------------------------------------------------------
// Reset before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  useSelectionStore.setState({
    selectedType: null,
    selectedId: null,
    buildingPk: null,
    selectedEquipment: null,
  });
});

// ---------------------------------------------------------------------------
// Test 1: Initial state
// ---------------------------------------------------------------------------

describe("useSelectionStore — initial state", () => {
  it("has selectedEquipment === null by default", () => {
    expect(useSelectionStore.getState().selectedEquipment).toBeNull();
  });

  it("exposes selectEquipment and clearEquipment actions", () => {
    expect(typeof useSelectionStore.getState().selectEquipment).toBe("function");
    expect(typeof useSelectionStore.getState().clearEquipment).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Test 2: selectEquipment sets info without mutating other fields
// ---------------------------------------------------------------------------

describe("useSelectionStore — selectEquipment", () => {
  it("sets selectedEquipment to the passed info (shallow reference equality)", () => {
    useSelectionStore.getState().selectEquipment(mockEquipmentInfo);
    expect(useSelectionStore.getState().selectedEquipment).toBe(mockEquipmentInfo);
  });

  it("does NOT mutate selectedType, selectedId, or buildingPk", () => {
    // Pre-set some existing selection state
    useSelectionStore.setState({
      selectedType: "wall",
      selectedId: "wall-123",
      buildingPk: "building-pk-001",
    });

    useSelectionStore.getState().selectEquipment(mockEquipmentInfo);

    const state = useSelectionStore.getState();
    expect(state.selectedType).toBe("wall");
    expect(state.selectedId).toBe("wall-123");
    expect(state.buildingPk).toBe("building-pk-001");
    expect(state.selectedEquipment).toBe(mockEquipmentInfo);
  });

  it("stores all SelectedEquipmentInfo fields correctly", () => {
    useSelectionStore.getState().selectEquipment(mockEquipmentInfo);
    const info = useSelectionStore.getState().selectedEquipment!;

    expect(info.equipmentId).toBe("mep-hvac-floor-2-cooling-branch");
    expect(info.subLayerId).toBe("mep-hvac");
    expect(info.componentType).toBe("cooling-branch");
    expect(info.floorNo).toBe(2);
    expect(info.specs.efficiencyGrade).toBe(1);
    expect(info.specs.categoryKo).toBe("냉방기");
  });
});

// ---------------------------------------------------------------------------
// Test 3: clearEquipment sets selectedEquipment to null without mutating others
// ---------------------------------------------------------------------------

describe("useSelectionStore — clearEquipment", () => {
  it("sets selectedEquipment back to null", () => {
    useSelectionStore.getState().selectEquipment(mockEquipmentInfo);
    expect(useSelectionStore.getState().selectedEquipment).not.toBeNull();

    useSelectionStore.getState().clearEquipment();
    expect(useSelectionStore.getState().selectedEquipment).toBeNull();
  });

  it("does NOT mutate selectedType, selectedId, or buildingPk when clearing equipment", () => {
    useSelectionStore.setState({
      selectedType: "room",
      selectedId: "room-456",
      buildingPk: "building-pk-002",
      selectedEquipment: mockEquipmentInfo,
    });

    useSelectionStore.getState().clearEquipment();

    const state = useSelectionStore.getState();
    expect(state.selectedType).toBe("room");
    expect(state.selectedId).toBe("room-456");
    expect(state.buildingPk).toBe("building-pk-002");
    expect(state.selectedEquipment).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 4: clearSelection (existing action) also clears selectedEquipment
// ---------------------------------------------------------------------------

describe("useSelectionStore — clearSelection composite clear", () => {
  it("clears selectedType, selectedId, buildingPk AND selectedEquipment", () => {
    useSelectionStore.setState({
      selectedType: "component",
      selectedId: "comp-789",
      buildingPk: "building-pk-003",
      selectedEquipment: mockEquipmentInfo,
    });

    useSelectionStore.getState().clearSelection();

    const state = useSelectionStore.getState();
    expect(state.selectedType).toBeNull();
    expect(state.selectedId).toBeNull();
    expect(state.buildingPk).toBeNull();
    expect(state.selectedEquipment).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Type safety — SelectedEquipmentInfo must not accept THREE.Object3D
// ---------------------------------------------------------------------------

describe("SelectedEquipmentInfo — JSON-serialisable type contract", () => {
  it("SelectedEquipmentInfo fields are all primitive/plain-object types", () => {
    // Verify the shape is plain JSON: string, number, null, nested plain object
    const info = mockEquipmentInfo;
    expect(typeof info.equipmentId).toBe("string");
    expect(typeof info.subLayerId).toBe("string");
    expect(typeof info.componentType).toBe("string");
    expect(typeof info.floorNo === "number" || info.floorNo === null).toBe(true);
    expect(typeof info.specs).toBe("object");
    expect(typeof info.specs.annualKwh).toBe("number");
    expect(typeof info.specs.installYear).toBe("number");
    expect(typeof info.specs.gradeColor).toBe("string");

    // JSON round-trip must succeed (no non-serialisable values)
    const serialised = JSON.stringify(info);
    const parsed = JSON.parse(serialised) as SelectedEquipmentInfo;
    expect(parsed.equipmentId).toBe(info.equipmentId);
    expect(parsed.specs.efficiencyGrade).toBe(info.specs.efficiencyGrade);
  });

  it("TypeScript structurally rejects THREE.Object3D: SelectedEquipmentInfo has no mesh-like fields", () => {
    // Compile-time check: SelectedEquipmentInfo has no 'geometry', 'material',
    // 'isMesh', 'isObject3D', 'position', 'rotation', 'scale' fields.
    // We verify this structurally at runtime by checking the key set.
    const keys = Object.keys(mockEquipmentInfo);
    const threeMeshKeys = ["geometry", "material", "isMesh", "isObject3D", "position", "rotation", "scale", "uuid", "matrixWorld"];
    for (const meshKey of threeMeshKeys) {
      expect(keys).not.toContain(meshKey);
    }
  });
});
