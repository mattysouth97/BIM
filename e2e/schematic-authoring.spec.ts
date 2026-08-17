import { test, expect } from "@playwright/test";

test.describe("Schematic authoring", () => {
  test("columns and lights are placed on the plan and generate stays in the studio", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/studio?start=draw");
    await expect(page.getByRole("button", { name: "Draw schematic", pressed: true })).toBeVisible();
    await expect(page.getByTestId("schematic-tool-column")).toBeVisible();
    await expect(page.getByTestId("schematic-tool-lighting")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate BIM" })).toBeDisabled();

    const canvas = page.getByRole("application", { name: "Schematic drawing canvas" });
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 - 110);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 110);
    await page.mouse.up();

    const generate = page.getByRole("button", { name: "Generate BIM" });
    await expect(generate).toBeEnabled();

    await page.getByTestId("schematic-tool-column").click();
    await expect(page.getByTestId("schematic-placement-type")).toBeVisible();
    await page.mouse.click(box.x + box.width / 2 - 40, box.y + box.height / 2 - 20);

    await page.getByTestId("schematic-tool-lighting").click();
    await page.mouse.click(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10);

    await generate.click();
    await expect(page.getByRole("heading", { level: 1, name: "Untitled schematic" })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByRole("button", { name: "Open in workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Schematic", exact: true, pressed: true })).toBeVisible();
    await expect(page).toHaveURL(/\/studio/);
    await expect(page.getByTestId("schematic-tool-column")).toBeVisible();
    await page.screenshot({ path: "qa-evidence/schematic-authoring.png", fullPage: true });

    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.getByRole("button", { name: "3D", exact: true, pressed: true })).toBeVisible();
    await expect(page).toHaveURL(/\/studio/);
  });
});
