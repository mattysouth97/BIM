import { expect, test } from "@playwright/test";

for (const language of ["ko", "en"] as const) {
  for (const width of [390, 768, 1440]) {
    test(`gallery keeps complete evidence and aligned cards: ${language}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((locale) => {
        localStorage.setItem("korea-building-info-storage", JSON.stringify({
          state: { language: locale }, version: 1,
        }));
      }, language);
      await page.goto("/");
      const cards = page.locator('[data-testid="landing-gallery"] article');
      await expect(cards.first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await page.evaluate(() => document.fonts.ready);

      const geometry = await cards.evaluateAll((elements) => elements.map((card) => {
        const bounds = card.getBoundingClientRect();
        const offset = (selector: string) => card.querySelector(selector)!.getBoundingClientRect().top - bounds.top;
        const copy = [...card.querySelectorAll<HTMLElement>("h2, p, dt, dd")];
        return {
          id: card.getAttribute("data-testid"),
          height: bounds.height,
          titleTop: offset("header"),
          figuresTop: offset("dl"),
          footerTop: offset("footer"),
          clipped: copy.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).map((element) => element.textContent),
          titleFont: getComputedStyle(card.querySelector("h2")!).fontFamily,
        };
      }));
      expect(geometry.length).toBeGreaterThan(1);
      for (const key of ["height", "titleTop", "figuresTop", "footerTop"] as const) {
        const values = geometry.map((card) => card[key]);
        expect(Math.max(...values) - Math.min(...values), `${key}: ${JSON.stringify(geometry)}`).toBeLessThan(1);
      }
      for (const card of geometry) {
        expect(card.clipped, card.id ?? "card").toEqual([]);
        expect(card.titleFont).toContain("Geist");
        expect(card.titleFont).not.toContain("Fraunces");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.locator('a[href^="/diagnostics"]')).toHaveCount(0);
    });
  }
}

test("gallery card opens the named building and supports keyboard focus", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const modelLink = page.getByTestId("gallery-item-kit-office-link");
  await modelLink.focus();
  await expect(modelLink).toBeFocused();
  await modelLink.press("Enter");
  await expect(page).toHaveURL(/\/models\/kit-office$/, { timeout: 30_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
});
