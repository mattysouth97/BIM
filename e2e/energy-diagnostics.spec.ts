import { expect, test, type Page } from "@playwright/test";

const APP_STORAGE_KEY = "korea-building-info-storage";
const ALTERNATIVE_WINDOW_U_VALUE = "1.3";
const CALIBRATED_FLOOR_PLAN_DXF = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6",
  "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LWPOLYLINE",
  "8", "BIM_OUTLINE", "90", "4", "70", "1", "10", "0", "20", "0",
  "10", "20", "20", "0", "10", "20", "20", "20", "10", "0", "20", "20",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n");

async function openDiagnosis(page: Page): Promise<void> {
  await page.goto("/studio?start=diagnose");
  await expect(
    page.getByRole("button", { name: "Energy diagnosis", pressed: true }),
  ).toBeVisible();
  await expect(page.getByTestId("energy-diagnosis-workspace")).toBeVisible();
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

test.describe("P0-06 energy diagnosis", () => {
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

  test("diagnosis entry preserves the describe and draw start-mode switches", async ({
    page,
  }) => {
    await openDiagnosis(page);

    await page.getByRole("button", { name: "Describe a building" }).click();
    await expect(
      page.getByRole("button", { name: "Describe a building", pressed: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Draw schematic" }).click();
    await expect(
      page.getByRole("button", { name: "Draw schematic", pressed: true }),
    ).toBeVisible();
    await expect(page.getByTestId("schematic-tool-column")).toBeVisible();

    await page.getByRole("button", { name: "Energy diagnosis" }).click();
    await expect(
      page.getByRole("button", { name: "Energy diagnosis", pressed: true }),
    ).toBeVisible();
    await expect(page.getByTestId("energy-diagnosis-workspace")).toBeVisible();
  });

  test("a calibrated plan stays locked until its visible Tier-1 assumptions are accepted", async ({
    page,
  }) => {
    await openDiagnosis(page);

    await page.getByTestId("drawing-set-input").setInputFiles({
      name: "A101-office-floor-plan-rev-A.dxf",
      mimeType: "application/dxf",
      buffer: Buffer.from(CALIBRATED_FLOOR_PLAN_DXF, "utf8"),
    });

    const assumptionCard = page.getByTestId("tier-one-assumption-card");
    await expect(assumptionCard).toBeVisible();
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
    await expect(page.getByTestId("tier-one-uncertainty-banner")).toBeVisible();
    await expect(page.getByTestId("next-diagnosis-action")).toContainText(
      "Confirm footprint & Tier-1 assumptions",
    );

    await page.getByTestId("diagnosis-stage-simulation").click();
    await expect(
      page
        .getByTestId("stage-panel-simulation")
        .getByRole("button", { name: "Run baseline simulation" }),
    ).toBeDisabled();

    await page.getByTestId("diagnosis-stage-assumptions").click();
    await page.getByTestId("accept-tier-one-assumptions").click();
    await expect(assumptionCard).toContainText("accepted");
    const nextAction = page.getByTestId("next-diagnosis-action");
    await expect(nextAction).toContainText("Run baseline simulation");

    await nextAction.click();
    await expect(page.getByTestId("result-comparison")).toContainText(
      "Real engine result",
    );
    await expect(page.getByTestId("tier-one-uncertainty-banner")).toBeVisible();
  });

  test("representative review, simulation, comparison, and evidence survive save and reopen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openDiagnosis(page);

    await page
      .getByRole("button", { name: "Open representative office set" })
      .click();
    await expect(page.getByTestId("stage-panel-review")).toBeVisible();
    await expect(page.getByTestId("conflict-resolution-panel")).toBeVisible();

    await page
      .getByRole("button", { name: "Confirm selected value", exact: true })
      .click();
    await expect(page.getByText("User selection recorded.")).toBeVisible();

    const nextAction = page.getByTestId("next-diagnosis-action");
    await expect(nextAction).toContainText("Apply 0.5 ACH assumption");
    await nextAction.click();
    await expect(page.getByTestId("stage-panel-assumptions")).toContainText(
      "0.5 ACH",
    );
    await expect(nextAction).toContainText("Run baseline simulation");

    await page.getByTestId("diagnosis-stage-preflight").click();
    const preflight = page.getByTestId("stage-panel-preflight");
    await expect(preflight).toBeVisible();
    await expect(preflight).toContainText(
      "Preflight passed. The real engine input can be compiled.",
    );
    await expect(preflight).toContainText("0 blocking");

    await nextAction.click();
    await expect(page.getByTestId("stage-panel-simulation")).toBeVisible();
    await expect(page.getByTestId("result-comparison")).toContainText(
      "Real engine result",
    );
    await expect(nextAction).toContainText("Run alternative");

    await page.getByTestId("result-annualEnergyKwh-baseline").click();
    const diagnosisScene = page.getByTestId("energy-diagnosis-scene");
    const selectedRunZoneLegend = diagnosisScene
      .locator("p")
      .filter({ hasText: "Energy zones" })
      .locator("..");
    await expect(selectedRunZoneLegend).toBeVisible();
    await expect(selectedRunZoneLegend).toContainText("selected run");
    await expect(
      selectedRunZoneLegend.locator("li").filter({ hasText: /kWh\/yr/ }).first(),
    ).toBeVisible();

    await expect(diagnosisScene).toBeVisible();
    await page.getByRole("tab", { name: "Source drawing" }).click();
    await expect(page.getByTestId("source-review-canvas")).toBeVisible();
    await page.getByRole("tab", { name: "3D energy model" }).click();
    await expect(diagnosisScene).toBeVisible();
    await expect(
      page.getByTestId("energy-diagnosis-scene").locator("canvas"),
    ).toBeVisible();

    await page.getByTestId("diagnosis-stage-compare").click();
    const comparePanel = page.getByTestId("stage-panel-compare");
    const scenarioValue = comparePanel.getByRole("spinbutton", {
      name: "Alternative window U-value",
    });
    await scenarioValue.fill(ALTERNATIVE_WINDOW_U_VALUE);
    await comparePanel
      .getByRole("button", { name: "Run alternative", exact: true })
      .click();

    await expect(nextAction).toContainText("Save project");
    const comparison = page.getByTestId("result-comparison");
    await expect(comparison).toContainText("Window-performance alternative");
    await expect(comparison).toContainText("kWh/yr");
    const comparisonBeforeSave = normalizedText(await comparison.innerText());

    await nextAction.click();
    await expect(page.getByRole("status")).toContainText(
      "Saved the model, provenance, and exact runs in this browser.",
    );

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Energy diagnosis", pressed: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Open recent saved diagnosis" })
      .click();
    await expect(page.getByTestId("stage-panel-compare")).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Restored the saved model and simulation runs.",
    );

    const comparisonAfterReopen = normalizedText(
      await page.getByTestId("result-comparison").innerText(),
    );
    expect(comparisonAfterReopen).toBe(comparisonBeforeSave);

    await page.getByTestId("diagnosis-stage-assumptions").click();
    const restoredAssumptions = page.getByTestId("stage-panel-assumptions");
    await expect(restoredAssumptions).toContainText("0.5 ACH");
    await expect(restoredAssumptions).toContainText("user_resolved");

    await page.getByTestId("diagnosis-stage-compare").click();
    await expect(
      page
        .getByTestId("stage-panel-compare")
        .getByRole("spinbutton", { name: "Alternative window U-value" }),
    ).toHaveValue(ALTERNATIVE_WINDOW_U_VALUE);
  });
});
