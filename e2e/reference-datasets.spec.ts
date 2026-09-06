import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { REFERENCE_BUILDING_IDS } from "../src/lib/reference-buildings/manifest";

test("catalogue downloads preserve provenance and distinguish modeled energy from meters", async ({ page, request }) => {
  await page.goto("/");
  const downloads = page.getByTestId("reference-dataset-downloads");
  await expect(downloads).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloads.locator('a[href="/api/reference-buildings/datasets"]').click(),
  ]);
  const file = await download.path();
  expect(file).not.toBeNull();
  const catalogue = JSON.parse(await readFile(file!, "utf8"));
  expect(catalogue.datasetCount).toBe(REFERENCE_BUILDING_IDS.length);
  expect(catalogue.datasets.map((dataset: { id: string }) => dataset.id).sort()).toEqual([...REFERENCE_BUILDING_IDS].sort());
  for (const dataset of catalogue.datasets) {
    expect(dataset.isMetered).toBe(false);
    expect(dataset.meteredEnergy).toBeNull();
    expect(dataset.modeledEnergy.status).toBe("modeled_not_metered");
    expect(dataset.assumptions.length).toBeGreaterThan(0);
    expect(dataset.source.licenceAsDeclared).toBeTruthy();
    const source = await request.get(dataset.source.manifestUrl);
    expect(source.ok()).toBe(true);
    const actualHash = createHash("sha256").update(await source.body()).digest("hex");
    expect(dataset.integrity.manifestSha256).toBe(actualHash);
    const { integrity, ...payload } = dataset;
    expect(integrity.datasetPayloadSha256).toBe(createHash("sha256").update(JSON.stringify(payload)).digest("hex"));
  }
});

test("model-page download is the published baseline even after a retrofit selection", async ({ page }) => {
  await page.goto("/models/fzk-haus");
  await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-roof-planes", "ready", { timeout: 45000 });
  const solar = page.locator('[data-measure-chip^="solar-pv"]').first();
  if (await solar.getAttribute("data-measure-chosen") !== "true") await solar.click();
  await page.getByTestId("reference-info-tab-data").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("reference-dataset-downloads").locator('a[href="/api/reference-buildings/fzk-haus/dataset"]').click(),
  ]);
  const file = await download.path();
  expect(file).not.toBeNull();
  const dataset = JSON.parse(await readFile(file!, "utf8"));
  expect(dataset.scope).toBe("published_baseline");
  expect(dataset.id).toBe("fzk-haus");
  expect(dataset.building.modelContext.classification).toBe("synthetic_example");
  expect(dataset.modelInputs.materials.renewable.solarPV.installed).toBe(false);
  expect(dataset.modelInputs.materials.renewable.solarPV.capacity).toBe(0);
});
