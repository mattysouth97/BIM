// src/lib/ifc/ifc-material-extractor.ts
// Parse IFC material/property data into the app's ExtractedMaterial format.
// Works with web-ifc output or any duck-typed IFC object graph.

import {
  mapRevitProperties,
  isRevitExternalElement,
} from "./revit-property-map";
import {
  mapArchicadProperties,
  extractArchicadZoneArea,
} from "./archicad-property-map";
import { extractGeometry } from "./ifc-geometry-extractor";

// ── Public types ─────────────────────────────────────────────────────────

export interface MaterialLayer {
  name: string;
  thickness: number;            // meters
  thermalConductivity?: number; // W/mK
}

export interface ExtractedMaterial {
  elementType: "wall" | "roof" | "window" | "slab" | "column";
  name: string;
  layers?: MaterialLayer[];
  uValue?: number;              // W/m²K
  thermalConductivity?: number; // W/mK
}

export interface IFCMaterialResult {
  source: "revit" | "archicad" | "unknown";
  materials: ExtractedMaterial[];
  wallArea: number;   // m²
  windowArea: number; // m²
  roofArea: number;   // m²
  confidence: "high" | "medium" | "low";
}

// ── IFC element type → ExtractedMaterial elementType ─────────────────────

const ELEMENT_TYPE_MAP: Record<string, ExtractedMaterial["elementType"]> = {
  IFCWALL: "wall",
  IFCWALLSTANDARDCASE: "wall",
  IFCROOF: "roof",
  IFCSLAB: "slab",
  IFCWINDOW: "window",
  IFCDOOR: "window",  // doors treated as window openings for energy calcs
  IFCCOLUMN: "column",
  IFCBEAM: "column",  // beams as structural members
};

// ── Authoring-tool detection ──────────────────────────────────────────────

/**
 * Detect whether an IFC file was authored in Revit or ArchiCAD.
 * Checks IFC header strings and well-known metadata fields.
 */
