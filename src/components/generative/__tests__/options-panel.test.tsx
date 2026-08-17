/* @vitest-environment happy-dom */
//
// OptionsPanel — design-option comparison.
//
// The panel's stated purpose is comparative: several full generations against
// the same brief, held side by side, so the numbers are measured rather than
// estimated. These tests defend that intent:
//   · every option gets a column, identified by label and seed;
//   · an option that has not finished (running) or cannot finish (failed) says
//     so and offers nothing to adopt — you cannot commit to a non-design;
//   · adopting a ready option hands back THAT option's id;
//   · the "best" marker appears only on rows that have a direction, and only
//     when the ready options actually disagree.
//
// Fixtures are real: every `result` below comes from the offline heuristic
// provider run through the same deterministic build the server uses, so the
// metrics being compared are the ones the product would really show.

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import { OptionsPanel } from "../options-panel";
import { buildDesign, generationIdFor } from "@/lib/generative/build";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import type { GenerationResult } from "@/lib/generative/client";
import type { DesignOption } from "@/store/generative-session-store";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const BRIEF =
  "Create a five-story office building, approximately 6,000 m², with a central core.";

async function makeResult(seed: number, prompt = BRIEF): Promise<GenerationResult> {
  const { data: spec, trace } = await new HeuristicReasoningProvider().generateBuilding({
    prompt,
    seed,
  });
  const built = buildDesign({
    spec,
    buildingPk: "generated",
    generationId: generationIdFor(seed, 0),
  });
  return {
    success: true,
    spec,
    recipe: built.recipe,
    snapshot: built.snapshot,
    metrics: built.metrics,
    validation: built.validation,
    status: built.status,
    approximations: built.approximations,
    generationId: built.generationId,
    revision: 0,
    seed,
    provider: {
      name: trace.provider,
      model: trace.model,
      latencyMs: trace.latencyMs,
      inputTokens: trace.inputTokens,
      outputTokens: trace.outputTokens,
      retries: trace.retries,
    },
  };
}

// Same brief, different seed — the product's own definition of an "option".
let schemeA: GenerationResult;
let schemeB: GenerationResult;

// Seed alone moves net area and circulation but leaves core ratio and the
// critical-issue count identical, so a seed-only pair can never show whether
// THOSE two rows mark anything at all. The comparison tests therefore use two
// genuinely different buildings (still real generations, still deterministic)
// that disagree on all four directional rows — and disagree in opposite
// directions, so a per-row marker cannot be faked by always picking column one.
let researchScheme: GenerationResult;
let courtyardScheme: GenerationResult;

// The critical-issue row needs its own pair. Both schemes above now validate
// clean, so neither can show that row marking anything — see the comment on
// "the fixtures really do disagree" below. This is still a real generation:
// an L-plate whose wings the space solver leaves with no route to the core.
let severedScheme: GenerationResult;

beforeAll(async () => {
  schemeA = await makeResult(4242);
  schemeB = await makeResult(99);
  researchScheme = await makeResult(
    20,
    "Create a 5 storey research building of 6,000 m² with a central core.",
  );
  courtyardScheme = await makeResult(
    22,
    "Create a 5 storey courtyard office building of 6,000 m² with a central core.",
  );
  severedScheme = await makeResult(
    20,
    "Create a 5 storey L-shaped office of 6,000 m² with a central core.",
  );
});

function threeOptions(): DesignOption[] {
  return [
    { id: "opt-a", label: "Scheme A", seed: 4242, state: "ready", result: schemeA },
    { id: "opt-b", label: "Scheme B", seed: 99, state: "ready", result: schemeB },
    { id: "opt-c", label: "Scheme C", seed: 1234, state: "running" },
  ];
}

function withFailure(): DesignOption[] {
  return [
    { id: "opt-a", label: "Scheme A", seed: 4242, state: "ready", result: schemeA },
    { id: "opt-b", label: "Scheme B", seed: 99, state: "ready", result: schemeB },
    {
      id: "opt-d",
      label: "Scheme D",
      seed: 777,
      state: "failed",
      error: "The reasoning provider timed out.",
    },
  ];
}

