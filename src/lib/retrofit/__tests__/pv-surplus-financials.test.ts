import { describe, expect, it } from "vitest";
import { canonicalParityBuilding } from "@/hooks/__tests__/test-fixtures";
import { generateRetrofitMeasures } from "../retrofit-core";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";

describe("isolated savings with existing PV surplus",()=>{
  it("reduces LED physical consumption without inventing a grid bill or carbon saving",()=>{
    const fixture=canonicalParityBuilding();
    fixture.materials.renewable.solarPV={...fixture.materials.renewable.solarPV,installed:true,capacity:1000};
    const area=envelopeQuantities(fixture.recipe).intensityFloorAreaSqm;
    const core=generateRetrofitMeasures({...fixture,conditionedFloorAreaSqm:area,programTrack:"none",measureIds:["lighting-led-smart"],unsavedEditCount:0});
    const led=core.measures.find(m=>m.id==="lighting-led-smart")!;
    expect(led.annualEnergySaving).toBeGreaterThan(0);
    expect(led.annualEnergySaving).toBe(-core.delta!.deltaSitePerSqm*area);
    expect(led.annualCostSaving).toBe(0);
    expect(core.bill!.annualSavingKrw).toBe(0);
    expect(led.co2Reduction).toBe(0);
    expect(led.pricedByEngine).toBe(true);
    expect(core.delta!.isZeroDelta).toBe(false);
    expect(led.financials.npv).toBeLessThan(0);
    expect(led.description).toContain("annual bill saving 0 KRW");
  });
});
