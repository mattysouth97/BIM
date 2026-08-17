import { test, expect } from "@playwright/test";

test.describe("3D work rail", () => {
  test("offers 작성 / Authoring so families can be placed on the live model", async ({
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
    const authoring = page.getByRole("button", { name: /Authoring|작성/ });
    await expect(authoring).toBeVisible();
    await expect(page.getByRole("button", { name: /Views|뷰/ })).toBeVisible();

    // The rail button must actually reach the palette — a mode that switches
    // without surfacing its tools is the dead-UI case this test exists to catch.
    await authoring.click();
    await expect(page.getByTestId("authoring-palette")).toBeVisible({
      timeout: 15000,
    });
  });
});
