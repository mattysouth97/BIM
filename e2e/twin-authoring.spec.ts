import { test, expect } from "@playwright/test";

test.describe("Twin authoring", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("floor-edit and object-edit expose real authoring, not dead chrome", async ({
    page,
  }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });

    const tour = page.locator(".driver-popover");
    if (await tour.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(tour).toHaveCount(0);
    }

    await expect(page.getByTestId("scene-layer-list")).toBeVisible();
    await expect(page.getByTestId("equipment-schedule-ingest")).toBeVisible();

    await page.keyboard.press("2");
    await expect(page.getByTestId("floor-stack-editor")).toBeVisible();
    await expect(page.getByText("층 스택")).toBeVisible();

    await page.keyboard.press("3");
    await expect(page.getByTestId("slot-plan")).toBeVisible();
    await expect(page.getByText("서비스 코어")).toBeVisible();
  });

  test("CAD continue still reaches the twin after core classification", async ({
    page,
  }) => {
    // The CAD-first draft (/building/drawing) is no longer a landing
    // door post-pivot — the generative studio's schematic import replaced it
    // there — but the route itself is still owned by /building, so this
    // deep-dives it directly rather than via a removed landing button.
    await page.goto("/building/drawing");
    await expect(page.getByTestId("upload-sample-dxf")).toBeVisible();
    await page.getByTestId("upload-sample-dxf").click();
    await expect(page.getByText("외곽선 준비 완료")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("upload-continue").click();
    await expect(page.getByRole("button", { name: /디지털 트윈/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(page.getByTestId("scene-layer-list")).toBeVisible({ timeout: 15000 });
  });
});
