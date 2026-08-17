/* @vitest-environment happy-dom */
//
// The review gate (brief §55): nothing about the model changes until the user
// has seen what changed. These tests drive the real edit loop offline — provider
// patch → applySpecPatch (with locks) → rebuild → diffSpecs/diffMetrics — so the
// PendingChange handed to the panel is the same shape the route returns, and the
// numbers on screen are measured off two genuine builds rather than invented.

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import { DiffPreview, RejectionNotice } from "../diff-preview";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { buildDesign, generationIdFor } from "@/lib/generative/build";
import { applySpecPatch } from "@/lib/generative/patch/apply";
import { diffMetrics, diffSpecs } from "@/lib/generative/patch/diff";
import { systemLock, type LockToken } from "@/lib/generative/session/locks";
import type { AppliedEdit, RejectedEdit } from "@/lib/generative/client";
import type { BuildingPatch } from "@/lib/generative/spec/building-spec";
import type { DesignState, PendingChange } from "@/store/generative-session-store";

/** U+2192, the arrow the panel puts between a before and an after. */
const TO = "→";

const PROVIDER_SUMMARY = {
  name: "heuristic",
  model: "deterministic",
  latencyMs: 1,
  inputTokens: 0,
  outputTokens: 0,
  retries: 0,
};

const provider = new HeuristicReasoningProvider();

async function makeDesign(
  prompt = "Create a five-story office building, approximately 6,000 m2, with a central core.",
): Promise<DesignState> {
  const { data: spec } = await provider.generateBuilding({ prompt, seed: 4242 });
  const built = buildDesign({ spec, buildingPk: "generated", generationId: "GEN-0001" });
  return {
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
    provider: PROVIDER_SUMMARY,
  };
}

/** What the command bar asks for: a patch grounded in the built model's digest. */
async function propose(
  design: DesignState,
  instruction: string,
): Promise<BuildingPatch> {
  const built = buildDesign({
    spec: design.spec,
    buildingPk: "generated",
    generationId: design.generationId,
  });
  const { data } = await provider.modifyBuilding({
    spec: design.spec,
    summary: built.summary,
    instruction,
    scope: { kind: "building", label: "Whole building" },
    locked: [],
  });
  return data;
}

/**
 * The server's `completeEdit`, inlined: apply, rebuild, then measure the diff
 * off the two builds. Throws if the patch was wholly rejected — that outcome is
 * `RejectedEdit`, which is the other component's job.
 */
function applyAndBuild(
  before: DesignState,
  patch: BuildingPatch,
  locks: LockToken[] = [],
): AppliedEdit {
  const application = applySpecPatch({ spec: before.spec, patch, locks });
  if (!application.ok) throw new Error("patch was rejected: expected an applied edit");

  const revision = before.revision + 1;
  const generationId = generationIdFor(application.spec.generationSeed, revision);
  const next = buildDesign({
    spec: application.spec,
    buildingPk: "generated",
    generationId,
    locks,
  });

  return {
    kind: "applied",
    success: true,
    generationId,
    revision,
    patch,
    applied: application.applied,
    rejected: application.rejected.map((r) => ({
      path: r.op.path,
      reason: r.reason,
      kind: r.kind,
    })),
    diff: diffSpecs(before.spec, application.spec),
    metricDeltas: diffMetrics(before.metrics, next.metrics),
    spec: application.spec,
    recipe: next.recipe,
    snapshot: next.snapshot,
    metrics: next.metrics,
    validation: next.validation,
    status: next.status,
    approximations: next.approximations,
    provider: PROVIDER_SUMMARY,
  };
}

function pendingOf(edit: AppliedEdit): PendingChange {
  return { edit, kind: "modify", baseNodeId: "gen-1" };
}

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/* ------------------------------------------------------------------ */

const norm = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

/** Scope queries to the section a heading introduces. */
function sectionFor(name: RegExp | string) {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");
  if (!section) throw new Error(`no <section> around heading ${String(name)}`);
  return within(section);
}

/** The rendered "before → after (±delta)" for one metric row. */
function metricRow(label: string): string {
  const term = sectionFor("Measured effect").getByText(label);
  return norm(term.nextElementSibling?.textContent ?? null);
}

/* ------------------------------------------------------------------ */
/* Fixtures — built once, from the real loop                           */
/* ------------------------------------------------------------------ */

