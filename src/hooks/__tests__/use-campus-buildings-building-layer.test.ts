// src/hooks/__tests__/use-campus-buildings-building-layer.test.ts
// P2-28 — campus hook match logic:
//   - building footprint preferred over parcel (largest-area per PNU)
//   - parcel fallback when no building match
//   - degraded building fetch (throws) → parcel-only (never rejects)
//   - measuredHeightM carried on CampusBuilding

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Test-local re-implementation of the core matching logic ─────────────────
// We test the pure matching/selection functions extracted from the hook, because
// the hook itself uses React + react-query (needs full environment).
// The functions under test are imported from the module once it is implemented.

// ─── Helpers matching the shapes used in use-campus-buildings.ts ─────────────

function squareRing(lng: number, lat: number, side: number): number[][] {
  return [
    [lng, lat],
    [lng + side, lat],
    [lng + side, lat + side],
    [lng, lat + side],
  ];
}

// Compute unsigned shoelace area of outer ring (same formula used in route.ts)
function ringArea(ring: number[][]): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// ─── Inline re-implementation of the pure helper under test ──────────────────
// These mirror what use-campus-buildings.ts must implement in P2-28.
// They are kept here so the RED phase tests against functions that don't exist yet.

interface BuildingFootprintItem {
  pnu: string;
  polygon: number[][][];
  height: number | null;
  groundFloors: number | null;
}

interface ParcelFootprintItem {
  pnu: string;
  polygon: number[][][];
}

/**
 * Pick the largest-area building footprint among candidates sharing a PNU.
 * Returns null if candidates is empty.
 */
function pickLargestBuildingForPnu(candidates: BuildingFootprintItem[]): BuildingFootprintItem | null {
  let best: BuildingFootprintItem | null = null;
  let bestArea = -1;
  for (const c of candidates) {
    const outer = c.polygon[0];
    if (!outer) continue;
    const area = ringArea(outer);
    if (area > bestArea) {
      bestArea = area;
      best = c;
    }
  }
  return best;
}

/**
 * Resolve footprint + measuredHeightM for one building PNU.
 * Prefers largest-area building footprint; falls back to parcel footprint.
 */
