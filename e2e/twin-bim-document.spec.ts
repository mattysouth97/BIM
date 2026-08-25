import { test, expect } from "@playwright/test";

import { seedSeenTours } from "./helpers/app-state";

test.describe("Autonomous BIM document", () => {
  test.beforeEach(async ({ page }) => {
    await seedSeenTours(page);
    await page.goto("/");
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
    const wallSchedule = page.getByTestId("schedule-table-wall-schedule-v1");
    await expect(wallSchedule).toBeVisible();

    const firstWall = wallSchedule.locator("tbody tr").first();
    await expect(firstWall.locator("td").first()).toHaveText(/^WALL-L\d+-\d+$/);

    await expect(
      wallSchedule.getByRole("columnheader", { name: /열관류율/ }),
    ).toBeVisible();
    const firstWallId = await firstWall.locator("td").first().innerText();
    const firstWallArea = Number(await firstWall.locator("td").nth(5).innerText());
    const existingU = Number(await firstWall.locator("td").nth(6).innerText());
    expect(firstWallArea).toBeGreaterThan(0);
    expect(Number.isFinite(existingU)).toBe(true);
    expect(existingU).toBeGreaterThanOrEqual(0);
    await expect(firstWall.locator("td").nth(7)).not.toHaveText("");

    await page.getByTestId("bim-phase-retrofit").click();
    await expect(panel.getByText(/개보수 단계/)).toBeVisible();
    await expect(firstWall.locator("td").first()).toHaveText(firstWallId);
  });

  test("report stage lists autonomous sheets and schedules", async ({ page }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /보고서/ }).click();
    await page.getByTestId("report-schedules-tab").click();
    await expect(page.getByTestId("schedule-preview")).toBeVisible();
    await expect(page.getByText("A-101 평면도")).toBeVisible();
    await expect(page.getByText("벽체 일람표").first()).toBeVisible();
  });
});
