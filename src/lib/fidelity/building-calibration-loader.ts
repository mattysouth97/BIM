// src/lib/fidelity/building-calibration-loader.ts
// Loads per-buildingId calibration overrides from a static registry.
// Next.js cannot dynamic-require src/data/building-calibrations/*.json at
// runtime, so registered files are imported explicitly below. See
// src/data/building-calibrations/README.md for the on-disk format and how
// to register a new file.

import type { BuildingCalibration, OverrideRationale } from "@/lib/fidelity/fidelity-types";
import type { FloorSpec } from "@/lib/procedural/types";
import testFixture from "@/data/building-calibrations/_test-fixture.json";
import seedAptGangnam2003 from "@/data/building-calibrations/seed-apt-gangnam-2003.json";
import seedOfficeMapo2012 from "@/data/building-calibrations/seed-office-mapo-2012.json";
import seedFactoryGuro1988 from "@/data/building-calibrations/seed-factory-guro-1988.json";
import seedRetailJongno1995 from "@/data/building-calibrations/seed-retail-jongno-1995.json";
import seedAptNowon1979 from "@/data/building-calibrations/seed-apt-nowon-1979.json";

/**
 * Explicit registry of known building calibrations, keyed by buildingId.
 * `_test-fixture` is a non-building entry registered solely so
 * building-calibration-loader.test.ts can exercise the real registry path.
 *
 * To register a file once a real showcase building exists at
 * src/data/building-calibrations/{buildingId}.json:
 *
 *   import myBuilding from "@/data/building-calibrations/1111010100100010000.json";
 *
 *   const CALIBRATION_REGISTRY: Record<string, BuildingCalibration> = {
 *     "1111010100100010000": myBuilding as BuildingCalibration,
 *   };
 */
const CALIBRATION_REGISTRY: Record<string, BuildingCalibration> = {
  "_test-fixture": testFixture as BuildingCalibration,
  "seed-apt-gangnam-2003": seedAptGangnam2003 as BuildingCalibration,
  "seed-office-mapo-2012": seedOfficeMapo2012 as BuildingCalibration,
  "seed-factory-guro-1988": seedFactoryGuro1988 as BuildingCalibration,
  "seed-retail-jongno-1995": seedRetailJongno1995 as BuildingCalibration,
  "seed-apt-nowon-1979": seedAptNowon1979 as BuildingCalibration,
};

/** Valid GeometricLOD values */
const VALID_LOD = new Set<string>(["L1", "L2", "L3"]);

/**
 * Vague source strings that indicate a tautological calibration (tuned to match
 * a target) rather than a traceable measurement. Rejected by validateCalibrationEntry.
 */
const VAGUE_SOURCES = new Set(["backfit", "tuned", "adjusted", "fitted", "calibrated"]);

/**
 * Validate a BuildingCalibration entry against schema rules.
 * Throws a descriptive Error if any rule is violated.
 * Used at registration time and in tests.
 *
 * Rules (from src/data/building-calibrations/README.md):
 *  - buildingId must be a non-empty string
 *  - geometricLOD must be one of L1 | L2 | L3
 *  - each override's source must be non-empty and not a vague keyword
 */
export function validateCalibrationEntry(entry: BuildingCalibration): void {
  if (!entry.buildingId || typeof entry.buildingId !== "string") {
    throw new Error(`buildingId is required and must be a non-empty string`);
  }
  if (!VALID_LOD.has(entry.geometricLOD)) {
    throw new Error(
      `geometricLOD "${entry.geometricLOD}" is invalid — must be one of L1, L2, L3`,
    );
  }
  for (const override of entry.overrides ?? []) {
    validateOverrideRationale(override, entry.buildingId);
  }
}

function validateOverrideRationale(
  override: OverrideRationale,
  buildingId: string,
): void {
  const src = (override.source ?? "").trim();
  if (!src) {
    throw new Error(
      `Override for field "${override.field}" in buildingId "${buildingId}" has an empty source — ` +
      `source must cite a specific document (permit drawing, 건축물대장 field, on-site measurement)`,
    );
  }
  if (VAGUE_SOURCES.has(src.toLowerCase())) {
    throw new Error(
      `Override for field "${override.field}" in buildingId "${buildingId}" has a vague source "${src}" — ` +
      `use a specific document reference, not a generic tuning label`,
    );
  }
}

