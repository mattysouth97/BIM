/* @vitest-environment happy-dom */
//
// The measured fidelity report, on screen.
//
// This panel exists to make the §55 proof step visible, and its whole value is
// that it does not flatter the engine. The tests below therefore pin the
// honesty rules, not the layout:
//
//   - NO aggregate score. The metric refuses to compute one; the UI must not
//     invent one either, so the rendered text is searched for the language a
//     blended number would arrive in.
//   - null prints as "not measurable", never as 0.0%.
//   - `measured: false` anchors and `NotMeasured` entries are SHOWN with their
//     reasons.
//   - the zone-position engine gap is visible AND labelled as an engine gap,
//     because a 0% overlap that reads as the user's mistake is a lie by omission.
//
// The fixture is a real `runBlueprintGeneration` run: every number asserted
// below was produced by the real metric over the real generated building, so a
// regression in either shows up here.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";

import {
  addAnchor,
  addBoundary,
  addCore,
  addVoid,
  addZone,
  emptyBlueprint,
  makeRectLoop,
  preservationPlan,
  validateBlueprint,
  type BlueprintFidelityReport,
  type BlueprintSpec,
} from "@/lib/generative/blueprint";
import type { BimModelSnapshot } from "@/lib/bim/model/types";
import type { BuildingSpec } from "@/lib/generative/spec/building-spec";
import { runBlueprintGeneration } from "@/lib/generative/server/generate-from-blueprint";

import {
  FidelityReport,
  NOT_MEASURABLE,
  bandForDeviation,
  bandForOverlap,
  bandForRetention,
  formatHold,
  formatMetres,
  formatRatioPercent,
  formatSqm,
  groupNotMeasurable,
} from "../fidelity-report";
import { PlanOverlay } from "../plan-overlay";
import { SchematicInspector } from "../schematic-inspector";

const SEED = 20260817;

/**
 * 40 × 28 m plate over three levels with a courtyard, two cores (only the first
 * of which the engine compiles), an entrance anchor, and two zones wired with a
 * satisfied, a violated and a not-measurable relationship. Chosen to reach
 * every branch of the panel with real numbers rather than invented ones.
 */
function fixtureBlueprint(): BlueprintSpec {
  let spec = emptyBlueprint("Fidelity report fixture");
  spec = addBoundary(spec, {
    loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 40_000, depthMm: 28_000 }),
    floorNos: [1, 2, 3],
  });
  spec = addVoid(spec, {
    id: "court",
    kind: "courtyard",
    region: {
      kind: "loop",
      loop: makeRectLoop("court-loop", {
        xMm: 16_000,
        zMm: 11_000,
        widthMm: 8_000,
        depthMm: 6_000,
      }),
    },
    floorNos: [1, 2, 3],
  });
  spec = addCore(spec, {
    id: "core-main",
    region: {
      kind: "loop",
      loop: makeRectLoop("core-loop", {
        xMm: 4_000,
        zMm: 10_000,
        widthMm: 8_000,
        depthMm: 8_000,
      }),
    },
    floorNos: [1, 2, 3],
    contents: ["stair", "elevator"],
  });
  spec = addAnchor(spec, {
    id: "entrance-1",
    kind: "entrance",
    positionMm: { xMm: 20_000, zMm: 0 },
    floorNos: [1],
  });
  spec = addZone(spec, {
    id: "zone-meeting",
    program: "meeting",
    region: {
      kind: "loop",
      loop: makeRectLoop("zone-meeting-loop", {
        xMm: 28_000,
        zMm: 4_000,
        widthMm: 10_000,
        depthMm: 8_000,
      }),
    },
    floorNos: [2],
  });
  spec = addZone(spec, {
    id: "zone-lobby",
    program: "lobby",
    region: {
      kind: "loop",
      loop: makeRectLoop("zone-lobby-loop", {
        xMm: 2_000,
        zMm: 20_000,
        widthMm: 10_000,
        depthMm: 6_000,
      }),
    },
    floorNos: [2],
  });
  spec = addCore(spec, {
    id: "core-second",
    region: {
      kind: "loop",
      loop: makeRectLoop("core-second-loop", {
        xMm: 30_000,
        zMm: 18_000,
        widthMm: 6_000,
        depthMm: 6_000,
      }),
    },
    floorNos: [1, 2, 3],
    contents: ["stair"],
  });
  return {
    ...spec,
    relationships: [
      {
        id: "rel-1",
        kind: "REQUIRES_ADJACENCY",
        fromId: "zone-meeting",
        toId: "zone-lobby",
        weight: 1,
      },
      {
        id: "rel-3",
        kind: "AVOID_ADJACENCY",
        fromId: "zone-meeting",
        toId: "zone-lobby",
        weight: 1,
      },
      {
        id: "rel-2",
        kind: "FACES",
        fromId: "zone-meeting",
        toId: "core-main",
        weight: 0.5,
      },
    ],
  };
}

