/* @vitest-environment happy-dom */
//
// IssuesPanel + SummaryPanel — the two panels that carry the system's honesty
// promises.
//
//   IssuesPanel   every issue came from a deterministic validator, so "repair
//                 this" is meaningful and BOUNDED: after maxAttempts the panel
//                 must say the attempts are spent and leave the issues on
//                 screen rather than quietly doing nothing.
//   SummaryPanel  status is derived from evidence and has no "approved" state;
//                 every value the user did not state is listed with its source
//                 and confidence, and can be promoted into a persistent rule.
//
// Fixtures are real: the heuristic provider produces a real BuildingSpec and
// buildDesign() runs the real solver + the real validators. Where a case needs
// outstanding issues, the REAL validator is re-run over a perturbed model
// rather than hand-written violations, so the shapes cannot drift.

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import { buildDesign } from "@/lib/generative/build";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import type { BuildingSpec } from "@/lib/generative/spec/building-spec";
import type { GeneratedBuilding } from "@/lib/generative/generate/types";
import { validateBuilding, type ValidationReport } from "@/lib/generative/validate/rules";
import type { DesignState } from "@/store/generative-session-store";

import { IssuesPanel } from "../issues-panel";
import { SummaryPanel } from "../summary-panel";

const PROMPT =
  "Create a five-story office building, approximately 6,000 m², with a central core.";

let design: DesignState;
/** Real report over the unperturbed model — genuinely zero violations. */
let cleanReport: ValidationReport;
/** Real report over a perturbed model — 2 critical, 1 warning, 1 advisory. */
let dirtyReport: ValidationReport;

beforeAll(async () => {
  const { data: spec } = await new HeuristicReasoningProvider().generateBuilding({
    prompt: PROMPT,
    seed: 4242,
  });
  const built = buildDesign({ spec, buildingPk: "generated", generationId: "GEN-0001" });

  design = {
    spec,
    recipe: built.recipe,
    snapshot: built.snapshot,
    metrics: built.metrics,
    validation: built.validation,
    status: built.status,
    approximations: built.approximations,
    generationId: "GEN-0001",
    revision: 0,
    seed: 4242,
    provider: {
      name: "heuristic",
      model: "deterministic",
      latencyMs: 1,
      inputTokens: 0,
      outputTokens: 0,
      retries: 0,
    },
  };
  cleanReport = built.validation;

  // Perturb the solved model and the spec, then run the SAME validators:
  //   duplicated wall        → DUPLICATE_WALL          P0 critical
  //   unreachable space      → SPACE_NOT_ACCESSIBLE    P1 critical
  //   impossible area target → SPACE_BELOW_TARGET_AREA P2 warning
  //   impossible circ budget → CIRCULATION_OVER_BUDGET P3 advisory
  const brokenSpec: BuildingSpec = {
    ...spec,
    constraints: spec.constraints.map((c) =>
      c.rule?.kind === "max_circulation_ratio"
        ? { ...c, rule: { ...c.rule, numeric: 0.02 } }
        : c,
    ),
    program: spec.program.map((p, i) => (i === 0 ? { ...p, minAreaSqm: 99_999 } : p)),
  };
  const brokenBuilding: GeneratedBuilding = {
    ...built.building,
    walls: [...built.building.walls, { ...built.building.walls[0], id: "WALL-DUPE" }],
    spaces: built.building.spaces.map((s, i) => (i === 0 ? { ...s, reachable: false } : s)),
  };
  dirtyReport = validateBuilding(brokenBuilding, brokenSpec);
});

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** The row a user sees for one violation, found by the message they read. */
function issueRow(violation: { message: string }): HTMLElement {
  const row = screen.getByText(violation.message).closest("li");
  if (!row) throw new Error(`no row rendered for "${violation.message}"`);
  return row as HTMLElement;
}

