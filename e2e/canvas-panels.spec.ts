import { test, expect } from "@playwright/test";
import { seedSeenTours } from "./helpers/app-state";

for (const route of ["/models/fzk-haus", "/building/demo"]) {
  test(`${route}: top and bottom panels collapse independently without losing state`, async ({ page }) => {
    await seedSeenTours(page);
    await page.goto(route);
    const top = page.getByTestId("twin-panel-top-toggle");
    const bottom = page.getByTestId("twin-panel-bottom-toggle");
    const topContent = page.getByTestId("twin-panel-top-content");
    const bottomContent = page.getByTestId("twin-panel-bottom-content");
    await expect(top).toBeVisible({ timeout: 45000 });
    await expect(bottom).toBeVisible();
    await expect(top).toHaveAttribute("aria-expanded", "true");
    await expect(bottom).toHaveAttribute("aria-expanded", "true");
    const budget = topContent.locator("input[type=number]").first();
    await expect(budget).toBeVisible();
    await budget.fill("1234");
    await budget.blur();
    const countBefore = await page.locator('[data-measure-chosen="true"]').count();
    await top.focus();
    await page.keyboard.press("Enter");
    await expect(top).toHaveAttribute("aria-expanded", "false");
    await expect(topContent).toBeHidden();
    await expect(bottomContent).toBeVisible();
    await bottom.click();
    await expect(bottomContent).toBeHidden();
    await expect(top).toBeVisible();
    await expect(bottom).toBeVisible();
    await top.click();
    await expect(topContent).toBeVisible();
    await expect(bottomContent).toBeHidden();
    await expect(budget).toHaveValue("1234");
    await bottom.click();
    await expect(bottomContent).toBeVisible();
    await expect(page.locator('[data-measure-chosen="true"]')).toHaveCount(countBefore);
  });
}
