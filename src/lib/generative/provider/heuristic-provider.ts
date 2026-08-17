// src/lib/generative/provider/heuristic-provider.ts
//
// Deterministic, offline reasoning provider. No network, no key, no model.
//
// It exists for three real reasons, none of them decorative:
//   1. CI and unit tests must exercise the FULL pipeline (spec → geometry →
//      BIM graph → validation) without a live API call.
//   2. When the API errors or the key is missing, the product should still
//      generate a coherent building rather than showing a dead button.
//   3. It is the control case that proves the downstream engine — not the LLM
//      — is what actually builds the model (brief §92: Claude is replaceable).
//
// It parses the prompt with plain heuristics and fills the rest from the
// standards library. It is deliberately unclever: same input ⇒ same output.

import {
  BuildingSpecSchema,
  type BuildingPatch,
  type BuildingReview,
  type BuildingSpec,
  type BuildingUse,
  type MassingStrategy,
  type ProgramItem,
  type SpaceType,
  type ValueSource,
} from "../spec/building-spec";
import {
  beamDepthMm,
  coreFromPlate,
  columnSizeMm,
  DIMENSION_DEFAULTS,
  MIN_AREA_SQM,
  plateFromArea,
  PREFERRED_ASPECT,
  recommendElevators,
  recommendStairs,
  slabThicknessMm,
  USE_PROFILES,
} from "../spec/defaults";
import { createRng } from "../rng";
import type {
  BIMReasoningProvider,
  BimSummary,
  GenerationRequest,
  ModificationRequest,
  ProviderResult,
  ProviderTrace,
  RepairRequest,
} from "./types";

/* ------------------------------------------------------------------ */
/* Prompt parsing                                                      */
/* ------------------------------------------------------------------ */

// Stems are matched with a trailing `\w*`, never a trailing `\b` — "warehous"
// followed by a word boundary can never match "warehouse". Order matters: the
// first hit wins, so specific uses are listed before the generic office
// fallback (a "research office building" is a research building).
const USE_KEYWORDS: Array<[RegExp, BuildingUse]> = [
  [/\bmixed[- ]?use\w*/i, "mixed-use"],
  [/\b(?:research|laborator|r&d|science)\w*/i, "research"],
  [/\b(?:school|classroom|universit|college|educat|campus)\w*/i, "education"],
  [/\b(?:factor|warehous|industrial|logistic|manufactur)\w*/i, "industrial"],
  [/\b(?:hospital|clinic|healthcare|medical)\w*/i, "healthcare"],
  [/\b(?:hotel|hospitality|resort)\w*/i, "hospitality"],
  // `flats\b` not `flat\w*` — the latter matches "flat roof".
  [/\b(?:apartment\w*|residential\w*|housing\b|condo\w*|dwelling\w*|flats\b)/i, "residential"],
  // `stores?\b` not `store\w*` — the latter matches "storey".
  [/\b(?:retail\w*|shop\w*|stores?\b|storefront\w*|mall\w*|commercial\w*)/i, "retail"],
  [/\b(?:civic|library|museum|town hall|communit)\w*/i, "civic"],
  [/\b(?:office|workplace|hq|headquarter)\w*/i, "office"],
];

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function detectUse(prompt: string): BuildingUse | null {
  for (const [pattern, use] of USE_KEYWORDS) {
    if (pattern.test(prompt)) return use;
  }
  return null;
}

function detectFloors(prompt: string): number | null {
  const digit = /(\d{1,3})[\s-]*(?:stor(?:e?y|ies)|floor|level)/i.exec(prompt);
  if (digit) return clamp(Number(digit[1]), 1, 120);

  const word = new RegExp(
    `\\b(${Object.keys(WORD_NUMBERS).join("|")})[\\s-]*(?:stor(?:e?y|ies)|floor|level)`,
    "i",
  ).exec(prompt);
  if (word) return WORD_NUMBERS[word[1].toLowerCase()];

  return null;
}

function detectArea(prompt: string): number | null {
  const match =
    /([\d,]+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:er|re)s?)/i.exec(prompt);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? clamp(value, 50, 2_000_000) : null;
}

/** Accepts "3.9 m", "3900mm", "3.9m floor-to-floor". */
function detectFloorToFloorMm(prompt: string): number | null {
  const mmMatch = /(\d{4,5})\s*mm\s*(?:floor[- ]to[- ]floor|f2f|storey|story)?/i.exec(prompt);
  if (mmMatch) {
    const value = Number(mmMatch[1]);
    if (value >= 2_200 && value <= 12_000) return value;
  }
  const mMatch =
    /(\d(?:\.\d+)?)\s*m\s*(?:floor[- ]to[- ]floor|f2f|storey|story|ceiling)/i.exec(prompt);
  if (mMatch) {
    const value = Math.round(Number(mMatch[1]) * 1000);
    if (value >= 2_200 && value <= 12_000) return value;
  }
  return null;
}

/** Accepts "8.4 m structural grid", "8400mm grid", "8.4m bays". */
function detectGridMm(prompt: string): number | null {
  const mm = /(\d{4,5})\s*mm\s*(?:structural\s*)?(?:grid|bay)/i.exec(prompt);
  if (mm) {
    const value = Number(mm[1]);
    if (value >= 3_000 && value <= 20_000) return value;
  }
  const m = /(\d(?:\.\d+)?)\s*m\s*(?:structural\s*)?(?:grid|bay)/i.exec(prompt);
  if (m) {
    const value = Math.round(Number(m[1]) * 1000);
    if (value >= 3_000 && value <= 20_000) return value;
  }
  return null;
}