function pick(report: ValidationReport, severity: string) {
  const found = report.violations.find((v) => v.severity === severity);
  if (!found) throw new Error(`fixture has no ${severity} violation`);
  return found;
}

function renderIssues(
  overrides: Partial<React.ComponentProps<typeof IssuesPanel>> = {},
) {
  const onRepair = vi.fn();
  const utils = render(
    <IssuesPanel
      validation={dirtyReport}
      onRepair={onRepair}
      busy={false}
      attempt={0}
      maxAttempts={3}
      {...overrides}
    />,
  );
  return { onRepair, ...utils };
}

/* ------------------------------------------------------------------ */
/* IssuesPanel                                                         */
/* ------------------------------------------------------------------ */

describe("IssuesPanel", () => {
  it("reports how many issues sit at each severity", () => {
    renderIssues();

    // The fixture deliberately carries all three severities at once.
    expect(dirtyReport.counts.critical).toBeGreaterThan(0);
    expect(dirtyReport.counts.warning).toBeGreaterThan(0);
    expect(dirtyReport.counts.advisory).toBeGreaterThan(0);

    expect(screen.getByText(`${dirtyReport.counts.critical} critical`)).toBeTruthy();
    expect(screen.getByText(`${dirtyReport.counts.warning} warning`)).toBeTruthy();
    expect(screen.getByText(`${dirtyReport.counts.advisory} advisory`)).toBeTruthy();
  });

  it("lists every violation with its message and machine code", () => {
    renderIssues();

    for (const violation of dirtyReport.violations) {
      const row = issueRow(violation).textContent ?? "";
      expect(row).toContain(violation.code);
      expect(row).toContain(violation.priority);
      if (violation.suggestion) expect(row).toContain(violation.suggestion);
    }
  });

  it("repairing one issue asks for exactly that issue's code", () => {
    const { onRepair } = renderIssues();
    const target = pick(dirtyReport, "critical");

    // Each control names the code it will send, so a list of repair buttons is
    // distinguishable rather than three identical "repair"s.
    fireEvent.click(
      within(issueRow(target)).getByRole("button", { name: `Repair ${target.code}` }),
    );

    expect(onRepair).toHaveBeenCalledTimes(1);
    expect(onRepair).toHaveBeenCalledWith([target.code]);
  });

  it("the bulk button asks for an empty list, the convention for 'everything non-advisory'", () => {
    const { onRepair } = renderIssues();
    const repairable = dirtyReport.violations.filter((v) => v.severity !== "advisory");

    const bulk = screen.getByRole("button", {
      name: new RegExp(`^Repair ${repairable.length} issues?$`),
    });
    fireEvent.click(bulk);

    // Empty — NOT the enumerated codes. The route reads [] as "every critical
    // or warning issue present in the CURRENT model", which is what keeps a
    // stale client list from repairing something already gone.
    expect(onRepair).toHaveBeenCalledWith([]);
  });

  it("offers no repair control on advisory issues", () => {
    renderIssues();
    const advisory = pick(dirtyReport, "advisory");

    const row = issueRow(advisory);
    expect(within(row).queryByRole("button")).toBeNull();

    // …and the bulk button counts the repairable ones only, not the advisory.
    const repairable = dirtyReport.violations.filter((v) => v.severity !== "advisory");
    expect(repairable.length).toBeLessThan(dirtyReport.violations.length);
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^Repair ${repairable.length} issues?$`),
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(`^Repair ${dirtyReport.violations.length} issues?$`),
      }),
    ).toBeNull();
  });

  it("shows which attempt is next while attempts remain", () => {
    renderIssues({ attempt: 1, maxAttempts: 3 });
    expect(screen.getByText("attempt 2 of 3")).toBeTruthy();
  });

  it("disables every repair control while a repair is in flight", () => {
    renderIssues({ busy: true });

    const controls = screen.getAllByRole("button") as HTMLButtonElement[];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control.disabled).toBe(true);
  });

  it("says the attempts are used up instead of silently doing nothing", () => {
    const { onRepair } = renderIssues({ attempt: 3, maxAttempts: 3 });

    expect(screen.getByText("3 attempts used")).toBeTruthy();
    expect(screen.queryByText(/attempt \d+ of \d+/)).toBeNull();

    const controls = screen.getAllByRole("button") as HTMLButtonElement[];
    for (const control of controls) expect(control.disabled).toBe(true);

    const exhausted = pick(dirtyReport, "critical");
    fireEvent.click(
      within(issueRow(exhausted)).getByRole("button", {
        name: `Repair ${exhausted.code}`,
      }),
    );
    expect(onRepair).not.toHaveBeenCalled();

    // The unresolved issues stay on screen as issues — the bound is on the
    // repair loop, not on what the user is allowed to see.
    for (const violation of dirtyReport.violations) {
      expect(screen.getByText(violation.message)).toBeTruthy();
    }
  });

  it("a clean report says the checks pass and stops short of claiming compliance", () => {
    expect(cleanReport.violations).toHaveLength(0);
    const { container } = renderIssues({ validation: cleanReport });

    expect(screen.getByText(/check(s)? pass/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/code.compliant|permit|approved/i);
  });
});

/* ------------------------------------------------------------------ */
/* SummaryPanel                                                        */
/* ------------------------------------------------------------------ */

function renderSummary(
  overrides: Partial<React.ComponentProps<typeof SummaryPanel>> = {},
) {
  const onAddRule = vi.fn();
  const onRemoveRule = vi.fn();
  const utils = render(
    <SummaryPanel
      design={design}
      designRules={[]}
      onAddRule={onAddRule}
      onRemoveRule={onRemoveRule}
      {...overrides}
    />,
  );
  return { onAddRule, onRemoveRule, ...utils };
}

/**
 * The block a user reads for one assumption, found by its statement. Scoped to
 * the Assumptions section — a statement promoted to a design rule also appears
 * in the rules list above.
 */
function assumptionRow(statement: string): HTMLElement {
  const section = screen.getByText(/^Assumptions \(\d+\)$/).closest("section");
  if (!section) throw new Error("no assumptions section rendered");
  const row = within(section as HTMLElement).getByText(statement).closest("li");
  if (!row) throw new Error(`no row rendered for assumption "${statement}"`);
  return row as HTMLElement;
}

describe("SummaryPanel", () => {
  it("names the project and describes it", () => {
    renderSummary();

    expect(
      screen.getByRole("heading", { name: design.spec.project.name }),
    ).toBeTruthy();
    expect(screen.getByText(design.spec.project.description)).toBeTruthy();
  });

  it("shows the derived status, its reason and its blockers", () => {
    renderSummary();

    expect(design.status.level).toBe("GEOMETRICALLY_VALIDATED");
    expect(screen.getByText("Geometrically Valid")).toBeTruthy();
    expect(screen.getByText(design.status.reason)).toBeTruthy();

    expect(design.status.blockers.length).toBeGreaterThan(0);
    for (const blocker of design.status.blockers) {
      expect(screen.getByText(blocker)).toBeTruthy();
    }
  });

  it("never presents the design as approved", () => {
    const { container } = renderSummary();
    expect(container.textContent ?? "").not.toMatch(/approved|code.compliant/i);
  });

  it("shows the numbers an architect checks first", () => {
    renderSummary();
    const m = design.metrics;

    const value = (label: string) =>
      screen.getByText(label).parentElement?.textContent ?? "";

    expect(value("Floors")).toContain(String(m.floorCount));
    expect(value("Gross area")).toContain(
      `${Math.round(m.grossAreaSqm).toLocaleString()} m²`,
    );
    expect(value("Net area")).toContain(
      `${Math.round(m.netAreaSqm).toLocaleString()} m²`,
    );
    expect(value("Height")).toContain(`${m.buildingHeightM.toFixed(1)} m`);
    expect(value("Spaces")).toContain(String(m.roomCount));
    expect(value("Doors")).toContain(String(m.doorCount));
    expect(value("Windows")).toContain(String(m.windowCount));
    expect(value("Columns")).toContain(String(m.columnCount));
    expect(value("Circulation")).toContain(
      `${(m.circulationRatio * 100).toFixed(1)}%`,
    );
  });

  it("shows every assumption with where it came from and how confident it is", () => {
    renderSummary();
    const assumptions = design.spec.assumptions;

    expect(assumptions.length).toBeGreaterThan(0);
    for (const assumption of assumptions) {
      const row = assumptionRow(assumption.statement);
      expect(within(row).getByText(assumption.label)).toBeTruthy();
      expect(row.textContent ?? "").toContain(assumption.source.replace("_", " "));
      expect(row.textContent ?? "").toContain(
        `confidence ${(assumption.confidence * 100).toFixed(0)}%`,
      );
    }
  });

  it("promoting an assumption to a rule passes its statement verbatim", () => {
    const { onAddRule } = renderSummary();
    const assumption = design.spec.assumptions[0];

    fireEvent.click(
      within(assumptionRow(assumption.statement)).getByRole("button", {
        name: "make a rule",
      }),
    );

    expect(onAddRule).toHaveBeenCalledTimes(1);
    expect(onAddRule).toHaveBeenCalledWith(assumption.statement);
  });

  it("offers 'make a rule' only for values the user did not state", () => {
    const userStated = {
      id: "user-f2f",
      label: "Storey height",
      statement: "Floor-to-floor is 4.2 m, as stated in the brief.",
      source: "USER_PROVIDED" as const,
      confidence: 1,
    };
    const withUserValue: DesignState = {
      ...design,
      spec: {
        ...design.spec,
        assumptions: [...design.spec.assumptions, userStated],
      },
    };

    renderSummary({ design: withUserValue });

    // Nothing to stop guessing at — the user already said it.
    expect(
      within(assumptionRow(userStated.statement)).queryByRole("button", {
        name: "make a rule",
      }),
    ).toBeNull();

    // Every inferred/derived/default value still offers the promotion.
    const inferred = design.spec.assumptions.filter((a) => a.source !== "USER_PROVIDED");
    expect(inferred.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "make a rule" })).toHaveLength(
      inferred.length,
    );
  });

  it("stops offering 'make a rule' once the assumption is already a rule", () => {
    const assumption = design.spec.assumptions[0];
    renderSummary({ designRules: [assumption.statement] });

    expect(
      within(assumptionRow(assumption.statement)).queryByRole("button", {
        name: "make a rule",
      }),
    ).toBeNull();
  });

  it("renders the design rules it is given, and counts them", () => {
    const rules = ["Keep corridors at least 1.8 m clear", "No offices below grade"];
    renderSummary({ designRules: rules });

    expect(screen.getByText(`Design rules (${rules.length})`)).toBeTruthy();
    for (const rule of rules) expect(screen.getByText(rule)).toBeTruthy();
  });

  it("adding a rule through the form reports it and clears the input", () => {
    const { onAddRule } = renderSummary();

    const input = screen.getByLabelText("Add a design rule") as HTMLInputElement;
    const add = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;

    // Nothing typed yet — there is nothing to add.
    expect(add.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "Stairs must reach the roof" } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);

    expect(onAddRule).toHaveBeenCalledWith("Stairs must reach the roof");
    expect(input.value).toBe("");
  });

  it("removing a rule reports which one", () => {
    const rules = ["Keep corridors at least 1.8 m clear", "No offices below grade"];
    const { onRemoveRule } = renderSummary({ designRules: rules });

    const row = screen.getByText(rules[1]).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "remove" }));

    expect(onRemoveRule).toHaveBeenCalledTimes(1);
    expect(onRemoveRule).toHaveBeenCalledWith(rules[1]);
  });
});
