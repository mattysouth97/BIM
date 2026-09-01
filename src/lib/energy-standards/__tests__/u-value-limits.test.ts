import { describe, expect, it } from "vitest";
import {
  checkUValueCompliance,
  resolveInsulationRegion,
  uValueLimit,
} from "../u-value-limits";

describe("uValueLimit — 별표1 spot checks (제2025-738호)", () => {
  it("거실의 외벽, 외기 직접", () => {
    expect(
      uValueLimit({ element: "exterior_wall", region: "jungbu1", exposure: "direct", residential: true })!
        .limitWPerM2K
    ).toBe(0.15);
    expect(
      uValueLimit({ element: "exterior_wall", region: "jungbu2", exposure: "direct", residential: false })!
        .limitWPerM2K
    ).toBe(0.24);
    expect(
      uValueLimit({ element: "exterior_wall", region: "jeju", exposure: "direct", residential: false })!
        .limitWPerM2K
    ).toBe(0.41);
  });

  it("거실의 외벽, 외기 간접", () => {
    expect(
      uValueLimit({ element: "exterior_wall", region: "nambu", exposure: "indirect", residential: true })!
        .limitWPerM2K
    ).toBe(0.31);
    expect(
      uValueLimit({ element: "exterior_wall", region: "jungbu1", exposure: "indirect", residential: false })!
        .limitWPerM2K
    ).toBe(0.24);
  });

  it("지붕과 바닥", () => {
    expect(
      uValueLimit({ element: "roof", region: "jungbu2", exposure: "direct", residential: false })!
        .limitWPerM2K
    ).toBe(0.15);
    expect(
      uValueLimit({ element: "roof", region: "jeju", exposure: "indirect", residential: true })!
        .limitWPerM2K
    ).toBe(0.35);
    expect(
      uValueLimit({
        element: "lowest_floor_heated",
        region: "nambu",
        exposure: "direct",
        residential: true,
      })!.limitWPerM2K
    ).toBe(0.22);
    expect(
      uValueLimit({
        element: "lowest_floor_unheated",
        region: "jungbu1",
        exposure: "indirect",
        residential: false,
      })!.limitWPerM2K
    ).toBe(0.24);
    expect(
      uValueLimit({
        element: "interfloor_heated",
        region: "jeju",
        exposure: "direct",
        residential: true,
      })!.limitWPerM2K
    ).toBe(0.81);
  });

  it("창 및 문", () => {
    expect(
      uValueLimit({ element: "window", region: "jungbu1", exposure: "direct", residential: true })!
        .limitWPerM2K
    ).toBe(0.9);
    expect(
      uValueLimit({ element: "window", region: "jeju", exposure: "indirect", residential: false })!
        .limitWPerM2K
    ).toBe(2.8);
    expect(
      uValueLimit({ element: "door", region: "nambu", exposure: "direct", residential: false })!
        .limitWPerM2K
    ).toBe(1.5);
    expect(
      uValueLimit({
        element: "apartment_entrance_door",
        region: "jungbu2",
        exposure: "indirect",
        residential: true,
      })!.limitWPerM2K
    ).toBe(1.8);
  });

  it("names the standard on every result", () => {
    const limit = uValueLimit({
      element: "exterior_wall",
      region: "jungbu2",
      exposure: "direct",
      residential: false,
    })!;
    expect(limit.standard).toContain("제2025-738호");
    expect(limit.rowKo).toContain("외벽");
  });
});

describe("checkUValueCompliance", () => {
  const query = {
    element: "exterior_wall",
    region: "jungbu2",
    exposure: "direct",
    residential: false,
  } as const;

  it("passes below the ceiling with a positive margin", () => {
    const check = checkUValueCompliance(0.17, query)!;
    expect(check.compliant).toBe(true);
    expect(check.marginWPerM2K).toBeCloseTo(0.07, 9);
  });

  it("fails above the ceiling with a negative margin", () => {
    const check = checkUValueCompliance(0.58, query)!;
    expect(check.compliant).toBe(false);
    expect(check.marginWPerM2K).toBeLessThan(0);
  });

  it("exactly at the ceiling is compliant (기준값 이하)", () => {
    expect(checkUValueCompliance(0.24, query)!.compliant).toBe(true);
  });

  it("refuses nonsense input", () => {
    expect(checkUValueCompliance(0, query)).toBeNull();
    expect(checkUValueCompliance(Number.NaN, query)).toBeNull();
  });
});

describe("resolveInsulationRegion", () => {
  it("resolves 시도-level regions", () => {
    expect(resolveInsulationRegion("11680")).toEqual({ region: "jungbu2", regionBasis: "sido" }); // 서울 강남
    expect(resolveInsulationRegion("26110")).toEqual({ region: "nambu", regionBasis: "sido" }); // 부산
    expect(resolveInsulationRegion("50110")).toEqual({ region: "jeju", regionBasis: "sido" });
    expect(resolveInsulationRegion("51110")).toEqual({ region: "jungbu1", regionBasis: "sido" }); // 강원 춘천
  });

  it("applies footnote exceptions when the 시군구 name is known", () => {
    expect(resolveInsulationRegion("51150", "강릉시")).toEqual({
      region: "jungbu2",
      regionBasis: "sigungu_exception",
    });
    expect(resolveInsulationRegion("41480", "파주시")).toEqual({
      region: "jungbu1",
      regionBasis: "sigungu_exception",
    });
    expect(resolveInsulationRegion("43150", "제천시")).toEqual({
      region: "jungbu1",
      regionBasis: "sigungu_exception",
    });
    expect(resolveInsulationRegion("48880", "거창군")).toEqual({
      region: "jungbu2",
      regionBasis: "sigungu_exception",
    });
  });

  it("keeps the 시도 default when the name matches no exception", () => {
    expect(resolveInsulationRegion("41135", "성남시 분당구")).toEqual({
      region: "jungbu2",
      regionBasis: "sido",
    });
  });

  it("returns null for an unknown prefix rather than guessing", () => {
    expect(resolveInsulationRegion("99999")).toBeNull();
  });
});