let base: DesignState;
/** "add a floor", nothing locked: the whole patch lands. */
let addFloor: AppliedEdit;
/** The same instruction with the partition system locked (§42). */
let addFloorLocked: AppliedEdit;
/** A patch that is half blocked by a lock and half a bad path. */
let mixedRejections: AppliedEdit;
/** The offline provider's honest no-op: applies cleanly, changes nothing. */
let noop: AppliedEdit;
/** Twelve storeys raised 300 mm each — eleven spec rows, past the collapse. */
let tallBuilding: DesignState;
let tallerFloors: AppliedEdit;

beforeAll(async () => {
  base = await makeDesign();
  addFloor = applyAndBuild(base, await propose(base, "add a floor"));
  addFloorLocked = applyAndBuild(base, await propose(base, "add a floor"), [
    systemLock("partitions"),
  ]);
  noop = applyAndBuild(base, await propose(base, "make the lobby feel more welcoming"));

  mixedRejections = applyAndBuild(
    base,
    {
      summary: "Widen the grid and shift the core",
      rationale: "Larger bays, and the core moved east to clear the lobby.",
      scope: "building",
      affectedFloorNos: [],
      operations: [
        { op: "set", path: "/core/offsetXMm", value: base.spec.core.offsetXMm + 2_000 },
        {
          op: "set",
          path: "/structure/gridXMm/value",
          value: base.spec.structure.gridXMm.value + 1_200,
        },
        { op: "set", path: "/levels/99/floorToFloorMm", value: 4_000 },
      ],
    },
    [systemLock("structure")],
  );

  tallBuilding = await makeDesign("Create a twelve-story office building of about 14,000 m2.");
  tallerFloors = applyAndBuild(tallBuilding, await propose(tallBuilding, "taller floors"));
});

afterEach(() => {
  cleanup();
});

function renderPreview(
  edit: AppliedEdit,
  before: DesignState = base,
  handlers: { onAccept?: () => void; onDiscard?: () => void } = {},
) {
  return render(
    <DiffPreview
      pending={pendingOf(edit)}
      before={before}
      onAccept={handlers.onAccept ?? (() => {})}
      onDiscard={handlers.onDiscard ?? (() => {})}
    />,
  );
}

/* ------------------------------------------------------------------ */

describe("DiffPreview — what the change was", () => {
  it("states the patch's summary and its rationale", () => {
    renderPreview(addFloor);

    expect(screen.getByRole("heading", { name: "Add one floor" })).toBeTruthy();
    // The rationale is the provider's own justification, shown verbatim so the
    // reviewer can tell what the change was *meant* to do.
    expect(screen.getByText(addFloor.patch.rationale)).toBeTruthy();
    expect(addFloor.patch.rationale).toMatch(/program item/i);
  });

  it("names the design the candidate was built as", () => {
    renderPreview(addFloor);
    expect(screen.getByText(addFloor.generationId)).toBeTruthy();
    expect(addFloor.generationId).toMatch(/^GEN-\d{4}\.1$/);
  });
});

describe("DiffPreview — measured effect", () => {
  it("reports every significant metric as before " + TO + " after with a signed delta", () => {
    renderPreview(addFloor);

    // Counts and lengths, formatted the way the panel formats them.
    expect(metricRow("Floors")).toBe(`5 ${TO} 6 (+1)`);
    expect(metricRow("Height")).toBe(`20.4 m ${TO} 24.3 m (+3.9 m)`);
    // A storey the instruction asked for; columns it never mentioned.
    expect(metricRow("Columns")).toBe(`135 ${TO} 162 (+27)`);
  });

  it("leaves out movements too small to be worth reading", () => {
    // Circulation moved 0.1347 → 0.1343 in the rebuild: real, but noise. It is
    // marked insignificant by diffMetrics and must not compete for attention
    // with the storey that was actually added.
    const circulation = addFloor.metricDeltas.find((d) => d.key === "circulationRatio");
    expect(circulation?.significant).toBe(false);

    renderPreview(addFloor);
    expect(sectionFor("Measured effect").queryByText("Circulation")).toBeNull();
    expect(sectionFor("Measured effect").getByText("Floors")).toBeTruthy();
  });

  it("shows a consequence the instruction never mentioned", () => {
    // "Add a floor" with partitions locked: the level lands, the program that
    // would have filled it does not. The panel still has to report the 104 extra
    // windows and 27 extra columns that came with the empty storey.
    renderPreview(addFloorLocked);

    expect(metricRow("Windows")).toBe(`520 ${TO} 624 (+104)`);
    expect(metricRow("Columns")).toBe(`135 ${TO} 162 (+27)`);
  });
});