function renderPanel(options: DesignOption[]) {
  const onAdopt = vi.fn();
  const onDismiss = vi.fn();
  render(
    <OptionsPanel
      options={options}
      prompt={BRIEF}
      onAdopt={onAdopt}
      onDismiss={onDismiss}
    />,
  );
  return { onAdopt, onDismiss };
}

/* ------------------------------------------------------------------ */
/* Table helpers                                                       */
/* ------------------------------------------------------------------ */

/** Column headers, minus the empty corner cell above the row labels. */
function optionHeaders(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("thead th")).slice(1);
}

function headerFor(optionLabel: string): HTMLElement {
  const header = optionHeaders().find((th) =>
    (th.textContent ?? "").includes(optionLabel),
  );
  if (!header) throw new Error(`No column headed "${optionLabel}"`);
  return header;
}

function columnIndexOf(optionLabel: string): number {
  return optionHeaders().indexOf(headerFor(optionLabel));
}

/** The value cells of a comparison row, in column order. */
function rowCells(rowLabel: string): HTMLElement[] {
  const row = Array.from(document.querySelectorAll("tbody tr")).find(
    (tr) => tr.querySelector("th")?.textContent?.trim() === rowLabel,
  );
  if (!row) throw new Error(`No comparison row labelled "${rowLabel}"`);
  return Array.from(row.querySelectorAll<HTMLElement>("td"));
}

/** The action cell under a column — where "Use this" or the error lives. */
function actionCell(optionLabel: string): HTMLElement {
  const cells = Array.from(document.querySelectorAll<HTMLElement>("tfoot td"));
  // tfoot leads with the same empty corner cell as thead.
  return cells[columnIndexOf(optionLabel) + 1];
}

// The panel signals "best in this row" with colour alone — an emerald, bolder
// cell. There is no text, title or ARIA marker on the winning value, so the
// class is the only observable signal a test (or a screen reader) could read.
// See the reported accessibility finding.
function isMarkedBest(cell: HTMLElement): boolean {
  return cell.className.includes("text-emerald-600");
}

/** Labels of the columns whose value is marked as best on a given row. */
function markedLabels(rowLabel: string): string[] {
  // The label is the first line of the column header; "seed N" follows it.
  const labels = optionHeaders().map(
    (th) => th.querySelector("span")?.textContent?.trim() ?? "",
  );
  return rowCells(rowLabel)
    .map((cell, index) => (isMarkedBest(cell) ? labels[index] : null))
    .filter((label): label is string => label !== null);
}

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

