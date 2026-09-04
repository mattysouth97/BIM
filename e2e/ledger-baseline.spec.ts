import { expect, test } from "@playwright/test";

/**
 * The product promise for the register path: choosing a building is the only
 * input required to see a diagnosed model. These tests assert exactly that —
 * no upload, no drawing, no form, no clicks between arriving and a result.
 */

const LEDGER_URL = "/diagnostics/new?method=ledger&building=demo";
const REGISTER_URL = "/diagnostics/new?method=ledger";

test.describe("building register → baseline diagnosis", () => {
  test("the register lookup is step 1 with nothing in front of it", async ({ page }) => {
    await page.goto(REGISTER_URL);
    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible();
    await expect(page.getByTestId("ledger-lookup")).toBeVisible();
    // Both ways of finding a building are offered.
    await expect(page.getByRole("tab", { name: /지역|district/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /주소|address/i })).toBeVisible();
  });

  test("the register lookup exists in exactly one place", async ({ page }) => {
    // It lives here and only here. `/` is the model gallery and states no
    // register lookup of its own; a method-less arrival lands on this sheet.
    await page.goto("/diagnostics/new");
    await expect(page).toHaveURL(/method=ledger/);
    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible();

    await page.goto("/");
    await expect(page.getByTestId("landing-ledger-lookup")).toHaveCount(0);
  });

  test("the sample enters the four-step twin workflow", async ({ page }) => {
    await page.goto(REGISTER_URL);
    await page.getByTestId("landing-sample-diagnostic").click();
    await expect(page).toHaveURL(/\/building\/demo$/);
    // 건물 검색 → 도면 업로드 → 디지털 트윈 → 보고서
    const body = page.locator("body");
    await expect(body).toContainText("건물 검색", { timeout: 60_000 });
    await expect(body).toContainText("도면 업로드");
    await expect(body).toContainText("디지털 트윈");
    await expect(body).toContainText("보고서");
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
    // An id that is not a register address at all. Deterministic on purpose:
    // it is refused without any network call, so the test does not depend on
    // whether a lookup key happens to be configured.
    await page.goto("/diagnostics/new?method=ledger&building=not-a-building-id");
    await expect(page.getByTestId("ledger-baseline-unavailable")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("results-at-a-glance")).toHaveCount(0);
  });
});
