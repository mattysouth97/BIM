import { test, expect } from "@playwright/test";

import { seedSeenTours } from "./helpers/app-state";

/**
 * The canonical workflow begins at the 건축물대장: find the real building, and
 * its register becomes a baseline energy model. A drawing and the sample are
 * ways into the same diagnosis and sit underneath it, never beside it as equal
 * choices.
 *
 * That sheet used to be the landing page. `/` is a gallery of the models the
 * project has taken in, so the sheet has its own address now — and these tests
 * enter through it, because the door itself is what they are about. The gallery
 * has its own describe at the bottom of this file.
 */
const REGISTER_URL = "/diagnostics/new?method=ledger";
test.describe("First door", () => {
  test.beforeEach(async ({ page }) => {
    await seedSeenTours(page);
    await page.goto(REGISTER_URL);
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
    const drawing = page.getByTestId("diagnostic-method-upload");

    await expect(sample).toBeVisible();
    await expect(sample).toHaveAttribute("href", "/building/demo");
    await expect(drawing).toBeVisible();
    await expect(drawing).toHaveAttribute(
      "href",
      "/diagnostics/new?method=upload",
    );

    // The retired product surfaces stay unlinked.
    await expect(page.locator('a[href^="/studio"]')).toHaveCount(0);
  });

  test("keeps the persistent chrome and switches language", async ({
    page,
  }) => {
    const main = page.getByRole("main");
    const headerAction = page.getByTestId("header-new-diagnostic");

    await expect(headerAction).toBeVisible();
    await expect(headerAction).toHaveAttribute("href", REGISTER_URL);
    await expect(
      page.getByRole("button", { name: /(라이트|다크) 모드/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "API 키 설정" }),
    ).toBeVisible();
    await expect(page.locator("img.landing-plate")).toBeVisible();

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

  test("the sample reaches a diagnosed building from the register sheet", async ({
    page,
  }) => {
    await page.getByTestId("landing-sample-diagnostic").click();
    await expect(page).toHaveURL(/\/building\/demo$/);
    await expect(
      page.getByRole("button", { name: /디지털 트윈|Twin/ }).first(),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("the drawing path goes straight to drawing, not to another menu", async ({
    page,
  }) => {
    await page.getByTestId("diagnostic-method-create").click();
    await expect(page).toHaveURL(/method=create/);
    await expect(page.getByTestId("diagnostic-geometry-editor")).toBeVisible({
      timeout: 60_000,
    });
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
    await page.goto(REGISTER_URL);

    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible();
    await expect(page.getByTestId("landing-sample-diagnostic")).toBeVisible();
    await expect(page.getByTestId("header-new-diagnostic")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("Landing gallery", () => {
  test.beforeEach(async ({ page }) => {
    await seedSeenTours(page);
    await page.goto("/");
  });

  test("shows the models and nothing else", async ({ page }) => {
    const gallery = page.getByTestId("landing-gallery");
    await expect(gallery).toBeVisible();

    // One model so far: the clinic being ingested.
    await expect(page.getByTestId("gallery-item-clinic")).toBeVisible();
    await expect(gallery.locator("> li")).toHaveCount(1);

    // The register sheet's furniture is gone from this page entirely.
    await expect(page.getByTestId("landing-ledger-lookup")).toHaveCount(0);
    await expect(page.getByTestId("diagnostic-method-upload")).toHaveCount(0);
    await expect(page.getByTestId("landing-sample-diagnostic")).toHaveCount(0);
  });

  test("carries no background image", async ({ page }) => {
    // The plate was the landing's hero render. It is not merely hidden — the
    // page must not request an image at all, so a leftover <img> would fail
    // here even if CSS had made it invisible.
    await expect(page.locator("img.landing-plate")).toHaveCount(0);
    await expect(page.locator("main img")).toHaveCount(0);

    const backgrounds = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main, main *"))
        .map((el) => getComputedStyle(el).backgroundImage)
        .filter((value) => value.includes("url(")),
    );
    expect(backgrounds).toEqual([]);
  });

  test("strips the diagnostic action and the API key control", async ({ page }) => {
    // Asked for explicitly: the gallery carries neither. This is the sharpest
    // edge of the gallery decision, so it is pinned rather than left implicit —
    // from `/` the register search is reachable only by URL or by first
    // leaving the page via the wordmark.
    await expect(page.getByTestId("header-new-diagnostic")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "API 키 설정" })).toHaveCount(0);
  });

  test("the wordmark is the way off the gallery, and the door is still there", async ({
    page,
  }) => {
    // Not a redundant URL check: it is the only navigation the gallery has, so
    // if it broke there would be no way out of `/` at all.
    await expect(page.getByRole("link", { name: "BIMFIT 홈" })).toBeVisible();

    await page.goto("/diagnostics/new?method=ledger");
    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible();
    await expect(page.getByTestId("header-new-diagnostic")).toBeVisible();
  });
});
