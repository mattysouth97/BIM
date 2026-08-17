import { test, expect } from "@playwright/test";

test.describe("Generated interior integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("demo workspace exposes the interior layer toggle", async ({ page }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });

    const tour = page.locator(".driver-popover");
    if (await tour.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(tour).toHaveCount(0);
    }

    const toggle = page.getByTestId("interior-layer-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("studio generate opens the design in the workspace", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/studio");
    await expect(page).toHaveURL(/\/studio/);
    await expect(
      page.getByRole("heading", { name: "Generate a building" }),
    ).toBeVisible();

    await page
      .getByLabel("Describe the building you want to create")
      .fill("Create a three-story office building.");
    await page.getByRole("button", { name: "Generate building" }).click();

    const open = page.getByRole("button", { name: "Open in workspace" });
    await expect(open).toBeEnabled({ timeout: 120000 });
    await open.click();

    await expect(page).toHaveURL(/\/building\/GEN-\d{4}/, { timeout: 30000 });
    await expect(page.getByTestId("interior-layer-toggle")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("button", { name: /다른 설계 생성|Generate alternative/ })).toBeVisible();
  });
});
