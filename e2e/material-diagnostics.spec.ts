import { expect, test } from "@playwright/test";

/**
 * ECO2-native material-aware diagnostics: the standards panel names the 기준
 * 버전 behind every number, the assembly editor recomputes U from the layer
 * stack and evaluates alternatives through the REAL engine, sensitivity comes
 * from actual runs, and the baseline is never corrupted by any of it.
 */

const LEDGER_URL = "/diagnostics/new?method=ledger&building=demo";

test.describe("material-aware energy diagnostics", () => {
  test("names its calculation basis and checks the envelope against 별표1", async ({
    page,
  }) => {
    await page.goto(LEDGER_URL);
    await expect(page.getByTestId("standards-panel")).toBeVisible({
      timeout: 60_000,
    });

    // The engine and the standards are named, with versions.
    await expect(page.getByTestId("calc-basis-engine")).toContainText(
      "bimfit-degree-day",
    );
    const standards = page.getByTestId("calc-basis-standards");
    await expect(standards).toContainText("제2025-738호");
    await expect(standards).toContainText("제2024-893호");

    // Result hierarchy ends in a primary-energy figure with its factor basis.
    await expect(page.getByTestId("primary-energy-tile")).toContainText(
      /kWh\/m²·yr/,
    );

    // The 2000s-era baseline wall honestly FAILS today's ceiling.
    const wallRow = page.getByTestId("compliance-ledger-construction-wall");
    await expect(wallRow).toContainText(/초과|FAIL/);

    // The ZEB row is reference-only and says so.
    await expect(page.getByTestId("zeb-reference")).toContainText("참고용");
  });

  test("a layer edit recomputes U live and evaluates through the real engine without touching the baseline", async ({
    page,
  }) => {
    await page.goto(LEDGER_URL);
    await expect(page.getByTestId("diagnosis-stage-nav")).toBeVisible({
      timeout: 60_000,
    });
    const baselineCell = page.getByTestId("result-annualEnergyKwh-baseline");
    await expect(baselineCell).toBeVisible();
    const baselineBefore = await baselineCell.textContent();

    await page.getByTestId("diagnosis-stage-model").click();
    const wallCard = page.getByTestId("assembly-editor-ledger-construction-wall");
    await expect(wallCard).toBeVisible();
    const computed = page.getByTestId("assembly-computed-u-ledger-construction-wall");
    const uBefore = await computed.textContent();

    // Swap the insulation to phenolic foam and thicken it: U must drop and
    // the 별표1 chip must flip to 충족.
    await page
      .getByTestId("assembly-material-ledger-construction-wall")
      .selectOption("ins-pf");
    await page
      .getByTestId(
        "assembly-thickness-ledger-construction-wall-ledger-construction-wall-layer-2",
      )
      .fill("150");
    await expect(computed).not.toHaveText(uBefore ?? "");
    await expect(
      page.getByTestId("assembly-limit-ledger-construction-wall"),
    ).toContainText(/충족|PASS/);

    // Evaluate: a real engine run lands as the comparison alternative.
    await page.getByTestId("assembly-evaluate-ledger-construction-wall").click();
    await expect(page.getByTestId("diagnosis-feedback")).toContainText(
      /실제 엔진|real engine/,
      { timeout: 60_000 },
    );
    const scenarioCell = page.getByTestId("result-annualEnergyKwh-scenario");
    await expect(scenarioCell).toBeVisible();
    await expect(scenarioCell).not.toContainText("—");

    // The baseline number is byte-identical: no hidden scenario drift.
    await expect(page.getByTestId("result-annualEnergyKwh-baseline")).toHaveText(
      baselineBefore ?? "",
    );
    // A fresh assembly evaluation is NOT flagged as a stale prior alternative.
    await expect(
      page.getByTestId("results-glance-scenario-prior"),
    ).toHaveCount(0);
  });

  test("sensitivity rankings come from actual engine runs", async ({ page }) => {
    await page.goto(LEDGER_URL);
    await expect(page.getByTestId("sensitivity-panel")).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("run-parameter-ranking").click();
    const ranking = page.getByTestId("parameter-ranking-result");
    await expect(ranking).toBeVisible({ timeout: 60_000 });
    // The panel reports its own engine-run count and its method honestly.
    await expect(ranking).toContainText(/엔진 \d+회 실행/);
    await expect(ranking).toContainText("실제 엔진");
  });
});
