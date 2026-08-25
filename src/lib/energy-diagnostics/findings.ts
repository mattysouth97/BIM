import type { DegreeDaySimulationRun, SpatialEnergyMapping } from "./adapter";
import type {
  CanonicalEnergyModel,
  EnergyFact,
  SourceReference,
} from "./types";
import type { CanonicalModelValidation, ValidationIssue } from "./validation";

export type DiagnosticFinding = Readonly<{
  id: string;
  title: string;
  severity: "blocking" | "high" | "medium" | "low" | "info";
  affectedObjectIds: readonly string[];
  evidence: readonly Readonly<{
    label: string;
    value: string | number;
    unit?: string;
    sourceFactIds: readonly string[];
  }>[];
  relatedSourceRefs: readonly SourceReference[];
  relatedFactIds: readonly string[];
  relatedSimulationPaths: readonly string[];
  explanation: string;
  confidence: number | null;
  recommendedDesignAction: string;
  impactSimulated: boolean;
  scenarioId?: string;
}>;

export type GenerateFindingsOptions = Readonly<{
  model: CanonicalEnergyModel;
  validation: CanonicalModelValidation;
  run?: DegreeDaySimulationRun;
  spatial?: SpatialEnergyMapping;
  baselineRun?: DegreeDaySimulationRun;
  /** Overrides the model's stored locale, e.g. to follow the live UI language. */
  locale?: "ko" | "en";
}>;

let activeLocaleOverride: "ko" | "en" | null = null;

function localized(model: CanonicalEnergyModel, ko: string, en: string): string {
  const locale = activeLocaleOverride ?? model.project.locale;
  return locale === "ko" ? ko : en;
}

function factsForIds(
  model: CanonicalEnergyModel,
  ids: readonly string[],
): readonly EnergyFact<unknown>[] {
  const wanted = new Set(ids);
  return model.facts.filter((fact) => wanted.has(fact.id));
}

function sourceRefsForFacts(facts: readonly EnergyFact<unknown>[]): readonly SourceReference[] {
  const unique = new Map<string, SourceReference>();
  for (const ref of facts.flatMap((fact) => fact.sourceRefs)) unique.set(ref.id, ref);
  return [...unique.values()];
}

