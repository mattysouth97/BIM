import { test, expect, type Page } from "@playwright/test";

// Five gallery models ship a single architectural IFC and no services. They
// now offer a generated network instead — and what is under test is not that
// it draws, but that it never passes itself off as source geometry.

const NO_SOURCE_MEP = ["fzk-haus", "kit-office", "tum-fantasy-hotel-1"];
const HAS_SOURCE_MEP = ["bs-medical-dental-clinic", "duplex-apartment"];

async function openLayers(page: Page, id: string) {
  await page.goto(`/models/${id}`);
  await page.getByTestId("reference-info-tab-layers").click();
  await expect(page.getByTestId("reference-model-layers")).toBeVisible();
}

test.describe("inferred services", () => {
  for (const id of NO_SOURCE_MEP) {
    test(`${id}: offers a generated layer that declares itself`, async ({ page }) => {
      await openLayers(page, id);

      await expect(
        page.getByTestId("reference-model-layers").getByText("추정 설비 (원본 아님)"),
      ).toBeVisible();

      // The disclosure sits with the toggle, not behind a disclosure widget:
      // the claim has to travel with the control that draws the geometry.
      const note = page.getByTestId("reference-model-layer-inferred-mep-note");
      await expect(note).toBeVisible();
      const text = (await note.innerText()).replace(/\s+/g, " ");
      expect(text).toContain("원본 파일에는 설비");
      expect(text).toContain("실제 설치된 설비가 아닙니다");
    });
  }

  for (const id of HAS_SOURCE_MEP) {
    test(`${id}: states real services, so no generated layer is offered`, async ({ page }) => {
      await openLayers(page, id);
      // A building that states its own MEP must show that, never a guess.
      await expect(
        page.getByTestId("reference-model-layer-inferred-mep-note"),
      ).toHaveCount(0);
    });
  }
});
