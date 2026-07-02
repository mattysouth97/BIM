// src/lib/fidelity/building-calibration-loader.ts
// Loads per-buildingId calibration overrides from a static registry.
// Next.js cannot dynamic-require src/data/building-calibrations/*.json at
// runtime, so registered files are imported explicitly below. See
// src/data/building-calibrations/README.md for the on-disk format and how
// to register a new file.

import type { BuildingCalibration } from "@/lib/fidelity/fidelity-types";
import testFixture from "@/data/building-calibrations/_test-fixture.json";

/**
 * Explicit registry of known building calibrations, keyed by buildingId.
 * Empty for real buildings today — no showcase building has been
 * selected/calibrated yet (blocked, see plan). `_test-fixture` is a
 * non-building entry registered solely so
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
};

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
 */
export function loadCalibration(buildingId: string): BuildingCalibration | null {
  return CALIBRATION_REGISTRY[buildingId] ?? null;
}
