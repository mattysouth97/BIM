import { describe, expect, it } from "vitest";
import {
  AssemblyCalcError,
  calculateAssembly,
  SURFACE_RESISTANCES,
  thicknessForTargetU,
  type AssemblyLayerInput,
} from "../assembly";

const RC_WALL: AssemblyLayerInput[] = [
  { id: "mortar", thicknessM: 0.02, conductivityWPerMK: 1.4 },
  { id: "concrete", thicknessM: 0.2, conductivityWPerMK: 2.3 },
  { id: "eps", thicknessM: 0.1, conductivityWPerMK: 0.032 },
  { id: "gypsum", thicknessM: 0.0125, conductivityWPerMK: 0.18 },
];

describe("calculateAssembly — analytical values", () => {
  it("computes a hand-verifiable single-layer wall", () => {
    // R_T = 0.11 + 0.043 + 0.1/0.04 = 2.653 → U = 0.376932...
    const result = calculateAssembly(
      [{ id: "ins", thicknessM: 0.1, conductivityWPerMK: 0.04 }],
      "horizontal"
    );
    expect(result.totalResistanceM2KPerW).toBeCloseTo(2.653, 6);
    expect(result.uValueWPerM2K).toBeCloseTo(1 / 2.653, 6);
  });

  it("computes the RC wall stack exactly", () => {
    // ΣR = 0.02/1.4 + 0.2/2.3 + 0.1/0.032 + 0.0125/0.18
    const layerR = 0.02 / 1.4 + 0.2 / 2.3 + 0.1 / 0.032 + 0.0125 / 0.18;
    const expectedR = 0.11 + 0.043 + layerR;
    const result = calculateAssembly(RC_WALL, "horizontal");
    expect(result.totalResistanceM2KPerW).toBeCloseTo(expectedR, 9);
    expect(result.uValueWPerM2K).toBeCloseTo(1 / expectedR, 9);
  });

  it("uses direction-dependent surface resistances", () => {
    const layers = [{ id: "ins", thicknessM: 0.1, conductivityWPerMK: 0.04 }];
    const wall = calculateAssembly(layers, "horizontal");
    const roof = calculateAssembly(layers, "upward");
    const floor = calculateAssembly(layers, "downward");
    expect(roof.uValueWPerM2K).toBeGreaterThan(wall.uValueWPerM2K); // Rsi 0.086 < 0.11
    expect(floor.uValueWPerM2K).toBeLessThan(wall.uValueWPerM2K); // Rsi 0.15 > 0.11
    expect(wall.surface).toMatchObject(SURFACE_RESISTANCES.horizontal);
  });

  it("accepts fixed-resistance layers (air cavity)", () => {
    const result = calculateAssembly(
      [
        { id: "brick", thicknessM: 0.09, conductivityWPerMK: 0.8 },
        { id: "air", thicknessM: 0.02, fixedResistanceM2KPerW: 0.17 },
      ],
      "horizontal"
    );
    expect(result.totalResistanceM2KPerW).toBeCloseTo(0.11 + 0.043 + 0.09 / 0.8 + 0.17, 9);
  });

  it("reports per-layer resistance shares that sum to the layers' share of R_T", () => {
    const result = calculateAssembly(RC_WALL, "horizontal");
    const layerShare = result.layers.reduce((s, l) => s + l.shareOfTotal, 0);
    const surfaceShare = (0.11 + 0.043) / result.totalResistanceM2KPerW;
    expect(layerShare + surfaceShare).toBeCloseTo(1, 9);
    // Insulation dominates an insulated RC wall.
    const eps = result.layers.find((l) => l.id === "eps")!;
    expect(eps.shareOfTotal).toBeGreaterThan(0.8);
  });
});

