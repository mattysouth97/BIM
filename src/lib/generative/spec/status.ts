// src/lib/generative/spec/status.ts
//
// The system generates architecturally plausible buildings. It must never imply
// it has generated a permitted, code-compliant or engineered one (brief §10).
//
// These four statuses are tracked separately and can only be earned, never
// assumed. The UI badge reads from here — there is deliberately no way to
// express "APPROVED".

export type DesignStatusLevel =
  /** Geometry produced from intent. Nothing has been checked. */
  | "GENERATIVE_DESIGN"
  /** Deterministic geometry/topology validators pass. */
  | "GEOMETRICALLY_VALIDATED"
  /** A jurisdictional ruleset was supplied AND evaluated. */
  | "RULE_VALIDATED"
  /** A qualified engineer signed off outside this system. */
  | "ENGINEER_VERIFIED";

export interface DesignStatus {
  level: DesignStatusLevel;
  /** Why the model sits at this level — shown on hover. */
  reason: string;
  /** Blockers preventing the next level up. */
  blockers: string[];
}

export const STATUS_LABEL: Record<DesignStatusLevel, string> = {
  GENERATIVE_DESIGN: "Generated",
  GEOMETRICALLY_VALIDATED: "Geometrically Valid",
  RULE_VALIDATED: "Rule Validated",
  ENGINEER_VERIFIED: "Engineer Reviewed",
};

export const STATUS_LABEL_KO: Record<DesignStatusLevel, string> = {
  GENERATIVE_DESIGN: "생성됨",
  GEOMETRICALLY_VALIDATED: "형상 검증됨",
  RULE_VALIDATED: "규정 검증됨",
  ENGINEER_VERIFIED: "기술사 검토됨",
};

const ORDER: DesignStatusLevel[] = [
  "GENERATIVE_DESIGN",
  "GEOMETRICALLY_VALIDATED",
  "RULE_VALIDATED",
  "ENGINEER_VERIFIED",
];

export function statusRank(level: DesignStatusLevel): number {
  return ORDER.indexOf(level);
}

/**
 * Derive status from real evidence only.
 *
 * `RULE_VALIDATED` requires `jurisdictionRulesetId` — a ruleset that was
 * actually supplied and run. Passing our own geometry checks does not and must
 * not promote a model to it.
 */
export function deriveDesignStatus(input: {
  hasGeometry: boolean;
  criticalViolations: number;
  warningViolations: number;
  jurisdictionRulesetId?: string | null;
  jurisdictionViolations?: number;
  engineerSignOffId?: string | null;
}): DesignStatus {
  const blockers: string[] = [];

  if (!input.hasGeometry) {
    return {
      level: "GENERATIVE_DESIGN",
      reason: "No geometry has been generated yet.",
      blockers: ["Generate a building."],
    };
  }

  if (input.criticalViolations > 0) {
    return {
      level: "GENERATIVE_DESIGN",
      reason: `${input.criticalViolations} critical geometry or spatial issue(s) unresolved.`,
      blockers: [`Resolve ${input.criticalViolations} critical issue(s).`],
    };
  }

  if (input.engineerSignOffId) {
    return {
      level: "ENGINEER_VERIFIED",
      reason: `Signed off under record ${input.engineerSignOffId}.`,
      blockers: [],
    };
  }

  if (input.jurisdictionRulesetId) {
    if ((input.jurisdictionViolations ?? 0) === 0) {
      return {
        level: "RULE_VALIDATED",
        reason: `Evaluated against ruleset ${input.jurisdictionRulesetId} with no violations.`,
        blockers: ["Engineering verification has not been performed."],
      };
    }
    blockers.push(
      `${input.jurisdictionViolations} violation(s) against ${input.jurisdictionRulesetId}.`,
    );
  } else {
    blockers.push("No jurisdictional ruleset has been supplied or evaluated.");
  }

  if (input.warningViolations > 0) {
    blockers.push(`${input.warningViolations} warning(s) outstanding.`);
  }

  return {
    level: "GEOMETRICALLY_VALIDATED",
    reason: "Deterministic geometry and spatial checks pass.",
    blockers,
  };
}

/**
 * Guard against the product ever asserting regulatory approval. Any copy that
 * fails this is a bug, not a wording preference.
 */
const FORBIDDEN = [
  /permit\s+compliant/i,
  /code\s+compliant/i,
  /structurally\s+certified/i,
  /fire\s+certified/i,
  /building\s+approved/i,
  /approved\s+for\s+construction/i,
];

export function assertNoComplianceClaim(text: string): void {
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) {
      throw new Error(
        `Refusing to display an unearned compliance claim: "${text}". ` +
          `Only deriveDesignStatus() may describe validation state.`,
      );
    }
  }
}
