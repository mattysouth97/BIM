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
    // Read the laid-out size from inside the page rather than via
    // boundingBox(). React Three Fiber sizes its canvas from react-use-measure,
    // which delivers the measured size on an animation frame, and headless
    // Chromium schedules no frames while nothing asks for one — so the canvas
    // sits at the 300x150 HTML default until something requests a frame. A
    // boundingBox() poll never does: measured here at ~12.0s and ~11.9s against
    // this assertion's 5s budget, which is the whole of this failure. Polling
    // through waitForFunction requests animation frames and resolves in ~65ms.
    // The viewer was never slow; the old assertion could not observe it.
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLCanvasElement>(
          '[data-testid="energy-diagnosis-scene"] canvas',
        );
        return Boolean(
          element && element.clientWidth >= 300 && element.clientHeight >= 400,
        );
      },
      null,
      { timeout: 20_000 },
    );

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
