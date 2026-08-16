import { test, expect } from "@playwright/test";

test.describe("Autonomous BIM document", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        "korea-building-info-storage",
        JSON.stringify({ state: { hasSeenTour: true, language: "ko" }, version: 0 }),
      );
    });
    await page.reload();
  });

  test("demo twin exposes views, phase, and a live wall schedule", async ({
    page,
  }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".driver-overlay")).toHaveCount(0);

    const viewBar = page.getByTestId("bim-view-bar");
    await expect(viewBar).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("bim-view-3d")).toBeVisible();
    await expect(page.getByTestId("bim-phase-toggle")).toBeVisible();

    await page.getByTestId("bim-view-plan").click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByTestId("bim-schedule-toggle").click();
    const panel = page.getByTestId("bim-schedule-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("schedule-table-wall-schedule-v1")).toBeVisible();
    await expect(page.getByText("W-1-N").first()).toBeVisible();

    const existingU = await page
      .getByTestId("schedule-table-wall-schedule-v1")
      .locator("tbody tr")
      .first()
      .locator("td")
      .nth(6)
      .innerText();
    expect(Number(existingU)).toBeGreaterThan(0.15);

    await page.getByTestId("bim-phase-retrofit").click();
    await expect(panel.getByText(/개보수 단계/)).toBeVisible();
    await expect(
      page.getByTestId("schedule-table-wall-schedule-v1").locator("tbody tr").first().locator("td").nth(6),
    ).toHaveText("0.15");
  });

  test("report stage lists autonomous sheets and schedules", async ({ page }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });

    const tour = page.locator(".driver-popover");
    if (await tour.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
    }

    await page.getByRole("button", { name: /보고서/ }).click();
    await page.getByTestId("report-schedules-tab").click();
    await expect(page.getByTestId("schedule-preview")).toBeVisible();
    await expect(page.getByText("A-101 평면도")).toBeVisible();
    await expect(page.getByText("벽체 일람표").first()).toBeVisible();
  });
});
