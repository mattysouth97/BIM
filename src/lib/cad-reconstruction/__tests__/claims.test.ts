import { describe, expect, it } from "vitest";

import { mapDxfTextToDoc } from "@/lib/cad/doc/map-dxf-to-doc";

import { runReconstruction } from "..";
import { claimOf, normaliseProvidedClaims, parseClaimStatements } from "../claims";
import type { BrTitleInfo } from "@/lib/types";

describe("parseClaimStatements", () => {
  it("reads dimensions with units, Korean or English", () => {
    const claims = parseClaimStatements(
      "정면 폭 12.5m 입니다. 깊이 8000mm. floor-to-floor 3.6 m.",
    );
    expect(claimOf(claims, "overall_width_m")?.value).toBe(12.5);
    expect(claimOf(claims, "overall_depth_m")?.value).toBe(8);
    expect(claimOf(claims, "floor_to_floor_m")?.value).toBe(3.6);
  });

  it("grades a measured statement A-VERIFIED and a belief D-INFERRED", () => {
    const measured = parseClaimStatements("정면 폭 12m 를 줄자로 실측했습니다.");
    expect(claimOf(measured, "overall_width_m")?.grade).toBe("A-VERIFIED");
    expect(claimOf(measured, "overall_width_m")?.measured).toBe(true);

    const believed = parseClaimStatements("정면 폭은 12m 정도일 것 같습니다.");
    expect(claimOf(believed, "overall_width_m")?.grade).toBe("D-INFERRED");
  });

  it("keeps the user's own words as the quote", () => {
    const claims = parseClaimStatements("정면 폭 12m 를 실측했습니다.");
    expect(claimOf(claims, "overall_width_m")?.quote).toContain("실측");
  });

  it("converts 평 to square metres", () => {
    const claims = parseClaimStatements("대지면적 100평 입니다.");
    expect(claimOf(claims, "site_area_sqm")?.value).toBeCloseTo(330.58, 1);
  });

  it("drops an out-of-range value instead of clamping it", () => {
    const claims = parseClaimStatements("정면 폭 900m 입니다.");
    expect(claimOf(claims, "overall_width_m")).toBeNull();
    const note = claims.find((c) => c.kind === "note");
    expect(note?.grade).toBe("X-UNRESOLVED");
    expect(note?.quote).toContain("범위");
  });

  it("records a second, contradicting statement rather than overwriting", () => {
    const claims = parseClaimStatements("폭 12m 입니다. 폭 20m 입니다.");
    expect(claimOf(claims, "overall_width_m")?.value).toBe(12);
    expect(claims.some((c) => c.kind === "note" && c.quote.includes("두 번째"))).toBe(
      true,
    );
  });

  it("reads orientation and categorical facts as observations", () => {
    const claims = parseClaimStatements(
      "주 출입구는 남쪽입니다. 코어는 북측에 있습니다. 평지붕입니다. 조적조 건물입니다.",
    );
    expect(claimOf(claims, "entrance_orientation")?.value).toBe("south");
    expect(claimOf(claims, "entrance_orientation")?.grade).toBe("B-OBSERVED");
    expect(claimOf(claims, "core_position")?.value).toBe("north");
    expect(claimOf(claims, "roof_form")?.value).toBe("flat");
    expect(claimOf(claims, "structure")?.value).toBe("masonry");
  });

  it("returns nothing for an empty statement", () => {
    expect(parseClaimStatements("   ")).toEqual([]);
  });
});

describe("normaliseProvidedClaims — model output is untrusted input", () => {
  it("refuses an out-of-range value the model asserted", () => {
    const out = normaliseProvidedClaims(
      [{ kind: "overall_width_m", value: 5000, quote: "폭 5000m" }],
      "폭 5000m",
    );
    expect(out).toEqual([]);
  });

  it("will not let a model promote a guess to A-VERIFIED", () => {
    const out = normaliseProvidedClaims(
      [
        {
          kind: "overall_width_m",
          value: 12,
          measured: true,
          quote: "폭은 대략 12m 입니다",
          reason: "measured",
        },
      ],
      "폭은 대략 12m 입니다",
    );
    expect(out[0].grade).toBe("D-INFERRED");
    expect(out[0].measured).toBe(false);
  });

  it("keeps A-VERIFIED when the user's own words say measured", () => {
    const text = "폭 12m 를 실측했습니다";
    const out = normaliseProvidedClaims(
      [{ kind: "overall_width_m", value: 12, quote: text }],
      text,
    );
    expect(out[0].grade).toBe("A-VERIFIED");
  });

  it("drops kinds it does not recognise", () => {
    const out = normaliseProvidedClaims(
      [{ kind: "wall_colour", value: "blue", quote: "" }],
      "",
    );
    expect(out).toEqual([]);
  });
});

describe("the generated DXF is readable by the CAD viewer's document mapper", () => {
  const title: BrTitleInfo = {
    mgmBldrgstPk: "PK",
    bldNm: "테스트동",
    platPlcNm: "서울특별시 종로구 청운동 1-1",
    newPlatPlc: "",
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
    grndFlrCnt: 2,
    ugrndFlrCnt: 0,
    totArea: 300,
    archArea: 150,
    platArea: 300,
    bcRat: 50,
    vlRat: 100,
    useAprDay: "20050101",
    pmsDay: "",
    stcnsDay: "",
    roofCd: "10",
    roofCdNm: "평지붕",
    heit: 7.2,
    regstrGbCd: "1",
    regstrGbCdNm: "일반",
    regstrKindCd: "2",
    regstrKindCdNm: "일반건축물",
  };

  it("maps to a CadDocument with the expected layers and entities", () => {
    const pkg = runReconstruction({
      buildingPk: "PK",
      title,
      recap: null,
      floors: [],
      areas: [],
      gis: null,
      address: null,
      claims: [],
      now: "2026-09-02T00:00:00.000Z",
    });

    const doc = mapDxfTextToDoc(pkg.dxf.text, "reconstruction.dxf");
    expect(doc.entities.length).toBeGreaterThan(20);
    const layerNames = doc.layers.map((l) => l.name);
    expect(layerNames).toContain("A-WALL");
    expect(layerNames).toContain("X-VERIFY");
    expect(layerNames).toContain("BIM_OUTLINE");
  });
});
