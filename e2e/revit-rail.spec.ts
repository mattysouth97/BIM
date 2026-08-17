import { test, expect } from "@playwright/test";

test.describe("3D work rail", () => {
  test("does not offer 작성 / Authoring — that is schematic-only", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.getByTestId("landing-demo-start").click();
    await expect(page).toHaveURL(/\/building\/demo/);
    const tour = page.locator(".driver-popover");
    if (await tour.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
    }
    await expect(page.getByTestId("revit-work-rail")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("button", { name: "Authoring" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "작성" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Views|뷰/ }),
    ).toBeVisible();
  });
});
