import { describe, expect, it } from "vitest";

import { parseDxfText } from "@/lib/cad/dxf-parser";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

import { runReconstruction } from "..";
import { parseClaimStatements } from "../claims";
import { areaSqm, isSelfIntersecting } from "../geometry";
import { qaSummary } from "../qa";
import type { EvidenceInput } from "../types";

const NOW = "2026-09-02T00:00:00.000Z";

function title(overrides: Partial<BrTitleInfo> = {}): BrTitleInfo {
  return {
    mgmBldrgstPk: "11110-100-1-1-0",
    bldNm: "청운동새사람선교회",
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
    ugrndFlrCnt: 1,
    totArea: 720,
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
    regstrKindCd: "2",
    regstrKindCdNm: "일반건축물",
    ...overrides,
  };
}

function floor(
  flrNo: number,
  area: number,
  below = false,
  overrides: Partial<BrFloorInfo> = {},
): BrFloorInfo {
  return {
    mgmBldrgstPk: "11110-100-1-1-0",
    flrNo,
    flrNoNm: below ? `지하${flrNo}층` : `${flrNo}층`,
    flrGbCd: below ? "10" : "20",
    flrGbCdNm: below ? "지하" : "지상",
    mainAtchGbCd: "0",
    mainAtchGbCdNm: "주건축물",
    mainPurpsCd: "14000",
    mainPurpsCdNm: "종교시설",
    etcPurps: "",
    area,
    strctCd: "21",
    strctCdNm: "철근콘크리트구조",
    ...overrides,
  };
}

function baseInput(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    buildingPk: "11110-100-1-1-0",
    title: title(),
    recap: null,
    floors: [floor(-1, 180, true), floor(1, 200), floor(2, 200), floor(3, 140)],
    areas: [],
    gis: null,
    address: "서울특별시 종로구 청운동 1-1",
    claims: [],
    now: NOW,
    ...overrides,
  };
}

/** A small L-ish outline near Seoul, in WGS84, as VWorld returns it. */
function gisRing(): number[][][] {
  const lng = 126.9695;
  const lat = 37.5885;
  const dLng = 0.000114; // ~10 m
  const dLat = 0.000090; // ~10 m
  return [
    [
      [lng, lat],
      [lng + dLng * 2, lat],
      [lng + dLng * 2, lat + dLat],
      [lng + dLng, lat + dLat],
      [lng + dLng, lat + dLat * 2],
      [lng, lat + dLat * 2],
      [lng, lat],
    ],
  ];
}

