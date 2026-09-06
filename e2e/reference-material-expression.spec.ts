import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { ReferenceBuildingManifest } from "../src/lib/reference-buildings/manifest";
import { seedSeenTours } from "./helpers/app-state";

const BUILDINGS = ["bs-medical-dental-clinic", "schependomlaan", "duplex-apartment", "fzk-haus", "kit-office", "klassiqua-office-1970"];
const TIMEOUT = 60000;
const source = (id: string): ReferenceBuildingManifest => JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings", id, "manifest.json"), "utf8"));

test.beforeEach(async ({ page }) => { await seedSeenTours(page); });

for (const id of BUILDINGS) test(`${id}: source-bound material appearance loads by default`, async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/models/${id}#materials`);
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: TIMEOUT });
  await expect(viewer).toHaveAttribute("data-original-fabric-visible", "false");
  await expect(viewer).toHaveAttribute("data-material-fabric-visible", "true");
  await expect(page.getByTestId("reference-material-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("reference-material-canvas-label")).toContainText("재료 예시");
  await expect(page.getByTestId("reference-material-basis")).toContainText("실제 외부 마감은 확인되지 않았습니다");
  await page.getByTestId("reference-view-inspection").click();
  await page.screenshot({ path: testInfo.outputPath(`${id}-materials.png`) });
  expect(errors).toEqual([]);
});

test("material toggling preserves the base camera and remains independent of service x-ray", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/models/duplex-apartment#materials");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: TIMEOUT });
  await page.getByTestId("reference-view-roof").click();
  await page.getByTestId("reference-material-toggle").click();
  await expect(viewer).toHaveAttribute("data-original-fabric-visible", "true");
  await expect(viewer).toHaveAttribute("data-material-fabric-visible", "false");
  await expect(viewer).toHaveAttribute("data-model-loaded", "true");
  await expect(viewer).toHaveAttribute("data-view", "roof");
  await page.getByTestId("reference-info-tab-layers").click();
  const service = source("duplex-apartment").serviceLayers![0];
  await page.getByTestId(`reference-model-layer-${service.id}`).click();
  await expect(viewer).toHaveAttribute("data-fabric-xray", "true");
  await page.getByTestId("reference-info-tab-materials").click();
  await page.getByTestId("reference-material-toggle").click();
  await expect(viewer).toHaveAttribute("data-material-fabric-visible", "true", { timeout: TIMEOUT });
  await expect(viewer).toHaveAttribute("data-fabric-xray", "true");
  await expect(viewer).toHaveAttribute("data-view", "roof");
});

test("a real surface click opens its exact source assembly; an orbit drag does not select", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/models/fzk-haus");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: TIMEOUT });
  await page.getByTestId("reference-view-inspection").click();
  const canvas = viewer.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("reference-info-tab-overview")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("reference-material-selection")).toHaveCount(0);
  await page.getByTestId("reference-view-exterior").click();
  await canvas.click({ position: { x: box.width * 0.65, y: box.height * 0.61 } });
  await expect(page.getByTestId("reference-info-tab-materials")).toHaveAttribute("aria-selected", "true");
  const selected = page.getByTestId("reference-material-selection");
  const key = await selected.getAttribute("data-binding-key");
  const manifest = source("fzk-haus");
  const binding = manifest.materialFabric!.bindings.find((entry) => entry.key === key)!;
  expect(binding.assemblyRef).toBeTruthy();
  const assembly = manifest.assemblies!.find((entry) => entry.ref === binding.assemblyRef)!;
  const card = page.locator(`[data-construction-id="${assembly.id}"]`);
  await expect(card).toHaveAttribute("data-material-selected", "true");
  await expect(card.getByTestId("material-construction-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByTestId("material-layer-detail")).toContainText(binding.representativeLayer!.ref);
});

for (const failedAsset of ["material-fabric.glb", "color.jpg"]) test(`a failed ${failedAsset} keeps original fabric visible and retries`, async ({ page }) => {
  test.setTimeout(90000);
  let attempts = 0;
  let failing = true;
  const pattern = failedAsset === "material-fabric.glb" ? "**/fzk-haus/material-fabric.glb" : "**/textures/concrete_rough/color.jpg";
  await page.route(pattern, async (route) => {
    attempts += 1;
    // The material cards also use the colour image. Keep the outage in force
    // until Retry so a failed CSS image cannot consume the one failed request.
    if (failing) await route.fulfill({ status: 503, body: "Temporary material asset failure" });
    else await route.continue();
  });
  await page.goto("/models/fzk-haus#materials");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "error", { timeout: TIMEOUT });
  await expect(viewer).toHaveAttribute("data-original-fabric-visible", "true");
  await expect(viewer.locator("canvas")).toBeVisible();
  await page.getByTestId("reference-view-roof").click();
  await expect(viewer).toHaveAttribute("data-view", "roof");
  const failedAttempts = attempts;
  expect(failedAttempts).toBeGreaterThan(0);
  failing = false;
  await page.getByTestId("reference-material-retry").click();
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: TIMEOUT });
  await expect(viewer).toHaveAttribute("data-original-fabric-visible", "false");
  await expect(viewer).toHaveAttribute("data-material-fabric-visible", "true");
  expect(attempts).toBeGreaterThan(failedAttempts);
});

test("the original fabric stays visible until the material payload is ready", async ({ page }) => {
  test.setTimeout(90000);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/fzk-haus/material-fabric.glb", async (route) => { await gate; await route.continue(); });
  await page.goto("/models/fzk-haus#materials", { waitUntil: "domcontentloaded" });
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "loading", { timeout: TIMEOUT });
  await expect(viewer).toHaveAttribute("data-original-fabric-visible", "true");
  await expect(viewer).toHaveAttribute("data-material-fabric-visible", "false");
  release();
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: TIMEOUT });
  await expect(viewer).toHaveAttribute("data-original-fabric-visible", "false");
  await expect(viewer).toHaveAttribute("data-material-fabric-visible", "true");
});
