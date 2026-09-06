import { expect, test } from "@playwright/test";
import { seedSeenTours } from "./helpers/app-state";

test.beforeEach(async ({ page }) => { await seedSeenTours(page); });

test("TalTech keeps existing PV in the baseline and prices only ten additional modules", async ({ page, request }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await request.get("/api/reference-buildings/taltech-maemaja/dataset");
  expect(response.ok()).toBe(true);
  const dataset = await response.json();
  expect(dataset.isMetered).toBe(false);
  expect(dataset.meteredEnergy).toBeNull();
  expect(dataset.calibration.status).toBe("not_calibrated");
  expect(dataset.modelInputs.materials.renewable.solarPV).toMatchObject({ installed: true, capacity: 63.36, area: 0 });
  expect(dataset.measuredEnvelope.floorArea.value).toBe(3486.12);
  expect(dataset.modeledEnergy.hvac.deliveredKWhPerM2Year).toBeCloseTo(51.671850302, 6);
  expect(dataset.modeledEnergy.climate.status).toBe("assumed");
  expect(dataset.modeledEnergy.comparisonRating.officialCertificate).toBe(false);

  await page.goto("/models/taltech-maemaja");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: 60000 });
  await expect(viewer).toHaveAttribute("data-roof-planes", "ready");
  const solar = page.locator('[data-measure-chip^="solar-pv"]').first();
  await expect(solar).toContainText("4.0 kWp");
  if (await solar.getAttribute("data-measure-chosen") !== "true") await solar.click();
  await expect(viewer).toHaveAttribute("data-pv-drawn", "10");
  await expect(page.getByTestId("reference-pv-summary")).toContainText("10장 · 4.0 kWp");
  await page.getByTestId("reference-pv-utilisation").locator("summary").click();
  await expect(page.getByTestId("reference-pv-assumptions")).toContainText("59.39°");
  await expect(page.getByTestId("reference-pv-obstruction-scope")).toContainText("입력된 옥상 장애물을 반영");
  await page.getByTestId("reference-view-roof").click();
  await page.screenshot({ path: testInfo.outputPath("taltech-roof.png") });
  expect(errors).toEqual([]);
});

test("TalTech source services load while ambiguous flow remains unavailable", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/models/taltech-maemaja#layers");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: 60000 });
  await expect(page.getByTestId("reference-mep-counts")).toContainText("528개");
  await expect(page.getByTestId("reference-mep-counts")).toContainText("1,644개");
  await expect(page.getByTestId("reference-model-flow-absent")).toBeVisible();
  const layer = page.getByTestId("reference-model-layer-mep");
  await layer.click();
  await expect(viewer).toHaveAttribute("data-fabric-xray", "true");
  await expect(viewer).toHaveAttribute("data-service-layers-loaded", "mep", { timeout: 60000 });
  await page.getByTestId("reference-view-inspection").click();
  await page.screenshot({ path: testInfo.outputPath("taltech-mep.png") });
  await layer.click();
  await expect(viewer).toHaveAttribute("data-service-layers-loaded", "");
  expect(errors).toEqual([]);
});