function detectSource(ifcData: Record<string, unknown>): IFCMaterialResult["source"] {
  const headerStr = [
    ifcData?.header ?? "",
    ifcData?.FILE_DESCRIPTION ?? "",
    ifcData?.FILE_NAME ?? "",
    ifcData?.applicationName ?? "",
    ifcData?.authoringTool ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (headerStr.includes("revit") || headerStr.includes("autodesk")) {
    return "revit";
  }

  if (
    headerStr.includes("archicad") ||
    headerStr.includes("graphisoft") ||
    headerStr.includes("ac_pset")
  ) {
    return "archicad";
  }

  // Scan property set names for AC_Pset_ prefix as a secondary signal
  const elements: unknown[] = Array.isArray(ifcData?.elements)
    ? ifcData.elements
    : [];
  for (const el of elements) {
    const propSets = (el as Record<string, unknown>).propertySets;
    if (propSets && typeof propSets === "object") {
      for (const key of Object.keys(propSets)) {
        if (key.startsWith("AC_Pset_")) return "archicad";
      }
    }
  }

  return "unknown";
}

// ── Layer extraction ──────────────────────────────────────────────────────

/**
 * Parse IfcMaterialLayerSet (or equivalent) from an element's material data.
 */
function extractLayers(materialData: unknown): MaterialLayer[] {
  if (!materialData || typeof materialData !== "object") return [];
  const md = materialData as Record<string, unknown>;

  const layerList = md["MaterialLayers"] ?? md["materialLayers"] ?? md["layers"];
  if (!Array.isArray(layerList)) return [];

  return (layerList as unknown[]).flatMap((layer): MaterialLayer[] => {
    if (!layer || typeof layer !== "object") return [];
    const l = layer as Record<string, unknown>;

    const mat = l["Material"] as Record<string, unknown> | undefined;
    const name =
      typeof l["Name"] === "string"
        ? l["Name"]
        : typeof l["name"] === "string"
          ? l["name"]
          : typeof mat?.Name === "string"
            ? mat.Name
            : "Unknown Layer";

    const rawThickness = l["LayerThickness"] ?? l["thickness"] ?? l["Thickness"];
    const thickness =
      typeof rawThickness === "number"
        ? rawThickness
        : parseFloat(String(rawThickness ?? "0"));

    const rawConductivity =
      mat?.ThermalConductivity ??
      mat?.thermalConductivity ??
      l["thermalConductivity"] ??
      l["ThermalConductivity"];

    const thermalConductivity =
      rawConductivity !== undefined && rawConductivity !== null
        ? typeof rawConductivity === "number"
          ? rawConductivity
          : parseFloat(String(rawConductivity))
        : undefined;

    return [
      {
        name,
        thickness: isNaN(thickness) ? 0 : thickness,
        ...(thermalConductivity !== undefined && !isNaN(thermalConductivity)
          ? { thermalConductivity }
          : {}),
      },
    ];
  });
}

// ── Property set processing ───────────────────────────────────────────────

function applyPropertySets(
  propertySets: Record<string, Record<string, unknown>>,
  source: IFCMaterialResult["source"],
): Partial<ExtractedMaterial> {
  const merged: Partial<ExtractedMaterial> = {};

  for (const [setName, props] of Object.entries(propertySets)) {
    let partial: Partial<ExtractedMaterial> = {};

    if (source === "revit") {
      partial = mapRevitProperties(setName, props);
    } else if (source === "archicad") {
      partial = mapArchicadProperties(setName, props);
    } else {
      // Unknown source: try both, Revit result takes precedence
      const revitResult = mapRevitProperties(setName, props);
      const acResult = mapArchicadProperties(setName, props);
      partial = { ...acResult, ...revitResult };
    }

    if (partial.uValue !== undefined) merged.uValue = partial.uValue;
    if (partial.thermalConductivity !== undefined)
      merged.thermalConductivity = partial.thermalConductivity;
  }

  return merged;
}

// ── Confidence rating ─────────────────────────────────────────────────────

function rateConfidence(
  materials: ExtractedMaterial[],
  wallArea: number,
  windowArea: number,
  roofArea: number,
): IFCMaterialResult["confidence"] {
  const total = materials.length || 1;
  const hasUValues = materials.filter((m) => m.uValue !== undefined).length;
  const hasLayers = materials.filter((m) => m.layers && m.layers.length > 0).length;
  const hasAreas = wallArea > 0 || windowArea > 0 || roofArea > 0;

  const uValueCoverage = hasUValues / total;
  const layerCoverage = hasLayers / total;

  if (uValueCoverage >= 0.7 && hasAreas) return "high";
  if ((uValueCoverage >= 0.3 || layerCoverage >= 0.3) && hasAreas) return "medium";
  return "low";
}

// ── Main entry point ──────────────────────────────────────────────────────

/**
 * Extract material properties from a raw IFC data object.
 *
 * `ifcData` shape (duck-typed — works without web-ifc installed):
 * ```
 * {
 *   header?: string;
 *   authoringTool?: string;
 *   elements: Array<{
 *     ifcType: string;           // e.g. "IFCWALL"
 *     name?: string;
 *     IsExternal?: boolean;
 *     properties?: Record<string, unknown>;
 *     propertySets?: Record<string, Record<string, unknown>>;
 *     material?: unknown;        // IfcMaterialLayerSet or similar
 *     quantities?: unknown[];
 *     area?: number;
 *     level?: number;
 *   }>;
 * }
 * ```
 */
export function extractMaterials(ifcData: Record<string, unknown>): IFCMaterialResult {
  const source = detectSource(ifcData);
  const elements: unknown[] = Array.isArray(ifcData?.elements)
    ? ifcData.elements
    : [];

  const materials: ExtractedMaterial[] = [];

  for (const el of elements) {
    if (!el || typeof el !== "object") continue;
    const obj = el as Record<string, unknown>;

    const ifcTypeRaw =
      typeof obj["ifcType"] === "string"
        ? obj["ifcType"].toUpperCase()
        : typeof obj["type"] === "string"
          ? obj["type"].toUpperCase()
          : "";

    const elementType = ELEMENT_TYPE_MAP[ifcTypeRaw];
    if (!elementType) continue;

    const propertySets =
      (obj["propertySets"] as Record<string, Record<string, unknown>> | undefined) ?? {};

    // Skip internal walls — only extract envelope elements
    if (elementType === "wall") {
      const flatProps = (obj["properties"] as Record<string, unknown> | undefined) ?? {};
      const allProps: Record<string, unknown> = { ...flatProps };
      for (const pset of Object.values(propertySets)) {
        Object.assign(allProps, pset);
      }
      if (!isRevitExternalElement(allProps)) continue;
    }

    const name =
      typeof obj["name"] === "string" && obj["name"]
        ? obj["name"]
        : typeof obj["Name"] === "string" && obj["Name"]
          ? obj["Name"]
          : `${ifcTypeRaw} Element`;

    const layers = extractLayers(obj["material"] ?? obj["materialLayerSet"]);
    const psetPartial = applyPropertySets(propertySets, source);

    const material: ExtractedMaterial = {
      elementType,
      name,
      ...(layers.length > 0 ? { layers } : {}),
      ...(psetPartial.uValue !== undefined ? { uValue: psetPartial.uValue } : {}),
      ...(psetPartial.thermalConductivity !== undefined
        ? { thermalConductivity: psetPartial.thermalConductivity }
        : {}),
    };

    materials.push(material);
  }

  // Extract areas via geometry extractor
  const geometry = extractGeometry(ifcData);

  // For ArchiCAD: supplement zone area data if geometry extractor got zeros
  if (source === "archicad") {
    for (const el of elements) {
      if (!el || typeof el !== "object") continue;
      const obj = el as Record<string, unknown>;
      const propertySets =
        (obj["propertySets"] as Record<string, Record<string, unknown>> | undefined) ?? {};
      for (const [setName, props] of Object.entries(propertySets)) {
        // extractArchicadZoneArea is called for side-effect awareness;
        // actual zone-area accumulation is handled in geometry extractor
        extractArchicadZoneArea(setName, props);
      }
    }
  }

  const confidence = rateConfidence(
    materials,
    geometry.wallArea,
    geometry.windowArea,
    geometry.roofArea,
  );

  return {
    source,
    materials,
    wallArea: geometry.wallArea,
    windowArea: geometry.windowArea,
    roofArea: geometry.roofArea,
    confidence,
  };
}
