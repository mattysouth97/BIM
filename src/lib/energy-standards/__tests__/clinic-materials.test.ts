import { describe, expect, it } from "vitest";
import { calculateAssembly, type AssemblyLayerInput } from "../assembly";
import { GENERIC_MATERIALS, genericMaterialById, type GenericMaterial } from "../materials";

/**
 * The Medical-Dental Clinic reference building needs material entries the
 * Korean 별표 library does not carry. These tests pin the sourced values and —
 * more importantly — pin the guarantee that adding them changed nothing that
 * was already there.
 *
 * Sources, named where each value came from:
 *   EN 12524:2000 Table 1  the table EN ISO 10456:2007 succeeded. ISO 10456
 *                          itself is not freely readable, so the predecessor
 *                          is cited directly rather than laundered through a
 *                          secondary source that paraphrases it.
 *   ISO 6946:2007 Table 2  unventilated air layers.
 *   ASTM C1289 LTTR        North American polyiso roof-board design value.
 */

const R_IMPERIAL_TO_SI = 0.1761101838; // 1 h·ft²·°F/Btu -> m²K/W
const INCH_M = 0.0254;

const lambdaOf = (id: string): number | undefined =>
  genericMaterialById(id)?.conductivityWPerMK;
const fixedROf = (id: string): number | undefined =>
  genericMaterialById(id)?.fixedResistanceM2KPerW;

describe("additive-only guarantee", () => {
  /**
   * Every entry that existed before the Clinic work, with the value it had.
   * If one of these moves, the ledger baseline shifts underneath assemblies
   * already persisted against these ids. That is why the rule is additive-only,
   * and why it is a test rather than a comment.
   */
  const PRE_EXISTING: ReadonlyArray<readonly [string, number, "lambda" | "fixedR"]> = [
    ["ins-eps1", 0.036, "lambda"],
    ["ins-eps2", 0.032, "lambda"],
    ["ins-xps", 0.029, "lambda"],
    ["ins-pir", 0.025, "lambda"],
    ["ins-pf", 0.02, "lambda"],
    ["ins-gw", 0.036, "lambda"],
    ["ins-mw", 0.038, "lambda"],
    ["st-rc", 2.3, "lambda"],
    ["st-lwc", 0.16, "lambda"],
    ["st-brick", 0.8, "lambda"],
    ["st-redbrick", 0.78, "lambda"],
    ["fin-mortar", 1.4, "lambda"],
    ["fin-gypsum", 0.18, "lambda"],
    ["wd-structural", 0.14, "lambda"],
    ["sn-granite", 3.1, "lambda"],
    ["mt-alpanel", 160, "lambda"],
    ["air-20", 0.17, "fixedR"],
    ["air-10", 0.14, "fixedR"],
  ];

  it.each(PRE_EXISTING)("%s keeps its original value", (id, value, kind) => {
    const actual = kind === "lambda" ? lambdaOf(id) : fixedROf(id);
    expect(actual).toBe(value);
  });

  it("still contains every pre-existing id", () => {
    for (const [id] of PRE_EXISTING) {
      expect(genericMaterialById(id), id + " disappeared").toBeDefined();
    }
  });
});

describe("library invariants", () => {
  it("gives every entry exactly one of λ or a fixed resistance", () => {
    for (const m of GENERIC_MATERIALS) {
      const hasLambda = m.conductivityWPerMK !== undefined;
      const hasFixedR = m.fixedResistanceM2KPerW !== undefined;
      expect(hasLambda !== hasFixedR, m.id + " needs exactly one of λ / fixed R").toBe(true);
    }
  });

  it("keeps ids unique — persisted assemblies reference them", () => {
    const ids = GENERIC_MATERIALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hardwires confidence to generic on every entry, new ones included", () => {
    for (const m of GENERIC_MATERIALS) expect(m.confidence).toBe("generic");
  });
});

const NEW_IDS = [
  "mb-epdm",
  "ins-polyiso",
  "mt-steel-deck",
  "wd-plywood",
  "pnl-imp-pir42",
  "air-iso-h25",
  "air-iso-u25",
  "fin-plasterboard-iso",
] as const;

