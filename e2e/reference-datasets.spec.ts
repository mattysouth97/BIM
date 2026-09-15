import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { REFERENCE_BUILDING_IDS } from "../src/lib/reference-buildings/manifest";

/**
 * Models that publish source geometry and no energy at all, each for a stated
 * reason recorded in its build definition:
 *
 * - both TUM hotels: fictional student designs whose exterior-envelope
 *   classification is unresolved, so no baseline is calculated.
 * - West Riverside Hospital: the publisher's model card states there is no
 *   IfcSpace in any of its seven discipline files, so there is no conditioned
 *   area to divide by.
 *
 * - Sixty5: its source DOES state IfcSpace, so this one is a limitation of what
 *   has been established rather than of the source — exterior-envelope
 *   classification has not been done for it, and a grade struck on an
 *   unresolved envelope would be fabricated.
 *
 * Every other model must carry modeled energy. Adding an id here is a
 * decision that a building legitimately cannot be graded — not a way to get
 * a failing dataset past this test.
 */
const GEOMETRY_ONLY = [
  "tum-fantasy-hotel-1",
  "tum-fantasy-hotel-2",
  "west-riverside-hospital",
  "sixty5",
];

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
    // Geometry-only models carry no energy at all. Pinned by id rather than
    // inferred from the payload: reading "no energy" off the dataset and then
    // asserting the no-energy shape would pass for a model that lost its
    // energy by accident. This list is the set allowed to have none.
    if (GEOMETRY_ONLY.includes(dataset.id)) {
      expect(dataset.modeledEnergy).toBeNull();
      expect(dataset.modelInputs).toBeNull();
      expect(dataset.measuredEnvelope.status).toBe("unresolved");
      expect(dataset.assumptions).toEqual([]);
    } else {
      expect(dataset.modeledEnergy.status).toBe("modeled_not_metered");
      expect(dataset.assumptions.length).toBeGreaterThan(0);
    }
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
  await page.getByTestId("twin-panel-top-toggle").click();
  const solar = page.getByTestId("twin-panel-top-content").locator('[data-measure-chip^="solar-pv"]').first();
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