let report: BlueprintFidelityReport;
let buildingSpec: BuildingSpec;
let snapshot: BimModelSnapshot;
let blueprint: BlueprintSpec;

beforeAll(() => {
  const outcome = runBlueprintGeneration({ blueprint: fixtureBlueprint(), seed: SEED });
  if (!outcome.ok) throw new Error("fixture generation failed");
  report = outcome.payload.fidelity;
  buildingSpec = outcome.payload.spec;
  snapshot = outcome.payload.snapshot;
  blueprint = outcome.payload.blueprint;
});

afterEach(cleanup);

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

describe("formatting", () => {
  it("prints an absent ratio as words, never as zero", () => {
    expect(formatRatioPercent(null)).toBe(NOT_MEASURABLE);
    expect(formatRatioPercent(null)).not.toContain("0");
    // Non-finite could only arrive from a division the metric guards, but a
    // "NaN%" in a report is worse than saying nothing.
    expect(formatRatioPercent(Number.NaN)).toBe(NOT_MEASURABLE);
    expect(formatRatioPercent(Number.POSITIVE_INFINITY)).toBe(NOT_MEASURABLE);
  });

  it("prints a measured zero as zero — it is a result, not an absence", () => {
    expect(formatRatioPercent(0)).toBe("0.0%");
    expect(formatMetres(0)).toBe("0.000 m");
  });

  it("scales ratios to percent and metres to the millimetre", () => {
    expect(formatRatioPercent(0.1234)).toBe("12.3%");
    expect(formatRatioPercent(1)).toBe("100.0%");
    expect(formatRatioPercent(0.005, 2)).toBe("0.50%");
    expect(formatMetres(25.96151)).toBe("25.962 m");
    expect(formatMetres(null)).toBe(NOT_MEASURABLE);
    expect(formatSqm(1072)).toBe("1,072 m²");
    expect(formatSqm(null)).toBe(NOT_MEASURABLE);
  });

  it("keeps a soft hold's tolerance visible — it is what makes a move obedient", () => {
    expect(formatHold({ mode: "hard" })).toBe("hard");
    expect(formatHold({ mode: "soft", toleranceMm: 500 })).toBe("soft ±0.500 m");
    expect(formatHold({ mode: "soft", toleranceMm: 0 })).toBe("soft ±0.000 m");
  });

  it("bands never claim knowledge about a null", () => {
    expect(bandForDeviation(null)).toBe("unknown");
    expect(bandForRetention(null)).toBe("unknown");
    expect(bandForOverlap(null)).toBe("unknown");
  });

  it("bands step in the direction each metric improves", () => {
    // Deviation: lower is better.
    expect(bandForDeviation(0)).toBe("good");
    expect(bandForDeviation(0.019)).toBe("good");
    expect(bandForDeviation(0.02)).toBe("fair");
    expect(bandForDeviation(0.5)).toBe("poor");
    // Retention: higher is better, flagged below the brief's 0.98.
    expect(bandForRetention(1)).toBe("good");
    expect(bandForRetention(0.98)).toBe("good");
    expect(bandForRetention(0.9799)).toBe("fair");
    expect(bandForRetention(0)).toBe("poor");
    // Overlap: higher is better.
    expect(bandForOverlap(0.95)).toBe("good");
    expect(bandForOverlap(0.5)).toBe("fair");
    expect(bandForOverlap(0)).toBe("poor");
  });
});

