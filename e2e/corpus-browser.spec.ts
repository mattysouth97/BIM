import { expect, test } from "@playwright/test";
import { recordFixture, releaseFixture } from "../src/components/corpus/__tests__/fixtures";

for (const language of ["ko", "en"] as const) for (const width of [390, 1440]) {
  test(`read-only corpus API presentation: ${language}, ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript((lang) => { localStorage.setItem("korea-building-info-storage", JSON.stringify({ state: { language: lang, hasSeenTour: true }, version: 1 })); }, language);
    await page.route("**/api/corpus/releases", (route) => route.fulfill({ json: { releases: [releaseFixture] } }));
    const queries: string[] = [];
    await page.route("**/api/corpus/records?*", (route) => {
      queries.push(route.request().url());
      const params = new URL(route.request().url()).searchParams;
      const second = params.get("page") === "2";
      return route.fulfill({ json: { releaseId: releaseFixture.releaseId, records: [recordFixture(second ? 21 : 1)], total: 21, page: second ? 2 : 1, pageSize: 20, totalPages: 2 } });
    });
    await page.goto("/corpus");
    await expect(page.getByTestId("corpus-record")).toBeVisible();
    await page.getByRole("button", { name: language === "ko" ? "다음" : "Next", exact: true }).click();
    await expect(page.getByTestId("corpus-record")).toContainText(recordFixture(21).id);
    await page.getByTestId("corpus-region").selectOption("26");
    await page.getByTestId("corpus-use").selectOption("03000");
    await page.getByTestId("corpus-era").selectOption("post-2016");
    await page.getByTestId("corpus-search").fill("kr-ledger-123");
    await page.getByRole("button", { name: language === "ko" ? "검색" : "Search", exact: true }).click();
    await expect.poll(() => queries.at(-1)).toContain("q=kr-ledger-123");
    expect(queries.at(-1)).toContain("region=26"); expect(queries.at(-1)).toContain("useType=03000"); expect(queries.at(-1)).toContain("era=post-2016"); expect(queries.at(-1)).toContain("page=1");
    await page.getByTestId("corpus-release-evidence").locator("summary").click();
    await page.getByTestId("corpus-record").locator("summary").click();
    await expect(page.getByText("wallUValue", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const clipped = await page.getByTestId("corpus-browser").locator("p, h1, h2, h3, dt, dd, a, li").evaluateAll((elements) => elements.filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
    expect(clipped).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`corpus-${language}-${width}.png`), fullPage: true });
  });
}

test("unconfigured corpus API reports unavailable without substitute data", async ({ page }) => {
  await page.route("**/api/corpus/releases", (route) => route.fulfill({ status: 503, json: { error: "corpus_unavailable" } }));
  await page.goto("/corpus");
  await expect(page.getByTestId("corpus-unavailable")).toBeVisible();
  await expect(page.getByTestId("corpus-record")).toHaveCount(0);
});
