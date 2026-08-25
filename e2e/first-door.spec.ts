import { test, expect } from "@playwright/test";

import { seedSeenTours } from "./helpers/app-state";

test.describe("First door", () => {
  test.beforeEach(async ({ page }) => {
    await seedSeenTours(page);
    await page.goto("/");
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

  test("studio door is the generative-first primary CTA", async ({ page }) => {
    const studio = page.getByTestId("landing-studio-start");
    await expect(studio).toBeVisible();
    await expect(studio).toHaveAttribute("href", "/studio?start=draw");
    const importDoor = page.getByTestId("landing-import-start");
    await expect(importDoor).toBeVisible();
    await expect(importDoor).toHaveAttribute("href", "/studio?start=diagnose");

    await studio.click();
    await expect(page).toHaveURL(/\/studio\?start=draw/);
    await expect(
      page.getByRole("button", { name: "도면 그리기", pressed: true }),
    ).toBeVisible();
  });

  test("import door opens source-traceable energy diagnosis", async ({ page }) => {
    await page.getByTestId("landing-import-start").click();
    await expect(page).toHaveURL(/\/studio\?start=diagnose/);
    await expect(
      page.getByRole("button", { name: "에너지 진단", pressed: true }),
    ).toBeVisible();
    await expect(page.getByTestId("energy-diagnosis-workspace")).toBeVisible();
    await expect(page.getByTestId("drawing-set-input")).toHaveAttribute(
      "accept",
      /\.dwg.*\.dxf.*\.svg/,
    );
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

  test("DXF import is reviewed before schematic adoption", async ({ page }) => {
    await page.goto("/studio?start=draw");
    await expect(page.getByRole("button", { name: "Generate BIM" })).toBeDisabled();

    await page.getByTestId("schematic-import-cad").click();
    await expect(
      page.getByRole("heading", { name: "Import DWG/DXF/SVG as a schematic" }),
    ).toBeVisible();
    await page
      .getByTestId("import-cad-file-input")
      .setInputFiles("public/samples/sample-footprint.dxf");

    await expect(page.getByTestId("import-cad-preview")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/boundary from layer BIM_OUTLINE/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Use as schematic" })).toBeEnabled();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("import-cad-preview")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Generate BIM" })).toBeDisabled();
  });

  test("reopening keeps the CAPEX the person set", async ({ page }) => {
    await page.getByTestId("landing-demo-start").click();
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    const capex = page.locator("[data-twin-capex-input]");
    await capex.getByRole("button", { name: "₩5억", exact: true }).click();
    await expect(capex).toContainText("₩5억");
    await page.reload();
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("[data-twin-capex-input]")).toContainText("₩5억");
  });
});

test.describe("Twin on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("shows the measures the budget picked", async ({ page }) => {
    await seedSeenTours(page);
    await page.goto("/");
    await page.getByTestId("landing-demo-start").click();
    await expect(page.getByTitle("데모 오피스 타워")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("[data-twin-selected-measures]")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("[data-twin-selected-measures]")).toContainText(
      /예산 내 선택/,
    );
  });
});