describe("DiffPreview — validation movement", () => {
  it("reports the severity counts that moved", () => {
    // The lock ate the program half of the patch, so the new storey is empty and
    // the rebuild raises UNPROGRAMMED_LEVEL. That is exactly the consequence the
    // review exists to surface, before it is accepted.
    expect(addFloorLocked.validation.counts.warning).toBe(1);
    expect(base.validation.counts.warning).toBe(0);

    renderPreview(addFloorLocked);
    const validation = sectionFor("Validation");

    expect(norm(validation.getByText(/^warning:/).textContent)).toBe(`warning: 0 ${TO} 1`);
    // Severities that did not move are not listed as if they had.
    expect(validation.queryByText(/^critical:/)).toBeNull();
    expect(validation.queryByText(/^advisory:/)).toBeNull();
  });

  it("says so explicitly when nothing moved, rather than showing an empty section", () => {
    renderPreview(addFloor);
    const validation = sectionFor("Validation");

    expect(norm(validation.getByText(/Validation unchanged/).textContent)).toBe(
      "Validation unchanged — 0 critical · 0 warning · 0 advisory.",
    );
  });
});

describe("DiffPreview — accept and discard", () => {
  it("Apply change calls onAccept", () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    renderPreview(addFloor, base, { onAccept, onDiscard });

    fireEvent.click(screen.getByRole("button", { name: "Apply change" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("Discard calls onDiscard", () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    renderPreview(addFloor, base, { onAccept, onDiscard });

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("refuses to accept a patch that applied cleanly but changed nothing", () => {
    // The offline provider's honest fallback: it re-sets the generation seed to
    // the value it already had. Every operation applies; the building does not
    // move. Accepting that would spend a history entry on nothing.
    expect(noop.diff).toEqual([]);
    expect(noop.metricDeltas).toEqual([]);

    const onAccept = vi.fn();
    renderPreview(noop, base, { onAccept });

    expect(screen.getByText(/nothing about the building changed/i)).toBeTruthy();

    const apply = screen.getByRole("button", { name: "Apply change" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onAccept).not.toHaveBeenCalled();

    // Discarding a no-op is still allowed — that is how the panel is dismissed.
    expect((screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("offers to accept a change that did land", () => {
    renderPreview(addFloor);
    expect(
      (screen.getByRole("button", { name: "Apply change" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.queryByText(/nothing about the building changed/i)).toBeNull();
  });
});

describe("DiffPreview — rejected operations", () => {
  it("keeps a lock the user set apart from an operation that could not be applied", () => {
    // Same patch, two very different failures: the user forbade the grid change,
    // whereas /levels/99 was a bad proposal. Reporting them together would tell
    // the user their instruction was malformed when they themselves blocked it.
    expect(mixedRejections.rejected.map((r) => r.kind).sort()).toEqual(["locked", "path"]);

    renderPreview(mixedRejections);

    const locked = sectionFor(/Blocked by locks \(1\)/);
    expect(locked.getByText("/structure/gridXMm/value")).toBeTruthy();
    expect(locked.getByText(/Structure is locked/)).toBeTruthy();
    expect(locked.queryByText("/levels/99/floorToFloorMm")).toBeNull();

    const failed = sectionFor(/Could not be applied \(1\)/);
    expect(failed.getByText("/levels/99/floorToFloorMm")).toBeTruthy();
    expect(failed.getByText(/out of range/)).toBeTruthy();
    expect(failed.queryByText("/structure/gridXMm/value")).toBeNull();
  });

  it("counts every lock that blocked an operation, not just the ones it lists", () => {
    // Seven program operations were blocked. The panel lists the first six, so
    // the heading's count is the only place the seventh is admitted to — a lock
    // that quietly ate part of a patch would be worse than no lock at all.
    expect(addFloorLocked.rejected).toHaveLength(7);

    renderPreview(addFloorLocked);
    const locked = sectionFor(/Blocked by locks \(7\)/);
    expect(locked.getAllByText(/Partitions is locked/)).toHaveLength(6);
    expect(locked.getByText("/program/2/levels/-")).toBeTruthy();
  });

  it("shows no rejection headings when the whole patch landed", () => {
    expect(addFloor.rejected).toEqual([]);

    renderPreview(addFloor);
    expect(screen.queryByRole("heading", { name: /Blocked by locks/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Could not be applied/ })).toBeNull();
  });
});

describe("DiffPreview — the specification list", () => {
  it("collapses a long list behind a control that expands it", () => {
    // Twelve storeys raised 300 mm apiece: twelve spec rows, four past the cut.
    expect(tallerFloors.diff).toHaveLength(12);

    renderPreview(tallerFloors, tallBuilding);
    const spec = sectionFor(/Specification \(12 changes\)/);

    expect(spec.getAllByRole("listitem")).toHaveLength(8);
    expect(spec.queryByText("Levels · L12 · Floor to floor")).toBeNull();

    fireEvent.click(spec.getByRole("button", { name: "Show 4 more" }));

    expect(spec.getAllByRole("listitem")).toHaveLength(12);
    expect(spec.getByText("Levels · L12 · Floor to floor")).toBeTruthy();
    expect(spec.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("shows a short list whole, with no control to expand", () => {
    // Exactly one row: the appended level. Everything else the lock stopped.
    expect(addFloorLocked.diff).toHaveLength(1);

    renderPreview(addFloorLocked);
    const spec = sectionFor(/Specification \(1 change\)/);

    expect(spec.getAllByRole("listitem")).toHaveLength(1);
    expect(spec.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
  });

  it("reads each row as a value that moved", () => {
    renderPreview(tallerFloors, tallBuilding);
    const spec = sectionFor(/Specification \(12 changes\)/);

    // The row names the value in a readable trail and then shows both sides of
    // it, so a reviewer can tell WHICH storey moved and by how much.
    const label = spec.getByText("Levels · L01 · Floor to floor");
    expect(norm(label.nextElementSibling?.textContent ?? null)).toBe(
      `4.80 m ${TO} 5.10 m`,
    );
  });
});

/* ------------------------------------------------------------------ */

describe("RejectionNotice", () => {
  /** A patch where nothing at all could land — the other half of the loop. */
  function fullyRejected(): RejectedEdit {
    const patch: BuildingPatch = {
      summary: "Widen the structural grid",
      rationale: "A larger bay for column-free space.",
      scope: "structure",
      affectedFloorNos: [],
      operations: [
        {
          op: "set",
          path: "/structure/gridXMm/value",
          value: base.spec.structure.gridXMm.value + 1_200,
        },
        { op: "set", path: "/levels/99/floorToFloorMm", value: 4_000 },
      ],
    };
    const application = applySpecPatch({
      spec: base.spec,
      patch,
      locks: [systemLock("structure")],
    });
    expect(application.ok).toBe(false);

    return {
      kind: "rejected",
      success: false,
      patch,
      rejected: application.rejected.map((r) => ({
        path: r.op.path,
        reason: r.reason,
        kind: r.kind,
      })),
      error: application.error!,
      provider: PROVIDER_SUMMARY,
    };
  }

  it("says nothing changed, and why", () => {
    const rejected = fullyRejected();
    render(<RejectionNotice rejected={rejected} onDismiss={() => {}} />);

    expect(screen.getByRole("heading", { name: "Nothing was changed" })).toBeTruthy();
    expect(screen.getByText(rejected.error.message)).toBeTruthy();
    expect(rejected.error.message).toMatch(/could be applied/i);
  });

  it("still shows what was proposed, so the instruction is not lost", () => {
    render(<RejectionNotice rejected={fullyRejected()} onDismiss={() => {}} />);

    const proposed = screen.getByText(/^Proposed:/).closest("p");
    expect(norm(proposed?.textContent ?? null)).toBe("Proposed: Widen the structural grid");
  });

  it("names each rejected operation by kind, path and reason", () => {
    render(<RejectionNotice rejected={fullyRejected()} onDismiss={() => {}} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    expect(norm(rows[0].textContent)).toBe(
      "locked/structure/gridXMm/value — Structure is locked.",
    );
    expect(norm(rows[1].textContent)).toBe(
      'path/levels/99/floorToFloorMm — Index 99 is out of range at "/levels/99".',
    );
  });

  it("Dismiss calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(<RejectionNotice rejected={fullyRejected()} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
