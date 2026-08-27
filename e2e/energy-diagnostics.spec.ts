import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const APP_STORAGE_KEY = "korea-building-info-storage";
const ALTERNATIVE_WINDOW_U_VALUE = "1.3";
const BUNDLED_DWG_FIXTURE = resolve(
  process.cwd(),
  "e2e/fixtures/libredwg-example-2018.dwg.base64",
);
const BUNDLED_DWG_SHA256 =
  "7bc7721224003062b237845842b7a976e46771c37eba6833b9ed3712e7a5a65a";
const CALIBRATED_FLOOR_PLAN_DXF = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6",
  "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LWPOLYLINE",
  "8", "BIM_OUTLINE", "90", "4", "70", "1", "10", "0", "20", "0",
  "10", "20", "20", "0", "10", "20", "20", "20", "10", "0", "20", "20",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n");

const VISIBLE_PHASES = [
  "drawings",
  "model",
  "preflight",
  "simulation",
  "compare",
] as const;

async function expectCanonicalPhases(page: Page): Promise<void> {
  const navigation = page.getByTestId("diagnosis-stage-nav");
  await expect(navigation).toBeVisible();
  for (const phase of VISIBLE_PHASES) {
    await expect(page.getByTestId(`diagnosis-stage-${phase}`)).toBeVisible();
  }
  await expect(
    navigation.locator('[data-testid^="diagnosis-stage-"]'),
  ).toHaveCount(VISIBLE_PHASES.length);
}

async function openMethod(
  page: Page,
  method: "upload" | "create" | "sample",
): Promise<void> {
  await page.goto(`/diagnostics/new?method=${method}`);
  if (method === "create") {
    await expect(page.getByTestId("diagnostic-geometry-editor")).toBeVisible();
  } else {
    await expect(page.getByTestId("energy-diagnosis-workspace")).toBeVisible();
    await expectCanonicalPhases(page);
  }
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function expectCanonicalMethodUrl(
  page: Page,
  method: "upload" | "create" | "sample",
): Promise<void> {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return { pathname: url.pathname, method: url.searchParams.get("method") };
    })
    .toEqual({ pathname: "/diagnostics/new", method });
}

