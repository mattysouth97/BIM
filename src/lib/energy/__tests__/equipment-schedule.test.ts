import { describe, it, expect } from "vitest";
import {
  parseEquipmentSchedule,
  scheduleToMaterialPatches,
} from "../equipment-schedule";

describe("parseEquipmentSchedule", () => {
  it("parses a Korean header row", () => {
    const text = "종류,용량,연도,연료,효율\n난방,200,2014,가스,0.92\n냉방,180,2016,전기,3.2";
    const parsed = parseEquipmentSchedule(text);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      type: "heating",
      capacityKw: 200,
      installYear: 2014,
      fuel: "gas",
      efficiency: 0.92,
    });
    expect(parsed.rows[1].type).toBe("cooling");
  });

  it("parses positional rows without a header", () => {
    const parsed = parseEquipmentSchedule("heating,120,2008,gas,0.85");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].capacityKw).toBe(120);
  });

  it("maps heating/cooling rows onto material paths", () => {
    const parsed = parseEquipmentSchedule("heating,200,2014,gas,0.92");
    const { paths } = scheduleToMaterialPatches(parsed.rows);
    expect(paths).toEqual(
      expect.arrayContaining([
        { path: "hvac.heating.capacity", value: 200 },
        { path: "hvac.heating.efficiency", value: 0.92 },
        { path: "hvac.heating.fuelType", value: "gas" },
      ]),
    );
  });

  it("warns on unknown type and returns no rows", () => {
    const parsed = parseEquipmentSchedule("type,capacity\npiano,3");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});
