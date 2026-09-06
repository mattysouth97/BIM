import { test, expect } from "@playwright/test";

for (const id of ["bs-medical-dental-clinic", "schependomlaan", "duplex-apartment", "fzk-haus", "kit-office"]) {
  test(`${id}: thin-layer depth precision follows orbit and zoom`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/models/${id}#layers`);
    const viewer = page.getByTestId("reference-model-viewer");
    await expect(viewer).toHaveAttribute("data-model-loaded", "true", { timeout: 60000 });
    await expect(page.getByTestId("reference-details-status")).toHaveAttribute("data-status", "ready", { timeout: 60000 });
    await page.getByTestId("reference-view-inspection").click();
    const canvas = viewer.locator("canvas");
    await expect(canvas).toHaveAttribute("data-camera-near", /[0-9]/);
    const readRange = async () => ({ near: Number(await canvas.getAttribute("data-camera-near")), far: Number(await canvas.getAttribute("data-camera-far")) });
    const before = await readRange();
    expect(before.near).toBeGreaterThan(0.02);
    expect(before.far / before.near).toBeLessThan(100);
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -320);
    await expect.poll(async () => (await readRange()).near).toBeLessThan(before.near);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 95, box.y + box.height / 2 + 18, { steps: 12 });
    await page.mouse.up();
    await expect(viewer).toHaveAttribute("data-model-loaded", "true");
    const after = await readRange();
    expect(after.near).toBeGreaterThanOrEqual(0.02);
    expect(after.far).toBeGreaterThan(after.near);
    await page.screenshot({ path: `qa-evidence/shimmer-after-${id}.png` });
    expect(errors).toEqual([]);
  });
}
