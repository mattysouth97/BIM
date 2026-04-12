import { describe, it, expect, beforeEach } from "vitest";
import { useEquipmentStore } from "../equipment-store";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "@/lib/layers/mep-equipment-params";

describe("useEquipmentStore", () => {
  beforeEach(() => {
    useEquipmentStore.setState({ params: {} });
  });

  it("getParams on unknown pk returns deep-equal copy of DEFAULT_MEP_EQUIPMENT_PARAMS", () => {
    const result = useEquipmentStore.getState().getParams("unknown-pk");
    expect(result).toEqual(DEFAULT_MEP_EQUIPMENT_PARAMS);
    expect(result).not.toBe(DEFAULT_MEP_EQUIPMENT_PARAMS); // must be a copy, not the same ref
  });

  it("setParams then getParams returns correct value", () => {
    useEquipmentStore.getState().setParams("pk-A", DEFAULT_MEP_EQUIPMENT_PARAMS);
    const result = useEquipmentStore.getState().getParams("pk-A");
    expect(result.chiller.bodyWidth).toBe(2.4);
  });

  it("overrideParam updates only the targeted nested property", () => {
    useEquipmentStore.getState().setParams("pk-A", DEFAULT_MEP_EQUIPMENT_PARAMS);
    useEquipmentStore.getState().overrideParam("pk-A", "chiller.bodyWidth", 3.2);
    const result = useEquipmentStore.getState().getParams("pk-A");
    expect(result.chiller.bodyWidth).toBe(3.2);
    expect(result.chiller.bodyDepth).toBe(1.8); // sibling unchanged
  });

  it("overrideParam on unseen pk initializes from DEFAULT then applies override (NOT a no-op)", () => {
    useEquipmentStore.getState().overrideParam("new-pk", "chiller.bodyWidth", 5.0);
    const result = useEquipmentStore.getState().getParams("new-pk");
    expect(result.chiller.bodyWidth).toBe(5.0);
    // other defaults still present
    expect(result.chiller.bodyDepth).toBe(1.8);
    expect(result.boiler.height).toBe(1.8);
  });

  it("overrideParam persists a boolean false", () => {
    useEquipmentStore.getState().setParams("pk-A", DEFAULT_MEP_EQUIPMENT_PARAMS);
    useEquipmentStore.getState().overrideParam("pk-A", "ahu.showDuctStubs", false);
    const result = useEquipmentStore.getState().getParams("pk-A");
    expect(result.ahu.showDuctStubs).toBe(false);
  });

  it("overrideParam does not mutate DEFAULT_MEP_EQUIPMENT_PARAMS", () => {
    useEquipmentStore.getState().overrideParam("pk-mutate-test", "chiller.bodyWidth", 99);
    expect(DEFAULT_MEP_EQUIPMENT_PARAMS.chiller.bodyWidth).toBe(2.4);
  });

  it("two different pks are fully isolated", () => {
    useEquipmentStore.getState().setParams("pk-A", DEFAULT_MEP_EQUIPMENT_PARAMS);
    useEquipmentStore.getState().setParams("pk-B", DEFAULT_MEP_EQUIPMENT_PARAMS);
    useEquipmentStore.getState().overrideParam("pk-A", "chiller.bodyWidth", 9.9);
    const resultB = useEquipmentStore.getState().getParams("pk-B");
    expect(resultB.chiller.bodyWidth).toBe(2.4); // pk-B unaffected
  });
});
