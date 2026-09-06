import { expect, test } from "@playwright/test";
import { seedSeenTours } from "./helpers/app-state";

test.beforeEach(async ({ page }) => { await seedSeenTours(page); });

test("the reachable language preference applies to category navigation and model information", async ({ page }) => {
  await page.addInitScript(() => {
    const stored = JSON.parse(localStorage.getItem("korea-building-info-storage")!);
    stored.state.language = "en";
    localStorage.setItem("korea-building-info-storage", JSON.stringify(stored));
  });
  await page.goto("/models/fzk-haus#materials");
  await expect(page.getByRole("tab", { name: "Materials", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("FZK");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("reference-info-panel-overview")).toContainText("They are not metered energy use");
  await expect(page.getByRole("button", { name: "Fit exterior", exact: true })).toBeVisible();
});

test("category links, keyboard navigation and Back preserve the selected material and panel scroll", async ({ page }) => {
  await page.goto("/models/fzk-haus?view=reference#materials");
  const tab = (section: string) => page.getByTestId(`reference-info-tab-${section}`);
  await expect(tab("materials")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-roof-planes", "ready", { timeout: 45000 });
  const panel = page.getByTestId("reference-info-panel-materials");
  const firstCard = panel.getByTestId("reference-material-construction").first();
  const layers = firstCard.getByRole("group", { name: "원본 재료층 선택" }).getByRole("button");
  const selected = layers.last();
  await selected.click();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await panel.evaluate((element) => { element.scrollTop = 180; });
  const scrollBefore = await panel.evaluate((element) => element.scrollTop);
  expect(scrollBefore).toBeGreaterThan(0);
  await tab("layers").click();
  await expect(page).toHaveURL(/\?view=reference#layers$/);
  await page.getByTestId("reference-model-layer-details").click();
  await tab("data").click();
  await expect(page.getByTestId("reference-dataset-downloads")).toBeVisible();
  await expect(page.getByTestId("reference-model-attribution")).toBeVisible();
  await page.goBack();
  await expect(tab("layers")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("reference-model-layer-details")).toHaveAttribute("aria-pressed", "false");
  await page.goBack();
  await expect(tab("materials")).toHaveAttribute("aria-selected", "true");
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  expect(await panel.evaluate((element) => element.scrollTop)).toBe(scrollBefore);
  await tab("materials").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("layers")).toBeFocused();
  await expect(tab("layers")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tab("data")).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await page.reload();
  await expect(tab("data")).toHaveAttribute("aria-selected", "true");
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`${viewport.width}px: the model and view controls remain on screen while information scrolls`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/models/fzk-haus");
    await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-model-loaded", "true", { timeout: 45000 });
    const topToggle = page.getByTestId("twin-panel-top-toggle");
    const bottomToggle = page.getByTestId("twin-panel-bottom-toggle");
    await expect(topToggle).toHaveAttribute("aria-expanded", viewport.width < 768 ? "false" : "true");
    await expect(bottomToggle).toHaveAttribute("aria-expanded", viewport.width < 768 ? "false" : "true");
    await expect(page.getByRole("tab", { name: "개요", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("reference-info-panel-overview")).toContainText("실측 에너지 사용량이 아닙니다");
    const canvas = page.getByTestId("reference-model-canvas");
    const before = await canvas.boundingBox();
    await page.getByTestId("reference-info-tab-materials").click();
    const panel = page.getByTestId("reference-info-panel-materials");
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const after = await canvas.boundingBox();
    expect(after).toEqual(before);
    expect(after!.height).toBeGreaterThanOrEqual(230);
    for (const locator of [canvas, page.getByTestId("reference-view-roof"), page.getByRole("tablist")]) {
      const bounds = await locator.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.y).toBeGreaterThanOrEqual(48);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await page.getByTestId("reference-view-roof").click();
    await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-view", "roof");
    await page.screenshot({ path: testInfo.outputPath(`information-${viewport.width}.png`) });
    if (viewport.width < 768) {
      await topToggle.click();
      await expect(topToggle).toHaveAttribute("aria-expanded", "true");
      await page.getByTestId("reference-info-tab-overview").click();
      await expect(topToggle).toHaveAttribute("aria-expanded", "true");
      await expect(bottomToggle).toHaveAttribute("aria-expanded", "false");
    }
  });
}
