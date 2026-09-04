// src/lib/mep/__tests__/rules-archetype.test.ts
// chooseArchetype/buildingUseFamily had no dedicated test (SESSION-LOCKS.md
// queue item 6, user-authorized 09-04 10:33 for the honesty half only: fix
// the false claim, invent no MOLIT ratios). The bug: for a mainPurpsCd this
// repo's SYSTEM_RATIOS/buildingUseFamily tables don't recognise (family
// "default" — anything outside 01/02/03/04/07/14), chooseArchetype fell
// into the same branch as "office" and returned a reason string claiming
// "업무시설" for a building whose use it does not actually know — e.g.
// "10000" (교육연구시설, korean-building-codes.ts:178) reads
// "2000년 이후 업무시설: 시스템에어컨(VRF) + 환기유닛 관행", a false claim.
import { describe, expect, it } from "vitest";
import { buildingUseFamily, chooseArchetype } from "../rules";

describe("buildingUseFamily", () => {
  it("classifies known prefixes", () => {
    expect(buildingUseFamily("14000")).toBe("office");
    expect(buildingUseFamily("02000")).toBe("residential");
    expect(buildingUseFamily("01000")).toBe("residential");
    expect(buildingUseFamily("07000")).toBe("retail");
    expect(buildingUseFamily("03000")).toBe("retail");
    expect(buildingUseFamily("04000")).toBe("retail");
  });

  it("falls back to default for an unrecognised prefix", () => {
    expect(buildingUseFamily("10000")).toBe("default"); // 교육연구시설
    expect(buildingUseFamily("09000")).toBe("default"); // 문화및집회시설
  });
});

describe("chooseArchetype — office (family is genuinely known)", () => {
  it("names the real use in the reason, post-2000", () => {
    const c = chooseArchetype("14000", 2005);
    expect(c.archetype).toBe("vrf");
    expect(c.basis).toBe("estimated");
    expect(c.reason).toContain("업무시설");
  });

  it("names the real use in the reason, pre-2000", () => {
    const c = chooseArchetype("14000", 1995);
    expect(c.archetype).toBe("central-ahu");
    expect(c.basis).toBe("estimated");
    expect(c.reason).toContain("업무시설");
  });
});

describe("chooseArchetype — default family (use is NOT known)", () => {
  it("does not claim 업무시설 for a building whose use it doesn't recognise, post-2000", () => {
    const c = chooseArchetype("10000", 2005); // 교육연구시설
    expect(c.archetype).toBe("vrf"); // same heuristic archetype kept — no new MOLIT data invented
    expect(c.reason).not.toContain("업무시설");
    expect(c.basis).toBe("defaulted"); // not "estimated" — this is a labelled fallback, not a determination
  });

  it("does not claim 업무시설 for a building whose use it doesn't recognise, pre-2000", () => {
    const c = chooseArchetype("10000", 1995);
    expect(c.archetype).toBe("central-ahu");
    expect(c.reason).not.toContain("업무시설");
    expect(c.basis).toBe("defaulted");
  });

  it("uses a distinct ruleId from the genuine office determination", () => {
    const office = chooseArchetype("14000", 2005);
    const fallback = chooseArchetype("09000", 2005);
    expect(fallback.ruleId).not.toBe(office.ruleId);
  });
});
