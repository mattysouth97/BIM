import type {
  DrawingClassification,
  DrawingDiscipline,
  DrawingDocumentType,
} from "./types";

type ClassificationRule = Readonly<{
  type: DrawingDocumentType;
  discipline: DrawingDiscipline;
  signals: readonly RegExp[];
}>;

const RULES: readonly ClassificationRule[] = [
  rule("window_schedule", "architectural", [
    /window[\s_-]*(schedule|type)/i,
    /창호[\s_-]*(일람|스케줄|표)/,
    /창[\s_-]*일람/,
  ]),
  rule("door_schedule", "architectural", [
    /door[\s_-]*(schedule|type)/i,
    /문[\s_-]*(일람|스케줄|표)/,
  ]),
  rule("hvac_equipment_schedule", "mechanical", [
    /(hvac|mechanical|ahu|fcu|vav)[\s_-]*(equipment[\s_-]*)?(schedule|list)/i,
    /(기계|공조|냉난방|장비)[\s_-]*(일람|스케줄|표)/,
  ]),
  rule("lighting_fixture_schedule", "electrical", [
    /light(ing)?[\s_-]*(fixture[\s_-]*)?(schedule|list)/i,
    /조명[\s_-]*(기구[\s_-]*)?(일람|스케줄|표)/,
  ]),
  rule("construction_schedule", "architectural", [
    /construction[\s_-]*(schedule|assembly)/i,
    /구성[\s_-]*(일람|스케줄|표)/,
  ]),
  rule("material_schedule", "architectural", [
    /material[\s_-]*(schedule|list)/i,
    /재료[\s_-]*(일람|스케줄|표)/,
  ]),
  rule("site_plan", "civil", [
    /site[\s_-]*(plan|layout)/i,
    /배치도|대지[\s_-]*평면/,
  ]),
  rule("floor_plan", "architectural", [
    /floor[\s_-]*plan/i,
    /plan[\s_-]*(level|floor|outline)/i,
    /평면도|층[\s_-]*평면/,
  ]),
  rule("elevation", "architectural", [
    /elevation/i,
    /입면도|입면/,
  ]),
  rule("section", "architectural", [
    /section/i,
    /단면도|단면/,
  ]),
  rule("wall_detail", "architectural", [
    /(exterior[\s_-]*)?wall[\s_-]*(detail|assembly|type)/i,
    /외벽[\s_-]*(상세|구성)|벽체[\s_-]*상세/,
  ]),
  rule("roof_detail", "architectural", [
    /roof[\s_-]*(detail|assembly|type)/i,
    /지붕[\s_-]*(상세|구성)/,
  ]),
  rule("slab_detail", "architectural", [
    /(slab|ground[\s_-]*floor)[\s_-]*(detail|assembly|type)/i,
    /(슬래브|바닥)[\s_-]*(상세|구성)/,
  ]),
  rule("hvac_system_diagram", "mechanical", [
    /(hvac|mechanical|air[\s_-]*side)[\s_-]*(system[\s_-]*)?(diagram|schematic)/i,
    /(공조|냉난방|기계설비)[\s_-]*(계통도|다이어그램)/,
  ]),
  rule("duct_plan", "mechanical", [/duct[\s_-]*plan/i, /덕트[\s_-]*평면/]),
  rule("hydronic_diagram", "mechanical", [
    /(hydronic|piping)[\s_-]*(diagram|schematic)/i,
    /(배관|수배관)[\s_-]*계통도/,
  ]),
  rule("lighting_plan", "electrical", [
    /light(ing)?[\s_-]*plan/i,
    /조명[\s_-]*평면/,
  ]),
  rule("electrical_single_line", "electrical", [
    /(electrical[\s_-]*)?(single[\s_-]*line|one[\s_-]*line)/i,
    /전기[\s_-]*단선|단선[\s_-]*결선/,
  ]),
  rule("electrical_load_schedule", "electrical", [
    /(electrical[\s_-]*)?load[\s_-]*(schedule|list)/i,
    /부하[\s_-]*(일람|스케줄|표)/,
  ]),
  rule("domestic_hot_water", "plumbing", [
    /domestic[\s_-]*hot[\s_-]*water|dhw/i,
    /급탕/,
  ]),
  rule("controls_diagram", "controls", [
    /(automatic[\s_-]*)?control(s)?[\s_-]*(diagram|sequence)/i,
    /자동[\s_-]*제어|제어[\s_-]*계통/,
  ]),
  rule("bems_document", "controls", [/\bbems\b/i, /건물[\s_-]*에너지[\s_-]*관리/]),
  rule("photovoltaic_plan", "electrical", [
    /photovoltaic|solar[\s_-]*pv|\bpv[\s_-]*plan\b/i,
    /태양광/,
  ]),
  rule("specification", "multidiscipline", [
    /specification|design[\s_-]*criteria/i,
    /시방서|설계[\s_-]*기준/,
  ]),
] as const;

