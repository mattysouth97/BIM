// The badge over the numbers has to be a claim the rows underneath support.
//
// It read the first word of each row's `biasDirection` prose until
// 2026-09-06. On the apartment that matched "Understates the spread" — a
// statement about how glazing is DISTRIBUTED between elevations, not about
// how much envelope there is — and rendered "1개가 외피를 과소평가하므로 실측
// 후 등급이 내려갈 가능성이 큽니다", a prediction about the grade that no row
// had made. The counting now reads a declared `envelopeBias`, and these tests
// parse the rendered sentence back and check it against the rows.

import { describe, it, expect } from "vitest";
import { summarisePendingBias, pendingBadgeText } from "../reference-energy";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import type { ReferenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";

type Rows = NonNullable<ReferenceBuildingEnergyInputs["pendingMeasurements"]>;
type Bias = Rows[number]["envelopeBias"];

function rows(...biases: Bias[]): Rows {
  return biases.map((envelopeBias, i) => ({
    manifestField: `areas.field${i}`,
    constant: `PLACEHOLDER_${i}`,
    placeholderValue: 1,
    unit: "m2" as const,
    derivedFrom: "a fixture",
    biasDirection: "Understates the spread, deliberately worded to start with the wrong word.",
    envelopeBias,
  }));
}

describe("summarisePendingBias counts what the row declares, not what it says first", () => {
  it("does not count a distribution-only row as understating the envelope", () => {
    // Every row's prose begins "Understates", which is exactly what the old
    // regex keyed on.
    const bias = summarisePendingBias(rows("distribution", "unknown", "neutral"));
    expect(bias.total).toBe(3);
    expect(bias.understates).toBe(0);
    expect(bias.overstates).toBe(0);
    expect(bias.distribution).toBe(1);
    expect(bias.unknown).toBe(1);
    expect(bias.neutral).toBe(1);
  });

  it("still predicts a falling grade when rows really do understate the envelope", () => {
    const bias = summarisePendingBias(rows("understates", "understates", "neutral"));
    expect(pendingBadgeText(bias, false)).toBe(
      "Awaiting measurement · 3 stand-ins — 2 understate the envelope, so the grade will likely fall once measured",
    );
    expect(pendingBadgeText(bias, true)).toContain("2개가 외피를 과소평가");
  });

  it("predicts a rising grade the other way round", () => {
    const bias = summarisePendingBias(rows("overstates", "unknown"));
    expect(pendingBadgeText(bias, false)).toContain(
      "1 overstate the envelope, so the grade may rise once measured",
    );
  });
});

describe("the apartment's badge, parsed back against its own rows", () => {
  const energy = referenceBuildingEnergyInputs("schependomlaan")!;
  const pending = energy.pendingMeasurements!;
  const bias = summarisePendingBias(pending);

  it("counts every stand-in the file lists", () => {
    expect(energy.measurementState).toBe("awaiting_measurement");
    expect(bias.total).toBe(pending.length);
    expect(bias.total).toBe(3);
  });

  it("makes no directional claim, because no row makes one", () => {
    // The row-by-row truth: one unknown mean pane, one distribution-only
    // split, one neutral-on-total-loss door area. Nothing here says the
    // envelope is too small.
    expect(pending.filter((p) => p.envelopeBias === "understates")).toHaveLength(0);
    expect(pending.filter((p) => p.envelopeBias === "overstates")).toHaveLength(0);

    const en = pendingBadgeText(bias, false);
    expect(en).not.toContain("grade will likely fall");
    expect(en).not.toContain("grade may rise");
    expect(en).toContain("none of them states which way the envelope moves");
  });

  it("every count in the rendered sentence is reproduced by the rows", () => {
    const en = pendingBadgeText(bias, false);

    // Parse the sentence back rather than asserting substrings appear.
    const total = en.match(/(\d+) stand-ins/);
    expect(total).not.toBeNull();
    expect(Number(total![1])).toBe(pending.length);

    const parsed = {
      unknown: Number(en.match(/(\d+) unknown/)?.[1] ?? 0),
      neutral: Number(en.match(/(\d+) neutral on total loss/)?.[1] ?? 0),
      distribution: Number(en.match(/(\d+) affecting only the split/)?.[1] ?? 0),
    };
    for (const key of ["unknown", "neutral", "distribution"] as const) {
      expect(parsed[key]).toBe(pending.filter((p) => p.envelopeBias === key).length);
    }
    // And the parts account for the whole: nothing is silently dropped.
    expect(parsed.unknown + parsed.neutral + parsed.distribution).toBe(pending.length);
  });

  it("the Korean sentence carries the same counts as the English one", () => {
    const ko = pendingBadgeText(bias, true);
    expect(Number(ko.match(/자리표시자 (\d+)개/)![1])).toBe(pending.length);
    expect(Number(ko.match(/불확실 (\d+)/)![1])).toBe(bias.unknown);
    expect(Number(ko.match(/총손실 중립 (\d+)/)![1])).toBe(bias.neutral);
    expect(Number(ko.match(/분포만 (\d+)/)![1])).toBe(bias.distribution);
  });
});

describe("the Clinic states its measurement state instead of leaving it blank", () => {
  it("is complete, and carries no pending rows to summarise", () => {
    const energy = referenceBuildingEnergyInputs("bs-medical-dental-clinic")!;
    expect(energy.measurementState).toBe("complete");
    expect(energy.pendingMeasurements).toBeUndefined();
    // The absence of a warning is not a statement — the page renders a
    // "measurement complete" row so the two buildings answer the same
    // question rather than one of them staying silent.
    expect(summarisePendingBias(energy.pendingMeasurements).total).toBe(0);
  });
});