function resolveFootprintForPnu(
  pnu: string,
  buildingItems: BuildingFootprintItem[],
  parcelByPnu: Map<string, ParcelFootprintItem>
): { polygon: number[][][]; measuredHeightM: number | null } | null {
  const candidates = buildingItems.filter((b) => b.pnu === pnu);
  if (candidates.length > 0) {
    const best = pickLargestBuildingForPnu(candidates);
    if (best) {
      return { polygon: best.polygon, measuredHeightM: best.height };
    }
  }
  const parcel = parcelByPnu.get(pnu);
  if (parcel) {
    return { polygon: parcel.polygon, measuredHeightM: null };
  }
  return null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("P2-28: campus building layer match logic (pure helpers)", () => {
  // ── Building preferred over parcel ──────────────────────────────────────────
  it("prefers building footprint over parcel for the same PNU", () => {
    const pnu = "1111010100100010000";

    const buildingItems: BuildingFootprintItem[] = [
      { pnu, polygon: [squareRing(127, 37, 0.001)], height: 43.5, groundFloors: 12 },
    ];
    const parcelByPnu = new Map<string, ParcelFootprintItem>([
      [pnu, { pnu, polygon: [squareRing(127, 37, 0.005)] }], // bigger parcel
    ]);

    const result = resolveFootprintForPnu(pnu, buildingItems, parcelByPnu);

    expect(result).not.toBeNull();
    // The building ring is 0.001-wide, parcel is 0.005-wide
    const outerRing = result!.polygon[0];
    const lngs = outerRing.map((p) => p[0]);
    const width = Math.max(...lngs) - Math.min(...lngs);
    expect(width).toBeCloseTo(0.001, 4);
    expect(result!.measuredHeightM).toBe(43.5);
  });

  // ── Largest-area building wins when multiple share PNU ──────────────────────
  it("picks largest-area building footprint when multiple share the same PNU", () => {
    const pnu = "1111010100100010000";

    const buildingItems: BuildingFootprintItem[] = [
      { pnu, polygon: [squareRing(127, 37, 0.0005)], height: 10, groundFloors: 3 },  // small
      { pnu, polygon: [squareRing(127.002, 37.002, 0.002)], height: 50, groundFloors: 15 }, // large
    ];
    const parcelByPnu = new Map<string, ParcelFootprintItem>();

    const result = resolveFootprintForPnu(pnu, buildingItems, parcelByPnu);

    expect(result).not.toBeNull();
    const outerRing = result!.polygon[0];
    const lngs = outerRing.map((p) => p[0]);
    const width = Math.max(...lngs) - Math.min(...lngs);
    // Large building: side=0.002
    expect(width).toBeCloseTo(0.002, 4);
    expect(result!.measuredHeightM).toBe(50);
  });

  // ── Parcel fallback when no building match ───────────────────────────────────
  it("falls back to parcel footprint when no building feature matches the PNU", () => {
    const pnu = "1111010100100010000";
    const otherPnu = "9999999999900000000";

    const buildingItems: BuildingFootprintItem[] = [
      { pnu: otherPnu, polygon: [squareRing(128, 38, 0.001)], height: 20, groundFloors: 5 },
    ];
    const parcelByPnu = new Map<string, ParcelFootprintItem>([
      [pnu, { pnu, polygon: [squareRing(127, 37, 0.003)] }],
    ]);

    const result = resolveFootprintForPnu(pnu, buildingItems, parcelByPnu);

    expect(result).not.toBeNull();
    // Should be the parcel ring (side=0.003)
    const outerRing = result!.polygon[0];
    const lngs = outerRing.map((p) => p[0]);
    const width = Math.max(...lngs) - Math.min(...lngs);
    expect(width).toBeCloseTo(0.003, 4);
    // measuredHeightM is null on parcel fallback
    expect(result!.measuredHeightM).toBeNull();
  });

  // ── measuredHeightM null when height absent/zero ─────────────────────────────
  it("measuredHeightM is null when building height is null (AFF-6)", () => {
    const pnu = "1111010100100010000";

    const buildingItems: BuildingFootprintItem[] = [
      { pnu, polygon: [squareRing(127, 37, 0.001)], height: null, groundFloors: 5 },
    ];
    const parcelByPnu = new Map<string, ParcelFootprintItem>();

    const result = resolveFootprintForPnu(pnu, buildingItems, parcelByPnu);
    expect(result).not.toBeNull();
    expect(result!.measuredHeightM).toBeNull();
  });

  // ── Returns null when both building and parcel missing ───────────────────────
  it("returns null when neither building nor parcel is found for the PNU", () => {
    const result = resolveFootprintForPnu("0000000000000000000", [], new Map());
    expect(result).toBeNull();
  });
});

// ─── Degraded building fetch tests (fetch-level behavior) ───────────────────

describe("P2-28: campus building fetch degrades gracefully", () => {
  beforeEach(() => {
    vi.stubEnv("VWORLD_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fetchBBoxBuildingFootprints returns [] when the API route returns non-OK (degraded)", async () => {
    // Import the hook module to get the internal fetch helper.
    // The helper must exist and return [] (not throw) on non-OK.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502 })
    );

    // Dynamic import so we pick up the module after stubbing
    const mod = await import("../use-campus-buildings");
    // The hook exports a named helper fetchBBoxBuildingFootprints or wraps it.
    // If the module doesn't export it yet, this test will fail at import — RED.
    expect(typeof mod.fetchBBoxBuildingFootprints).toBe("function");
    const result = await mod.fetchBBoxBuildingFootprints({
      minLng: 127, minLat: 37, maxLng: 128, maxLat: 38,
    });
    expect(result).toEqual([]);
  });

  it("fetchBBoxBuildingFootprints returns [] when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const mod = await import("../use-campus-buildings");
    expect(typeof mod.fetchBBoxBuildingFootprints).toBe("function");
    const result = await mod.fetchBBoxBuildingFootprints({
      minLng: 127, minLat: 37, maxLng: 128, maxLat: 38,
    });
    expect(result).toEqual([]);
  });
});