test.describe("Canonical energy diagnostic", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ storageKey }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          state: {
            apiKey: "",
            language: "en",
            sidePanelOpen: true,
            hasSeenTour: true,
            hasSeenHomeTour: true,
            hasSeenTwinTour: true,
          },
          version: 1,
        }),
      );
    }, { storageKey: APP_STORAGE_KEY });
  });

  test("gathers every way in on the one landing page", async ({ page }) => {
    await page.goto("/");

    // The register lookup is the page, not a choice among choices.
    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible();
    await expect(page.getByTestId("ledger-lookup")).toBeVisible();

    // Everything else is a fallback offered underneath it.
    await expect(page.getByTestId("diagnostic-method-upload")).toHaveAttribute(
      "href",
      "/diagnostics/new?method=upload",
    );
    await expect(page.getByTestId("diagnostic-method-create")).toHaveAttribute(
      "href",
      "/diagnostics/new?method=create",
    );
    await expect(page.getByTestId("landing-sample-diagnostic")).toHaveAttribute(
      "href",
      "/diagnostics/new?method=ledger&building=demo",
    );

    // There is no second entry screen any more.
    await page.goto("/diagnostics/new");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('a[href^="/studio"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/building/demo"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/building/drawing"]')).toHaveCount(0);
  });

  test("redirects legacy product URLs into canonical input methods", async ({
    page,
  }) => {
    await page.goto("/studio?start=diagnose");
    await expectCanonicalMethodUrl(page, "upload");
    await expect(page.getByTestId("energy-diagnosis-workspace")).toBeVisible();

    await page.goto("/building/drawing");
    await expectCanonicalMethodUrl(page, "create");
    await expect(page.getByTestId("diagnostic-geometry-editor")).toBeVisible();

    await page.goto("/building/demo");
    await expectCanonicalMethodUrl(page, "sample");
    await expect(page.getByTestId("stage-panel-review")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("keeps mobile results and the spatial model inside the viewport", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openMethod(page, "sample");

    await page
      .getByRole("button", { name: "Confirm selected value", exact: true })
      .click();
    const nextAction = page.getByTestId("next-diagnosis-action");
    await expect(nextAction).toContainText("Apply 0.5 ACH assumption");
    await nextAction.click();
    await expect(nextAction).toContainText("Run baseline simulation");
    await nextAction.click();

    const results = page.getByTestId("results-at-a-glance");
    const scene = page.getByTestId("energy-diagnosis-scene");
    await expect(results).toBeVisible();
    await expect(scene).toBeVisible();
    const detailedFinding = page
      .getByTestId("diagnostic-findings")
      .locator("button[aria-pressed]")
      .first();
    await detailedFinding.click();
    await expect(detailedFinding).toHaveAttribute("aria-pressed", "true");

    const layout = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>(
        '[data-testid="energy-diagnosis-workspace"]',
      );
      const workspaceLayout = document.querySelector<HTMLElement>(
        '[data-testid="diagnosis-workspace-layout"]',
      );
      const summary = document.querySelector<HTMLElement>(
        '[data-testid="results-at-a-glance"]',
      );
      const viewer = document.querySelector<HTMLElement>(
        '[data-testid="energy-diagnosis-scene"]',
      );
      if (!workspace || !workspaceLayout || !summary || !viewer) {
        throw new Error("The mobile diagnostic result layout is incomplete.");
      }
      const measure = (element: HTMLElement) => {
        const box = element.getBoundingClientRect();
        return {
          left: Math.round(box.left),
          right: Math.round(box.right),
          width: Math.round(box.width),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        };
      };
      return {
        viewportWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        workspace: measure(workspace),
        workspaceLayout: measure(workspaceLayout),
        summary: measure(summary),
        viewer: measure(viewer),
      };
    });

    expect(layout.viewportWidth).toBe(390);
    expect(layout.documentScrollWidth).toBe(390);
    expect(layout.workspace.scrollWidth).toBe(layout.workspace.clientWidth);
    expect(layout.workspaceLayout.scrollWidth).toBe(
      layout.workspaceLayout.clientWidth,
    );
    for (const element of [layout.summary, layout.viewer]) {
      expect(element.left).toBeGreaterThanOrEqual(0);
      expect(element.right).toBeLessThanOrEqual(layout.viewportWidth);
      expect(element.width).toBeLessThanOrEqual(layout.viewportWidth);
    }
  });

  test("authored geometry enters validation and the real diagnostic engine", async ({
    page,
  }) => {
    await openMethod(page, "create");
    const canvas = page.getByRole("application", {
      name: "Schematic drawing canvas",
    });
    await expect(canvas).toBeVisible();
    await page.getByTestId("schematic-tool-boundary").click();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Schematic canvas has no measurable bounds.");

    await page.mouse.move(
      bounds.x + bounds.width * 0.2,
      bounds.y + bounds.height * 0.22,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.72,
      bounds.y + bounds.height * 0.7,
    );
    await page.mouse.up();

    await page.getByRole("button", { name: "Review building model" }).click();
    await expect(page.getByTestId("tier-one-assumption-card")).toBeVisible();
    await expect(page.getByTestId("energy-diagnosis-workspace")).toBeVisible();
    await expectCanonicalPhases(page);
    await page.getByTestId("accept-tier-one-assumptions").click();
    await expect(page.getByTestId("next-diagnosis-action")).toContainText(
      "Run baseline simulation",
    );
    await page.getByTestId("next-diagnosis-action").click();

    await expect(page.getByTestId("result-comparison")).toContainText(
      "Real engine result",
    );
    await expect(page.getByTestId("diagnostic-findings")).toBeVisible();
    await expectCanonicalMethodUrl(page, "create");
  });

  test("offers reviewed DWG/SVG import from Upload while direct input remains DXF", async ({
    page,
  }) => {
    await openMethod(page, "upload");

    await expect(page.getByTestId("drawing-set-input")).toHaveAttribute(
      "accept",
      ".dxf",
    );
    await page.getByTestId("diagnostic-review-dwg-svg").click();

    await expect(page.getByTestId("diagnostic-geometry-editor")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Import DWG/DXF/SVG as a schematic",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("import-cad-file-input")).toHaveAttribute(
      "accept",
      ".dxf,.dwg,.svg",
    );
    await expect(page.getByTestId("drawing-set-input")).not.toBeVisible();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByTestId("back-to-direct-dxf-upload").click();
    await expect(page.getByTestId("drawing-set-input")).toBeVisible();
    await expectCanonicalMethodUrl(page, "upload");
  });

  test("canceling reviewed import preserves the current model and running diagnostic", async ({
    page,
  }) => {
    await openMethod(page, "upload");
    await page.getByTestId("drawing-set-input").setInputFiles({
      name: "A101-in-progress-floor-plan.dxf",
      mimeType: "application/dxf",
      buffer: Buffer.from(CALIBRATED_FLOOR_PLAN_DXF, "utf8"),
    });

    await expect(page.getByTestId("tier-one-assumption-card")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("accept-tier-one-assumptions").click();
    const nextAction = page.getByTestId("next-diagnosis-action");
    await expect(nextAction).toContainText("Run baseline simulation");

    await nextAction.click();
    await page.getByTestId("diagnostic-review-dwg-svg").click();
    await expect(page.getByTestId("diagnostic-geometry-editor")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByTestId("back-to-direct-dxf-upload").click();

    await expect(page.getByTestId("result-comparison")).toContainText(
      "Real engine result",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("diagnostic-findings")).toBeVisible();
    await expectCanonicalMethodUrl(page, "upload");
  });

  test("a genuine reviewed DWG reaches the canonical engine", async ({ page }) => {
    test.setTimeout(120_000);
    const overridePath = process.env.BIMFIT_E2E_DWG_FIXTURE?.trim();
    const fixture = overridePath
      ? await readFile(overridePath)
      : Buffer.from(await readFile(BUNDLED_DWG_FIXTURE, "utf8"), "base64");
    expect(fixture.subarray(0, 6).toString("ascii")).toMatch(/^AC\d{4}$/);
    if (!overridePath) {
      expect(fixture).toHaveLength(149_218);
      expect(createHash("sha256").update(fixture).digest("hex")).toBe(
        BUNDLED_DWG_SHA256,
      );
    }

    await openMethod(page, "upload");
    await page.getByTestId("diagnostic-review-dwg-svg").click();
    await page.getByTestId("import-cad-file-input").setInputFiles({
      name: "representative-building.dwg",
      mimeType: "application/acad",
      buffer: fixture,
    });

    await expect(page.getByRole("button", { name: "Use as schematic" })).toBeEnabled({
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Use as schematic" }).click();
    await page.getByRole("button", { name: "Review building model" }).click();

    await expect(page.getByTestId("tier-one-assumption-card")).toBeVisible({
      timeout: 30_000,
    });
    await expectCanonicalPhases(page);
    await page.getByTestId("accept-tier-one-assumptions").click();
    await expect(page.getByTestId("next-diagnosis-action")).toContainText(
      "Run baseline simulation",
    );
    await page.getByTestId("next-diagnosis-action").click();

    await expect(page.getByTestId("result-comparison")).toContainText(
      "Real engine result",
    );
    await expect(page.getByTestId("diagnostic-findings")).toBeVisible();
    await expectCanonicalMethodUrl(page, "upload");
  });

  test("a DXF stays blocked until its visible Tier-1 assumptions are accepted", async ({
    page,
  }) => {
    await openMethod(page, "upload");

    await page.getByTestId("drawing-set-input").setInputFiles({
      name: "A101-office-floor-plan-rev-A.dxf",
      mimeType: "application/dxf",
      buffer: Buffer.from(CALIBRATED_FLOOR_PLAN_DXF, "utf8"),
    });

    const assumptionCard = page.getByTestId("tier-one-assumption-card");
    await expect(assumptionCard).toBeVisible({ timeout: 20_000 });
    await expect(assumptionCard).toContainText(
      "Tier-1 office screening template v1",
    );
    await expect(assumptionCard).toContainText("Seoul, KR");
    await expect(assumptionCard).toContainText("WWR 30%");
    await expect(assumptionCard).toContainText("occupancy 0.1 people/m²");
    await expect(assumptionCard).toContainText("heat recovery 70%");
    await expect(assumptionCard).toContainText(
      "not measured data or a compliance prediction",
    );
    await expect(assumptionCard).toContainText("acceptance required");
    await expect(page.getByTestId("tier-one-uncertainty-banner")).toBeVisible();
    await expect(page.getByTestId("next-diagnosis-action")).toContainText(
      "Confirm footprint & Tier-1 assumptions",
    );

    await page.getByTestId("diagnosis-stage-preflight").click();
    const preflight = page.getByTestId("stage-panel-preflight");
    await expect(preflight).toBeVisible();
    await expect(preflight).toContainText("2 blocking");
    await expect(preflight).toContainText("TIER_ONE_ACCEPTANCE_REQUIRED");
    await expect(preflight).toContainText("MISSING_REQUIRED_VALUE");

    await page.getByTestId("diagnosis-stage-simulation").click();
    const baselineButton = page
      .getByTestId("stage-panel-simulation")
      .getByRole("button", { name: "Run baseline simulation" });
    await expect(baselineButton).toBeDisabled();
    await expect(page.getByTestId("stage-panel-simulation")).toContainText(
      "Run the validated diagnostic model",
    );

    await page.getByTestId("next-diagnosis-action").click();
    await expect(assumptionCard).toContainText("accepted");
    await expect(page.getByTestId("next-diagnosis-action")).toContainText(
      "Run baseline simulation",
    );

    await page.getByTestId("diagnosis-stage-simulation").click();
    await expect(
      page
        .getByTestId("stage-panel-simulation")
        .getByRole("button", { name: "Run baseline simulation" }),
    ).toBeEnabled();
  });

  test("sample review, results, finding selection, and comparison survive reopen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openMethod(page, "sample");

    await expect(page.getByTestId("stage-panel-review")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("diagnosis-stage-drawings")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(page.getByTestId("conflict-resolution-panel")).toBeVisible();
    await page
      .getByRole("button", { name: "Confirm selected value", exact: true })
      .click();
    await expect(page.getByText("User selection recorded.")).toBeVisible();

    await page.getByTestId("diagnosis-stage-model").click();
    await expect(page.getByTestId("stage-panel-model")).toBeVisible();
    await expect(page.getByTestId("diagnosis-stage-model")).toHaveAttribute(
      "aria-current",
      "step",
    );

    const nextAction = page.getByTestId("next-diagnosis-action");
    await expect(nextAction).toContainText("Apply 0.5 ACH assumption");
    await nextAction.click();
    await expect(page.getByTestId("stage-panel-assumptions")).toContainText(
      "0.5 ACH",
    );
    await expect(page.getByTestId("stage-panel-assumptions")).toContainText(
      "user_resolved",
    );
    await expect(page.getByTestId("diagnosis-stage-preflight")).toHaveAttribute(
      "aria-current",
      "step",
    );

    await page.getByTestId("diagnosis-stage-preflight").click();
    const preflight = page.getByTestId("stage-panel-preflight");
    await expect(preflight).toBeVisible();
    await expect(preflight).toContainText(
      "Preflight passed. The real engine input can be compiled.",
    );
    await expect(preflight).toContainText("0 blocking");

    await expect(nextAction).toContainText("Run baseline simulation");
    await nextAction.click();
    await expect(page.getByTestId("stage-panel-compare")).toBeVisible();
    await expect(page.getByTestId("diagnosis-stage-compare")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(
      page.getByRole("heading", { name: "Energy Diagnostic Results" }),
    ).toBeVisible();
    const baselineComparison = page.getByTestId("result-comparison");
    await expect(baselineComparison).toContainText("Real engine result");
    await expect(baselineComparison).toContainText("Baseline");
    await expect(page.getByTestId("diagnostic-findings")).toBeVisible();

    const envelopeFinding = page.getByTestId(
      /^finding-finding:dominant-envelope:/,
    );
    await expect(envelopeFinding).toBeVisible();
    const findingTitle = normalizedText(
      await envelopeFinding.locator('p[id$="-title"]').innerText(),
    );

    await page.getByRole("tab", { name: "Source drawing" }).click();
    await expect(page.getByTestId("source-review-canvas")).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "3D energy model" }),
    ).toHaveAttribute("aria-selected", "false");

    await envelopeFinding
      .getByRole("button", { name: findingTitle, exact: true })
      .click();
    await expect(envelopeFinding).toHaveAttribute("data-selected", "true");
    await expect(
      envelopeFinding.getByRole("button", {
        name: findingTitle,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("tab", { name: "3D energy model" }),
    ).toHaveAttribute("aria-selected", "true");

    const diagnosisScene = page.getByTestId("energy-diagnosis-scene");
    await expect(diagnosisScene).toBeVisible();
    await expect(diagnosisScene.locator("canvas")).toBeVisible();
    const sceneSelectionKind = await diagnosisScene.getAttribute(
      "data-selection-kind",
    );
    const sceneHighlightedObjectCount = await diagnosisScene.getAttribute(
      "data-highlighted-object-count",
    );

    await page.getByTestId("diagnosis-stage-compare").click();
    const comparePanel = page.getByTestId("stage-panel-compare");
    await comparePanel.getByTestId("toggle-improvement-editor").click();
    const alternativeCop = comparePanel.getByRole("spinbutton", {
      name: "Alternative heating COP",
    });
    await alternativeCop.fill("0");
    await comparePanel.getByTestId("run-improvement-scenario").click();
    await expect(page.getByTestId("diagnosis-feedback")).toContainText(
      "must be positive",
    );
    await expect(comparePanel.getByTestId("result-comparison")).toContainText(
      "Baseline",
    );
    await alternativeCop.fill("");
    const scenarioValue = comparePanel.getByRole("spinbutton", {
      name: "Alternative window U-value",
    });
    await scenarioValue.fill(ALTERNATIVE_WINDOW_U_VALUE);
    await comparePanel
      .getByRole("button", { name: "Run alternative", exact: true })
      .click();

    await expect(page.getByTestId("diagnosis-stage-compare")).toHaveAttribute(
      "aria-current",
      "step",
    );
    const comparison = page.getByTestId("result-comparison");
    await expect(comparison).toContainText("Improvement alternative");
    await expect(comparison).toContainText("kWh/yr");
    const comparisonBeforeSave = normalizedText(await comparison.innerText());

    await expect(nextAction).toContainText("Save project");
    await nextAction.click();
    await expect(page.getByRole("status")).toContainText(
      "Saved the model, provenance, and exact runs in this browser.",
      { timeout: 20_000 },
    );

    await page.goto("/");
    const resumeRecent = page.getByTestId("resume-recent-diagnostic");
    await expect(resumeRecent).toBeVisible();
    await resumeRecent.click();

    await expect(page.getByTestId("stage-panel-compare")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("status")).toContainText(
      "Restored the saved model and simulation runs.",
    );
    const comparisonAfterReopen = normalizedText(
      await page.getByTestId("result-comparison").innerText(),
    );
    expect(comparisonAfterReopen).toBe(comparisonBeforeSave);
    await page.getByTestId("toggle-improvement-editor").click();
    await expect(
      page
        .getByTestId("stage-panel-compare")
        .getByRole("spinbutton", { name: "Alternative window U-value" }),
    ).toHaveValue(ALTERNATIVE_WINDOW_U_VALUE);

    expect(sceneSelectionKind).toBe("diagnostic_finding");
    expect(sceneHighlightedObjectCount).toMatch(/^[1-9]\d*$/);
  });

  test("switching methods resets method-scoped product state", async ({ page }) => {
    await openMethod(page, "sample");
    await expect(page.getByTestId("stage-panel-review")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("link", { name: "Start over" }).click();
    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible();
    await page.getByTestId("diagnostic-method-create").click();
    await expect(page.getByTestId("diagnostic-geometry-editor")).toBeVisible();
    await expect(page.getByTestId("energy-diagnosis-workspace")).toHaveCount(0);
  });
});
