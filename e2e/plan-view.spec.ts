import { expect, test } from "@playwright/test";

const APP_STORAGE_KEY = "korea-building-info-storage";

test.describe("Canonical diagnostic viewer modes", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ storageKey }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          state: {
            apiKey: "",
            language: "en",
            sidePanelOpen: true,
            hasSeenTour: true,
            hasSeenHomeTour: true,
            hasSeenTwinTour: true,
          },
          version: 1,
        }),
      );

      // Headless Chromium may report a driver-level ReadPixels stall while
      // compositing WebGL. Trace the public WebGL boundary so an actual app or
      // library readback still fails this regression below.
      const readPixelsCalls: string[] = [];
      Object.defineProperty(window, "__bimfitReadPixelsCalls", {
        value: readPixelsCalls,
        configurable: false,
      });
      for (const Context of [
        window.WebGLRenderingContext,
        window.WebGL2RenderingContext,
      ]) {
        if (!Context) continue;
        const original = Context.prototype.readPixels;
        Context.prototype.readPixels = function (...args: unknown[]) {
          readPixelsCalls.push(new Error().stack ?? "unknown JavaScript caller");
          return Reflect.apply(original, this, args);
        };
      }
    }, { storageKey: APP_STORAGE_KEY });
  });

  test("source plan and 3D energy model round-trip without losing the viewer", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const viewerWarnings: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "warning" &&
        /THREE\.Clock|GPU stall due to ReadPixels/i.test(message.text())
      ) {
        viewerWarnings.push(message.text());
      }
    });

    await page.goto("/diagnostics/new?method=sample");
    await expect(page.getByTestId("stage-panel-review")).toBeVisible({
      timeout: 20_000,
    });

    const viewTabs = page.getByRole("tablist", {
      name: "Drawing and 3D view",
    });
    const sourceTab = viewTabs.getByRole("tab", { name: "Source drawing" });
    const modelTab = viewTabs.getByRole("tab", { name: "3D energy model" });

    await expect(sourceTab).toHaveAttribute("aria-selected", "true");
    await expect(modelTab).toHaveAttribute("aria-selected", "false");
    const sourcePlan = page.getByTestId("source-review-canvas");
    await expect(sourcePlan).toBeVisible();
    await expect(sourcePlan.locator("svg")).toHaveAttribute(
      "aria-label",
      /drawing and extraction overlay/i,
    );
    await expect(sourcePlan.locator("polyline")).not.toHaveCount(0);

    await modelTab.click();
    await expect(modelTab).toHaveAttribute("aria-selected", "true");
    await expect(sourceTab).toHaveAttribute("aria-selected", "false");
    const diagnosisScene = page.getByTestId("energy-diagnosis-scene");
    await expect(diagnosisScene).toBeVisible({ timeout: 20_000 });
    const canvas = diagnosisScene.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = await canvas.boundingBox();
        return Boolean(bounds && bounds.width >= 300 && bounds.height >= 400);
      })
      .toBe(true);

    await sourceTab.click();
    await expect(sourceTab).toHaveAttribute("aria-selected", "true");
    await expect(sourcePlan).toBeVisible();
    await expect(diagnosisScene).toHaveCount(0);

    await modelTab.click();
    await expect(modelTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("energy-diagnosis-scene").locator("canvas")).toBeVisible({
      timeout: 20_000,
    });

    expect(pageErrors).toEqual([]);
    expect(viewerWarnings.filter((warning) => /THREE\.Clock/i.test(warning))).toEqual([]);
    const javaScriptReadPixelsCalls = await page.evaluate(
      () =>
        (window as Window & { __bimfitReadPixelsCalls?: string[] })
          .__bimfitReadPixelsCalls ?? [],
    );
    expect(javaScriptReadPixelsCalls).toEqual([]);
  });
});
