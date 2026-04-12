// src/lib/layers/mep-equipment-params.ts
// MepEquipmentParams type system for procedural MEP equipment generators.
// All downstream plans (28-02 through 28-05) import from this file.

export interface ChillerParams {
  bodyWidth: number;            // default: 2.4
  bodyDepth: number;            // default: 1.8
  bodyHeight: number;           // default: 1.5
  showCoolingTower: boolean;    // default: false (era < 1990 = no cooling tower)
  pipeStubRadius: number;       // default: 0.12
}

export interface BoilerParams {
  radius: number;               // default: 0.5
  height: number;               // default: 1.8
  flueRadius: number;           // default: 0.12
  flueHeight: number;           // default: 0.8
  vrfHeads: boolean;            // default: true (2010+ buildings have VRF heads)
  vrfHeadsPerFloor: number;     // default: 2
  vrfLocation: "roof" | "perimeter"; // default: "roof" (Open Question 1 resolved)
}

export interface AhuParams {
  width: number;                // default: 1.2
  height: number;               // default: 0.8
  depth: number;                // default: 0.8
  showDuctStubs: boolean;       // default: true
  showFanFace: boolean;         // default: true
  unitsPerFloor: number;        // default: 1
}

export interface DhwParams {
  tankRadius: number;           // default: 0.6
  tankHeight: number;           // default: 1.8
  showPump: boolean;            // default: true
  showInsulationJacket: boolean; // default: false (visual noise)
}

export interface LightingFixtureParams {
  width: number;                // default: 0.6
  depth: number;                // default: 0.3
  height: number;               // default: 0.10 (was 0.02 — too flat to see at distance)
  showDiffuserFace: boolean;    // default: true
}

export interface ElectricalPanelParams {
  width: number;                // default: 0.5
  height: number;               // default: 0.8
  depth: number;                // default: 0.18
  showDoorOutline: boolean;     // default: true
  showBreakerGrid: boolean;     // default: true
}

export interface MepEquipmentParams {
  chiller: ChillerParams;
  boiler: BoilerParams;
  ahu: AhuParams;
  dhw: DhwParams;
  lightingFixture: LightingFixtureParams;
  electricalPanel: ElectricalPanelParams;
}

export const DEFAULT_MEP_EQUIPMENT_PARAMS: MepEquipmentParams = {
  chiller: {
    bodyWidth: 2.4,
    bodyDepth: 1.8,
    bodyHeight: 1.5,
    showCoolingTower: false,
    pipeStubRadius: 0.12,
  },
  boiler: {
    radius: 0.5,
    height: 1.8,
    flueRadius: 0.12,
    flueHeight: 0.8,
    vrfHeads: true,
    vrfHeadsPerFloor: 2,
    vrfLocation: "roof",
  },
  ahu: {
    width: 1.2,
    height: 0.8,
    depth: 0.8,
    showDuctStubs: true,
    showFanFace: true,
    unitsPerFloor: 1,
  },
  dhw: {
    tankRadius: 0.6,
    tankHeight: 1.8,
    showPump: true,
    showInsulationJacket: false,
  },
  lightingFixture: {
    width: 0.6,
    depth: 0.3,
    height: 0.10,
    showDiffuserFace: true,
  },
  electricalPanel: {
    width: 0.5,
    height: 0.8,
    depth: 0.18,
    showDoorOutline: true,
    showBreakerGrid: true,
  },
};