/**
 * Default buildingId resolver: buildingId = PNU today. Exposed as a pure
 * helper so future non-PNU sources (e.g. operator-uploaded buildings) can
 * key by the same identifier without refactoring loadCalibration().
 */
export function resolveBuildingId(pnu: string): string {
  return pnu;
}

/**
 * Look up a building's calibration overrides. Returns null when no
 * calibration is registered for buildingId — this is the expected path for
 * any building without per-building handcraft (proves extensibility).
 * Never throws on a registry miss.
 */
export function loadCalibration(buildingId: string): BuildingCalibration | null {
  return CALIBRATION_REGISTRY[buildingId] ?? null;
}

/**
 * Floor-height override result — calibrated heights + per-floor estimated flags.
 */
export interface FloorHeightResult {
  /** Floors with heights (and y positions) updated from calibration or left at recipe defaults */
  floors: FloorSpec[];
  /** Per-floor flag: true when height comes from era-recipe default (not measured/calibrated) */
  estimatedFlags: boolean[];
}

/**
 * Parse a `floorHeights.<floorNo>` field path and return the floor number, or null.
 * Example: "floorHeights.3" → 3
 */
function parseFloorHeightField(field: string): number | null {
  const match = /^floorHeights\.(-?\d+)$/.exec(field);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Apply calibrated floor heights from a BuildingCalibration to a FloorSpec array.
 *
 * - overrides with field "floorHeights.<floorNo>" replace recipe-default heights
 * - zero heights in the base recipe are flagged estimated (zero-value convention)
 * - y positions are recalculated from the first floor upward for above-grade floors
 * - below-grade floors are left at their recipe y values
 * - null calibration → floors unchanged, zero heights → estimated
 * - never throws — unknown floor numbers in overrides are silently skipped
 */
export function applyCalibrationFloorHeights(
  floors: FloorSpec[],
  calibration: BuildingCalibration | null,
): FloorHeightResult {
  // Build a lookup from floorNo → calibrated height
  const calibratedHeights = new Map<number, number>();
  if (calibration) {
    for (const override of calibration.overrides) {
      const floorNo = parseFloorHeightField(override.field);
      if (floorNo !== null && typeof override.overrideValue === "number" && override.overrideValue > 0) {
        calibratedHeights.set(floorNo, override.overrideValue);
      }
    }
  }

  // Apply overrides and compute estimated flags
  const updatedFloors: FloorSpec[] = floors.map((f) => {
    const calibratedH = calibratedHeights.get(f.floorNo);
    if (calibratedH !== undefined) {
      return { ...f, height: calibratedH };
    }
    return { ...f };
  });

  const estimatedFlags: boolean[] = updatedFloors.map((f) => {
    // "estimated" (true) when:
    //   (a) height is zero — AFF-6 zero-value convention: zero means data unavailable
    //   (b) a calibration exists but does NOT cover this floor — the calibration author
    //       signalled that some floors have real data; a missing floor is therefore a gap
    // When NO calibration exists at all, recipe defaults are the best available data
    // (not flagged as estimated — they are the authoritative era defaults).
    if (f.height === 0) return true;
    if (calibration !== null && !calibratedHeights.has(f.floorNo)) return true;
    return false;
  });

  // Recalculate y positions for above-grade floors only (ascending floor order)
  // Below-grade floors keep their recipe y values.
  const aboveFloors = updatedFloors.filter((f) => f.type === "above");
  aboveFloors.sort((a, b) => a.floorNo - b.floorNo);

  let cumulativeY = 0;
  const yByFloorNo = new Map<number, number>();
  for (const f of aboveFloors) {
    yByFloorNo.set(f.floorNo, cumulativeY);
    cumulativeY += f.height;
  }

  const finalFloors = updatedFloors.map((f) => {
    const newY = yByFloorNo.get(f.floorNo);
    if (newY !== undefined) {
      return { ...f, y: newY };
    }
    return f;
  });

  return { floors: finalFloors, estimatedFlags };
}
