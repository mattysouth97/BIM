// Figma BIM Family Catalog semantics: IFC mapping, connectors, LOD, Type A/B/C.
// Source: RmCCr8pOFvqq4dzGZTJkFl — 46 KEEP + 56 NEW = 102.

import { getAuthoringFamily, type AuthoringFamily, type AuthoringToolId } from "./family-catalog";

export type FamilyTypeClass = "A" | "B" | "C" | "D";
export type FamilyLod = 1 | 2 | 3;
export type ConnectorSystem =
  | "air"
  | "hydronic"
  | "power"
  | "data"
  | "waste"
  | "gas"
  | "control"
  | "metering";

export interface FamilyConnectorDef {
  id: string;
  system: ConnectorSystem;
  direction: "in" | "out" | "bidirectional";
  sizeMm?: number;
}

export interface FamilySemantics {
  ifcClass: string;
  typeClass: FamilyTypeClass;
  lod: FamilyLod;
  host: string;
  layers?: string[];
  fireRating?: string;
  connectors: FamilyConnectorDef[];
  emsCapable: boolean;
}

const IFC_BY_TOOL: Record<AuthoringToolId, string> = {
  wall: "IfcWall",
  door: "IfcDoor",
  window: "IfcWindow",
  column: "IfcColumn",
  beam: "IfcBeam",
  foundation: "IfcFooting",
  floor: "IfcSlab",
  roof: "IfcRoof",
  ceiling: "IfcCovering",
  stair: "IfcStair",
  railing: "IfcRailing",
  lighting: "IfcLightFixture",
  furniture: "IfcFurniture",
  plumbing: "IfcSanitaryTerminal",
  electrical: "IfcElectricAppliance",
  fire: "IfcAlarm",
  equipment: "IfcUnitaryEquipment",
  planting: "IfcGeographicElement",
  site: "IfcBuildingElementProxy",
};

function ifcFor(family: AuthoringFamily): string {
  if (family.id.includes("curtain-wall")) return "IfcCurtainWall";
  if (family.id.includes("pile-cap") || family.id.startsWith("pile-")) return "IfcPile";
  if (family.id.includes("sliding")) return "IfcDoor";
  if (family.id.includes("rollup")) return "IfcDoor";
  if (family.id === "energy-smart-meter") return "IfcFlowMeter";
  if (family.id.startsWith("bems-") || family.id.includes("sensor")) return "IfcSensor";
  if (family.id === "mep-diffuser") return "IfcAirTerminal";
  if (family.id.includes("ramp")) return "IfcRamp";
  return IFC_BY_TOOL[family.tool];
}

function connectorsFor(family: AuthoringFamily): FamilyConnectorDef[] {
  if (family.id === "energy-smart-meter") {
    return [
      { id: "power", system: "power", direction: "in" },
      { id: "metering", system: "metering", direction: "out" },
      { id: "data", system: "data", direction: "out" },
    ];
  }
  if (family.id.startsWith("bems-") || family.id.includes("sensor") || family.id === "device-thermostat") {
    return [{ id: "data", system: "data", direction: "out" }];
  }
  if (family.tool === "equipment" || family.id.includes("ahu") || family.id === "mep-vav") {
    return [
      { id: "air-in", system: "air", direction: "in" },
      { id: "air-out", system: "air", direction: "out" },
      { id: "power", system: "power", direction: "in" },
    ];
  }
  if (family.id === "mep-pump" || family.id.includes("dhw") || family.id.includes("expansion")) {
    return [
      { id: "hydronic-in", system: "hydronic", direction: "in" },
      { id: "hydronic-out", system: "hydronic", direction: "out" },
      { id: "power", system: "power", direction: "in" },
    ];
  }
  if (family.tool === "plumbing") {
    return [{ id: "waste", system: "waste", direction: "out", sizeMm: 100 }];
  }
  if (family.tool === "lighting" || family.tool === "electrical") {
    return [{ id: "power", system: "power", direction: "in" }];
  }
  if (family.tool === "fire") {
    return [{ id: "control", system: "control", direction: "bidirectional" }];
  }
  return [];
}

export function familySemantics(id: string | null | undefined): FamilySemantics | null {
  const family = getAuthoringFamily(id);
  if (!family) return null;
  const typeClass: FamilyTypeClass =
    family.tool === "equipment" || family.id.startsWith("bems-") || family.id.includes("meter")
      ? "C"
      : family.familyKind === "system"
        ? "A"
        : "B";
  return {
    ifcClass: ifcFor(family),
    typeClass,
    lod: typeClass === "C" ? 3 : 2,
    host: family.host,
    layers: family.id.includes("brick-on-cmu")
      ? ["Finish 1", "Thermal/Air Layer", "Thermal/Air Layer", "Structure", "Finish 2"]
      : family.id.includes("stacked-brick")
        ? ["Brick base", "CMU"]
        : family.tool === "wall"
          ? ["Structure"]
          : undefined,
    fireRating: family.id.includes("fire") ? "FD60" : undefined,
    connectors: connectorsFor(family),
    emsCapable:
      family.id.startsWith("bems-") ||
      family.id.includes("meter") ||
      family.id.includes("sensor") ||
      family.tool === "equipment",
  };
}

export function ifcClassForType(typeId: string): string {
  return familySemantics(typeId)?.ifcClass ?? "IfcBuildingElementProxy";
}