describe("calculateAssembly — metamorphic properties", () => {
  it("more insulation thickness monotonically lowers U", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const mm of [50, 100, 150, 200, 250]) {
      const u = calculateAssembly(
        [
          { id: "concrete", thicknessM: 0.2, conductivityWPerMK: 2.3 },
          { id: "eps", thicknessM: mm / 1000, conductivityWPerMK: 0.032 },
        ],
        "horizontal"
      ).uValueWPerM2K;
      expect(u).toBeLessThan(previous);
      previous = u;
    }
  });

  it("doubling a layer's thickness doubles that layer's resistance exactly", () => {
    const base = calculateAssembly(RC_WALL, "horizontal");
    const doubled = calculateAssembly(
      RC_WALL.map((l) => (l.id === "eps" ? { ...l, thicknessM: l.thicknessM * 2 } : l)),
      "horizontal"
    );
    const baseEps = base.layers.find((l) => l.id === "eps")!;
    const doubledEps = doubled.layers.find((l) => l.id === "eps")!;
    expect(doubledEps.resistanceM2KPerW).toBeCloseTo(baseEps.resistanceM2KPerW * 2, 9);
  });

  it("swapping to a lower-conductivity insulation lowers U", () => {
    const eps = calculateAssembly(RC_WALL, "horizontal").uValueWPerM2K;
    const pf = calculateAssembly(
      RC_WALL.map((l) => (l.id === "eps" ? { ...l, conductivityWPerMK: 0.02 } : l)),
      "horizontal"
    ).uValueWPerM2K;
    expect(pf).toBeLessThan(eps);
  });

  it("adding any layer can only lower U", () => {
    const base = calculateAssembly(RC_WALL, "horizontal").uValueWPerM2K;
    const withExtra = calculateAssembly(
      [...RC_WALL, { id: "extra", thicknessM: 0.005, conductivityWPerMK: 3 }],
      "horizontal"
    ).uValueWPerM2K;
    expect(withExtra).toBeLessThan(base);
  });

  it("exhibits diminishing returns: each added 50mm of insulation saves less U", () => {
    const uAt = (mm: number) =>
      calculateAssembly(
        [
          { id: "concrete", thicknessM: 0.2, conductivityWPerMK: 2.3 },
          { id: "eps", thicknessM: mm / 1000, conductivityWPerMK: 0.032 },
        ],
        "horizontal"
      ).uValueWPerM2K;
    const drops: number[] = [];
    for (let mm = 50; mm < 300; mm += 50) drops.push(uAt(mm) - uAt(mm + 50));
    for (let i = 1; i < drops.length; i++) expect(drops[i]).toBeLessThan(drops[i - 1]);
  });
});

describe("thicknessForTargetU", () => {
  it("round-trips: computed thickness reproduces the target U", () => {
    const target = 0.17; // 별표1 중부2 비주거 외벽 직접
    const thickness = thicknessForTargetU(RC_WALL, "horizontal", "eps", target);
    expect(thickness).not.toBeNull();
    const check = calculateAssembly(
      RC_WALL.map((l) => (l.id === "eps" ? { ...l, thicknessM: thickness! } : l)),
      "horizontal"
    );
    expect(check.uValueWPerM2K).toBeCloseTo(target, 9);
  });

  it("returns null for an unreachable target", () => {
    // Other layers alone already give R > 1/10 → target U=10 unreachable positively.
    expect(thicknessForTargetU(RC_WALL, "horizontal", "eps", 10)).toBeNull();
    expect(thicknessForTargetU(RC_WALL, "horizontal", "eps", 0)).toBeNull();
    expect(thicknessForTargetU(RC_WALL, "horizontal", "missing-layer", 0.2)).toBeNull();
  });
});

describe("calculateAssembly — refusals", () => {
  it("throws on empty, non-positive, or non-finite input", () => {
    expect(() => calculateAssembly([], "horizontal")).toThrow(AssemblyCalcError);
    expect(() =>
      calculateAssembly([{ id: "bad", thicknessM: 0, conductivityWPerMK: 0.03 }], "horizontal")
    ).toThrow(AssemblyCalcError);
    expect(() =>
      calculateAssembly([{ id: "bad", thicknessM: 0.1, conductivityWPerMK: -1 }], "horizontal")
    ).toThrow(AssemblyCalcError);
    expect(() =>
      calculateAssembly([{ id: "bad", thicknessM: Number.NaN, conductivityWPerMK: 0.03 }], "horizontal")
    ).toThrow(AssemblyCalcError);
    expect(() =>
      calculateAssembly([{ id: "bad", thicknessM: 0.02, fixedResistanceM2KPerW: 0 }], "horizontal")
    ).toThrow(AssemblyCalcError);
  });

  it("throws when a layer has neither conductivity nor fixed resistance", () => {
    expect(() =>
      calculateAssembly([{ id: "bad", thicknessM: 0.1 }], "horizontal")
    ).toThrow(AssemblyCalcError);
  });
});
