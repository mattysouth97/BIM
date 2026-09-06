import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { ReferenceBuildingManifest } from "../src/lib/reference-buildings/manifest";
import { seedSeenTours } from "./helpers/app-state";

const DETAIL_BUILDINGS = ["bs-medical-dental-clinic", "schependomlaan", "duplex-apartment", "fzk-haus", "kit-office"] as const;
const LOAD_TIMEOUT = 60_000;

function manifestFor(id: string): ReferenceBuildingManifest {
  return JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings", id, "manifest.json"), "utf8"));
}

test.beforeEach(async ({ page }) => { await seedSeenTours(page); });

for (const id of DETAIL_BUILDINGS) {
  test(`${id}: source details load by default and leave fabric opaque`, async ({ page }) => {
    test.setTimeout(90_000);
    const manifest = manifestFor(id);
    const layer = manifest.architecturalDetails!;
    const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/${id}/${layer.file}`), { timeout: LOAD_TIMEOUT });
    await page.goto(`/models/${id}`);
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    // Payload budgets are checked by decoding actual GLBs in the unit suite.
    // Browser responses may be streamed without Content-Length, and Chromium
    // can evict the large Clinic body from its inspector cache after loading.
    await expect(page.getByTestId("reference-details-status")).toHaveAttribute("data-status", "ready", { timeout: LOAD_TIMEOUT });
    await expect(page.getByTestId("reference-model-layer-details")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-details-visible", "true");
    await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-fabric-xray", "false");
    await expect(page.getByTestId("reference-details-source-summary")).toContainText(layer.elements.toLocaleString("en-US"));
    await expect(page.getByTestId("reference-mep-coverage")).toHaveAttribute("data-coverage", manifest.mepCoverage!.status);
    await expect(page.getByTestId("reference-mep-counts")).toContainText(manifest.mepCoverage!.typedElementCount.toLocaleString("en-US"));
  });
}

test("detail and service toggles remain independent, including fabric transparency", async ({ page }) => {
  test.setTimeout(90_000);
  const manifest = manifestFor("bs-medical-dental-clinic");
  const service = manifest.serviceLayers![0];
  await page.goto(`/models/${manifest.id}`);
  await expect(page.getByTestId("reference-details-status")).toHaveAttribute("data-status", "ready", { timeout: LOAD_TIMEOUT });
  const viewer = page.getByTestId("reference-model-viewer");
  const detailsToggle = page.getByTestId("reference-model-layer-details");
  const serviceToggle = page.getByTestId(`reference-model-layer-${service.id}`);
  await detailsToggle.click();
  await expect(viewer).toHaveAttribute("data-details-visible", "false");
  await expect(viewer).toHaveAttribute("data-fabric-xray", "false");
  await expect(serviceToggle).toHaveAttribute("aria-pressed", "false");
  await serviceToggle.click();
  await expect(viewer).toHaveAttribute("data-fabric-xray", "true");
  await detailsToggle.click();
  await expect(viewer).toHaveAttribute("data-details-visible", "true");
  await expect(serviceToggle).toHaveAttribute("aria-pressed", "true");
  await serviceToggle.click();
  await expect(serviceToggle).toHaveAttribute("aria-pressed", "false");
  await expect(viewer).toHaveAttribute("data-fabric-xray", "false");
  await expect(detailsToggle).toHaveAttribute("aria-pressed", "true");
});

test("Schependomlaan publishes source drainage and vents as a separate MEP layer", async ({ page }) => {
  test.setTimeout(90_000);
  const manifest = manifestFor("schependomlaan");
  const layer = manifest.serviceLayers!.find((entry) => entry.id === "source-services")!;
  await page.goto(`/models/${manifest.id}`);
  await expect(page.getByTestId("reference-details-status")).toHaveAttribute("data-status", "ready", { timeout: LOAD_TIMEOUT });
  const toggle = page.getByTestId("reference-model-layer-source-services");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/schependomlaan/${layer.file}`), { timeout: LOAD_TIMEOUT });
  await toggle.click();
  expect((await responsePromise).ok()).toBe(true);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toContainText("73");
  await expect(page.getByTestId("reference-model-layer-details")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-fabric-xray", "true");
  await expect(page.getByTestId("reference-mep-coverage")).toHaveAttribute("data-coverage", "source_geometry_published");
});

test("a failed detail GLB keeps the base model usable and can retry the same source", async ({ page }) => {
  test.setTimeout(90_000);
  let attempts = 0;
  await page.route("**/fzk-haus/architectural-details.glb", async (route) => {
    attempts += 1;
    if (attempts === 1) await route.fulfill({ status: 503, body: "Temporary source asset failure" });
    else await route.continue();
  });
  await page.goto("/models/fzk-haus");
  await expect(page.getByTestId("reference-details-status")).toHaveAttribute("data-status", "error", { timeout: LOAD_TIMEOUT });
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-model-loaded", "true");
  await expect(viewer.locator("canvas")).toBeVisible();
  const fabric = page.getByTestId("reference-model-layer-fabric");
  await fabric.click();
  await expect(fabric).toHaveAttribute("aria-pressed", "false");
  await fabric.click();
  await page.getByTestId("reference-details-retry").click();
  await expect(page.getByTestId("reference-details-status")).toHaveAttribute("data-status", "ready", { timeout: LOAD_TIMEOUT });
  expect(attempts).toBe(2);
  await expect(viewer).toHaveAttribute("data-fabric-xray", "false");
});

test("details disabled before the base model loads are fetched only when enabled", async ({ page }) => {
  test.setTimeout(90_000);
  const manifest = manifestFor("fzk-haus");
  let releaseBase!: () => void;
  const baseGate = new Promise<void>((resolve) => { releaseBase = resolve; });
  let detailRequests = 0;
  await page.route(`**/fzk-haus/${manifest.model.file}`, async (route) => { await baseGate; await route.continue(); });
  page.on("request", (request) => { if (request.url().endsWith("/fzk-haus/architectural-details.glb")) detailRequests += 1; });
  await page.goto("/models/fzk-haus", { waitUntil: "domcontentloaded" });
  // Roof data arrives through a client effect independently of the gated GLB.
  // Wait for hydration before clicking the server-rendered control.
  await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-roof-planes", "ready", { timeout: LOAD_TIMEOUT });
  const toggle = page.getByTestId("reference-model-layer-details");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  releaseBase();
  await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-model-loaded", "true", { timeout: LOAD_TIMEOUT });
  expect(detailRequests).toBe(0);
  await toggle.click();
  await expect(page.getByTestId("reference-details-status")).toHaveAttribute("data-status", "ready", { timeout: LOAD_TIMEOUT });
  expect(detailRequests).toBe(1);
});