describe("Clinic entries — sourced values", () => {
  it.each(NEW_IDS)("%s exists", (id) => {
    expect(genericMaterialById(id)).toBeDefined();
  });

  it("names a checkable source on every new entry — 'typical' is not a citation", () => {
    for (const id of NEW_IDS) {
      const note = genericMaterialById(id)!.sourceNoteKo;
      expect(
        /EN 12524|ISO 6946|ASTM C1289|제조사 자료/.test(note),
        id + " cites nothing checkable: " + note
      ).toBe(true);
    }
  });

  it("takes EPDM from EN 12524 Table 1 (ρ 1150, λ 0.25, c 1000)", () => {
    const m = genericMaterialById("mb-epdm") as GenericMaterial;
    expect(m.conductivityWPerMK).toBe(0.25);
    expect(m.densityKgPerM3).toBe(1150);
    expect(m.specificHeatJPerKgK).toBe(1000);
  });

  it("takes plywood from the EN 12524 ρ=500 row, not the 300/700/1000 rows", () => {
    const m = genericMaterialById("wd-plywood") as GenericMaterial;
    expect(m.conductivityWPerMK).toBe(0.13);
    expect(m.densityKgPerM3).toBe(500);
  });

  it("takes steel decking from EN 12524 'Steel' — λ 50, so its R is ~zero", () => {
    expect(lambdaOf("mt-steel-deck")).toBe(50);
    expect(0.038 / 50).toBeLessThan(0.001);
  });

  it("converts the ASTM C1289 LTTR R-5.7/in design value to λ correctly", () => {
    // λ = 1 inch / R(1 inch) = 0.0254 / (5.7 × 0.1761101838)
    const expected = INCH_M / (5.7 * R_IMPERIAL_TO_SI);
    expect(expected).toBeCloseTo(0.0253, 4);
    expect(lambdaOf("ins-polyiso")).toBeCloseTo(expected, 4);
  });

  it("leaves polyiso density unset — EN 12524 gives 28–55, and a range is not a value", () => {
    expect(genericMaterialById("ins-polyiso")!.densityKgPerM3).toBeUndefined();
    expect(genericMaterialById("ins-polyiso")!.specificHeatJPerKgK).toBe(1400);
  });

  it("treats the metal panel as a product with a fixed R, not a material with a λ", () => {
    const m = genericMaterialById("pnl-imp-pir42") as GenericMaterial;
    expect(m.conductivityWPerMK).toBeUndefined();
    expect(m.fixedResistanceM2KPerW).toBe(1.75);
    // The R is declared for one thickness. Offering others would imply a λ.
    expect(m.typicalThicknessesMm).toEqual([42]);
  });

  it("keeps the panel R inside the published aged band R-6.0…6.5 per inch", () => {
    const rAt = (perInch: number) => 0.042 / (INCH_M / (perInch * R_IMPERIAL_TO_SI));
    const lo = rAt(6.0);
    const hi = rAt(6.5);
    const actual = fixedROf("pnl-imp-pir42")!;
    expect(lo).toBeCloseTo(1.747, 3);
    expect(hi).toBeCloseTo(1.893, 3);
    expect(actual).toBeGreaterThanOrEqual(lo - 0.01);
    expect(actual).toBeLessThanOrEqual(hi);
  });

  it("uses the ISO 6946 Table 2 horizontal plateau of 0.18, leaving the KS 0.17 alone", () => {
    expect(fixedROf("air-iso-h25")).toBe(0.18);
    expect(fixedROf("air-20")).toBe(0.17);
  });

  it("carries a separate UPWARD cavity at 0.16 — a roof must not use the horizontal row", () => {
    // ISO 6946 Table 2 is direction-dependent: upward plateaus at 0.16,
    // horizontal at 0.18. Using 0.18 on a roof overstates resistance and lowers
    // U — it flatters the building. On the Clinic's 286 mm bar-joist roof that
    // is U 3.23 where the correct row gives 3.45.
    expect(fixedROf("air-iso-u25")).toBe(0.16);
    expect(fixedROf("air-iso-u25")!).toBeLessThan(fixedROf("air-iso-h25")!);
  });

  it("does not offer a downward cavity, because that row is not flat", () => {
    // Table 2 downward runs 0.19 → 0.23 across 25…300 mm, so a single fixed-R
    // entry would be wrong at most thicknesses. Absent on purpose.
    expect(genericMaterialById("air-iso-d25")).toBeUndefined();
  });

  it("adds the ISO plasterboard value without disturbing the KS one", () => {
    expect(lambdaOf("fin-plasterboard-iso")).toBe(0.25);
    expect(lambdaOf("fin-gypsum")).toBe(0.18);
  });
});

