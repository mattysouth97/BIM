import { describe, expect, it } from "vitest";

import type { BrTitleInfo } from "@/lib/types";

import { runReconstruction } from "..";
import type { EvidenceInput, OsmBuildingInput } from "../types";

const NOW = "2026-09-04T00:00:00.000Z";

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
    totArea: 600,
    archArea: 200,
    platArea: 400,
    bcRat: 50,
    vlRat: 150,
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

const LNG = 126.9695;
const LAT = 37.5885;
/** ~1 m in degrees at this latitude. */
const DLNG = 0.0000114;
const DLAT = 0.000009;

/** An axis-aligned WGS84 box of the given metre dimensions, as OSM returns it. */
function box(widthM: number, depthM: number, offsetM = 0): number[][][] {
  const x0 = LNG + offsetM * DLNG;
  const y0 = LAT + offsetM * DLAT;
  const x1 = x0 + widthM * DLNG;
  const y1 = y0 + depthM * DLAT;
  return [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ];
}

function osm(overrides: Partial<OsmBuildingInput> = {}): OsmBuildingInput {
  return {
    polygon: box(20, 10),
    osmType: "way",
    osmId: 198561926,
    tags: { building: "yes" },
    error: null,
    ...overrides,
  };
}

function input(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    buildingPk: "11110-100-1-1-0",
    title: title(),
    recap: null,
    floors: [],
    areas: [],
    gis: null,
    address: "서울특별시 종로구 청운동 1-1",
    claims: [],
    now: NOW,
    ...overrides,
  };
}

describe("an OpenStreetMap outline reaches the model", () => {
  const pkg = runReconstruction(input({ osm: osm() }));

  it("is used as the footprint when no government outline answered", () => {
    expect(pkg.model.footprint.grade).toBe("B-OBSERVED");
    expect(pkg.model.footprint.method).toContain("OpenStreetMap");
  });

  it("carries its area rather than the area-solved rectangle's", () => {
    // The box is 20 × 10 m; 건축면적 says 200 m². They agree here, which is the
    // point — the ring is measured, not resized to match.
    expect(pkg.model.footprint.areaSqm).toBeGreaterThan(180);
    expect(pkg.model.footprint.areaSqm).toBeLessThan(220);
  });

  it("georeferences the frame from the OSM ring when it is the only one", () => {
    expect(pkg.model.frame.originLngLat).not.toBeNull();
    expect(pkg.model.frame.projection).toContain("+proj=tmerc");
  });

  it("names the source, its citation and its limits in the evidence register", () => {
    const record = pkg.model.sources.find((s) => s.sourceId === "SRC-OSM-BLDG")!;
    expect(record.available).toBe(true);
    expect(record.confidence).toBe("B-OBSERVED");
    // Ranked BELOW the government layer (3), never equal to it.
    expect(record.authorityLevel).toBe(4);
    expect(record.knownLimitations.join(" ")).toContain("측량 성과가 아님");
  });

  it("records using a crowd-sourced outline as an assumption", () => {
    const entry = pkg.model.assumptions.find((a) => a.sourceContext === "SRC-OSM-BLDG");
    expect(entry).toBeDefined();
    expect(entry!.assumption).toContain("way/198561926");
  });

  it("is absent, not empty, when OSM errored", () => {
    const errored = runReconstruction(input({ osm: osm({ error: "upstream" }) }));
    const record = errored.model.sources.find((s) => s.sourceId === "SRC-OSM-BLDG")!;
    expect(record.available).toBe(false);
    expect(record.confidence).toBe("X-UNRESOLVED");
    expect(errored.model.footprint.method).not.toContain("OpenStreetMap");
  });
});

describe("OSM against the government outline", () => {
  const gis = {
    polygon: box(20, 10),
    source: "building" as const,
    attributes: null,
    error: null,
  };

  it("keeps the government layer when the two agree", () => {
    const pkg = runReconstruction(input({ gis, osm: osm({ polygon: box(20.4, 9.8) }) }));
    expect(pkg.model.footprint.method).toContain("VWorld");
    const outlineConflicts = pkg.model.conflicts.filter((c) =>
      c.subject.includes("외곽 형상"),
    );
    expect(outlineConflicts).toEqual([]);
  });

  it("records a conflict, with geometry, when the two disagree", () => {
    const pkg = runReconstruction(input({ gis, osm: osm({ polygon: box(45, 30) }) }));
    const conflict = pkg.model.conflicts.find((c) => c.subject.includes("외곽 형상"))!;
    expect(conflict).toBeDefined();
    expect(conflict.resolutionStatus).toBe("unresolved");
    expect(conflict.geometry).toBeDefined();
    expect(conflict.magnitude).toContain("IoU");
  });
});

describe("OSM tags are cross-checks, never overrides", () => {
  it("records a storey-count disagreement without changing the register's value", () => {
    const pkg = runReconstruction(
      input({ osm: osm({ tags: { building: "yes", "building:levels": "7" } }) }),
    );
    const conflict = pkg.model.conflicts.find((c) => c.subject.includes("지상 층수"))!;
    expect(conflict).toBeDefined();
    expect(conflict.valueA).toBe("3");
    expect(conflict.valueB).toBe("7");
    // The register still governs the model.
    expect(pkg.model.building.storeysAbove).toBe(3);
    expect(pkg.model.levels.filter((l) => !l.below)).toHaveLength(3);
  });

  it("stays silent when the tag agrees with the register", () => {
    const pkg = runReconstruction(
      input({ osm: osm({ tags: { building: "yes", "building:levels": "3" } }) }),
    );
    expect(pkg.model.conflicts.filter((c) => c.subject.includes("지상 층수"))).toEqual([]);
  });

  it("records a height disagreement beyond 15 %", () => {
    const pkg = runReconstruction(
      input({ osm: osm({ tags: { building: "yes", height: "25" } }) }),
    );
    const conflict = pkg.model.conflicts.find((c) => c.subject.includes("건물 높이"));
    expect(conflict).toBeDefined();
  });
});
