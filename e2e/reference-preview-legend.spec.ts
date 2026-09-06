import { expect, test } from "@playwright/test";
import { seedSeenTours } from "./helpers/app-state";

test("desktop proposal details remain clickable between the open energy panels", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedSeenTours(page);
  await page.goto("/models/bs-medical-dental-clinic");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-model-loaded", "true", { timeout: 60_000 });
  const legend = page.getByTestId("reference-retrofit-legend");
  const toggle = legend.getByRole("button");
  const top = page.locator('[data-twin-panel="top"]');
  const bottom = page.locator('[data-twin-panel="bottom"]');
  await expect(page.getByTestId("twin-panel-top-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("twin-panel-bottom-toggle")).toHaveAttribute("aria-expanded", "true");
  await toggle.click(); // Real pointer action, with the default HUD still open.
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => {
    const [caption, upper, lower] = await Promise.all([legend.boundingBox(), top.boundingBox(), bottom.boundingBox()]);
    return !!caption && !!upper && !!lower && caption.y >= upper.y + upper.height && caption.y + caption.height <= lower.y;
  }).toBe(true);
  await expect(legend.getByRole("region")).toContainText("kWp");
  await page.screenshot({ path: testInfo.outputPath("proposal-desktop-open-hud.png") });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("twin-panel-bottom-toggle").click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("mobile proposal caption stays compact and preserves detail state while inspecting the model", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSeenTours(page);
  await page.addInitScript(() => {
    const stored = JSON.parse(localStorage.getItem("korea-building-info-storage")!);
    stored.state.language = "en";
    localStorage.setItem("korea-building-info-storage", JSON.stringify(stored));
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/models/klassiqua-office-1970#materials");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: 60_000 });
  const legend = page.getByTestId("reference-retrofit-legend");
  const toggle = legend.getByRole("button");
  const details = legend.getByRole("region", { name: "Proposal preview details", includeHidden: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toContainText("Proposed · not built");
  await expect(details).toBeHidden();
  const compact = (await legend.boundingBox())!;
  const canvas = (await viewer.locator("canvas").boundingBox())!;
  expect(compact.height).toBeLessThanOrEqual(64);
  expect(compact.height / canvas.height).toBeLessThan(0.28);
  await page.screenshot({ path: testInfo.outputPath("proposal-mobile-collapsed.png") });

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(details).toBeVisible();
  await expect(details).toContainText("not yet built");
  const count = Number(await legend.getAttribute("data-pv-modules"));
  expect(count).toBeGreaterThan(0);
  await expect(viewer).toHaveAttribute("data-pv-drawn", String(count));
  await expect(details).toContainText(`${count} modules`);
  const capacity = /([\d.]+) kWp/.exec(await details.innerText());
  expect(Number(capacity?.[1])).toBeCloseTo(count * 0.4, 5);
  await expect(details).toContainText("no module fits after setbacks / clearances");
  await expect(details).toContainText("this file carries no such discipline model");
  const detailedText = await details.innerText();
  await page.getByTestId("reference-view-roof").click();
  await page.getByTestId("reference-info-tab-layers").click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => details.innerText()).toBe(detailedText);
  await page.screenshot({ path: testInfo.outputPath("proposal-mobile-expanded.png") });

  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toContainText("Proposed · not built");
  await expect(details).toBeHidden();
  await expect(viewer).toHaveAttribute("data-pv-drawn", String(count));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
