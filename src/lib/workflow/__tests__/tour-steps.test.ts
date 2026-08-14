import { describe, expect, it } from "vitest";
import { STAGE_LABELS, STAGE_ORDER } from "../stages";
import { twinTourSteps } from "../tour-steps";

describe("twinTourSteps", () => {
  it("names all four real stages and never invents a fifth", () => {
    const ko = twinTourSteps(true);
    const en = twinTourSteps(false);
    const pipelineKo = STAGE_ORDER.map((s) => STAGE_LABELS[s].ko).join(" → ");
    const pipelineEn = STAGE_ORDER.map((s) => STAGE_LABELS[s].en).join(" → ");

    expect(ko[0]?.description).toContain(`${STAGE_ORDER.length}단계`);
    expect(ko[0]?.description).toContain(pipelineKo);
    expect(en[0]?.description).toContain(`${STAGE_ORDER.length} stages`);
    expect(en[0]?.description).toContain(pipelineEn);

    const blob = [...ko, ...en].map((s) => `${s.title} ${s.description}`).join("\n");
    expect(blob).not.toMatch(/5단계|5 stages|Assemble|구성, 분석/);
  });

  it("highlights the twin surface, not a catalog that is not there", () => {
    const steps = twinTourSteps(true);
    expect(steps.map((s) => s.element)).toEqual([
      '[data-tour="stepper"]',
      '[data-tour="viewport"]',
      '[data-tour="left-dock"]',
      '[data-tour="right-dock"]',
    ]);
    expect(steps.map((s) => s.description).join(" ")).not.toMatch(/카탈로그|catalog/i);
  });
});
