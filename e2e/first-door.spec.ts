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
    await expect(page.getByRole("heading", { level: 1, name: "BIMFIT" })).toBeVisible();
    await expect(page.getByText(/3D 트윈/)).toBeVisible();

    await demo.click();
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(page.getByText("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
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
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(
      page.getByRole("button", { name: /도면 업로드/ }),
    ).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("도면 업로드").first()).toBeVisible();
    await expect(page.getByText("건물 데이터 없음")).toHaveCount(0);
    await expect(page.getByText("간이 모델")).toBeVisible({ timeout: 15000 });
  });

  test("report takes the twin retrofit answer away", async ({ page }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page).toHaveURL(/\/building\/demo/);
    await expect(page.getByText("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /보고서/ }).click();
    await expect(page.getByText("개보수 권장 사항")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Fidelity Level 2/)).toHaveCount(0);
    await expect(page.getByText(/트윈에서 고른 투자 시나리오가 없습니다/)).toHaveCount(0);
    await expect(page.getByText("포트폴리오 NPV")).toBeVisible();
  });
});