export function classifyDrawing(input: Readonly<{
  fileName: string;
  textSample?: string;
  userDocumentType?: DrawingDocumentType;
}>): DrawingClassification {
  if (input.userDocumentType) {
    const userRule = RULES.find((candidate) => candidate.type === input.userDocumentType);
    return {
      documentType: input.userDocumentType,
      discipline: userRule?.discipline ?? "unknown",
      confidence: 1,
      method: "user_assignment",
      matchedSignals: ["user_assignment"],
      alternatives: [],
    };
  }

  const fileStem = input.fileName.replace(/\.[^.]+$/, "");
  const textSample = (input.textSample ?? "").slice(0, 64_000);
  const scored = RULES.map((candidate) => {
    const fileMatches = candidate.signals.filter((signal) => signal.test(fileStem));
    const textMatches = candidate.signals.filter((signal) => signal.test(textSample));
    const score = Math.min(
      0.99,
      fileMatches.length * 0.72 + textMatches.length * 0.22,
    );
    return {
      candidate,
      score,
      signals: [
        ...fileMatches.map((signal) => `filename:${signal.source}`),
        ...textMatches.map((signal) => `content:${signal.source}`),
      ],
    };
  })
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.type.localeCompare(right.candidate.type),
    );

  const winner = scored[0];
  if (!winner) {
    return {
      documentType: "unknown",
      discipline: "unknown",
      confidence: 0.15,
      method: "filename_and_metadata",
      matchedSignals: [],
      alternatives: [],
    };
  }

  return {
    documentType: winner.candidate.type,
    discipline: winner.candidate.discipline,
    confidence: roundConfidence(winner.score),
    method: "filename_and_metadata",
    matchedSignals: winner.signals,
    alternatives: scored.slice(1, 4).map((alternative) => ({
      documentType: alternative.candidate.type,
      confidence: roundConfidence(alternative.score),
    })),
  };
}

export function documentTier(documentType: DrawingDocumentType): 1 | 2 | 3 {
  if (
    [
      "site_plan",
      "floor_plan",
      "elevation",
      "section",
      "window_schedule",
      "door_schedule",
    ].includes(documentType)
  ) {
    return 1;
  }
  if (
    [
      "wall_detail",
      "roof_detail",
      "slab_detail",
      "construction_schedule",
      "material_schedule",
      "hvac_equipment_schedule",
      "hvac_system_diagram",
      "duct_plan",
      "hydronic_diagram",
      "lighting_plan",
      "lighting_fixture_schedule",
    ].includes(documentType)
  ) {
    return 2;
  }
  return documentType === "unknown" ? 1 : 3;
}

export function inferRevision(fileName: string, explicitRevision?: string): string {
  if (explicitRevision?.trim()) return explicitRevision.trim();
  const stem = fileName.replace(/\.[^.]+$/, "");
  const match = stem.match(
    /(?:^|[\s_.-])(?:rev(?:ision)?|r|개정)[\s_.-]*([a-z0-9]+)(?:$|[\s_.-])/i,
  );
  return match?.[1]?.toUpperCase() ?? "0";
}

export function revisionGroupStem(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/(?:^|[\s_.-])(?:rev(?:ision)?|r|개정)[\s_.-]*[a-z0-9]+/gi, "")
    .replace(/[\s_.-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLocaleLowerCase("en-US");
}

function rule(
  type: DrawingDocumentType,
  discipline: DrawingDiscipline,
  signals: readonly RegExp[],
): ClassificationRule {
  return { type, discipline, signals };
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