function detectCoreStrategy(prompt: string) {
  if (/\b(dual|two)\s+(?:service\s+)?cores?\b/i.test(prompt)) return "dual" as const;
  if (/\b(offset|side|eccentric)\s+core\b/i.test(prompt)) return "offset" as const;
  if (/\bend\s+core\b/i.test(prompt)) return "end" as const;
  if (/\bcentral\s+(?:service\s+|elevator\/?stair\s+)?core\b/i.test(prompt)) return "central" as const;
  return null;
}

function detectMassing(prompt: string): MassingStrategy | null {
  if (/\bcourtyard\b/i.test(prompt)) return "courtyard";
  if (/\batrium\b/i.test(prompt)) return "atrium";
  if (/\bl[- ]shape/i.test(prompt)) return "l-shape";
  if (/\bu[- ]shape/i.test(prompt)) return "u-shape";
  if (/\bcross[- ]shape/i.test(prompt)) return "cross";
  if (/\b(podium|tower on a podium)\b/i.test(prompt)) return "podium-tower";
  if (/\btwin[- ]bar|two wings|two[- ]wing\b/i.test(prompt)) return "twin-bar";
  if (/\bstepped|terrac(?:ed|ing)\b/i.test(prompt)) return "stepped";
  if (/\bbar\b/i.test(prompt)) return "bar";
  if (/\brectangular|simple\s+rectangle\b/i.test(prompt)) return "rectangle";
  return null;
}

function detectElevators(prompt: string): number | null {
  const m = /(\d{1,2}|one|two|three|four|five|six)\s+(?:passenger\s+)?(?:elevator|lift)/i.exec(prompt);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return WORD_NUMBERS[raw] ?? clamp(Number(raw), 0, 24);
}

function detectStairs(prompt: string): number | null {
  const m = /(\d{1,2}|one|two|three|four)\s+(?:egress\s+|fire\s+)?stair/i.exec(prompt);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return WORD_NUMBERS[raw] ?? clamp(Number(raw), 1, 12);
}

function wantsCurtainWall(prompt: string): boolean {
  return /\bcurtain[- ]wall\b/i.test(prompt);
}

function curtainWallSides(prompt: string): Array<"north" | "south" | "east" | "west"> {
  const sides: Array<"north" | "south" | "east" | "west"> = [];
  if (/\bsouth\b/i.test(prompt)) sides.push("south");
  if (/\bnorth\b/i.test(prompt)) sides.push("north");
  if (/\beast\b/i.test(prompt)) sides.push("east");
  if (/\bwest\b/i.test(prompt)) sides.push("west");
  return sides;
}

function wantsEconomy(prompt: string): boolean {
  return /\b(inexpensive|cheap|economical|efficient|low[- ]cost|budget|simple)\b/i.test(prompt);
}

function wantsRegularity(prompt: string): boolean {
  return /\b(regular|rational|orthogonal|repetitive|standardi[sz]ed)\b/i.test(prompt);
}

function detectMechanicalLevel(prompt: string, floors: number): number | null {
  const m = /mechanical\s+(?:floor|level|plant)\s+(?:on\s+)?(?:level\s+)?(\d{1,3})/i.exec(prompt);
  if (m) {
    const value = Number(m[1]);
    if (value >= 1 && value <= floors) return value;
  }
  if (/\bmechanical\s+(?:floor|level|plant)\b/i.test(prompt)) return floors;
  return null;
}