describe("OptionsPanel — columns", () => {
  it("gives every option a column carrying its label and the seed that made it", () => {
    renderPanel(threeOptions());

    const headers = optionHeaders();
    expect(headers.length).toBe(3);

    expect(within(headerFor("Scheme A")).getByText("seed 4242")).toBeTruthy();
    expect(within(headerFor("Scheme B")).getByText("seed 99")).toBeTruthy();
    expect(within(headerFor("Scheme C")).getByText("seed 1234")).toBeTruthy();
  });

  it("heads the panel with the option count, the outstanding work and the brief", () => {
    renderPanel(threeOptions());

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toContain("3 design options");
    expect(heading.textContent).toContain("1 still generating");
    expect(screen.getByText(BRIEF)).toBeTruthy();
  });

  it("renders nothing at all when there are no options", () => {
    const { container } = render(
      <OptionsPanel options={[]} prompt={BRIEF} onAdopt={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* Option state                                                        */
/* ------------------------------------------------------------------ */

describe("OptionsPanel — option state", () => {
  it("shows a running option as still generating, with no numbers and nothing to adopt", () => {
    renderPanel(threeOptions());

    expect(within(headerFor("Scheme C")).getByText(/generating/i)).toBeTruthy();

    // An unfinished generation has no measurements to compare.
    const column = columnIndexOf("Scheme C");
    for (const rowLabel of ["Floors", "Gross area", "Net area", "Critical issues"]) {
      expect(rowCells(rowLabel)[column].textContent).toBe("—");
    }

    // You cannot adopt a design that does not exist yet.
    expect(
      within(actionCell("Scheme C")).queryByRole("button", { name: "Use this" }),
    ).toBeNull();
  });

  it("shows a failed option's error in place of an adopt control", () => {
    renderPanel(withFailure());

    expect(within(headerFor("Scheme D")).getByText(/failed/i)).toBeTruthy();
    expect(
      within(actionCell("Scheme D")).getByText("The reasoning provider timed out."),
    ).toBeTruthy();
    expect(
      within(actionCell("Scheme D")).queryByRole("button", { name: "Use this" }),
    ).toBeNull();
  });

  it("offers exactly one adopt control per ready option", () => {
    renderPanel(threeOptions());
    expect(screen.getAllByRole("button", { name: "Use this" }).length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Adopting                                                            */
/* ------------------------------------------------------------------ */

describe("OptionsPanel — adopting", () => {
  it("adopts the option whose own column was clicked", () => {
    const { onAdopt } = renderPanel(threeOptions());

    fireEvent.click(
      within(actionCell("Scheme B")).getByRole("button", { name: "Use this" }),
    );
    expect(onAdopt).toHaveBeenCalledTimes(1);
    expect(onAdopt).toHaveBeenCalledWith("opt-b");

    fireEvent.click(
      within(actionCell("Scheme A")).getByRole("button", { name: "Use this" }),
    );
    expect(onAdopt).toHaveBeenCalledTimes(2);
    expect(onAdopt).toHaveBeenLastCalledWith("opt-a");
  });

  it("dismisses the whole comparison without adopting anything", () => {
    const { onAdopt, onDismiss } = renderPanel(threeOptions());

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAdopt).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Comparison marking                                                  */
/* ------------------------------------------------------------------ */

describe("OptionsPanel — which value is better", () => {
  function twoDifferentSchemes(): DesignOption[] {
    return [
      {
        id: "opt-research",
        label: "Research bar",
        seed: 20,
        state: "ready",
        result: researchScheme,
      },
      {
        id: "opt-courtyard",
        label: "Courtyard block",
        seed: 22,
        state: "ready",
        result: courtyardScheme,
      },
    ];
  }

  function schemesDifferingOnCriticals(): DesignOption[] {
    return [
      {
        id: "opt-research",
        label: "Research bar",
        seed: 20,
        state: "ready",
        result: researchScheme,
      },
      {
        id: "opt-severed",
        label: "Severed L",
        seed: 20,
        state: "ready",
        result: severedScheme,
      },
    ];
  }

  it("the fixtures really do disagree on every directional row", () => {
    // Guards the tests below: if the generator ever produces a tie here, the
    // marking assertions would pass vacuously.
    expect(researchScheme.metrics.netAreaSqm).toBeGreaterThan(
      courtyardScheme.metrics.netAreaSqm,
    );
    expect(researchScheme.metrics.circulationRatio).toBeLessThan(
      courtyardScheme.metrics.circulationRatio,
    );
    expect(researchScheme.metrics.coreRatio).toBeGreaterThan(
      courtyardScheme.metrics.coreRatio,
    );

    // The critical row is NOT a contest between these two any more, and that is
    // an engine repair rather than a weakened test. The courtyard fixture used
    // to report 12 × SPACE_NOT_ACCESSIBLE: on a void-cut plate the thin solid
    // cell adjoining the core took no rooms, was dropped as "unserved", and
    // severed the door graph to both wings. `retainedCirculation` in
    // `generate/space-plan.ts` now reinstates a dropped cell that something
    // still needs to reach the core, so the courtyard block is a valid building
    // — and the price of those reinstated walk-throughs is the circulation
    // ratio asserted above (11.6% → 35.9%, an advisory, not a violation).
    // Both fixtures are therefore critical-free, and the critical row gets its
    // own pair below.
    expect(researchScheme.validation.counts.critical).toBe(0);
    expect(courtyardScheme.validation.counts.critical).toBe(0);
  });

  it("marks more net area, less circulation and less core", () => {
    renderPanel(twoDifferentSchemes());

    // Bigger net area wins.
    expect(markedLabels("Net area")).toEqual(["Research bar"]);
    // Less circulation wins.
    expect(markedLabels("Circulation")).toEqual(["Research bar"]);
    // Less core wins — and here the OTHER column is better, so the marker is
    // genuinely per-row rather than a whole-column "winner".
    expect(markedLabels("Core")).toEqual(["Courtyard block"]);
  });

  it("marks the option with fewer critical issues", () => {
    // The L-plate fixture is a genuinely invalid generation: its wings still
    // have no route to the core, because `retainedCirculation` repairs plates
    // cut by voids and not concave plates. That gap is real and registered in
    // docs/work-plan/handoffs/2026-08-17-schematic-pivot.md; when it is closed
    // this fixture stops being critical-bearing and this test fails loudly,
    // which is the intended signal to pick a new one.
    expect(severedScheme.validation.counts.critical).toBeGreaterThan(0);
    expect(researchScheme.validation.counts.critical).toBe(0);

    renderPanel(schemesDifferingOnCriticals());
    expect(markedLabels("Critical issues")).toEqual(["Research bar"]);
  });

  it("never marks a row that has no better direction, even when the values differ", () => {
    renderPanel(twoDifferentSchemes());

    // These three genuinely differ between the two designs...
    expect(researchScheme.metrics.grossAreaSqm).not.toBe(
      courtyardScheme.metrics.grossAreaSqm,
    );
    expect(researchScheme.metrics.windowToWallRatio).not.toBe(
      courtyardScheme.metrics.windowToWallRatio,
    );
    expect(researchScheme.metrics.roomCount).not.toBe(courtyardScheme.metrics.roomCount);

    // ...and none of them is a contest. More floors is not "better".
    expect(markedLabels("Floors")).toEqual([]);
    expect(markedLabels("Gross area")).toEqual([]);
    expect(markedLabels("Window-to-wall")).toEqual([]);
    expect(markedLabels("Spaces")).toEqual([]);
  });

  it("marks nothing when every ready option ties on a row", () => {
    // Deliberate tie: both ready options are the SAME build, so every row is a
    // dead heat. A tie has no winner worth pointing at.
    const tied: DesignOption[] = [
      { id: "opt-a", label: "Scheme A", seed: 4242, state: "ready", result: schemeA },
      { id: "opt-a2", label: "Scheme A prime", seed: 4242, state: "ready", result: schemeA },
      { id: "opt-c", label: "Scheme C", seed: 1234, state: "running" },
    ];
    renderPanel(tied);

    for (const rowLabel of [
      "Floors",
      "Gross area",
      "Net area",
      "Circulation",
      "Core",
      "Window-to-wall",
      "Spaces",
      "Critical issues",
    ]) {
      expect(markedLabels(rowLabel)).toEqual([]);
    }
  });

  it("marks nothing when there is only one ready option to compare", () => {
    renderPanel([
      { id: "opt-a", label: "Scheme A", seed: 4242, state: "ready", result: schemeA },
      { id: "opt-c", label: "Scheme C", seed: 1234, state: "running" },
    ]);

    expect(markedLabels("Net area")).toEqual([]);
    expect(markedLabels("Circulation")).toEqual([]);
    expect(markedLabels("Core")).toEqual([]);
    expect(markedLabels("Critical issues")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The caveat                                                          */
/* ------------------------------------------------------------------ */

describe("OptionsPanel — what adopting costs you", () => {
  it("warns that options are built from the original brief and drop later edits", () => {
    renderPanel(threeOptions());

    const note = screen.getByText(/do not carry later edits/i);
    expect(note.textContent).toMatch(/original brief/i);
    expect(note.textContent).toMatch(/new branch alongside the design you have/i);
  });
});
