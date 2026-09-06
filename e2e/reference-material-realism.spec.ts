import path from "node:path";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { seedSeenTours } from "./helpers/app-state";

// Reuse the bundler pinned by the project's existing Wrangler dev dependency.
// pnpm does not expose transitive dependencies at the workspace root.
const { buildSync } = createRequire(require.resolve("wrangler/package.json"))("esbuild") as {
  buildSync(options: { entryPoints: string[]; alias: Record<string, string>; bundle: boolean; write: boolean; format: string; globalName: string; platform: string }): { outputFiles: { text: string }[] };
};

test("material sampling is identical for metre geometry and millimetre node/instance placements", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const result = buildSync({
    entryPoints: [path.join(process.cwd(), "e2e/helpers/material-render-fixture.ts")],
    alias: { "@": path.join(process.cwd(), "src") }, bundle: true, write: false,
    format: "iife", globalName: "MaterialProbe", platform: "browser",
  });
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: result.outputFiles[0].text });
  const pixels = await page.evaluate(() => (window as unknown as {
    MaterialProbe: { compareMaterialUnits(): { colours: number; results: { maxChannelDifference: number; changedChannels: number }[] } };
  }).MaterialProbe.compareMaterialUnits());
  expect(pixels.colours).toBeGreaterThan(30); // A missing/black/averaged texture cannot pass equality.
  expect(pixels.results).toEqual(Array.from({ length: 3 }, () => ({ maxChannelDifference: 0, changedChannels: 0 })));
  expect(errors).toEqual([]);
});

for (const id of ["schependomlaan", "bs-medical-dental-clinic", "klassiqua-office-1970"]) test(`${id}: material detail remains stable through a close orbit`, async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text()); });
  await seedSeenTours(page);
  await page.goto(`/models/${id}#materials`);
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: 60000 });
  await page.getByTestId("reference-view-inspection").click();
  const box = (await viewer.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.mouse.wheel(0, -230);
  await expect(viewer).toHaveAttribute("data-material-status", "ready");
  await page.screenshot({ path: testInfo.outputPath(`${id}-near.png`) });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.58, { steps: 16 });
  await page.mouse.up();
  await page.screenshot({ path: testInfo.outputPath(`${id}-orbit.png`) });
  await expect(viewer).toHaveAttribute("data-material-fabric-visible", "true");
  expect(errors).toEqual([]);
});

test("material appearance remains usable beside the model on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSeenTours(page);
  await page.goto("/models/klassiqua-office-1970#materials");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: 60000 });
  await expect(page.getByTestId("twin-panel-top-content")).toBeHidden();
  await expect(page.getByTestId("twin-panel-bottom-content")).toBeHidden();
  await expect(viewer.locator("canvas")).toBeVisible();
  const toggle = page.getByTestId("reference-material-toggle");
  await toggle.click();
  await expect(viewer).toHaveAttribute("data-original-fabric-visible", "true");
  await toggle.click();
  await expect(viewer).toHaveAttribute("data-material-fabric-visible", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("klassiqua-material-mobile.png") });
});
