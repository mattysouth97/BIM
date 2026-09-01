import { expect, test } from "@playwright/test";

import { seedSeenTours } from "./helpers/app-state";

/**
 * The evidence-to-CAD prompt module, end to end on the bundled sample building.
 *
 * What these tests protect is not that a drawing appears — it is that the
 * drawing arrives labelled as what it is. A reconstruction must reach the twin
 * through the ordinary DXF ingestion path, and must never be recorded as CAD
 * evidence on the way there.
 */

test.describe("evidence-to-CAD reconstruction", () => {
  test.beforeEach(async ({ page }) => {
    await seedSeenTours(page);
    await page.goto("/building/demo");
    await expect(page.locator("body")).toContainText("도면 업로드", {
      timeout: 60_000,
    });
    await page.locator('[data-step="upload"]').click();
    // The register drives every control, so wait for the module to say it has
    // finished gathering before any test presses the button.
    await expect(
      page.locator('[data-testid="cad-request-run"][data-evidence-ready="true"]'),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("offers the module and names the evidence it already holds", async ({
    page,
  }) => {
    await expect(page.getByTestId("cad-request-prompt")).toBeVisible();
    await expect(page.locator("body")).toContainText("도면이 없나요?");
    // It says up front that this is a reconstruction, not a survey.
    await expect(page.locator("body")).toContainText("추정 현황 복원");
    await expect(page.locator("body")).toContainText("건축물대장");
    await expect(page.locator("body")).toContainText("연대 코드표");
  });

  test("reconstructs from the register and reports its own QA", async ({
    page,
  }) => {
    await page.getByTestId("cad-request-run").click();

    const result = page.getByTestId("cad-request-result");
    await expect(result).toBeVisible({ timeout: 30_000 });
    // Automated QA runs on the written DXF, including a reopen through the
    // application's own importer. A FAIL here is a real defect.
    await expect(result).toContainText("0 FAIL");
    await expect(result).toContainText("면적 검증");
    await expect(result).toContainText("가정 대장");
    await expect(result).toContainText("현장 확인 우선순위");
  });

  test("reads a measured statement and grades it above a belief", async ({
    page,
  }) => {
    await page
      .getByTestId("cad-request-prompt")
      .fill("정면 폭 20m 를 줄자로 실측했습니다. 주 출입구는 남쪽입니다.");
    await page.getByTestId("cad-request-run").click();

    const result = page.getByTestId("cad-request-result");
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toContainText("사용자 진술 해석");
    await expect(result).toContainText("A-VERIFIED");
  });

  test("the drawing reaches the twin through the ordinary import path", async ({
    page,
  }) => {
    await page.getByTestId("cad-request-run").click();
    await expect(page.getByTestId("cad-request-result")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("cad-request-use").click();

    // Read back out of the generated DXF by the same parser an upload uses —
    // the reserved outline layer means no layer picker is needed.
    await expect(page.locator("body")).toContainText("복원 외곽선 준비 완료");
    await expect(page.locator("body")).toContainText("BIM_OUTLINE");
    await expect(page.locator("body")).toContainText(
      "실측 도면이 아니며",
    );
    await expect(page.getByTestId("upload-continue")).toBeEnabled();
  });

  test("a reconstruction is never recorded as CAD evidence", async ({
    page,
  }) => {
    await page.getByTestId("cad-request-run").click();
    await expect(page.getByTestId("cad-request-result")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("cad-request-use").click();
    await page.getByTestId("upload-continue").click();

    const provenance = await page.evaluate(() => {
      const raw = localStorage.getItem("bim-twin-provenance");
      return raw ? JSON.parse(raw) : null;
    });

    const entries = Object.values(
      (provenance?.state?.byPk ?? {}) as Record<
        string,
        { hasCadFootprint: boolean; hasCadPlan: boolean; reconstructedFootprint?: boolean }
      >,
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.hasCadFootprint).toBe(false);
      expect(entry.hasCadPlan).toBe(false);
      expect(entry.reconstructedFootprint).toBe(true);
    }

    // The footprint itself did reach the recipe store, so the twin is better
    // off than with the era rectangle — it is only the LABEL that is honest.
    const rings = await page.evaluate(() => {
      const raw = localStorage.getItem("bim-recipe-overrides");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        state?: { overrides?: Record<string, { footprintPolygon?: number[][][] }> };
      };
      const overrides = Object.values(parsed.state?.overrides ?? {});
      return overrides.find((o) => o.footprintPolygon)?.footprintPolygon ?? null;
    });
    expect(rings?.[0]?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
