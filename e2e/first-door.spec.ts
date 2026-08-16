import { test, expect } from "@playwright/test";

test.describe("First door", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("demo door is the primary verb and opens the twin", async ({ page }) => {
    const demo = page.getByTestId("landing-demo-start");
    await expect(demo).toBeVisible();
    await expect(page.getByTestId("landing-layer-rail")).toBeVisible();
    await expect(page.getByTestId("landing-layer-all")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("heading", { level: 1, name: /BIMFIT/ })).toBeVisible();
    await expect(
      page.getByText("BIMFIT: Building Energy Retrofit Simulator"),
    ).toBeVisible();

    await demo.click();
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("button", { name: /디지털 트윈/ }),
    ).toHaveAttribute("aria-current", "step");
    await expect(page.getByText(/5단계/)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: "건축물대장" }),
    ).toHaveCount(0);
  });

  test("CAD door still lands on upload", async ({ page }) => {
    await page.getByTestId("landing-cad-start").click();
    await expect(page).toHaveURL(/\/building\/drawing/);
    await expect(
      page.getByRole("button", { name: /도면 업로드/ }),
    ).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("도면 업로드").first()).toBeVisible();
    await expect(page.getByTitle("데모 오피스 타워")).toHaveCount(0);
    await expect(page.getByTitle("도면에서 시작")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("건물 데이터 없음")).toHaveCount(0);
    await expect(page.getByText("간이 모델")).toBeVisible({ timeout: 15000 });
  });

  test("report takes the twin retrofit answer away", async ({ page }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /보고서/ }).click();
    await expect(page.getByText("개보수 권장 사항")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Fidelity Level 2/)).toHaveCount(0);
    await expect(page.getByText(/트윈에서 고른 투자 시나리오가 없습니다/)).toHaveCount(0);
    await expect(page.getByText("포트폴리오 NPV")).toBeVisible();
    await expect(page.getByText("에너지 감사 보고서")).toBeVisible();
  });

  test("sample drawing completes the CAD door into the twin", async ({ page }) => {
    await page.getByTestId("landing-cad-start").click();
    await expect(page.getByTestId("upload-sample-dxf")).toBeVisible();
    await page.getByTestId("upload-sample-dxf").click();
    await expect(page.getByText("외곽선 준비 완료")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("upload-continue").click();
    await expect(
      page.getByRole("button", { name: /디지털 트윈/ }),
    ).toHaveAttribute("aria-current", "step");
  });

  test("reopening keeps the CAPEX the person set", async ({ page }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    const tour = page.locator(".driver-popover");
    if (await tour.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(tour).toHaveCount(0);
    }
    const capex = page.locator("[data-twin-capex-input]");
    await capex.getByRole("button", { name: /^5억$/ }).click({ force: true });
    await expect(capex).toContainText("₩5억");
    await page.reload();
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("[data-twin-capex-input]")).toContainText("₩5억");
  });
});

test.describe("Twin on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("shows the measures the budget picked", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId("landing-demo-start").click();
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    const pop = page.locator(".driver-popover");
    if (await pop.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
    }
    await expect(page.locator("[data-twin-selected-measures]")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("[data-twin-selected-measures]")).toContainText(
      /예산 내 선택/,
    );
  });
});
