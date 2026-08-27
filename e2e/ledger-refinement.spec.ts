import { expect, test } from "@playwright/test";

/**
 * The second half of the product: the register gives a baseline whose envelope
 * and systems are era-code defaults, and the user corrects them toward the
 * real building. These tests assert the correction is possible, visible, and
 * actually changes the answer.
 */

const LEDGER_URL = "/diagnostics/new?method=ledger&building=demo";

test.describe("refining a register baseline", () => {
  test("shows what is assumed and lets a real value replace it", async ({
    page,
  }) => {
    await page.goto(LEDGER_URL);
    await expect(page.getByTestId("diagnosis-stage-nav")).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("diagnosis-stage-model").click();

    const panel = page.getByTestId("refinement-panel");
    await expect(panel).toBeVisible();
    // The baseline arrives with assumed values, and says how many.
    await expect(page.getByTestId("refinement-assumed-count")).toContainText(
      /\d/,
    );
    // Envelope, systems and operation are all offered for correction.
    await expect(panel).toContainText(/외피|Envelope/);
    await expect(panel).toContainText(/설비|Systems/);

    // Correct the wall U-value to a real insulated wall.
    const wallInput = page.locator(
      '[data-testid^="refine-input-envelope.construction.ledger-construction-wall.uValueWPerM2K"]',
    );
    await expect(wallInput).toBeVisible();
    await wallInput.fill("0.17");
    await page.getByTestId("refinement-note").fill("2021 외단열 시공 상세");

    const apply = page.getByTestId("refinement-apply");
    await expect(apply).toBeEnabled();
    await apply.click();

    // The result is re-diagnosed and the change is reported as a percentage.
    await expect(page.locator("body")).toContainText(/연간 수요|Annual demand/, {
      timeout: 60_000,
    });
  });

  test("records a corrected value as the user's, not as a measurement", async ({
    page,
  }) => {
    await page.goto(LEDGER_URL);
    await expect(page.getByTestId("diagnosis-stage-nav")).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("diagnosis-stage-model").click();

    const achInput = page.getByTestId(
      "refine-input-envelope.infiltrationAirChangesPerHour",
    );
    await achInput.fill("0.08");
    await page.getByTestId("refinement-apply").click();

    // That row now reads as stated by the user rather than an era default.
    const row = page.getByTestId(
      "refinable-envelope.infiltrationAirChangesPerHour",
    );
    await expect(row).toContainText(/사용자 확인|Stated by you/, {
      timeout: 60_000,
    });
    await expect(row).not.toContainText(/추정 · 연식 기반|Assumed · era default/);
  });
});
