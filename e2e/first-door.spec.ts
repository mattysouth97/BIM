import { test, expect } from "@playwright/test";

import { seedSeenTours } from "./helpers/app-state";

test.describe("First door", () => {
  test.beforeEach(async ({ page }) => {
    await seedSeenTours(page);
    await page.goto("/");
  });

  test("presents one canonical diagnostic entry", async ({ page }) => {
    const main = page.getByRole("main");
    const primary = page.getByTestId("landing-new-diagnostic");
    const sample = page.getByTestId("landing-sample-diagnostic");
    const headerAction = page.getByTestId("header-new-diagnostic");

    await expect(
      main.getByRole("heading", {
        level: 1,
        name: "BIMFIT: 건물 에너지 진단",
      }),
    ).toBeVisible();
    await expect(primary).toBeVisible();
    await expect(primary).toHaveText("새 에너지 진단");
    await expect(primary).toHaveAttribute("href", "/diagnostics/new");
    await expect(primary).toHaveAttribute("data-variant", "default");

    await expect(sample).toBeVisible();
    await expect(sample).toHaveText("샘플 진단 체험");
    await expect(sample).toHaveAttribute(
      "href",
      "/diagnostics/new?method=sample",
    );
    await expect(sample).toHaveAttribute("data-variant", "link");

    await expect(headerAction).toBeVisible();
    await expect(headerAction).toHaveAttribute("href", "/diagnostics/new");
    await expect(headerAction).toHaveAttribute("data-variant", "outline");
    await expect(
      page.getByRole("button", { name: "Switch to English" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /(라이트|다크) 모드/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "API 키 설정" }),
    ).toBeVisible();

    await expect(page.getByTestId("landing-layer-rail")).toBeVisible();
    await expect(page.getByTestId("landing-layer-all")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator('a[href^="/studio"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/building/demo"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(
      main.getByRole("heading", {
        level: 1,
        name: "BIMFIT: Building Energy Diagnostic",
      }),
    ).toBeVisible();
    await expect(primary).toHaveText("New Energy Diagnostic");
    await expect(sample).toHaveText("Try sample diagnostic");
    await expect(headerAction).toHaveAccessibleName("New Energy Diagnostic");
  });

  test("starts a new energy diagnostic", async ({ page }) => {
    await page.getByTestId("landing-new-diagnostic").click();
    await expect(page).toHaveURL(/\/diagnostics\/new$/);
  });

  test("starts a sample through the same diagnostic route", async ({ page }) => {
    await page.getByTestId("landing-sample-diagnostic").click();
    await expect(page).toHaveURL(/\/diagnostics\/new\?method=sample$/);
  });
});

test.describe("First door on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("keeps the primary and persistent diagnostic actions usable", async ({
    page,
  }) => {
    await seedSeenTours(page);
    await page.goto("/");

    await expect(page.getByTestId("landing-new-diagnostic")).toBeVisible();
    await expect(page.getByTestId("landing-sample-diagnostic")).toBeVisible();
    await expect(page.getByTestId("header-new-diagnostic")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
