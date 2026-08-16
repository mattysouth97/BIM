import { describe, expect, it } from "vitest";

import {
  resolveFootprintForPnu,
  selectLargestBuildingFootprintsByPnu,
  type VWorldBuildingFootprintItem,
  type VWorldFootprintItem,
} from "../use-campus-buildings";

function squareRing(lng: number, lat: number, side: number): number[][] {
  return [
    [lng, lat],
    [lng + side, lat],
    [lng + side, lat + side],
    [lng, lat + side],
  ];
}

describe("campus footprint index", () => {
  it("selects the largest building footprint once per PNU", () => {
    const pnu = "1111010100100010000";
    const footprints: VWorldBuildingFootprintItem[] = [
      {
        pnu,
        polygon: [squareRing(127, 37, 0.001)],
        height: 10,
        groundFloors: 3,
      },
      {
        pnu,
        polygon: [squareRing(127, 37, 0.003)],
        height: 40,
        groundFloors: 12,
      },
    ];

    const selected = selectLargestBuildingFootprintsByPnu(footprints);

    expect(selected.size).toBe(1);
    expect(selected.get(pnu)).toBe(footprints[1]);
  });

  it("prefers the indexed building and falls back to the parcel", () => {
    const buildingPnu = "1111010100100010000";
    const parcelPnu = "1111010100100020000";
    const building: VWorldBuildingFootprintItem = {
      pnu: buildingPnu,
      polygon: [squareRing(127, 37, 0.001)],
      height: 24,
      groundFloors: 7,
    };
    const parcel: VWorldFootprintItem = {
      pnu: parcelPnu,
      polygon: [squareRing(127, 37, 0.004)],
    };
    const buildingByPnu = selectLargestBuildingFootprintsByPnu([building]);
    const parcelByPnu = new Map([[parcelPnu, parcel]]);

    expect(
      resolveFootprintForPnu(buildingPnu, buildingByPnu, parcelByPnu),
    ).toEqual({
      polygon: building.polygon,
      measuredHeightM: 24,
    });
    expect(
      resolveFootprintForPnu(parcelPnu, buildingByPnu, parcelByPnu),
    ).toEqual({
      polygon: parcel.polygon,
      measuredHeightM: null,
    });
  });
});
