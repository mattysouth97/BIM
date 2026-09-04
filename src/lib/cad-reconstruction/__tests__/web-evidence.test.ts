import { describe, expect, it } from "vitest";

import type { BrTitleInfo } from "@/lib/types";

import { runReconstruction } from "..";
import type { EvidenceInput, WebEvidenceInput } from "../types";
import { normaliseWebFacts, webFactConflicts } from "../web-evidence";

function raw(over: Record<string, unknown> = {}) {
  return {
    kind: "storeys_above",
    value: 6,
    unit: "floors",
    quote: "지상 6층 규모의 업무시설이다.",
    citations: [{ url: "https://example.kr/news/1", title: "기사" }],
    ...over,
  };
}

describe("normaliseWebFacts — a fact without a citation is not a fact", () => {
  it("keeps a well-formed, cited fact", () => {
    const facts = normaliseWebFacts([raw()]);
    expect(facts).toHaveLength(1);
    expect(facts[0].kind).toBe("storeys_above");
    expect(facts[0].value).toBe(6);
    expect(facts[0].citations[0].url).toBe("https://example.kr/news/1");
  });

  it("drops a fact with no citations at all", () => {
    expect(normaliseWebFacts([raw({ citations: [] })])).toEqual([]);
    expect(normaliseWebFacts([raw({ citations: undefined })])).toEqual([]);
  });

  it("drops citations that are not http(s) URLs, and the fact if none survive", () => {
    expect(
      normaliseWebFacts([raw({ citations: [{ url: "javascript:alert(1)" }] })]),
    ).toEqual([]);
    expect(normaliseWebFacts([raw({ citations: [{ url: "not a url" }] })])).toEqual([]);
    expect(
      normaliseWebFacts([
        raw({ citations: [{ url: "ftp://x.kr/a" }, { url: "https://ok.kr/b" }] }),
      ])[0].citations,
    ).toHaveLength(1);
  });

  it("drops a fact with no quote — an uncitable claim is not reviewable", () => {
    expect(normaliseWebFacts([raw({ quote: "" })])).toEqual([]);
    expect(normaliseWebFacts([raw({ quote: null })])).toEqual([]);
  });

  it("refuses an unknown fact kind rather than inventing a slot for it", () => {
    expect(normaliseWebFacts([raw({ kind: "parking_spaces" })])).toEqual([]);
  });

  it("rejects a numeric kind whose value will not parse", () => {
    expect(normaliseWebFacts([raw({ value: "여섯" })])).toEqual([]);
    expect(normaliseWebFacts([raw({ value: null })])).toEqual([]);
  });

  it("rejects physically impossible numbers instead of passing them through", () => {
    expect(normaliseWebFacts([raw({ value: 0 })])).toEqual([]);
    expect(normaliseWebFacts([raw({ value: -3 })])).toEqual([]);
    expect(normaliseWebFacts([raw({ value: 9999 })])).toEqual([]);
  });

  it("ALWAYS grades a web fact as inferred, whatever the model said", () => {
    const facts = normaliseWebFacts([raw({ grade: "A-VERIFIED", measured: true })]);
    expect(facts[0].grade).toBe("D-INFERRED");
  });

  it("is total on junk input", () => {
    expect(normaliseWebFacts(null)).toEqual([]);
    expect(normaliseWebFacts("nope")).toEqual([]);
    expect(normaliseWebFacts([null, 3, "x"])).toEqual([]);
  });

  it("keeps only the first fact of each kind — the rest are duplicates", () => {
    const facts = normaliseWebFacts([raw(), raw({ value: 8 })]);
    expect(facts).toHaveLength(1);
    expect(facts[0].value).toBe(6);
  });
});

