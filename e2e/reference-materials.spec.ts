import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { seedSeenTours } from "./helpers/app-state";

type SourceLayer = { name: string; thicknessM: number; ref: string };
type SourceAssembly = { id: string; layers: SourceLayer[] };
type SourceManifest = { assemblies: SourceAssembly[] };

const CASES = [
  { id: "bs-medical-dental-clinic", cards: 7, assembly: "assembly-basic-wall-exterior-insul-panel-on-mtl-stud", selected: 3, sample: "framing" },
  { id: "schependomlaan", cards: 12, assembly: "assembly-ifc-dakplaat-geisoleerd-rc-4-00", selected: 1, sample: "fibre" },
  { id: "duplex-apartment", cards: 3, assembly: "assembly-basic-wall-exterior-brick-on-block", selected: 2, sample: "foam" },
  { id: "fzk-haus", cards: 4, assembly: "assembly-leichtbeton-102890359-0-3", selected: 0, sample: "concrete" },
  { id: "kit-office", cards: 4, assembly: "assembly-kalksandstein-2816491304-0-3", selected: 0, sample: "masonry" },
] as const;

for (const building of CASES) {
  test(`${building.id}: material layers reproduce the source and explain their thermal assumption`, async ({ page }, testInfo) => {
    test.setTimeout(75_000);
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings", building.id, "manifest.json"), "utf8")) as SourceManifest;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await seedSeenTours(page);
    await page.goto(`/models/${building.id}`);
    await page.bringToFront();
    const viewer = page.getByTestId("reference-model-viewer");
    await expect(viewer).toHaveAttribute("data-model-loaded", "true", { timeout: 45_000 });
    const section = page.getByTestId("reference-model-constructions");
    await section.scrollIntoViewIfNeeded();
    await expect(section).toContainText("열전도율 λ와 공기층 R은 가정");
    const cards = section.getByTestId("reference-material-construction");
    await expect(cards).toHaveCount(building.cards);

    // Read each displayed set against the raw artifact, independently of the
    // solver and UI mapping table. The source name's own mm is not a quantity.
    for (const card of await cards.all()) {
      const id = await card.getAttribute("data-construction-id");
      const source = manifest.assemblies.find((assembly) => assembly.id === id);
      expect(source, `Displayed construction ${id} must occur in its source`).toBeDefined();
      const toggle = card.getByTestId("material-construction-toggle");
      if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
      await expect(card.getByTestId("material-appearance-basis")).toContainText("실제 색상·마감·시공 방향은 확인되지 않았습니다");
      const layers = card.getByRole("group", { name: "원본 재료층 선택" }).getByRole("button");
      await expect(layers).toHaveCount(source!.layers.length);
      for (const [index, layer] of source!.layers.entries()) {
        const row = layers.nth(index);
        await expect(row).toContainText(layer.name);
        const thickness = Number((await row.innerText()).match(/([\d.]+) mm$/)?.[1]);
        expect(thickness).toBe(Number((layer.thicknessM * 1000).toFixed(1)));
      }
      if (id !== building.assembly) await toggle.click();
    }

    const card = section.locator(`[data-construction-id="${building.assembly}"]`);
    const source = manifest.assemblies.find((assembly) => assembly.id === building.assembly)!;
    const selectedLayer = source.layers[building.selected];
    const layerButton = card.getByRole("group", { name: "원본 재료층 선택" }).getByRole("button").nth(building.selected);
    await layerButton.click();
    await expect(layerButton).toHaveAttribute("aria-pressed", "true");
    const detail = card.getByTestId("material-layer-detail");
    await expect(detail).toContainText(selectedLayer.name);
    await expect(detail).toContainText(selectedLayer.ref);
    await expect(detail).toContainText("열 계산에 사용한 가정");
    await expect(detail.locator("[data-material-sample]")).toHaveAttribute("data-material-sample", building.sample);
    await expect(card).toContainText("건물 에너지 입력과 다를 수 있습니다");
    const detailText = await detail.innerText();
    const resistance = Number(detailText.match(/R ([\d.]+) m²K\/W/)?.[1]);
    const lambda = detailText.match(/λ ([\d.]+) W\/mK/);
    if (lambda) expect(resistance).toBeCloseTo(selectedLayer.thicknessM / Number(lambda[1]), 3);
    else expect(detailText).toContain("고정 R 0.180");
    const percent = Number((await detail.getByTestId("material-resistance-share").innerText()).match(/([\d.]+)%/)?.[1]);
    const u = Number((await card.getByTestId("material-construction-toggle").innerText()).match(/U ([\d.]+)/)?.[1]);
    // U/R each display three decimals and the percentage one. Derive the
    // allowed interval from those rounding units, not a loose fixed tolerance.
    const roundingBound = 100 * (resistance * 0.0005 + u * 0.0005 + 0.0005 ** 2) + 0.05;
    expect(Math.abs(percent - resistance * u * 100)).toBeLessThanOrEqual(roundingBound);
    await detail.screenshot({ path: testInfo.outputPath(`${building.id}-material.png`) });
    await page.screenshot({ path: testInfo.outputPath(`${building.id}-material-workspace.png`) });

    await page.setViewportSize({ width: 390, height: 844 });
    await detail.scrollIntoViewIfNeeded();
    await expect(detail).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const bounds = await detail.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await detail.screenshot({ path: testInfo.outputPath(`${building.id}-material-mobile.png`) });
    expect(errors).toEqual([]);
  });
}

test("unidentified FZK material and the Dutch 70mm name do not become invented properties", async ({ page }) => {
  await seedSeenTours(page);
  await page.goto("/models/fzk-haus");
  const unknown = page.locator('[data-construction-id="assembly-solid-397409098-0-2"]');
  await unknown.getByTestId("material-construction-toggle").click();
  const detail = unknown.getByTestId("material-layer-detail");
  await expect(detail.locator("[data-material-sample]")).toHaveAttribute("data-material-sample", "unknown");
  await expect(detail).toContainText("물성 미확인");
  await expect(detail).toContainText("R — m²K/W");
  await expect(detail.getByTestId("material-resistance-share")).toHaveCount(0);
  await page.goto("/models/schependomlaan");
  const wool = page.locator('[data-construction-id="assembly-ifc-isolatie-110mm-glaswol"]');
  await wool.getByTestId("material-construction-toggle").click();
  await expect(wool.getByTestId("material-layer-detail")).toContainText("99 Isolatie - Glaswol 70mm");
  await expect(wool.getByTestId("material-layer-detail")).toContainText("모델에 명시된 두께: 110.0 mm");
});