describe("groupNotMeasurable", () => {
  it("collapses identical (kind, reason) pairs and counts them, in report order", () => {
    const grouped = groupNotMeasurable([
      { relationshipId: "a", kind: "FACES", fromId: "x", toId: "y", weight: 1, outcome: "not-measurable", reason: "no orientation" },
      { relationshipId: "b", kind: "REQUIRES_ADJACENCY", fromId: "x", toId: "y", weight: 1, outcome: "satisfied" },
      { relationshipId: "c", kind: "FACES", fromId: "p", toId: "q", weight: 1, outcome: "not-measurable", reason: "no orientation" },
      { relationshipId: "d", kind: "INSIDE", fromId: "p", toId: "q", weight: 1, outcome: "not-measurable", reason: "no containment" },
    ]);
    expect(grouped).toEqual([
      { kind: "FACES", reason: "no orientation", count: 2 },
      { kind: "INSIDE", reason: "no containment", count: 1 },
    ]);
  });

  it("keeps two reasons for one kind apart rather than merging them", () => {
    const grouped = groupNotMeasurable([
      { relationshipId: "a", kind: "FACES", fromId: "x", toId: "y", weight: 1, outcome: "not-measurable", reason: "reason one" },
      { relationshipId: "b", kind: "FACES", fromId: "x", toId: "z", weight: 1, outcome: "not-measurable", reason: "reason two" },
    ]);
    expect(grouped).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

describe("<FidelityReport />", () => {
  it("shows no aggregate score of any kind", () => {
    const { container } = render(<FidelityReport report={report} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/fidelity score|overall score|total score|overall fidelity/i);
    expect(text).toContain("no combined score");
  });

  it("reports the boundary per level and as worst/mean, with real numbers", () => {
    render(<FidelityReport report={report} />);
    // The custom-plate path copies the drawn outline, so this build is exact.
    expect(report.boundary.worstSymmetricDifferenceRatio).toBe(0);
    expect(screen.getAllByText("0.0%").length).toBeGreaterThan(0);
    // One row per measured level: the drawn plate and the built one, both real.
    expect(screen.getAllByText(/1,072 m² → 1,072 m²/)).toHaveLength(3);
    expect(screen.getAllByText(/^L[123]$/)).toHaveLength(3);
  });

  it("says 'not measurable' rather than 0% when nothing was comparable", () => {
    const nothingComparable: BlueprintFidelityReport = {
      ...report,
      measuredFloorNos: [],
      boundary: {
        levels: [],
        blueprintOnlyFloorNos: [1, 2, 3],
        generatedOnlyFloorNos: [],
        meanAreaDeviationRatio: null,
        worstAreaDeviationRatio: null,
        meanSymmetricDifferenceRatio: null,
        worstSymmetricDifferenceRatio: null,
      },
    };
    const { container } = render(<FidelityReport report={nothingComparable} />);
    expect(screen.getAllByText(NOT_MEASURABLE).length).toBeGreaterThanOrEqual(4);
    expect(container.textContent).toContain("no level was comparable");
    expect(container.textContent).toContain("Drawn but not built: level(s) 1, 2, 3");
  });

  it("reports each void's retained ratio per floor", () => {
    render(<FidelityReport report={report} />);
    expect(report.voids).toHaveLength(3);
    expect(screen.getAllByText("100.0% kept")).toHaveLength(3);
  });

  it("names the core the engine dropped instead of implying it moved", () => {
    const { container } = render(<FidelityReport report={report} />);
    expect(report.cores.some((core) => !core.compiled)).toBe(true);
    expect(screen.getByText(/25\.962 m/)).toBeTruthy();
    expect(container.textContent).toContain("not compiled");
    expect(container.textContent).toContain("Only the first drawn core reaches the engine");
  });

  it("lists an unmeasurable anchor with its reason, not as a zero displacement", () => {
    const { container } = render(<FidelityReport report={report} />);
    const anchor = report.anchors[0];
    expect(anchor.measured).toBe(false);
    if (anchor.measured) return;
    expect(container.textContent).toContain(anchor.reason);
    expect(container.textContent).toContain(NOT_MEASURABLE);
  });

  it("makes the zone-position engine gap visible AND attributes it to the engine", () => {
    const { container } = render(<FidelityReport report={report} />);
    const lobby = report.zones.find((zone) => zone.zoneId === "zone-lobby");
    expect(lobby?.overlapRatio).toBe(0);
    expect(screen.getByText("0.0% overlap")).toBeTruthy();
    expect(screen.getByText("66.9% overlap")).toBeTruthy();
    expect(container.textContent).toContain("discards the region you drew");
    expect(container.textContent).toContain("engine gap");
  });

  it("counts topology outcomes and names the violated relationships", () => {
    const { container } = render(<FidelityReport report={report} />);
    expect(screen.getByText("1 satisfied")).toBeTruthy();
    expect(screen.getByText("1 violated")).toBeTruthy();
    expect(container.textContent).toContain("1 not measurable");
    expect(container.textContent).toContain("satisfied of measurable: 50.0%");
    expect(screen.getByText("AVOID_ADJACENCY: zone-meeting → zone-lobby")).toBeTruthy();
    // The not-measurable ones keep their reason instead of vanishing.
    expect(container.textContent).toContain("FACES ×1");
    expect(container.textContent).toContain("no view or orientation per space");
  });

  it("lists NotMeasured entries with their reasons when the report carries any", () => {
    // The fixture generates none; appending one is the only way to reach the
    // branch without a blueprint contrived purely to break the metric.
    const withGaps: BlueprintFidelityReport = {
      ...report,
      notMeasured: [
        { subject: "zone", id: "zone-57", reason: "Only 56 zones reach the spec." },
      ],
    };
    const { container } = render(<FidelityReport report={withGaps} />);
    expect(container.textContent).toContain("zone zone-57 — Only 56 zones reach the spec.");
    expect(container.textContent).toContain("Listed, not hidden");
  });

  it("omits the Not measured section entirely when nothing was skipped", () => {
    expect(report.notMeasured).toHaveLength(0);
    const { container } = render(<FidelityReport report={report} />);
    expect(container.textContent).not.toContain("Listed, not hidden");
  });

  it("takes focus when the plan view's badge asks for it, and not before", () => {
    const { rerender } = render(<FidelityReport report={report} focusToken={0} />);
    const heading = screen.getByRole("heading", { name: "Measured fidelity" });
    expect(document.activeElement).not.toBe(heading);

    rerender(<FidelityReport report={report} focusToken={1} />);
    expect(document.activeElement).toBe(heading);
  });

  it("focuses on the FIRST render too — the badge lives in another viewport", () => {
    // Clicking the badge unmounts the plan and mounts this panel, so the
    // request arrives as an initial render rather than as a change.
    render(<FidelityReport report={report} focusToken={3} />);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Measured fidelity" }),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Plan overlay badge                                                  */
/* ------------------------------------------------------------------ */

describe("<PlanOverlay /> fidelity badge", () => {
  it("shows the worst boundary difference, named as what it is", () => {
    render(
      <PlanOverlay
        spec={buildingSpec}
        snapshot={snapshot}
        blueprint={blueprint}
        fidelity={report}
        onFocusFidelity={() => {}}
      />,
    );
    const badge = screen.getByRole("button", { name: "plate diff 0.0%" });
    expect(badge.getAttribute("title")).toContain("Worst boundary outline difference");
  });

  it("opens the report when clicked", () => {
    const onFocusFidelity = vi.fn();
    render(
      <PlanOverlay
        spec={buildingSpec}
        snapshot={snapshot}
        blueprint={blueprint}
        fidelity={report}
        onFocusFidelity={onFocusFidelity}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "plate diff 0.0%" }));
    expect(onFocusFidelity).toHaveBeenCalledTimes(1);
  });

  it("is text rather than a dead button when there is nothing to open", () => {
    render(
      <PlanOverlay
        spec={buildingSpec}
        snapshot={snapshot}
        blueprint={blueprint}
        fidelity={report}
      />,
    );
    expect(screen.queryByRole("button", { name: "plate diff 0.0%" })).toBeNull();
    expect(screen.getByText("plate diff 0.0%")).toBeTruthy();
  });

  it("shows no badge at all when no report is bound to this design", () => {
    render(<PlanOverlay spec={buildingSpec} snapshot={snapshot} blueprint={blueprint} />);
    expect(screen.queryByText(/plate diff/)).toBeNull();
  });

  it("says the boundary was not measurable rather than printing 0%", () => {
    const unmeasured: BlueprintFidelityReport = {
      ...report,
      boundary: { ...report.boundary, worstSymmetricDifferenceRatio: null },
    };
    render(
      <PlanOverlay
        spec={buildingSpec}
        snapshot={snapshot}
        blueprint={blueprint}
        fidelity={unmeasured}
        onFocusFidelity={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: `plate diff ${NOT_MEASURABLE}` })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Inspector binding                                                   */
/* ------------------------------------------------------------------ */

describe("<SchematicInspector /> fidelity section", () => {
  const inspector = (fidelity: BlueprintFidelityReport | null) => {
    const spec = emptyBlueprint("binding");
    return (
      <SchematicInspector
        blueprint={spec}
        validation={validateBlueprint(spec)}
        preservation={preservationPlan(spec)}
        onFidelityChange={() => {}}
        onSelect={() => {}}
        fidelity={fidelity}
      />
    );
  };

  it("shows the report when one is bound to the design on screen", () => {
    render(inspector(report));
    expect(screen.getByRole("heading", { name: "Measured fidelity" })).toBeTruthy();
  });

  it("shows nothing at all when the design is not the one that was measured", () => {
    const { container } = render(inspector(null));
    expect(screen.queryByRole("heading", { name: "Measured fidelity" })).toBeNull();
    // Not an empty placeholder either — an absent measurement makes no claim.
    expect(container.textContent).not.toContain(NOT_MEASURABLE);
  });
});