describe("runReconstruction — register-only evidence", () => {
  const pkg = runReconstruction(baseInput());

  it("produces a model, a DXF and the full document set", () => {
    expect(pkg.model.levels).toHaveLength(4);
    expect(pkg.dxf.text.length).toBeGreaterThan(5000);
    expect(pkg.documents.map((d) => d.name.split("_").pop())).toEqual(
      expect.arrayContaining([
        "Register.md",
        "Ledger.md",
        "Report.md",
        "Geometry.json",
        "Provenance.csv",
        "Validation.csv",
      ]),
    );
  });

  it("never claims a survey — the title says estimated reconstruction", () => {
    expect(pkg.model.titleEn).toBe("Estimated Existing-Condition Reconstruction");
    expect(pkg.model.revision).toBe("R01");
  });

  it("grades a footprint solved from area alone as inferred, not verified", () => {
    expect(pkg.model.footprint.grade).toBe("D-INFERRED");
    // The AREA it was solved against is verified, so the area must land.
    expect(pkg.model.footprint.areaSqm).toBeCloseTo(200, 0);
  });

  it("hits the registered area on every floor", () => {
    for (const level of pkg.model.levels) {
      if (level.registeredAreaSqm === null) continue;
      expect(Math.abs(level.modelAreaSqm - level.registeredAreaSqm)).toBeLessThan(1);
    }
  });

  it("passes every automated QA check", () => {
    const failures = pkg.checks.filter((c) => c.status === "FAIL");
    expect(failures.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
    expect(qaSummary(pkg.checks).ok).toBe(true);
  });

  it("keeps the core inside every level and continuous", () => {
    expect(pkg.model.core).not.toBeNull();
    expect(pkg.model.core?.levelIds).toHaveLength(pkg.model.levels.length);
  });

  it("hosts every opening on a wall that exists", () => {
    const wallIds = new Set(pkg.model.walls.map((w) => w.id));
    for (const op of pkg.model.openings) {
      expect(wallIds.has(op.hostWallId)).toBe(true);
    }
  });

  it("puts no windows below grade", () => {
    const basement = pkg.model.levels.find((l) => l.below);
    const basementWindows = pkg.model.openings.filter(
      (o) => o.levelId === basement?.id && o.type === "window",
    );
    expect(basementWindows).toHaveLength(0);
  });

  it("records an assumption for every inference it made", () => {
    const elements = pkg.model.assumptions.map((a) => a.element);
    expect(elements).toEqual(
      expect.arrayContaining(["외곽선", "외벽 두께", "창 개구부", "코어"]),
    );
    for (const a of pkg.model.assumptions) {
      expect(a.verificationMethod.length).toBeGreaterThan(0);
      expect(a.impactIfWrong.length).toBeGreaterThan(0);
    }
  });

  it("ranks field verification by what it would eliminate", () => {
    expect(pkg.fieldPlan[0].measurement).toContain("폭");
    expect(pkg.fieldPlan.map((p) => p.rank)).toEqual(
      pkg.fieldPlan.map((_, i) => i + 1),
    );
  });

  it("is deterministic for identical evidence", () => {
    const again = runReconstruction(baseInput());
    expect(again.dxf.text).toBe(pkg.dxf.text);
  });
});

describe("round-trip through the application's own DXF importer", () => {
  const pkg = runReconstruction(baseInput());
  const reparsed = parseDxfText(pkg.dxf.text);

  it("reopens without a parse failure", () => {
    expect(reparsed.warnings.filter((w) => w.startsWith("DXF parse failed"))).toEqual([]);
    expect(reparsed.candidates.length).toBeGreaterThan(0);
  });

  it("declares millimetres and survives the unit conversion", () => {
    expect(reparsed.unitScaleToMeters).toBe(0.001);
  });

  it("returns the grade-level outline with the model's area and vertex count", () => {
    const outline = reparsed.candidates.find((c) => /^bim[_-]?outline$/i.test(c.layer));
    expect(outline).toBeDefined();
    expect(outline!.areaSqm).toBeCloseTo(pkg.model.footprint.areaSqm, 1);
    expect(outline!.vertexCount).toBe(pkg.model.footprint.ring.length);
  });

  it("keeps every required layer", () => {
    for (const layer of ["A-WALL", "A-WIND", "A-DIMS", "X-VERIFY", "X-CONFLICT", "SHEET"]) {
      expect(pkg.dxf.text).toContain(`\r\n${layer}\r\n`);
    }
  });

  it("writes real dimension and text entities", () => {
    expect(pkg.dxf.entityCounts.DIMENSION ?? 0).toBeGreaterThan(0);
    expect(pkg.dxf.entityCounts.TEXT ?? 0).toBeGreaterThan(0);
    expect(pkg.dxf.entityCounts.INSERT ?? 0).toBeGreaterThan(0);
  });

  it("marks inferred dimensions so they cannot read as measured", () => {
    expect(pkg.dxf.text).toContain("(추정)");
  });
});

describe("GIS outline evidence", () => {
  const pkg = runReconstruction(
    baseInput({
      gis: {
        polygon: gisRing(),
        source: "building",
        attributes: { height: 11.2, groundFloors: 3, undergroundFloors: 1 },
        error: null,
      },
    }),
  );

  it("prefers the observed outline over a solved rectangle", () => {
    expect(pkg.model.footprint.grade).toBe("B-OBSERVED");
    expect(pkg.model.footprint.ring.length).toBeGreaterThan(4);
    expect(isSelfIntersecting(pkg.model.footprint.ring)).toBe(false);
  });

  it("georeferences the local frame", () => {
    expect(pkg.model.frame.originLngLat).not.toBeNull();
    expect(pkg.model.frame.projection).toContain("+proj=tmerc");
    expect(pkg.model.frame.grade).toBe("C-CALCULATED");
  });

  it("does NOT distort the observed outline to hit the registered area", () => {
    // The synthetic ring is ~300 m², the register says 200 m². The outline
    // must keep its own area and the disagreement must be recorded.
    expect(pkg.model.footprint.areaSqm).toBeGreaterThan(220);
    const conflict = pkg.model.conflicts.find((c) => c.subject.includes("GIS"));
    expect(conflict).toBeDefined();
    expect(conflict!.geometry).toBeDefined();
  });

  it("still passes geometry QA with the irregular outline", () => {
    const failures = pkg.checks.filter(
      (c) => c.status === "FAIL" && c.group !== "area",
    );
    expect(failures.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
  });
});

describe("documented zeros are absences, not values", () => {
  it("treats platArea=0 / heit=0 as unavailable", () => {
    const pkg = runReconstruction(
      baseInput({ title: title({ platArea: 0, heit: 0, bcRat: 0 }) }),
    );
    const c1 = pkg.model.controls.find((c) => c.id === "C1");
    expect(c1?.value).toBeNull();
    expect(c1?.grade).toBe("X-UNRESOLVED");
    expect(pkg.model.site.ring).toBeNull();

    // Height gone → floor-to-floor falls back to the era table and says so.
    const c8 = pkg.model.controls.find((c) => c.id === "C8");
    expect(c8?.grade).toBe("D-INFERRED");
    expect(
      pkg.model.assumptions.some((a) => a.element === "층고"),
    ).toBe(true);
  });

  it("flags a missing approval date instead of silently picking an era", () => {
    const pkg = runReconstruction(
      baseInput({ title: title({ useAprDay: "", pmsDay: "" }) }),
    );
    expect(pkg.model.building.eraResolved).toBe(false);
    const eraAssumption = pkg.model.assumptions.find((a) => a.element === "건축 연대");
    expect(eraAssumption?.confidence).toBe("X-UNRESOLVED");
  });
});

describe("conflict detection", () => {
  it("catches a floor-row sum that disagrees with the gross area", () => {
    const pkg = runReconstruction(
      baseInput({ floors: [floor(1, 200), floor(2, 200)] }),
    );
    const conflict = pkg.model.conflicts.find((c) => c.subject.includes("연면적"));
    expect(conflict).toBeDefined();
    expect(conflict?.resolutionStatus).toBe("documented");
  });

  it("catches a stated dimension that cannot hold the registered area", () => {
    const claims = parseClaimStatements(
      "정면 폭 5m 를 실측했습니다. 깊이 5m 입니다.",
    );
    const pkg = runReconstruction(baseInput({ claims }));
    const conflict = pkg.model.conflicts.find((c) =>
      c.subject.includes("사용자 진술"),
    );
    expect(conflict).toBeDefined();
    expect(conflict?.resolutionStatus).toBe("unresolved");
  });

  it("catches GIS floor count disagreeing with the register", () => {
    const pkg = runReconstruction(
      baseInput({
        gis: {
          polygon: gisRing(),
          source: "building",
          attributes: { height: 11.2, groundFloors: 5, undergroundFloors: 1 },
          error: null,
        },
      }),
    );
    expect(
      pkg.model.conflicts.some((c) => c.subject.includes("지상 층수")),
    ).toBe(true);
  });
});

describe("measured user statements outrank inference", () => {
  const claims = parseClaimStatements(
    "정면 폭 20m 를 줄자로 실측했습니다. 깊이는 10m 입니다. 주 출입구는 남쪽에 있습니다.",
  );
  const pkg = runReconstruction(baseInput({ claims }));

  it("builds the footprint from the stated dimensions", () => {
    expect(pkg.model.footprint.areaSqm).toBeCloseTo(200, 0);
    const box = pkg.model.footprint.ring;
    expect(areaSqm(box)).toBeCloseTo(200, 0);
  });

  it("carries the measured grade into the footprint", () => {
    // Width was measured (A), depth merely stated (D) — the weaker wins.
    expect(pkg.model.footprint.grade).toBe("D-INFERRED");
    const c5 = pkg.model.controls.find((c) => c.id === "C5");
    expect(c5?.grade).toBe("A-VERIFIED");
  });

  it("places the entrance on the stated facade", () => {
    const door = pkg.model.openings.find((o) => o.type === "door");
    expect(door).toBeDefined();
    expect(door?.grade).toBe("B-OBSERVED");
  });
});

describe("no evidence at all", () => {
  it("blocks rather than inventing a building", () => {
    const pkg = runReconstruction(
      baseInput({
        title: title({
          archArea: 0,
          totArea: 0,
          platArea: 0,
          grndFlrCnt: 0,
          ugrndFlrCnt: 0,
        }),
        floors: [],
      }),
    );
    expect(pkg.model.blockers.length).toBeGreaterThan(0);
    expect(pkg.model.levels).toHaveLength(0);
    expect(pkg.model.footprint.grade).toBe("X-UNRESOLVED");
  });
});

/**
 * P2-31 reachability. `chooseSetbackFace` was unit-tested from the start, but
 * the product fed it `parcel: null` — `/api/vworld/footprint` spends its one
 * ring on the building outline, so the buildings with the best outlines had no
 * lot and the direction was always "undetermined". These pin the wiring that
 * carries a separately-fetched lot all the way to the setback decision.
 */
describe("a lot observed alongside the building outline", () => {
  const LNG = 126.9695;
  const LAT = 37.5885;
  const D_LNG = 0.000114; // ~10 m
  const D_LAT = 0.000090; // ~10 m

  /** A lot with ~8 m of northern slack and ~1 m to the south. */
  function parcelRing(): number[][][] {
    const west = LNG - D_LNG * 0.2;
    const east = LNG + D_LNG * 2.2;
    const south = LAT - 0.000009; // ~1 m
    const north = LAT + D_LAT * 2 + 0.000072; // ~8 m
    return [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ];
  }

  const gis = {
    polygon: gisRing(),
    source: "building" as const,
    attributes: { height: 11.2, groundFloors: 3, undergroundFloors: 1 },
    error: null,
  };
  const zoning = { district: "제2종일반주거지역", source: "LT_C_UQ111", error: null };

  const setbackAssumption = (pkg: ReturnType<typeof runReconstruction>) =>
    pkg.model.assumptions.find((a) => a.element === "후퇴 방향");

  it("leaves the direction undetermined when no lot is supplied", () => {
    const pkg = runReconstruction(baseInput({ gis, zoning }));
    const assumption = setbackAssumption(pkg);
    expect(assumption).toBeDefined();
    expect(assumption!.assumption).toContain("균등 축소");
    // The square solved from 대지면적 must not be dressed up as a lot: no
    // observed parcel, no parcel source, and nothing described as 관측.
    expect(assumption!.sourceContext).not.toContain("SRC-GIS-PARCEL (필지 여유 형상)");
    expect(assumption!.reason).not.toContain("관측");
  });

  it("reads the lot's northern slack and steps back on the north face", () => {
    const pkg = runReconstruction(
      baseInput({
        gis,
        zoning,
        parcel: { polygon: parcelRing(), source: "parcel", attributes: null, error: null },
      }),
    );
    const assumption = setbackAssumption(pkg);
    expect(assumption).toBeDefined();
    expect(assumption!.assumption).toBe("north 면으로 후퇴");
    expect(assumption!.sourceContext).toContain("건축법 시행령 제86조");
  });

  it("never lets the lot become the building's footprint", () => {
    const pkg = runReconstruction(
      baseInput({
        gis,
        zoning,
        parcel: { polygon: parcelRing(), source: "parcel", attributes: null, error: null },
      }),
    );
    // The lot is ~24 × 26 m; the building outline is the smaller L.
    expect(areaSqm(pkg.model.footprint.ring)).toBeLessThan(400);
  });
});