function confidenceForFacts(facts: readonly EnergyFact<unknown>[]): number | null {
  const values = facts
    .map((fact) => fact.confidence)
    .filter((value): value is number => value != null && Number.isFinite(value));
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function severityForValidation(issue: ValidationIssue): DiagnosticFinding["severity"] {
  if (issue.severity === "error") return "blocking";
  if (issue.severity === "warning") return "medium";
  return "info";
}

function validationFinding(
  model: CanonicalEnergyModel,
  issue: ValidationIssue,
): DiagnosticFinding {
  const facts = factsForIds(model, issue.factIds);
  return {
    id: `finding:${issue.id}`,
    title: issue.message,
    severity: severityForValidation(issue),
    affectedObjectIds: issue.affectedObjectIds,
    evidence: [{
      label: localized(model, "모델 검사 규칙", "Model validation rule"),
      value: issue.code,
      sourceFactIds: issue.factIds,
    }],
    relatedSourceRefs: sourceRefsForFacts(facts),
    relatedFactIds: issue.factIds,
    relatedSimulationPaths: [],
    explanation: issue.message,
    confidence: confidenceForFacts(facts),
    recommendedDesignAction: issue.correctiveAction,
    impactSimulated: false,
  };
}

function dominantEnvelopeFinding(
  model: CanonicalEnergyModel,
  run: DegreeDaySimulationRun,
): DiagnosticFinding | undefined {
  const output = run.engineOutput;
  if (run.status !== "succeeded" || output == null || output.heatLoss.totalHeatLoss <= 0) {
    return undefined;
  }
  const dominant = [...output.heatLoss.elements]
    .filter((element) => element.element !== "Infiltration/Ventilation")
    .sort((a, b) => b.heatLoss - a.heatLoss)[0];
  if (dominant == null) return undefined;
  const share = dominant.heatLoss / output.heatLoss.totalHeatLoss;
  const label: Record<string, string> = {
    Walls: localized(model, "외벽", "Exterior walls"),
    Windows: localized(model, "창호", "Windows"),
    Roof: localized(model, "지붕", "Roof"),
    "Ground Floor": localized(model, "지반 접촉 바닥", "Ground-contact floor"),
  };
  const affectedTypes: Record<string, readonly string[]> = {
    Walls: ["exterior_wall"],
    Windows: ["window", "curtain_wall", "skylight"],
    Roof: ["roof"],
    "Ground Floor": ["ground_floor"],
  };
  const types = new Set(affectedTypes[dominant.element] ?? []);
  const affectedObjectIds = dominant.element === "Windows"
    ? model.geometry.openings.filter((opening) => types.has(opening.type)).map((opening) => opening.id)
    : model.geometry.surfaces.filter((surface) => types.has(surface.type)).map((surface) => surface.id);
  const relevantFacts = model.facts.filter((fact) =>
    affectedObjectIds.some((id) => fact.key.includes(id)) ||
    fact.key.startsWith("construction."),
  );
  return {
    id: `finding:dominant-envelope:${dominant.element.toLowerCase().replaceAll(" ", "-")}`,
    title: localized(
      model,
      `${label[dominant.element] ?? dominant.element} 설계 열손실 비중이 가장 큽니다`,
      `${label[dominant.element] ?? dominant.element}: largest design heat-loss share`,
    ),
    severity: share >= 0.4 ? "high" : share >= 0.25 ? "medium" : "low",
    affectedObjectIds,
    evidence: [{
      label: localized(model, "전체 설계 열손실 비중", "Share of design heat loss"),
      value: Number((share * 100).toFixed(1)),
      unit: "%",
      sourceFactIds: relevantFacts.map((fact) => fact.id),
    }, {
      label: localized(model, "설계 열손실", "Design heat loss"),
      value: Number(dominant.heatLoss.toFixed(1)),
      unit: "W",
      sourceFactIds: relevantFacts.map((fact) => fact.id),
    }],
    relatedSourceRefs: sourceRefsForFacts(relevantFacts),
    relatedFactIds: relevantFacts.map((fact) => fact.id),
    relatedSimulationPaths: [
      `engineOutput.heatLoss.elements.${dominant.element}`,
      "engineOutput.heatLoss.totalHeatLoss",
    ],
    explanation: localized(
      model,
      "기존 도일 엔진의 외피 요소별 설계 열손실 결과를 비교한 스크리닝 진단입니다. 시간별 부하 해석을 의미하지 않습니다.",
      "This screening diagnosis compares the existing degree-day engine's envelope design heat-loss terms; it is not an hourly load analysis.",
    ),
    confidence: confidenceForFacts(relevantFacts),
    recommendedDesignAction: localized(
      model,
      `대안 시나리오에서 ${label[dominant.element] ?? dominant.element}의 U값 또는 면적을 변경하고 실제 엔진 결과를 비교하세요.`,
      `Change ${label[dominant.element] ?? dominant.element} U-value or area in a scenario and compare real engine results.`,
    ),
    impactSimulated: true,
    scenarioId: run.scenarioId,
  };
}

function infiltrationFinding(
  model: CanonicalEnergyModel,
  run: DegreeDaySimulationRun,
): DiagnosticFinding | undefined {
  const output = run.engineOutput;
  if (run.status !== "succeeded" || output == null || output.heatLoss.totalHeatLoss <= 0) {
    return undefined;
  }
  const infiltration = output.heatLoss.elements.find(
    (element) => element.element === "Infiltration/Ventilation",
  );
  if (infiltration == null) return undefined;
  const share = infiltration.heatLoss / output.heatLoss.totalHeatLoss;
  if (share < 0.25) return undefined;
  const infiltrationFact = model.envelope.infiltrationAirChangesPerHour;
  return {
    id: "finding:infiltration-share",
    title: localized(
      model,
      `침기·환기가 설계 열손실의 ${(share * 100).toFixed(0)}%를 차지합니다`,
      `Infiltration/ventilation accounts for ${(share * 100).toFixed(0)}% of design heat loss`,
    ),
    severity: share >= 0.5 ? "high" : "medium",
    affectedObjectIds: [model.building.id],
    evidence: [{
      label: localized(model, "전체 설계 열손실 비중", "Share of design heat loss"),
      value: Number((share * 100).toFixed(1)),
      unit: "%",
      sourceFactIds: [infiltrationFact.id],
    }, {
      label: localized(model, "침기율 입력", "Infiltration input"),
      value: infiltrationFact.value == null ? "—" : String(infiltrationFact.value),
      unit: infiltrationFact.unit ?? "ACH",
      sourceFactIds: [infiltrationFact.id],
    }],
    relatedSourceRefs: infiltrationFact.sourceRefs,
    relatedFactIds: [infiltrationFact.id],
    relatedSimulationPaths: [
      "engineOutput.heatLoss.elements.Infiltration/Ventilation",
      "engineOutput.heatLoss.totalHeatLoss",
    ],
    explanation: localized(
      model,
      infiltrationFact.assumptionId != null
        ? "현재 침기율은 명시적 가정입니다. 기밀 시방이 확인되면 이 비중은 달라질 수 있습니다."
        : "기존 도일 엔진의 환기·침기 열손실 항을 전체 열손실과 비교한 스크리닝 진단입니다.",
      infiltrationFact.assumptionId != null
        ? "The current infiltration rate is an explicit assumption; a confirmed airtightness spec changes this share."
        : "This screening diagnosis compares the degree-day engine's ventilation/infiltration term against total design heat loss.",
    ),
    confidence: infiltrationFact.confidence,
    recommendedDesignAction: localized(
      model,
      "대안 시나리오에서 침기율(ACH)을 낮춰 기밀 개선 효과를 실제 엔진으로 비교하세요.",
      "Lower the infiltration rate (ACH) in a scenario and compare the airtightness improvement with the real engine.",
    ),
    impactSimulated: true,
    scenarioId: run.scenarioId,
  };
}

function ratioAttributionFinding(
  model: CanonicalEnergyModel,
  run: DegreeDaySimulationRun,
): DiagnosticFinding | undefined {
  if (run.status !== "succeeded" || run.engineOutput == null) return undefined;
  const useFact = model.building.useType;
  return {
    id: "finding:ratio-estimated-non-hvac",
    title: localized(
      model,
      "조명·급탕·전열 에너지는 비율 추정값입니다",
      "Lighting, DHW, and plug energy are ratio estimates",
    ),
    severity: "medium",
    affectedObjectIds: [model.building.id],
    evidence: [{
      label: localized(model, "비율 선택에 사용된 건물 용도", "Building use selecting the ratio profile"),
      value: String(useFact.value),
      sourceFactIds: [useFact.id],
    }],
    relatedSourceRefs: useFact.sourceRefs,
    relatedFactIds: [useFact.id],
    relatedSimulationPaths: [
      "result.annualByEndUseKwh.lighting",
      "result.annualByEndUseKwh.domesticHotWater",
      "result.annualByEndUseKwh.equipment",
    ],
    explanation: localized(
      model,
      "냉난방은 도일 엔진으로 계산했지만 조명, 급탕, 전열부하는 현재 건물 용도별 비율로 배분합니다.",
      "HVAC is calculated by the degree-day engine, while lighting, DHW, and plug loads are allocated from a building-use ratio profile.",
    ),
    confidence: useFact.confidence,
    recommendedDesignAction: localized(
      model,
      "조명 기구일람과 운영 스케줄을 확인한 후에도 이 값을 실측 엔진 결과로 해석하지 마세요.",
      "Confirm fixture and operating schedules, and do not interpret these values as schedule-simulated outputs.",
    ),
    impactSimulated: false,
    scenarioId: run.scenarioId,
  };
}

function scenarioComparisonFinding(
  model: CanonicalEnergyModel,
  run: DegreeDaySimulationRun,
  baseline: DegreeDaySimulationRun,
): DiagnosticFinding | undefined {
  if (run.status !== "succeeded" || baseline.status !== "succeeded" ||
      run.result == null || baseline.result == null || run.scenarioId === "baseline") {
    return undefined;
  }
  const delta = run.result.annualEnergyKwh - baseline.result.annualEnergyKwh;
  const percent = baseline.result.annualEnergyKwh > 0
    ? delta / baseline.result.annualEnergyKwh * 100
    : 0;
  return {
    id: `finding:scenario-comparison:${run.scenarioId}`,
    title: localized(
      model,
      `대안의 연간 에너지가 기준안 대비 ${Math.abs(percent).toFixed(1)}% ${delta <= 0 ? "감소" : "증가"}했습니다`,
      `Scenario annual energy ${delta <= 0 ? "decreased" : "increased"} ${Math.abs(percent).toFixed(1)}% versus baseline`,
    ),
    severity: delta <= 0 ? "info" : "medium",
    affectedObjectIds: [model.building.id],
    evidence: [{
      label: localized(model, "기준안 연간 에너지", "Baseline annual energy"),
      value: Number(baseline.result.annualEnergyKwh.toFixed(2)),
      unit: "kWh/year",
      sourceFactIds: [],
    }, {
      label: localized(model, "대안 연간 에너지", "Scenario annual energy"),
      value: Number(run.result.annualEnergyKwh.toFixed(2)),
      unit: "kWh/year",
      sourceFactIds: [],
    }],
    relatedSourceRefs: [],
    relatedFactIds: [],
    relatedSimulationPaths: ["result.annualEnergyKwh"],
    explanation: localized(
      model,
      "동일한 기존 도일 엔진과 현재 가정에서 기준안과 대안을 재실행한 차이입니다.",
      "This is the difference between baseline and scenario reruns under the same existing degree-day engine and current assumptions.",
    ),
    confidence: 1,
    recommendedDesignAction: localized(
      model,
      "대안 변경값과 남은 가정을 검토한 뒤 설계 의사결정에 사용하세요.",
      "Review the scenario deltas and remaining assumptions before using the comparison in design decisions.",
    ),
    impactSimulated: true,
    scenarioId: run.scenarioId,
  };
}

/** Produces only validation- or real-result-backed findings. */
export function generateDiagnosticFindings({
  model,
  validation,
  run,
  baselineRun,
  locale,
}: GenerateFindingsOptions): readonly DiagnosticFinding[] {
  // The pipeline below is fully synchronous, so a scoped override is safe.
  activeLocaleOverride = locale ?? null;
  try {
    return buildFindings(model, validation, run, baselineRun);
  } finally {
    activeLocaleOverride = null;
  }
}

function buildFindings(
  model: CanonicalEnergyModel,
  validation: CanonicalModelValidation,
  run: DegreeDaySimulationRun | undefined,
  baselineRun: DegreeDaySimulationRun | undefined,
): readonly DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = validation.issues.map((issue) =>
    validationFinding(model, issue),
  );
  if (run?.status === "failed") {
    findings.push({
      id: `finding:failed-run:${run.id}`,
      title: localized(model, "시뮬레이션 실행이 실패했습니다", "Simulation run failed"),
      severity: "blocking",
      affectedObjectIds: [model.building.id],
      evidence: [{
        label: localized(model, "실패 유형", "Failure kind"),
        value: run.error?.kind ?? "engine",
        sourceFactIds: [],
      }],
      relatedSourceRefs: [],
      relatedFactIds: [],
      relatedSimulationPaths: [],
      explanation: run.error?.message ?? "Unknown engine failure.",
      confidence: 1,
      recommendedDesignAction: localized(model, "모델 검사와 실행 로그를 확인하세요.", "Review model preflight and the run log."),
      impactSimulated: false,
      scenarioId: run.scenarioId,
    });
  }
  if (run != null) {
    const infiltration = infiltrationFinding(model, run);
    const dominant = dominantEnvelopeFinding(model, run);
    const ratio = ratioAttributionFinding(model, run);
    if (infiltration != null) findings.push(infiltration);
    if (dominant != null) findings.push(dominant);
    if (ratio != null) findings.push(ratio);
    if (baselineRun != null) {
      const comparison = scenarioComparisonFinding(model, run, baselineRun);
      if (comparison != null) findings.push(comparison);
    }
  }
  return findings;
}