/**
 * The three Clinic envelope assemblies through the repo's own engine. Layer
 * thicknesses are the IFC's, not chosen: roof 6/76/38, wall 42/38/19/152/16,
 * ground slab 150.
 *
 * These use the repo's Korean 별표 surface resistances (walls 0.11/0.043,
 * roofs 0.086/0.043), NOT ISO 6946 Table 1 (0.13/0.04 and 0.10/0.04). That
 * substitution is documented in assembly.ts and moves the answers by ~1%.
 */
describe("Clinic envelope assemblies", () => {
  const layer = (id: string, thicknessMm: number, materialId: string): AssemblyLayerInput => {
    const m = genericMaterialById(materialId);
    if (!m) throw new Error("unknown material " + materialId);
    return m.fixedResistanceM2KPerW !== undefined
      ? { id, thicknessM: thicknessMm / 1000, fixedResistanceM2KPerW: m.fixedResistanceM2KPerW }
      : { id, thicknessM: thicknessMm / 1000, conductivityWPerMK: m.conductivityWPerMK };
  };

  it("roof: EPDM 6 | polyiso 76 | steel deck 38 gives U ≈ 0.317", () => {
    const r = calculateAssembly(
      [
        layer("epdm", 6, "mb-epdm"),
        layer("rigid-insulation", 76, "ins-polyiso"),
        layer("steel-deck", 38, "mt-steel-deck"),
      ],
      "upward"
    );
    expect(r.uValueWPerM2K).toBeCloseTo(0.317, 3);
  });

  it("roof falls one board increment short of ASHRAE 90.1-2007 R-20ci above deck", () => {
    // 76 mm at R-5.7/in is R-17.1ci; R-20ci needs about 89 mm.
    const insulationR = 0.076 / 0.0253;
    expect(insulationR / R_IMPERIAL_TO_SI).toBeCloseTo(17.1, 1);
    const thicknessForR20 = 20 * R_IMPERIAL_TO_SI * 0.0253;
    expect(thicknessForR20 * 1000).toBeCloseTo(89, 0);
  });

  it("wall: IMP 42 | cavity 38 | plywood 19 | cavity 152 | plasterboard 16 gives U ≈ 0.404", () => {
    const r = calculateAssembly(
      [
        layer("insulated-panel", 42, "pnl-imp-pir42"),
        layer("firring-cavity", 38, "air-iso-h25"),
        layer("plywood", 19, "wd-plywood"),
        layer("stud-cavity", 152, "air-iso-h25"),
        layer("plasterboard", 16, "fin-plasterboard-iso"),
      ],
      "horizontal"
    );
    expect(r.uValueWPerM2K).toBeCloseTo(0.404, 3);
  });

  it("wall is carried almost entirely by the panel — everything else is trim", () => {
    const r = calculateAssembly(
      [
        layer("insulated-panel", 42, "pnl-imp-pir42"),
        layer("firring-cavity", 38, "air-iso-h25"),
        layer("plywood", 19, "wd-plywood"),
        layer("stud-cavity", 152, "air-iso-h25"),
        layer("plasterboard", 16, "fin-plasterboard-iso"),
      ],
      "horizontal"
    );
    const panel = r.layers.find((l) => l.id === "insulated-panel")!.resistanceM2KPerW;
    const rest = r.layers
      .filter((l) => l.id !== "insulated-panel")
      .reduce((s, l) => s + l.resistanceM2KPerW, 0);
    expect(panel).toBeGreaterThan(rest * 2.5);
  });

  it("ground slab alone gives an absurd U — it needs ISO 13370, not an air-to-air U", () => {
    const r = calculateAssembly([layer("slab", 150, "st-rc")], "downward");
    // ~3.9 W/m²K. The arithmetic is right; the model is wrong. A slab on grade
    // loses heat to the ground, not to outside air.
    expect(r.uValueWPerM2K).toBeGreaterThan(3);
  });
});
