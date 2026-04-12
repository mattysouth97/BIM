import { describe, it, expect } from "vitest";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "./mep-equipment-params";

describe("DEFAULT_MEP_EQUIPMENT_PARAMS", () => {
  it("has all 6 sub-keys", () => {
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS).toHaveProperty("chiller");
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS).toHaveProperty("boiler");
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS).toHaveProperty("ahu");
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS).toHaveProperty("dhw");
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS).toHaveProperty("lightingFixture");
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS).toHaveProperty("electricalPanel");
  });

  it("chiller.bodyWidth === 2.4", () => {
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.chiller.bodyWidth).toBe(2.4);
  });

  it("chiller.bodyWidth is a number", () => {
    expect(typeof DEFAULT_MEP_EQUIPMENT_PARAMS.chiller.bodyWidth).toBe("number");
  });

  it("boiler.height === 1.8", () => {
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.boiler.height).toBe(1.8);
  });

  it("boiler.vrfLocation === 'roof'", () => {
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.boiler.vrfLocation).toBe("roof");
  });

  it("ahu.showDuctStubs === true", () => {
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.ahu.showDuctStubs).toBe(true);
  });

  it("lightingFixture.height === 0.10 (NOT 0.02)", () => {
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.lightingFixture.height).toBe(0.10);
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.lightingFixture.height).not.toBe(0.02);
  });

  it("dhw.showPump === true", () => {
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.dhw.showPump).toBe(true);
  });

  it("electricalPanel.showDoorOutline === true", () => {
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.electricalPanel.showDoorOutline).toBe(true);
  });
});
