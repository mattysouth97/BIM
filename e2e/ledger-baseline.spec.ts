import { expect, test } from "@playwright/test";

/**
 * The product promise for the register path: choosing a building is the only
 * input required to see a diagnosed model. These tests assert exactly that —
 * no upload, no drawing, no form, no clicks between arriving and a result.
 */

const LEDGER_URL = "/diagnostics/new?method=ledger&building=demo";

test.describe("building register → baseline diagnosis", () => {
  test("offers the register as an entry method", async ({ page }) => {
    await page.goto("/diagnostics/new");
    const door = page.getByTestId("diagnostic-method-ledger");
    await expect(door).toBeVisible();
    await expect(door).toHaveAttribute(
      "href",
      "/diagnostics/new?method=ledger",
    );
  });

  test("builds and runs a baseline with zero further input", async ({
    page,
  }) => {
    await page.goto(LEDGER_URL);

    // The workspace replaces the loading state once the model is built.
    await expect(page.getByTestId("diagnosis-stage-nav")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("ledger-baseline-loading")).toHaveCount(0);
    await expect(page.getByTestId("ledger-baseline-unavailable")).toHaveCount(0);

    // A completed baseline run is already present — the run is what makes the
    // results panel render at all.
    await expect(page.getByTestId("results-at-a-glance")).toBeVisible({
      timeout: 60_000,
    });

    // Readiness reports on a real model rather than an empty shell.
    await expect(page.getByTestId("energy-readiness-strip")).toBeVisible();
  });

  test("reports every registered storey, not a single extruded plate", async ({
    page,
  }) => {
    await page.goto(LEDGER_URL);
    await expect(page.getByTestId("diagnosis-stage-nav")).toBeVisible({
      timeout: 60_000,
    });

    // The demo register is a 10F/B2 office, so the thermal model must carry
    // all ten above-grade storeys. The Tier-1 path would have produced one.
    await page.getByTestId("diagnosis-stage-model").click();
    const body = page.locator("body");
    await expect(body).toContainText("1F zone");
    await expect(body).toContainText("10F zone");

    // Era defaults are labelled as defaults wherever they are shown, so a
    // code-table U-value can never read as a measurement.
    await expect(body).toContainText("2000-2009");
    // ACH50 3.5 for that era, divided by 20 to reach a natural rate.
    await expect(body).toContainText("0.175");
  });

  test("declines a building it cannot model instead of inventing one", async ({
    page,
  }) => {
    // A real register id has no offline record and no configured key, so the
    // honest outcome is a refusal, never a fabricated building.
    await page.goto(
      "/diagnostics/new?method=ledger&building=11680-10300-1-0012-0000",
    );
    await expect(page.getByTestId("ledger-baseline-unavailable")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("results-at-a-glance")).toHaveCount(0);
  });
});