describe("webFactConflicts — the register keeps the value, the web gets recorded", () => {
  const title = { grndFlrCnt: 3, heit: 11.4, totArea: 600 } as BrTitleInfo;

  it("raises a conflict when the web disagrees about storeys", () => {
    const conflicts = webFactConflicts(normaliseWebFacts([raw({ value: 6 })]), title);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].valueA).toContain("3");
    expect(conflicts[0].valueB).toContain("6");
    // The citation has to reach the conflict, or it cannot be checked.
    expect(conflicts[0].sourceB).toContain("https://example.kr/news/1");
    expect(conflicts[0].resolutionStatus).toBe("documented");
  });

  it("stays silent when the web agrees", () => {
    expect(webFactConflicts(normaliseWebFacts([raw({ value: 3 })]), title)).toEqual([]);
  });

  it("stays silent when the register never stated the value", () => {
    const blank = { grndFlrCnt: 0, heit: 0 } as BrTitleInfo;
    expect(webFactConflicts(normaliseWebFacts([raw({ value: 6 })]), blank)).toEqual([]);
  });

  it("allows height a tolerance, because measuring points differ", () => {
    const near = normaliseWebFacts([
      raw({ kind: "building_height_m", value: 12, unit: "m", quote: "높이 12m" }),
    ]);
    expect(webFactConflicts(near, title)).toEqual([]);

    const far = normaliseWebFacts([
      raw({ kind: "building_height_m", value: 30, unit: "m", quote: "높이 30m" }),
    ]);
    expect(webFactConflicts(far, title)).toHaveLength(1);
  });

  it("has nothing to say without a register", () => {
    expect(webFactConflicts(normaliseWebFacts([raw()]), null)).toEqual([]);
  });
});

describe("web evidence reaches the model as a cross-check only", () => {
  const fullTitle = {
    mgmBldrgstPk: "11110-100-1-1-0",
    bldNm: "테스트동",
    platPlcNm: "서울특별시 종로구 청운동 1-1",
    sigunguCd: "11110",
    bjdongCd: "10300",
    platGbCd: "0",
    bun: "0001",
    ji: "0001",
    mainPurpsCd: "14000",
    strctCd: "21",
    strctCdNm: "철근콘크리트구조",
    grndFlrCnt: 3,
    ugrndFlrCnt: 0,
    totArea: 600,
    archArea: 200,
    platArea: 400,
    useAprDay: "19980412",
    heit: 11.4,
  } as BrTitleInfo;

  function withWeb(web: WebEvidenceInput | null): EvidenceInput {
    return {
      buildingPk: "11110-100-1-1-0",
      title: fullTitle,
      recap: null,
      floors: [],
      areas: [],
      gis: null,
      address: "서울특별시 종로구 청운동 1-1",
      claims: [],
      now: "2026-09-04T00:00:00.000Z",
      web,
    };
  }

  const disagreeing: WebEvidenceInput = {
    facts: normaliseWebFacts([
      {
        kind: "storeys_above",
        value: 9,
        quote: "지상 9층 규모다.",
        citations: [{ url: "https://example.kr/a" }],
      },
    ]),
    query: "테스트동",
    searched: true,
    error: null,
  };

  it("records the disagreement and leaves the register in charge of the model", () => {
    const pkg = runReconstruction(withWeb(disagreeing));
    const conflict = pkg.model.conflicts.find((c) => c.subject.includes("웹 검색"))!;
    expect(conflict).toBeDefined();
    expect(conflict.sourceB).toContain("https://example.kr/a");
    // The register still built the building.
    expect(pkg.model.levels.filter((l) => !l.below)).toHaveLength(3);
    expect(pkg.model.building.storeysAbove).toBe(3);
  });

  it("never lets a web fact touch the footprint", () => {
    const pkg = runReconstruction(withWeb(disagreeing));
    expect(pkg.model.footprint.method).not.toContain("웹");
    expect(pkg.model.outlineScan.candidates.every((c) => c.sourceId !== "SRC-WEB")).toBe(
      true,
    );
  });

  it("is the weakest source in the register, and never above D-INFERRED", () => {
    const pkg = runReconstruction(withWeb(disagreeing));
    const record = pkg.model.sources.find((s) => s.sourceId === "SRC-WEB")!;
    expect(record.available).toBe(true);
    expect(record.confidence).toBe("D-INFERRED");
    expect(record.authorityLevel).toBe(5);
    expect(record.dimensionsAvailable).toBe(false);
  });

  it("distinguishes 'searched and found nothing' from 'never searched'", () => {
    const searched = runReconstruction(
      withWeb({ facts: [], query: "x", searched: true, error: null }),
    );
    const never = runReconstruction(withWeb(null));
    for (const pkg of [searched, never]) {
      const record = pkg.model.sources.find((s) => s.sourceId === "SRC-WEB")!;
      expect(record.available).toBe(false);
      expect(record.confidence).toBe("X-UNRESOLVED");
    }
  });
});
