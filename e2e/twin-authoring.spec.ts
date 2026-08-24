import { test, expect } from "@playwright/test";

import { seedSeenTours } from "./helpers/app-state";

test.describe("Twin authoring", () => {
  test.beforeEach(async ({ page }) => {
    await seedSeenTours(page);
    await page.goto("/");
  });

  test("floor-edit and object-edit expose real authoring, not dead chrome", async ({
    page,
  }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId("scene-layer-list")).toBeVisible();
    await expect(page.getByTestId("equipment-schedule-ingest")).toBeVisible();

    await page.keyboard.press("2");
    await expect(page.getByTestId("floor-stack-editor")).toBeVisible();
    await expect(page.getByText("층 스택")).toBeVisible();

    await page.keyboard.press("3");
    await expect(page.getByTestId("slot-plan")).toBeVisible();
    await expect(page.getByText("서비스 코어")).toBeVisible();
  });

  test("an imported DXF remains authorable after adoption", async ({
    page,
  }) => {
    await page.goto("/studio?start=draw");
    await page.getByTestId("schematic-import-cad").click();
    await page
      .getByTestId("import-cad-file-input")
      .setInputFiles("public/samples/sample-footprint.dxf");
    await expect(page.getByTestId("import-cad-preview")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Use as schematic" }).click();

    const importedFrom = page
      .getByRole("heading", { name: "Imported from" })
      .locator("..");
    await expect(importedFrom).toContainText("sample-footprint.dxf");
    await expect(importedFrom).toContainText("BIM_OUTLINE → boundary");

    const canvas = page.getByRole("application", { name: "Schematic drawing canvas" });
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    await page.getByTestId("schematic-tool-core").click();
    await page.mouse.move(box.x + box.width / 2 - 25, box.y + box.height / 2 - 25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 25);
    await page.mouse.up();

    await expect(page.getByText("Cores", { exact: true }).locator("..")).toContainText("1");
    await expect(page.getByRole("button", { name: "Generate BIM" })).toBeEnabled();
  });
});
