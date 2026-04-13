// src/lib/ifc/ifc-geometry-extractor.ts
// Extract geometric quantities (areas) from raw IFC data structures

/**
 * Area summary extracted from IFC geometry / quantity sets.
 */
export interface IFCGeometryResult {
  wallArea: number;      // m² (external walls only)
  windowArea: number;    // m²
  roofArea: number;      // m²
  floorAreas: { level: number; area: number }[];
}

// ── IFC type-code constants (STEP numeric codes used by web-ifc) ──────────

const IFC_WALL_CODES = new Set([
  "IFCWALL",
  "IFCWALLSTANDARDCASE",
  "IFCWALLTYPE",
]);

const IFC_WINDOW_CODES = new Set([
  "IFCWINDOW",
  "IFCWINDOWTYPE",
  "IFCDOOR",     // doors contribute to glazed opening area in energy models
  "IFCDOORTYPE",
]);

const IFC_ROOF_CODES = new Set([
  "IFCROOF",
  "IFCROOFTYPE",
  "IFCSLAB",     // top-level slabs are often the roof
]);

const IFC_SLAB_CODES = new Set([
  "IFCSLAB",
  "IFCSLABTYPE",
]);

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Safely read a numeric value from a nested IFC quantity/property object.
 * web-ifc returns value objects like { type: 4, value: 12.5 } for REAL numbers.
 */
function numericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // web-ifc STEP value wrapper
    if ("value" in obj && typeof obj.value === "number") return obj.value;
  }
  const parsed = parseFloat(String(raw));
  return isNaN(parsed) ? null : parsed;
}

/**
 * Attempt to read the IFC element type string from a raw element object.
 * Handles both web-ifc IfcLineObject shape and plain duck-typed objects.
 */
function elementTypeOf(el: unknown): string {
  if (!el || typeof el !== "object") return "";
  const obj = el as Record<string, unknown>;

  // web-ifc: element.type is a numeric Express code; web-ifc also exposes
  // a string via the IFC schema lookup, but duck-type callers may set
  // obj.ifcType directly.
  if (typeof obj.ifcType === "string") return obj.ifcType.toUpperCase();
  if (typeof obj.type === "string") return obj.type.toUpperCase();
  return "";
}

/**
 * Check IsExternal flag on element properties / attributes.
 */
function isExternal(el: Record<string, unknown>): boolean {
  // Direct attribute
  const direct = el["IsExternal"] ?? el["isExternal"];
  if (typeof direct === "boolean") return direct;
  if (typeof direct === "string") return direct.toLowerCase() === "true" || direct === "1";
  if (typeof direct === "number") return direct === 1;

  // Nested inside a properties map
  const props = el["properties"] as Record<string, unknown> | undefined;
  if (props) {
    const p = props["IsExternal"] ?? props["isExternal"];
    if (typeof p === "boolean") return p;
    if (typeof p === "string") return p.toLowerCase() === "true" || p === "1";
    if (typeof p === "number") return p === 1;
  }

  // Default: treat unknown as external (conservative for energy modelling)
  return true;
}

/**
 * Sum all net/gross area quantities from a quantity-set array.
 */
function sumAreaFromQuantities(quantities: unknown[]): number {
  let total = 0;
  for (const q of quantities) {
    if (!q || typeof q !== "object") continue;
    const qObj = q as Record<string, unknown>;

    // IfcQuantityArea has AreaValue
    const areaVal = numericValue(qObj["AreaValue"] ?? qObj["areaValue"]);
    if (areaVal !== null && areaVal > 0) {
      total += areaVal;
      continue;
    }

    // Some exporters use LengthValue for individual segment lengths (skip)
    // and NominalValue for simple property values
    const nomVal = numericValue(
      (qObj["NominalValue"] as Record<string, unknown> | undefined)?.["value"] ??
        qObj["NominalValue"],
    );
    if (nomVal !== null && nomVal > 0) {
      total += nomVal;
    }
  }
  return total;
}

// ── Main extractor ────────────────────────────────────────────────────────

/**
 * Extract wall, window, roof areas and per-level floor areas from IFC data.
 *
 * `ifcData` is the raw object produced by the IFC parser (web-ifc or
 * duck-typed equivalent).  Expected shape:
 *
 * ```
 * {
 *   elements: Array<{
 *     ifcType: string;          // e.g. "IFCWALL"
 *     IsExternal?: boolean;
 *     properties?: Record<string, unknown>;
 *     quantities?: Array<{ AreaValue?: number; ... }>;
 *     level?: number;           // storey index (0-based)
 *     area?: number;            // pre-computed area shortcut
 *   }>;
 * }
 * ```
 */
export function extractGeometry(ifcData: Record<string, unknown>): IFCGeometryResult {
  const elements: unknown[] = Array.isArray(ifcData?.elements)
    ? ifcData.elements
    : [];

  let wallArea = 0;
  let windowArea = 0;
  let roofArea = 0;
  const floorAreaMap = new Map<number, number>();

  for (const el of elements) {
    if (!el || typeof el !== "object") continue;
    const obj = el as Record<string, unknown>;
    const elType = elementTypeOf(el);

    // ── Determine element area ──────────────────────────────────────────
    let area = 0;

    // Shortcut: caller pre-computed area
    const directArea = numericValue(obj["area"] ?? obj["Area"]);
    if (directArea !== null && directArea > 0) {
      area = directArea;
    } else {
      // Derive from nested quantity sets
      const quantities = Array.isArray(obj["quantities"])
        ? (obj["quantities"] as unknown[])
        : [];
      area = sumAreaFromQuantities(quantities);
    }

    if (area <= 0) continue;

    // ── Classify and accumulate ─────────────────────────────────────────
    if (IFC_WALL_CODES.has(elType)) {
      if (isExternal(obj)) {
        wallArea += area;
      }
    } else if (IFC_WINDOW_CODES.has(elType)) {
      windowArea += area;
    } else if (IFC_ROOF_CODES.has(elType)) {
      // Distinguish roof slabs from floor slabs via PredefinedType
      const predefined = String(obj["PredefinedType"] ?? obj["predefinedType"] ?? "").toUpperCase();
      if (
        elType === "IFCROOF" ||
        elType === "IFCROOFTYPE" ||
        predefined === "ROOF" ||
        predefined === "BASESLAB" ||
        predefined.includes("ROOF")
      ) {
        roofArea += area;
      } else if (IFC_SLAB_CODES.has(elType)) {
        // Floor slab — bucket by storey level
        const level = typeof obj["level"] === "number" ? obj["level"] : 0;
        floorAreaMap.set(level, (floorAreaMap.get(level) ?? 0) + area);
      }
    } else if (IFC_SLAB_CODES.has(elType)) {
      const level = typeof obj["level"] === "number" ? obj["level"] : 0;
      floorAreaMap.set(level, (floorAreaMap.get(level) ?? 0) + area);
    }
  }

  const floorAreas = Array.from(floorAreaMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([level, area]) => ({ level, area }));

  return { wallArea, windowArea, roofArea, floorAreas };
}
