// src/lib/ifc/archicad-property-map.ts
// ArchiCAD-specific IFC property set mappings for material/thermal extraction

import type { ExtractedMaterial } from "./ifc-material-extractor";

export interface PropertyMapping {
  ifcKey: string;
  target: keyof ExtractedMaterial | "uValue" | "thermalConductivity" | "zoneArea";
  transform?: (raw: unknown) => unknown;
}

/**
 * ArchiCAD uses its own prefixed property sets (AC_Pset_*) in addition to
 * standard IFC Pset_* sets.  Thermal data may appear under both.
 *
 * Notable differences from Revit:
 * - AC_Pset_WallProperties contains "Thermal Transmittance (U-value)" with spaces
 * - Zone area data lives in AC_Pset_ZoneProperties → "Net Area"
 * - Custom sets may carry conductivity under "Thermal Conductivity"
 */
export const ARCHICAD_PROPERTY_SETS: Record<string, PropertyMapping[]> = {
  AC_Pset_WallProperties: [
    { ifcKey: "Thermal Transmittance (U-value)", target: "uValue" },
    { ifcKey: "ThermalTransmittance", target: "uValue" },
    { ifcKey: "Thermal Conductivity", target: "thermalConductivity" },
  ],
  AC_Pset_RoofProperties: [
    { ifcKey: "Thermal Transmittance (U-value)", target: "uValue" },
    { ifcKey: "ThermalTransmittance", target: "uValue" },
  ],
  AC_Pset_SlabProperties: [
    { ifcKey: "Thermal Transmittance (U-value)", target: "uValue" },
    { ifcKey: "ThermalTransmittance", target: "uValue" },
  ],
  AC_Pset_WindowProperties: [
    { ifcKey: "Thermal Transmittance (U-value)", target: "uValue" },
    { ifcKey: "ThermalTransmittance", target: "uValue" },
  ],
  AC_Pset_ZoneProperties: [
    { ifcKey: "Net Area", target: "zoneArea" },
    { ifcKey: "NetPlannedArea", target: "zoneArea" },
  ],
  // Standard IFC sets that ArchiCAD also populates
  Pset_WallCommon: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
  ],
  Pset_WindowCommon: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
  ],
  Pset_RoofCommon: [
    { ifcKey: "ThermalTransmittance", target: "uValue" },
  ],
};

/**
 * Apply an ArchiCAD property set to produce a partial ExtractedMaterial update.
 *
 * @param propertySet - the Pset name (e.g. "AC_Pset_WallProperties")
 * @param properties  - key/value pairs from the IFC property set
 */
export function mapArchicadProperties(
  propertySet: string,
  properties: Record<string, unknown>,
): Partial<ExtractedMaterial> {
  const mappings = ARCHICAD_PROPERTY_SETS[propertySet];
  if (!mappings) return {};

  const result: Partial<ExtractedMaterial> = {};

  for (const mapping of mappings) {
    const raw = properties[mapping.ifcKey];
    if (raw === undefined || raw === null) continue;

    const value = mapping.transform ? mapping.transform(raw) : raw;
    const num = typeof value === "number" ? value : parseFloat(String(value));
    if (isNaN(num)) continue;

    if (mapping.target === "uValue") {
      result.uValue = num;
    } else if (mapping.target === "thermalConductivity") {
      result.thermalConductivity = num;
    }
    // "zoneArea" is consumed by ifc-geometry-extractor, not ExtractedMaterial directly
  }

  return result;
}

/**
 * Extract zone area from ArchiCAD zone property sets.
 * Returns area in m² or null if not found.
 */
export function extractArchicadZoneArea(
  propertySet: string,
  properties: Record<string, unknown>,
): number | null {
  if (propertySet !== "AC_Pset_ZoneProperties") return null;

  for (const key of ["Net Area", "NetPlannedArea"]) {
    const raw = properties[key];
    if (raw !== undefined && raw !== null) {
      const num = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}
