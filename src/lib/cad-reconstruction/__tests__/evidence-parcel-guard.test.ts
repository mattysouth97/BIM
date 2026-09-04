import { describe, expect, it } from "vitest";

import type { BrTitleInfo } from "@/lib/types";

import { runReconstruction } from "..";
import type { EvidenceInput } from "../types";

const NOW = "2026-09-04T00:00:00.000Z";

/**
 * A parcel masquerading as a building.
 *
 * VWorld answers the building layer first and falls back to the cadastral
 * parcel, reporting which layer won in `source`. When only the parcel answers,
 * nothing in the evidence gathered describes the BUILDING's shape — and the
 * pipeline must say so rather than treat the lot as an observed outline.
 */
function title(overrides: Partial<BrTitleInfo> = {}): BrTitleInfo {
  return {
    mgmBldrgstPk: "11110-100-1-1-0",
    bldNm: "테스트동",
    platPlcNm: "서울특별시 종로구 청운동 1-1",
    newPlatPlc: "서울특별시 종로구 자하문로 1",
    sigunguCd: "11110",
    bjdongCd: "10300",
    platGbCd: "0",
    bun: "0001",
    ji: "0001",
    mainPurpsCd: "14000",
    mainPurpsCdNm: "종교시설",
    etcPurps: "",
    strctCd: "21",
    strctCdNm: "철근콘크리트구조",
    etcStrct: "",
    grndFlrCnt: 3,
    ugrndFlrCnt: 0,
    totArea: 1200,
    archArea: 400,
    platArea: 7000,
    bcRat: 5.71,
    vlRat: 17.14,
    useAprDay: "19980412",
    pmsDay: "19970101",
    stcnsDay: "19970301",
    roofCd: "10",
    roofCdNm: "평지붕",
    heit: 11.4,
    regstrGbCd: "1",
    regstrGbCdNm: "일반",
    ...overrides,
  } as BrTitleInfo;
}

/** ~84 m × 84 m ≈ 7,000 m² lot near Seoul, in WGS84, as VWorld returns it. */
function parcelRing(): number[][][] {
  const lng = 126.9695;
  const lat = 37.5885;
  const dLng = 0.000955;
  const dLat = 0.000755;
  return [
    [
      [lng, lat],
      [lng + dLng, lat],
      [lng + dLng, lat + dLat],
      [lng, lat + dLat],
      [lng, lat],
    ],
  ];
}

function parcelOnlyInput(): EvidenceInput {
  return {
    buildingPk: "11110-100-1-1-0",
    title: title(),
    recap: null,
    floors: [],
    areas: [],
    gis: {
      polygon: parcelRing(),
      source: "parcel",
      attributes: null,
      error: null,
    },
    address: "서울특별시 종로구 청운동 1-1",
    claims: [],
    now: NOW,
  };
}

describe("a cadastral parcel is never the building footprint", () => {
  const pkg = runReconstruction(parcelOnlyInput());
  const model = pkg.model;

  it("does not report the 7,000 m² lot as the building", () => {
    expect(model.footprint.areaSqm).toBeLessThan(1000);
    expect(model.footprint.areaSqm).toBeGreaterThan(300);
  });

  it("does not grade the footprint as observed when only a lot was observed", () => {
    expect(model.footprint.grade).not.toBe("B-OBSERVED");
    expect(model.footprint.grade).not.toBe("A-VERIFIED");
  });

  it("does not attribute the footprint to a user who stated nothing", () => {
    expect(model.claims).toHaveLength(0);
    expect(model.footprint.method).not.toContain("사용자");
  });

  it("does not let the lot's bounding box become the building's width and depth", () => {
    for (const id of ["C5", "C6"]) {
      const control = model.controls.find((c) => c.id === id)!;
      expect(control.sourceIds).not.toContain("SRC-GIS-BLDG");
      if (control.grade === "B-OBSERVED") {
        throw new Error(`${id} was graded B-OBSERVED from a parcel: ${control.method}`);
      }
    }
  });

  it("still keeps the parcel — as the site boundary, where it belongs", () => {
    expect(model.site.ring).not.toBeNull();
    expect(model.site.grade).toBe("B-OBSERVED");
    expect(model.site.note).toContain("필지");
  });

  it("keeps every floor plate usable instead of collapsing to X-UNRESOLVED", () => {
    const unresolved = model.levels.filter((l) => l.plateGrade === "X-UNRESOLVED");
    expect(unresolved).toEqual([]);
  });
});

describe("two contradictions in one GIS payload read as one problem", () => {
  // 서울청운초등학교, measured on production: VWorld returned a 95 m² outbuilding
  // as source "building" for a register stating 건축면적 2,749.71 m², AND
  // groundFloors 2 against a register stating 5. The storey mismatch is not a
  // stale register — it is the same wrong building answering twice.
  function wrongBuildingInput(): EvidenceInput {
    const lng = 126.9695;
    const lat = 37.5885;
    // ~9.7 m x 9.8 m ≈ 95 m² shed.
    const d = 0.00011;
    return {
      buildingPk: "11110-100-1-1-0",
      title: title({ archArea: 2749.71, grndFlrCnt: 5, totArea: 12000 }),
      recap: null,
      floors: [],
      areas: [],
      gis: {
        polygon: [
          [
            [lng, lat],
            [lng + d, lat],
            [lng + d, lat + d * 0.8],
            [lng, lat + d * 0.8],
            [lng, lat],
          ],
        ],
        source: "building",
        attributes: { height: null, groundFloors: 2, undergroundFloors: null },
        error: null,
      },
      address: "서울특별시 종로구 청운동 1-1",
      claims: [],
      now: NOW,
    };
  }

  const pkg = runReconstruction(wrongBuildingInput());

  it("does not build the building from the outbuilding's outline", () => {
    expect(pkg.model.footprint.areaSqm).toBeGreaterThan(1000);
    expect(pkg.model.footprint.grade).not.toBe("B-OBSERVED");
  });

  it("blames the storey mismatch on the wrong building, not on a stale register", () => {
    const conflict = pkg.model.conflicts.find((c) => c.subject === "지상 층수")!;
    expect(conflict).toBeDefined();
    expect(conflict.possibleExplanation).toContain("다른 동");
    expect(conflict.possibleExplanation).not.toContain("증축");
    expect(conflict.resolutionStatus).toBe("unresolved");
  });

  it("still reads a storey mismatch as a stale register when the outline agrees", () => {
    const input = wrongBuildingInput();
    const agreeing = { ...input, title: title({ archArea: 95, grndFlrCnt: 5 }) };
    const ok = runReconstruction(agreeing);
    const conflict = ok.model.conflicts.find((c) => c.subject === "지상 층수")!;
    expect(conflict.possibleExplanation).toContain("증축");
    expect(conflict.resolutionStatus).toBe("documented");
  });
});
