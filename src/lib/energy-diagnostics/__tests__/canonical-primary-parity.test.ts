import { describe, expect, it } from "vitest";
import { canonicalParityBuilding, paritySimulationRun } from "@/hooks/__tests__/test-fixtures";
import { parseEngineOutput, type CompiledDegreeDayInput } from "../adapter";
import { calculatePrimaryEnergy } from "@/lib/energy/primary-energy";
import { buildEndUseLoads } from "@/lib/energy/end-uses";
import { deliveredFromDemand } from "@/lib/energy/delivered-from-demand";

describe("canonical primary mapping uses shared end uses",()=>{
  it("agrees exactly on declared PV and district cooling rather than dropping either leg",()=>{
    const fixture=canonicalParityBuilding();
    fixture.materials.renewable.solarPV={...fixture.materials.renewable.solarPV,installed:true,capacity:100};
    fixture.materials.hvac.cooling.systemType="district";
    const run=paritySimulationRun(fixture);const input=run.engineInput as CompiledDegreeDayInput;
    const parsed=parseEngineOutput(run.engineOutput!,input);
    const shared=calculatePrimaryEnergy(deliveredFromDemand(buildEndUseLoads({demand:run.engineOutput!.annualDemand,materials:fixture.materials,recipe:fixture.recipe,climateRegion:fixture.climateRegion})),input.payload.mapping.conditionedFloorAreaSqm);
    expect(parsed.primary!.totalKwh).toBe(shared.primaryEnergy.total);
    expect(parsed.primary!.perM2Kwh).toBe(shared.primaryEnergyPerArea);
    expect(parsed.primary!.primaryByFuelKwh.districtCooling).toBe(shared.primaryEnergy.districtCooling);
    expect(parsed.primary!.primaryByFuelKwh.electricity).toBe(0);
    expect(parsed.primary!.basis).toContain("LPD");
  });
});
