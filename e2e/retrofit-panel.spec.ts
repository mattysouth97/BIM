import { expect, test } from "@playwright/test";

for (const language of ["ko", "en"] as const) for (const width of [390, 1440]) {
  test(`retrofit drawers stack content and reflect selected PV work: ${language}, ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript((lang) => {
      localStorage.setItem("korea-building-info-storage", JSON.stringify({ state: { language: lang, hasSeenTour: true, hasSeenTwinTour: true }, version: 1 }));
    }, language);
    await page.goto("/models/bs-medical-dental-clinic");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-model-loaded", "true", { timeout: 60_000 });
    await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-roof-planes", "ready", { timeout: 60_000 });
    const workToggle = page.getByTestId("twin-panel-top-toggle");
    await workToggle.click();
    const work = page.getByTestId("twin-panel-top-content");
    const chips = work.locator("[data-measure-chip]");
    await expect(chips.first()).toBeVisible();
    // Explicitly choose the empty set, then PV alone. An economic recommendation
    // must not be silently substituted for the user's choice.
    const selected = work.locator('[data-measure-chip][aria-pressed="true"]');
    while (await selected.count()) await selected.first().click();
    await expect(work.getByTestId("retrofit-annual-saving")).toHaveAttribute("data-saving-krw", "0");
    const vertical = await chips.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, overflow: element.scrollWidth - element.clientWidth };
    }));
    for (let i = 1; i < vertical.length; i++) {
      expect(Math.abs(vertical[i].x - vertical[0].x)).toBeLessThan(1);
      expect(vertical[i].y).toBeGreaterThanOrEqual(vertical[i - 1].y + vertical[i - 1].height);
    }
    expect(vertical.every((box) => box.overflow <= 1)).toBe(true);
    const pv = work.locator('[data-measure-chip^="solar-pv-"]');
    await pv.click();
    await expect(pv).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => Number(await work.getByTestId("retrofit-annual-saving").getAttribute("data-saving-krw"))).toBeGreaterThan(0);
    await work.locator(".canvas-drawer-content").evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`work-${language}-${width}.png`) });

    await page.getByTestId("twin-panel-bottom-toggle").click();
    const energy = page.getByTestId("twin-panel-bottom-content");
    const outcomes = energy.getByTestId("retrofit-outcomes");
    await outcomes.scrollIntoViewIfNeeded();
    const values = async (key: string) => ({
      before: Number(await energy.getByTestId(`retrofit-${key}-before`).getAttribute("data-value")),
      after: Number(await energy.getByTestId(`retrofit-${key}-after`).getAttribute("data-value")),
    });
    for (const key of ["primary", "carbon"]) {
      const pair = await values(key);
      expect(pair.after, key).toBeLessThan(pair.before);
    }
    const site = await values("site");
    expect(site.after).toBe(site.before);
    const summary = energy.getByTestId("energy-baseline-summary");
    expect(await summary.evaluate((element) => getComputedStyle(element).flexDirection)).toBe("column");
    const corpus = energy.getByTestId("retrofit-corpus-position");
    await corpus.scrollIntoViewIfNeeded();
    await expect(corpus).toHaveAttribute("data-status", "unavailable");
    await expect(energy.getByTestId("retrofit-capital-verification")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await energy.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`energy-${language}-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("twin-panel-bottom-toggle")).toHaveAttribute("aria-expanded", "false");
  });
}
