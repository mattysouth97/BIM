import { test, expect } from "@playwright/test";

import { seedSeenTours } from "./helpers/app-state";

/**
 * The canonical workflow begins at the 건축물대장. The landing page IS the
 * register lookup: find the real building, and its register becomes a baseline
 * energy model. A drawing and the sample are ways into the same diagnosis and
 * sit underneath it, never beside it as equal choices.
 */
test.describe("First door", () => {
  test.beforeEach(async ({ page }) => {
    await seedSeenTours(page);
    await page.goto("/");
  });

  test("opens on the building register", async ({ page }) => {
    const main = page.getByRole("main");

    await expect(
      main.getByRole("heading", {
        level: 1,
        name: "BIMFIT: 건물 에너지 진단",
      }),
    ).toBeVisible();

    // The workflow's first step is on screen with nothing to click first.
    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible();
    await expect(page.getByTestId("ledger-lookup")).toBeVisible();
    await expect(page.getByRole("tab", { name: "지역으로" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "주소로" })).toBeVisible();
    // 시/도 → 시/군/구 → 법정동 is the actual first action.
    await expect(page.getByText("시/도 선택")).toBeVisible();
  });

  test("offers the sample and the drawing path beneath the register", async ({
    page,
  }) => {
    const sample = page.getByTestId("landing-sample-diagnostic");
    const drawing = page.getByTestId("landing-new-diagnostic");

    await expect(sample).toBeVisible();
    await expect(sample).toHaveAttribute(
      "href",
      "/diagnostics/new?method=ledger&building=demo",
    );
    await expect(drawing).toBeVisible();
    await expect(drawing).toHaveAttribute("href", "/diagnostics/new");

    // The retired product surfaces stay unlinked.
    await expect(page.locator('a[href^="/studio"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/building/demo"]')).toHaveCount(0);
  });

  test("keeps the persistent chrome and switches language", async ({
    page,
  }) => {
    const main = page.getByRole("main");
    const headerAction = page.getByTestId("header-new-diagnostic");

    await expect(headerAction).toBeVisible();
    await expect(headerAction).toHaveAttribute("href", "/diagnostics/new");
    await expect(
      page.getByRole("button", { name: /(라이트|다크) 모드/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "API 키 설정" }),
    ).toBeVisible();
    await expect(page.getByTestId("landing-layer-rail")).toBeVisible();

    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(
      main.getByRole("heading", {
        level: 1,
        name: "BIMFIT: Building Energy Diagnostic",
      }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "By district" })).toBeVisible();
    await expect(headerAction).toHaveAccessibleName("New Energy Diagnostic");
  });

  test("the sample reaches a diagnosed building from the landing page", async ({
    page,
  }) => {
    await page.getByTestId("landing-sample-diagnostic").click();
    await expect(page).toHaveURL(/method=ledger&building=demo/);
    await expect(page.getByTestId("results-at-a-glance")).toBeVisible({
      timeout: 60_000,
    });
  });

  test("the drawing path still reaches the input methods", async ({ page }) => {
    await page.getByTestId("landing-new-diagnostic").click();
    await expect(page).toHaveURL(/\/diagnostics\/new$/);
    await expect(page.getByTestId("diagnostic-method-upload")).toBeVisible();
  });
});

test.describe("First door on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("keeps the register lookup usable without sideways scroll", async ({
    page,
  }) => {
    await seedSeenTours(page);
    await page.goto("/");

    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible();
    await expect(page.getByTestId("landing-sample-diagnostic")).toBeVisible();
    await expect(page.getByTestId("header-new-diagnostic")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
