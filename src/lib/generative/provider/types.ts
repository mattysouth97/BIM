// src/lib/generative/provider/types.ts
//
// The reasoning layer is an interface, not a vendor. Claude is the first
// implementation; the architecture must survive swapping it (brief §5, §92).
//
// The hard boundary: a provider returns INTENT (a BuildingSpec / patch /
// review). It never returns geometry, element ids, or mesh data. Everything a
// provider emits is parsed against a Zod schema before anything downstream
// touches it — AI output is untrusted input until validated (brief §66).

import type {
  BuildingPatch,
  BuildingReview,
  BuildingSpec,
} from "../spec/building-spec";

/** Compact semantic digest of the model. Never the geometry database (§49). */
export interface BimSummary {
  buildingPk: string;
  floors: number;
  grossAreaSqm: number;
  netAreaSqm: number;
  buildingHeightMm: number;
  gridXMm: number;
  gridZMm: number;
  coreStrategy: string;
  circulationRatio: number;
  /** Space type → count. */
  spaceCounts: Record<string, number>;
  /** Element category → count. */
  elementCounts: Record<string, number>;
  violations: ConstraintViolationSummary[];
  lockedSystems: string[];
}

export interface ConstraintViolationSummary {
  code: string;
  priority: "P0" | "P1" | "P2" | "P3";
  severity: "critical" | "warning" | "advisory";
  message: string;
  elementIds: string[];
  floorNo?: number;
}

export interface GenerationRequest {
  prompt: string;
  /** Optional structured hints from the Generate form. All genuinely optional. */
  hints?: {
    use?: string;
    floors?: number;
    grossAreaSqm?: number;
    siteWidthMm?: number;
    siteDepthMm?: number;
    floorToFloorMm?: number;
    structuralSystem?: string;
    style?: string;
  };
  /** Same prompt + hints + seed ⇒ substantially reproducible geometry (§24). */
  seed: number;
  /**
   * Design rules the project has accumulated and locked. These are persistent
   * project memory, not chat history (§120, §121) — they must be honoured on
   * every subsequent generation.
   */
  designRules?: string[];
  /** Optional images used as design evidence only, never as measurements (§50). */
  images?: Array<{ mediaType: string; base64: string }>;
  signal?: AbortSignal;
}

export interface ModificationRequest {
  /** Current spec — the thing being patched. */
  spec: BuildingSpec;
  /** Digest of the built model, so advice is grounded in real state. */
  summary: BimSummary;
  /** Natural-language instruction from the command bar. */
  instruction: string;
  /** What the user had selected; scopes the edit (§18, §54). */
  scope: {
    kind:
      | "building"
      | "system"
      | "level"
      | "zone"
      | "space"
      | "element"
      | "selection";
    label: string;
    floorNos?: number[];
    elementIds?: string[];
  };
  /** Systems/elements the provider must not touch (§41, §83). */
  locked: string[];
  designRules?: string[];
  signal?: AbortSignal;
}

export interface RepairRequest {
  spec: BuildingSpec;
  summary: BimSummary;
  violations: ConstraintViolationSummary[];
  locked: string[];
  /** Guard against uncontrolled iteration (§22). */
  attempt: number;
  signal?: AbortSignal;
}

/** Telemetry surfaced in the developer view only (§91, §94). */
export interface ProviderTrace {
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
  /** Schema-repair retries performed before a valid result. */
  retries: number;
}

export interface ProviderResult<T> {
  data: T;
  trace: ProviderTrace;
}

export interface BIMReasoningProvider {
  readonly name: string;
  /** False when the provider cannot run (e.g. no API key configured). */
  isAvailable(): boolean;

  generateBuilding(
    request: GenerationRequest,
  ): Promise<ProviderResult<BuildingSpec>>;

  modifyBuilding(
    request: ModificationRequest,
  ): Promise<ProviderResult<BuildingPatch>>;

  evaluateBuilding(
    summary: BimSummary,
    spec: BuildingSpec,
  ): Promise<ProviderResult<BuildingReview>>;

  repairBuilding(
    request: RepairRequest,
  ): Promise<ProviderResult<BuildingPatch>>;
}

/** Structured error surface — every tool returns these, never raw exceptions (§65). */
export type ProviderErrorCode =
  | "NO_CREDENTIALS"
  | "SCHEMA_VALIDATION_FAILED"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED"
  | "CANCELLED"
  | "TIMEOUT";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly detail?: string;

  constructor(code: ProviderErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.detail = detail;
  }
}