function detectBasements(prompt: string): number {
  const m = /(\d{1,2}|one|two|three)\s+(?:level[s]?\s+of\s+)?(?:basement|underground|below[- ]grade)/i.exec(prompt);
  if (m) {
    const raw = m[1].toLowerCase();
    return clamp(WORD_NUMBERS[raw] ?? Number(raw), 0, 8);
  }
  if (/\bbasement|underground parking\b/i.test(prompt)) return 1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/* ------------------------------------------------------------------ */
/* Program templates                                                   */
/* ------------------------------------------------------------------ */

interface ProgramTemplateEntry {
  id: string;
  type: SpaceType;
  label: string;
  /** Fraction of the level's programmable (non-core, non-circulation) area. */
  share: number;
  countPerLevel: number;
  adjacency: ProgramItem["adjacency"];
  priority: ProgramItem["priority"];
  /** Ground/lobby level only. */
  groundOnly?: boolean;
  /** Skip on the ground level. */
  skipGround?: boolean;
}

const PROGRAM_TEMPLATES: Record<BuildingUse, ProgramTemplateEntry[]> = {
  office: [
    { id: "lobby", type: "lobby", label: "Entrance Lobby", share: 0.45, countPerLevel: 1, groundOnly: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORE" }] },
    { id: "reception", type: "reception", label: "Reception", share: 0.12, countPerLevel: 1, groundOnly: true, priority: "P2", adjacency: [{ kind: "REQUIRES_ADJACENCY", targetId: "lobby" }] },
    { id: "open-office", type: "office-open", label: "Open Office", share: 0.62, countPerLevel: 2, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "meeting", type: "meeting", label: "Meeting Room", share: 0.18, countPerLevel: 3, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_CORE" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "restroom", type: "restroom", label: "Restrooms", share: 0.07, countPerLevel: 2, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "pantry", type: "pantry", label: "Pantry", share: 0.05, countPerLevel: 1, skipGround: true, priority: "P2", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
    { id: "storage", type: "storage", label: "Storage", share: 0.04, countPerLevel: 1, priority: "P3", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
    { id: "electrical", type: "electrical", label: "Electrical Room", share: 0.04, countPerLevel: 1, priority: "P1", adjacency: [{ kind: "REQUIRES_CORE" }] },
  ],
  research: [
    { id: "lobby", type: "lobby", label: "Entrance Lobby", share: 0.4, countPerLevel: 1, groundOnly: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORE" }] },
    { id: "lab", type: "laboratory", label: "Laboratory", share: 0.58, countPerLevel: 4, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "lab-support", type: "service", label: "Lab Support", share: 0.16, countPerLevel: 2, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_ADJACENCY", targetId: "lab" }] },
    { id: "write-up", type: "office-open", label: "Write-up Space", share: 0.12, countPerLevel: 1, skipGround: true, priority: "P2", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
    { id: "meeting", type: "meeting", label: "Meeting Room", share: 0.08, countPerLevel: 2, skipGround: true, priority: "P2", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "restroom", type: "restroom", label: "Restrooms", share: 0.06, countPerLevel: 2, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "mechanical", type: "mechanical", label: "Mechanical Room", share: 0.1, countPerLevel: 1, priority: "P1", adjacency: [{ kind: "REQUIRES_CORE" }] },
  ],
  residential: [
    { id: "lobby", type: "lobby", label: "Residential Lobby", share: 0.5, countPerLevel: 1, groundOnly: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORE" }] },
    { id: "unit", type: "residential-unit", label: "Dwelling Unit", share: 0.86, countPerLevel: 6, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "storage", type: "storage", label: "Resident Storage", share: 0.07, countPerLevel: 1, priority: "P3", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
    { id: "electrical", type: "electrical", label: "Electrical Room", share: 0.04, countPerLevel: 1, priority: "P1", adjacency: [{ kind: "REQUIRES_CORE" }] },
  ],
  retail: [
    { id: "retail-floor", type: "retail", label: "Retail Floor", share: 0.82, countPerLevel: 2, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "restroom", type: "restroom", label: "Restrooms", share: 0.07, countPerLevel: 2, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "storage", type: "storage", label: "Back of House", share: 0.11, countPerLevel: 1, priority: "P1", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
  ],
  education: [
    { id: "lobby", type: "lobby", label: "Entrance Hall", share: 0.45, countPerLevel: 1, groundOnly: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORE" }] },
    { id: "classroom", type: "classroom", label: "Classroom", share: 0.7, countPerLevel: 5, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "staff", type: "office-cellular", label: "Staff Room", share: 0.12, countPerLevel: 1, skipGround: true, priority: "P2", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
    { id: "restroom", type: "restroom", label: "Restrooms", share: 0.1, countPerLevel: 2, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "storage", type: "storage", label: "Storage", share: 0.05, countPerLevel: 1, priority: "P3", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
  ],
  industrial: [
    { id: "process", type: "service", label: "Process Hall", share: 0.72, countPerLevel: 1, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }] },
    { id: "warehouse", type: "storage", label: "Warehouse", share: 0.18, countPerLevel: 1, priority: "P1", adjacency: [{ kind: "REQUIRES_ADJACENCY", targetId: "process" }] },
    { id: "office", type: "office-open", label: "Plant Office", share: 0.07, countPerLevel: 1, priority: "P2", adjacency: [{ kind: "REQUIRES_EXTERIOR" }] },
    { id: "restroom", type: "restroom", label: "Restrooms", share: 0.03, countPerLevel: 1, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
  ],
  healthcare: [
    { id: "lobby", type: "lobby", label: "Public Lobby", share: 0.4, countPerLevel: 1, groundOnly: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORE" }] },
    { id: "consult", type: "office-cellular", label: "Consulting Room", share: 0.55, countPerLevel: 6, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
    { id: "treatment", type: "service", label: "Treatment Room", share: 0.2, countPerLevel: 2, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
    { id: "restroom", type: "restroom", label: "Restrooms", share: 0.09, countPerLevel: 2, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "mechanical", type: "mechanical", label: "Mechanical Room", share: 0.1, countPerLevel: 1, priority: "P1", adjacency: [{ kind: "REQUIRES_CORE" }] },
  ],
  hospitality: [
    { id: "lobby", type: "lobby", label: "Hotel Lobby", share: 0.55, countPerLevel: 1, groundOnly: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORE" }] },
    { id: "guestroom", type: "residential-unit", label: "Guest Room", share: 0.85, countPerLevel: 10, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "housekeeping", type: "service", label: "Housekeeping", share: 0.07, countPerLevel: 1, skipGround: true, priority: "P2", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "restroom", type: "restroom", label: "Public Restrooms", share: 0.08, countPerLevel: 1, groundOnly: true, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
  ],
  civic: [
    { id: "lobby", type: "lobby", label: "Public Hall", share: 0.5, countPerLevel: 1, groundOnly: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORE" }] },
    { id: "public-room", type: "classroom", label: "Public Room", share: 0.6, countPerLevel: 3, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "staff-office", type: "office-open", label: "Staff Office", share: 0.22, countPerLevel: 1, skipGround: true, priority: "P2", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
    { id: "restroom", type: "restroom", label: "Restrooms", share: 0.1, countPerLevel: 2, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "storage", type: "storage", label: "Storage", share: 0.08, countPerLevel: 1, priority: "P3", adjacency: [{ kind: "REQUIRES_CORRIDOR" }] },
  ],
  "mixed-use": [
    { id: "retail-floor", type: "retail", label: "Retail", share: 0.8, countPerLevel: 2, groundOnly: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }] },
    { id: "open-office", type: "office-open", label: "Open Office", share: 0.62, countPerLevel: 2, skipGround: true, priority: "P1", adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }] },
    { id: "meeting", type: "meeting", label: "Meeting Room", share: 0.2, countPerLevel: 2, skipGround: true, priority: "P2", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "restroom", type: "restroom", label: "Restrooms", share: 0.1, countPerLevel: 2, priority: "P0", adjacency: [{ kind: "REQUIRES_CORE" }] },
    { id: "electrical", type: "electrical", label: "Electrical Room", share: 0.05, countPerLevel: 1, priority: "P1", adjacency: [{ kind: "REQUIRES_CORE" }] },
  ],
};

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export class HeuristicReasoningProvider implements BIMReasoningProvider {
  readonly name = "heuristic";

  isAvailable(): boolean {
    return true;
  }

  async generateBuilding(
    request: GenerationRequest,
  ): Promise<ProviderResult<BuildingSpec>> {
    const started = Date.now();
    const spec = buildSpec(request);
    // Parse rather than cast: the fallback must satisfy the same contract the
    // model does, so a drift in the schema breaks tests here first.
    return { data: BuildingSpecSchema.parse(spec), trace: trace(this.name, started) };
  }

  async modifyBuilding(
    request: ModificationRequest,
  ): Promise<ProviderResult<BuildingPatch>> {
    const started = Date.now();
    return {
      data: heuristicPatch(request.instruction, request.spec),
      trace: trace(this.name, started),
    };
  }

  async repairBuilding(
    request: RepairRequest,
  ): Promise<ProviderResult<BuildingPatch>> {
    const started = Date.now();
    return {
      data: heuristicRepair(request),
      trace: trace(this.name, started),
    };
  }

  async evaluateBuilding(
    summary: BimSummary,
    spec: BuildingSpec,
  ): Promise<ProviderResult<BuildingReview>> {
    const started = Date.now();
    const explanation = [
      `${summary.floors} levels totalling ${Math.round(summary.grossAreaSqm).toLocaleString()} m² gross.`,
      `A ${spec.core.strategy.value} core was used, occupying ${(((summary.grossAreaSqm - summary.netAreaSqm) / Math.max(1, summary.grossAreaSqm)) * 100).toFixed(0)}% of the gross area with circulation.`,
      `The structural grid is ${summary.gridXMm} × ${summary.gridZMm} mm, giving regular bays across the plate.`,
      `Circulation is ${(summary.circulationRatio * 100).toFixed(1)}% of net area.`,
    ];
    const recommendations = summary.violations.slice(0, 6).map((v) => ({
      title: v.code,
      detail: v.message,
      severity: v.severity,
    }));
    return {
      data: { explanation, recommendations },
      trace: trace(this.name, started),
    };
  }
}

function trace(provider: string, started: number): ProviderTrace {
  return {
    provider,
    model: "deterministic",
    latencyMs: Date.now() - started,
    inputTokens: 0,
    outputTokens: 0,
    stopReason: "end_turn",
    retries: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Spec construction                                                   */
/* ------------------------------------------------------------------ */

function buildSpec(request: GenerationRequest): BuildingSpec {
  const prompt = request.prompt ?? "";
  const hints = request.hints ?? {};
  const rng = createRng(request.seed);

  const assumptions: BuildingSpec["assumptions"] = [];
  const note = (
    id: string,
    label: string,
    statement: string,
    source: ValueSource,
    confidence: number,
  ) => {
    if (source !== "USER_PROVIDED") {
      assumptions.push({ id, label, statement, source, confidence });
    }
  };

  /* --- use --- */
  const hintedUse = hints.use as BuildingUse | undefined;
  const detectedUse = detectUse(prompt);
  const use: BuildingUse =
    (hintedUse && hintedUse in USE_PROFILES ? hintedUse : null) ??
    detectedUse ??
    "office";
  const useSource: ValueSource = hintedUse || detectedUse ? "USER_PROVIDED" : "DEFAULT";
  note("use", "Building use", `Generic ${use} occupancy assumed.`, useSource, 0.6);

  const profile = USE_PROFILES[use];

  /* --- floors --- */
  const detectedFloors = hints.floors ?? detectFloors(prompt);
  const aboveGrade = clamp(detectedFloors ?? 4, 1, 120);
  const floorsSource: ValueSource = detectedFloors ? "USER_PROVIDED" : "INFERRED";
  note("floors", "Floor count", `${aboveGrade} above-grade levels assumed.`, floorsSource, 0.65);

  const basements = detectBasements(prompt);

  /* --- floor-to-floor --- */
  const detectedF2f = hints.floorToFloorMm ?? detectFloorToFloorMm(prompt);
  const f2f = detectedF2f ?? profile.floorToFloorMm;
  const f2fSource: ValueSource = detectedF2f ? "USER_PROVIDED" : "DEFAULT";
  note("f2f", "Floor-to-floor height", `${f2f} mm floor-to-floor assumed.`, f2fSource, 0.85);

  /* --- area + plate --- */
  const detectedArea = hints.grossAreaSqm ?? detectArea(prompt);
  const grossAreaSqm = detectedArea ?? aboveGrade * 1_200;
  const areaSource: ValueSource = detectedArea ? "USER_PROVIDED" : "INFERRED";
  note(
    "area",
    "Gross floor area",
    `${Math.round(grossAreaSqm).toLocaleString()} m² total assumed.`,
    areaSource,
    0.55,
  );

  /* --- grid --- */
  const detectedGrid = detectGridMm(prompt);
  const gridMm = detectedGrid ?? profile.gridMm;
  const gridSource: ValueSource = detectedGrid ? "USER_PROVIDED" : "DEFAULT";
  note("grid", "Structural grid", `${gridMm} mm square structural bays assumed.`, gridSource, 0.8);

  const plate = plateFromArea({
    grossAreaSqm,
    floors: aboveGrade,
    profile: { ...profile, gridMm },
  });

  /* --- massing --- */
  const detectedMassing = detectMassing(prompt);
  const strategy: MassingStrategy = detectedMassing ?? "rectangle";
  const massingSource: ValueSource = detectedMassing ? "USER_PROVIDED" : "DEFAULT";
  note("massing", "Massing strategy", `${strategy} massing assumed.`, massingSource, 0.7);

  /* --- core --- */
  const coreSize = coreFromPlate({
    plateWidthMm: plate.widthMm,
    plateDepthMm: plate.depthMm,
    profile,
  });
  const detectedCore = detectCoreStrategy(prompt);
  const coreStrategy = detectedCore ?? (aboveGrade >= 3 ? "central" : "offset");
  const coreSource: ValueSource = detectedCore ? "USER_PROVIDED" : "INFERRED";
  note("core", "Core strategy", `${coreStrategy} core selected.`, coreSource, 0.75);

  const detectedElevators = detectElevators(prompt);
  const elevators = detectedElevators ?? recommendElevators(grossAreaSqm, aboveGrade);
  note(
    "elevators",
    "Elevator count",
    `${elevators} passenger elevators sized from gross area.`,
    detectedElevators !== null ? "USER_PROVIDED" : "DERIVED",
    0.7,
  );

  const detectedStairs = detectStairs(prompt);
  const stairs = detectedStairs ?? recommendStairs(grossAreaSqm, aboveGrade);
  note(
    "stairs",
    "Stair count",
    `${stairs} egress stairs assumed.`,
    detectedStairs !== null ? "USER_PROVIDED" : "DERIVED",
    0.7,
  );

  /* --- levels --- */
  const mechanicalLevel = detectMechanicalLevel(prompt, aboveGrade);
  const levels: BuildingSpec["levels"] = [];

  for (let b = basements; b >= 1; b -= 1) {
    levels.push({
      floorNo: -b,
      name: `B${b}`,
      floorToFloorMm: Math.max(2_800, f2f - 300),
      usage: "parking",
    });
  }
  for (let n = 1; n <= aboveGrade; n += 1) {
    const isGround = n === 1;
    const isMechanical = mechanicalLevel === n;
    levels.push({
      floorNo: n,
      name: `L${String(n).padStart(2, "0")}`,
      floorToFloorMm: isMechanical
        ? profile.mechanicalFloorToFloorMm
        : isGround
          ? Math.max(f2f, profile.groundFloorToFloorMm)
          : f2f,
      usage: isMechanical ? "mechanical" : isGround ? "lobby" : "occupied",
    });
  }

  /* --- structure --- */
  const structuralSystem = profile.structuralSystem;
  const columnMm = columnSizeMm(gridMm, aboveGrade);

  /* --- facade --- */
  const cwSides = wantsCurtainWall(prompt) ? curtainWallSides(prompt) : [];
  const allCurtain = wantsCurtainWall(prompt) && cwSides.length === 0;
  const sides = (["north", "south", "east", "west"] as const).map((side) => {
    const isCurtain = allCurtain || cwSides.includes(side);
    const glazing = isCurtain
      ? 0.72
      : side === "south"
        ? profile.defaultGlazingRatio + 0.05
        : profile.defaultGlazingRatio;
    return {
      side,
      system: (isCurtain ? "curtain-wall" : "punched-window") as
        | "curtain-wall"
        | "punched-window",
      glazingRatio: Math.min(0.92, Number(glazing.toFixed(2))),
      moduleMm: isCurtain ? 1_500 : DIMENSION_DEFAULTS.facadeModuleMm,
      windowWidthMm: isCurtain ? 1_400 : 1_200,
      sillHeightMm: isCurtain ? 0 : DIMENSION_DEFAULTS.sillHeightMm,
      headHeightMm: Math.min(f2f - 400, isCurtain ? f2f - 400 : DIMENSION_DEFAULTS.headHeightMm),
    };
  });
  if (cwSides.length) {
    note(
      "facade",
      "Facade system",
      `Curtain wall applied to the ${cwSides.join(", ")} elevation(s).`,
      "USER_PROVIDED",
      1,
    );
  } else {
    note(
      "facade",
      "Facade system",
      `Punched windows at ${Math.round(profile.defaultGlazingRatio * 100)}% glazing assumed.`,
      "DEFAULT",
      0.6,
    );
  }

  note("roof", "Roof type", "Flat roof with parapet assumed.", "DEFAULT", 0.8);
  note("structure", "Structural system", `${structuralSystem} assumed.`, "DEFAULT", 0.7);

  /* --- program --- */
  const program = buildProgram({
    use,
    levels,
    plateAreaSqm: (plate.widthMm / 1000) * (plate.depthMm / 1000),
    coreAreaSqm: (coreSize.widthMm / 1000) * (coreSize.depthMm / 1000),
    profile,
  });

  /* --- intent --- */
  const priorities: BuildingSpec["designIntent"]["priorities"] = [];
  if (wantsEconomy(prompt)) {
    priorities.push({ goal: "construction_economy", weight: 0.9 });
    priorities.push({ goal: "structural_regularity", weight: 0.8 });
  }
  if (wantsRegularity(prompt)) {
    priorities.push({ goal: "structural_regularity", weight: 0.85 });
  }
  priorities.push({ goal: "maximize_usable_area", weight: 0.7 });
  priorities.push({ goal: "minimize_circulation", weight: 0.6 });
  if (use === "office" || use === "education") {
    priorities.push({ goal: "daylight_access", weight: 0.65 });
  }

  const constraints: BuildingSpec["constraints"] = [
    {
      id: "circulation-budget",
      priority: "P2",
      statement: `Circulation should stay under ${Math.round(profile.circulationRatio * 100 + 4)}% of net area.`,
      rule: {
        kind: "max_circulation_ratio",
        numeric: Number((profile.circulationRatio + 0.04).toFixed(2)),
      },
    },
    {
      id: "rooms-accessible",
      priority: "P1",
      statement: "Every enclosed space must connect to circulation.",
    },
    {
      id: "core-continuous",
      priority: "P0",
      statement: "The vertical core must align across all levels.",
    },
  ];
  if (wantsRegularity(prompt) || wantsEconomy(prompt)) {
    constraints.push({
      id: "fixed-grid",
      priority: "P1",
      statement: `Structural bays must remain a uniform ${gridMm} mm.`,
      rule: { kind: "fixed_grid", numeric: gridMm },
    });
  }

  // Building height is DERIVED from the level stack by the compiler, never
  // stored on the spec — two sources of truth would drift apart.
  const siteWidthMm = hints.siteWidthMm ?? Math.round(plate.widthMm * 1.6);
  const siteDepthMm = hints.siteDepthMm ?? Math.round(plate.depthMm * 1.6);

  const P = <T,>(value: T, source: ValueSource, confidence: number, reason: string) => ({
    value,
    source,
    confidence,
    reason,
  });

  return {
    schemaVersion: 1,
    units: "mm",
    generationSeed: request.seed,
    project: {
      name: titleFor(use, aboveGrade),
      use,
      description:
        `A ${aboveGrade}-storey ${use} building of approximately ` +
        `${Math.round(grossAreaSqm).toLocaleString()} m² on a ` +
        `${Math.round(plate.widthMm / 1000)} × ${Math.round(plate.depthMm / 1000)} m plate ` +
        `with a ${coreStrategy} core and a ${gridMm / 1000} m structural grid.`,
    },
    designIntent: {
      summary: prompt.slice(0, 580) || `Generate a ${use} building.`,
      priorities: priorities.slice(0, 7),
    },
    orientation: {
      northAngleDeg: P(0, "DEFAULT", 0.5, "No site orientation given; building aligned to north."),
      primaryEntranceFacade: "south",
    },
    site: {
      widthMm: P(
        siteWidthMm,
        hints.siteWidthMm ? "USER_PROVIDED" : "DERIVED",
        0.5,
        "Site sized to give the building a reasonable setback.",
      ),
      depthMm: P(
        siteDepthMm,
        hints.siteDepthMm ? "USER_PROVIDED" : "DERIVED",
        0.5,
        "Site sized to give the building a reasonable setback.",
      ),
    },
    massing: {
      strategy: P(strategy, massingSource, 0.7, "Simple massing keeps the plate efficient."),
      widthMm: P(plate.widthMm, "DERIVED", 0.75, "Plate sized from target area and snapped to the grid."),
      depthMm: P(plate.depthMm, "DERIVED", 0.75, "Plate depth capped for daylight reach."),
      parameters: massingParameters(strategy, plate, gridMm, rng),
    },
    levels,
    structure: {
      system: P(structuralSystem, "DEFAULT", 0.7, `${structuralSystem} suits this use and span.`),
      gridXMm: P(gridMm, gridSource, 0.8, "Regular bays simplify structure and layout."),
      gridZMm: P(gridMm, gridSource, 0.8, "Square bays keep the frame rational."),
      columnMm: P(columnMm, "DERIVED", 0.7, "Column section scaled to span and floors above."),
      slabThicknessMm: P(slabThicknessMm(gridMm), "DERIVED", 0.75, "Slab depth from governing span."),
      beamDepthMm: P(beamDepthMm(gridMm), "DERIVED", 0.7, "Beam depth approximated as span/12."),
    },
    core: {
      strategy: P(coreStrategy, coreSource, 0.75, "Keeps the perimeter free for occupied space."),
      widthMm: P(coreSize.widthMm, "DERIVED", 0.7, "Core sized from the per-use core ratio."),
      depthMm: P(coreSize.depthMm, "DERIVED", 0.7, "Core sized from the per-use core ratio."),
      offsetXMm: coreStrategy === "offset" ? Math.round(plate.widthMm * 0.22) : 0,
      offsetZMm: coreStrategy === "end" ? Math.round(plate.depthMm * 0.3) : 0,
      elevators: P(
        elevators,
        detectedElevators !== null ? "USER_PROVIDED" : "DERIVED",
        0.7,
        "One car per ~5,000 m² served.",
      ),
      stairs: P(
        stairs,
        detectedStairs !== null ? "USER_PROVIDED" : "DERIVED",
        0.8,
        "Two egress stairs for a multi-storey building.",
      ),
      shafts: ["mechanical", "electrical", "plumbing"],
    },
    program,
    facade: { sides, spandrelMm: DIMENSION_DEFAULTS.spandrelMm },
    roof: {
      type: P("flat" as const, "DEFAULT", 0.8, "Flat roof is the economical default."),
      parapetMm: DIMENSION_DEFAULTS.parapetMm,
      pitchDeg: 0,
    },
    dimensions: {
      exteriorWallMm: P(DIMENSION_DEFAULTS.exteriorWallMm, "DEFAULT", 0.85, "Standard insulated exterior wall."),
      interiorWallMm: P(DIMENSION_DEFAULTS.interiorWallMm, "DEFAULT", 0.85, "Standard stud partition."),
      doorWidthMm: P(DIMENSION_DEFAULTS.doorWidthMm, "DEFAULT", 0.9, "Standard single leaf."),
      doorHeightMm: P(DIMENSION_DEFAULTS.doorHeightMm, "DEFAULT", 0.9, "Standard door height."),
      corridorWidthMm: P(DIMENSION_DEFAULTS.corridorWidthMm, "DEFAULT", 0.8, "Two-way circulation width."),
    },
    mep: {
      strategy: use === "residential" ? "distributed-vrf" : "central-ahu",
      mechanicalLevels: mechanicalLevel ? [mechanicalLevel] : [aboveGrade],
      ceilingPlenumMm: DIMENSION_DEFAULTS.ceilingPlenumMm,
    },
    constraints,
    assumptions,
  };
}

function titleFor(use: BuildingUse, floors: number): string {
  const label = use.charAt(0).toUpperCase() + use.slice(1).replace("-", " ");
  return `${floors}-Storey ${label} Building`;
}

function massingParameters(
  strategy: MassingStrategy,
  plate: { widthMm: number; depthMm: number },
  gridMm: number,
  rng: ReturnType<typeof createRng>,
): BuildingSpec["massing"]["parameters"] {
  const snap = (mm: number) => Math.max(gridMm, Math.round(mm / gridMm) * gridMm);
  switch (strategy) {
    case "courtyard":
    case "atrium":
      return {
        voidWidthMm: snap(plate.widthMm * 0.32),
        voidDepthMm: snap(plate.depthMm * 0.3),
      };
    case "l-shape":
    case "u-shape":
    case "cross":
      return { wingDepthMm: snap(plate.depthMm * 0.42) };
    case "twin-bar":
      return {
        wingDepthMm: snap(plate.depthMm * 0.36),
        gapMm: snap(plate.depthMm * 0.2),
      };
    case "podium-tower":
      return {
        podiumWidthMm: plate.widthMm,
        podiumDepthMm: plate.depthMm,
        podiumLevels: rng.int(2, 3),
      };
    case "stepped":
      return { setbackMm: snap(plate.depthMm * 0.12), setbackEveryLevels: 3 };
    default:
      return {};
  }
}

function buildProgram(input: {
  use: BuildingUse;
  levels: BuildingSpec["levels"];
  plateAreaSqm: number;
  coreAreaSqm: number;
  profile: (typeof USE_PROFILES)[BuildingUse];
}): ProgramItem[] {
  const templates = PROGRAM_TEMPLATES[input.use];
  const occupied = input.levels.filter(
    (l) => l.floorNo > 0 && l.usage !== "mechanical",
  );
  if (occupied.length === 0) return [];

  const groundNos = occupied.filter((l) => l.usage === "lobby").map((l) => l.floorNo);
  const upperNos = occupied.filter((l) => l.usage !== "lobby").map((l) => l.floorNo);

  // Programmable area = plate − core − circulation budget.
  const programmable =
    (input.plateAreaSqm - input.coreAreaSqm) * (1 - input.profile.circulationRatio);

  const items: ProgramItem[] = [];

  for (const template of templates) {
    const levels = template.groundOnly
      ? groundNos
      : template.skipGround
        ? upperNos
        : occupied.map((l) => l.floorNo);
    if (levels.length === 0) continue;

    const targetArea = Math.max(
      MIN_AREA_SQM[template.type] * template.countPerLevel,
      Number((programmable * template.share).toFixed(1)),
    );

    items.push({
      id: template.id,
      type: template.type,
      label: template.label,
      levels,
      targetAreaSqmPerLevel: Number(targetArea.toFixed(1)),
      countPerLevel: template.countPerLevel,
      minAreaSqm: MIN_AREA_SQM[template.type],
      preferredAspectRatio: PREFERRED_ASPECT[template.type],
      adjacency: template.adjacency,
      priority: template.priority,
    });
  }

  // Every occupied level needs circulation the solver can hang rooms off.
  items.push({
    id: "circulation",
    type: "corridor",
    label: "Corridor",
    levels: occupied.map((l) => l.floorNo),
    targetAreaSqmPerLevel: Number(
      ((input.plateAreaSqm - input.coreAreaSqm) * input.profile.circulationRatio).toFixed(1),
    ),
    countPerLevel: 1,
    minAreaSqm: MIN_AREA_SQM.corridor,
    preferredAspectRatio: PREFERRED_ASPECT.corridor,
    adjacency: [{ kind: "REQUIRES_CORE" }],
    priority: "P0",
  });

  return items;
}

/* ------------------------------------------------------------------ */
/* Heuristic patches                                                   */
/* ------------------------------------------------------------------ */

function heuristicPatch(instruction: string, spec: BuildingSpec): BuildingPatch {
  const text = instruction.toLowerCase();

  // "add a floor" / "add one more floor" / "add another storey" / "add 1 level"
  if (/\badd\s+(?:a|an|one|another|\d+)?\s*(?:more\s+)?(?:floor|storey|story|level)/.test(text)) {
    const top = spec.levels.reduce((max, l) => Math.max(max, l.floorNo), 0);
    const template = spec.levels.find((l) => l.floorNo === top) ?? spec.levels[0];
    return {
      summary: "Add one floor",
      rationale: "Appended a level matching the current top storey.",
      scope: "levels",
      affectedFloorNos: [top + 1],
      operations: [
        {
          op: "insert",
          path: "/levels/-",
          value: {
            floorNo: top + 1,
            name: `L${String(top + 1).padStart(2, "0")}`,
            floorToFloorMm: template.floorToFloorMm,
            usage: "occupied",
          },
        },
      ],
    };
  }

  if (/(more|increase).*(glaz|glass)/.test(text)) {
    return {
      summary: "Increase glazing",
      rationale: "Raised the window-to-wall ratio on every elevation.",
      scope: "facade",
      affectedFloorNos: [],
      operations: spec.facade.sides.map((side, index) => ({
        op: "set" as const,
        path: `/facade/sides/${index}/glazingRatio`,
        value: Math.min(0.9, Number((side.glazingRatio + 0.12).toFixed(2))),
      })),
    };
  }

  if (/(less|reduce|decrease).*(glaz|glass)|more solid/.test(text)) {
    return {
      summary: "Reduce glazing",
      rationale: "Lowered the window-to-wall ratio on every elevation.",
      scope: "facade",
      affectedFloorNos: [],
      operations: spec.facade.sides.map((side, index) => ({
        op: "set" as const,
        path: `/facade/sides/${index}/glazingRatio`,
        value: Math.max(0.1, Number((side.glazingRatio - 0.12).toFixed(2))),
      })),
    };
  }

  if (/move.*core.*(east|right)/.test(text)) {
    return {
      summary: "Move core east",
      rationale: "Shifted the core 2 m east.",
      scope: "core",
      affectedFloorNos: [],
      operations: [
        { op: "set", path: "/core/offsetXMm", value: spec.core.offsetXMm + 2_000 },
      ],
    };
  }

  if (/(taller|increase).*(floor|ceiling|height)/.test(text)) {
    return {
      summary: "Increase floor-to-floor height",
      rationale: "Raised every occupied storey by 300 mm.",
      scope: "levels",
      affectedFloorNos: spec.levels.map((l) => l.floorNo),
      operations: spec.levels.map((level, index) => ({
        op: "set" as const,
        path: `/levels/${index}/floorToFloorMm`,
        value: Math.min(12_000, level.floorToFloorMm + 300),
      })),
    };
  }

  // Honest no-op rather than a fabricated change.
  return {
    summary: "No deterministic rule matched",
    rationale:
      "The offline provider has no rule for this instruction. Configure ANTHROPIC_API_KEY for open-ended modification.",
    scope: "building",
    affectedFloorNos: [],
    operations: [{ op: "set", path: "/generationSeed", value: spec.generationSeed }],
  };
}

function heuristicRepair(request: RepairRequest): BuildingPatch {
  const { spec, violations } = request;

  const circulation = violations.find((v) => v.code === "CIRCULATION_OVER_BUDGET");
  if (circulation) {
    const corridor = spec.program.findIndex((p) => p.type === "corridor");
    if (corridor >= 0) {
      return {
        summary: "Reduce corridor area",
        rationale: "Trimmed the corridor target to bring circulation within budget.",
        scope: "program",
        affectedFloorNos: [],
        operations: [
          {
            op: "set",
            path: `/program/${corridor}/targetAreaSqmPerLevel`,
            value: Number(
              (spec.program[corridor].targetAreaSqmPerLevel * 0.85).toFixed(1),
            ),
          },
        ],
      };
    }
  }

  const oversized = violations.find((v) => v.code === "PROGRAM_EXCEEDS_PLATE");
  if (oversized) {
    return {
      summary: "Enlarge floor plate",
      rationale: "The declared program did not fit; widened the plate by one bay.",
      scope: "massing",
      affectedFloorNos: [],
      operations: [
        {
          op: "set",
          path: "/massing/widthMm/value",
          value: spec.massing.widthMm.value + spec.structure.gridXMm.value,
        },
      ],
    };
  }

  return {
    summary: "No automatic repair available",
    rationale: "No deterministic repair rule matched the reported violations.",
    scope: "building",
    affectedFloorNos: [],
    operations: [{ op: "set", path: "/generationSeed", value: spec.generationSeed }],
  };
}
