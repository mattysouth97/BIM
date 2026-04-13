// src/lib/ifc/revit-property-map.ts
// Revit-specific IFC property set mappings for material/thermal extraction

import type { ExtractedMaterial } from "./ifc-material-extractor";

export interface PropertyMapping {
  ifcKey: string;
  target: keyof ExtractedMaterial | "uValue" | "thermalConductivity";
  transform?: (raw: unknown) => unknown;
}

/**
 * Revit exports thermal/physical data primarily via standard Pset_* property sets.
 * ThermalTransmittance maps directly to U-value (W/m²K).
 * IsExternal identifies envelope (exterior) elements.
 */
export const REVIT_PROPERTY_SETS: Record<string, PropertyMapping[]> = {
  Pset_WallCommon: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
    { ifcKey: "IsExternal", target: "name" }, // presence flags envelope element
  ],
  Pset_RoofCommon: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
    { ifcKey: "IsExternal", target: "name" },
  ],
  Pset_SlabCommon: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
    { ifcKey: "IsExternal", target: "name" },
  ],
  Pset_WindowCommon: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
  ],
  Pset_DoorWindowGlazingType: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
    {
      ifcKey: "SolarHeatGainTransmittance",
      target: "name", // stored separately; caller extracts raw value
    },
  ],
  Pset_ColumnCommon: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
    { ifcKey: "IsExternal", target: "name" },
  ],
};

/**
 * Apply a Revit property set to produce a partial ExtractedMaterial update.
 *
 * @param propertySet - the Pset name (e.g. "Pset_WallCommon")
 * @param properties  - key/value pairs from the IFC property set
 */
export function mapRevitProperties(
  propertySet: string,
  properties: Record<string, unknown>,
): Partial<ExtractedMaterial> {
  const mappings = REVIT_PROPERTY_SETS[propertySet];
  if (!mappings) return {};

  const result: Partial<ExtractedMaterial> = {};

  for (const mapping of mappings) {
    const raw = properties[mapping.ifcKey];
    if (raw === undefined || raw === null) continue;

    const value = mapping.transform ? mapping.transform(raw) : raw;

    if (mapping.target === "uValue") {
      result.uValue = typeof value === "number" ? value : parseFloat(String(value));
    } else if (mapping.target === "thermalConductivity") {
      result.thermalConductivity = typeof value === "number" ? value : parseFloat(String(value));
    }
    // "name" target is used as a sentinel for IsExternal / other flags —
    // callers inspect the raw properties dict directly for boolean flags.
  }

  return result;
}

/**
 * Returns true if the given Revit property set indicates the element is external (envelope).
 */
export function isRevitExternalElement(properties: Record<string, unknown>): boolean {
  const val = properties["IsExternal"];
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
  if (typeof val === "number") return val === 1;
  return false;
}
