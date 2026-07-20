import { test, expect } from "@playwright/test";
import { TITLE_RESPONSE, EMPTY_LEDGER } from "./fixtures/ledger";

// P2-09 — the old plan-view spec had an always-true `else` branch: when the
// viewer didn't render (which is ALWAYS, given the invalid test-id it used) it
// fell through to `expect(body).toBeVisible()` and passed. That branch is gone.
//
// The plan/3D toggle is WebGL-dependent: it only exists once the R3F canvas
// mounts, and headless software GL does not reliably mount an R3F scene in CI.
// Rather than hide that behind an always-true branch, this is an EXPLICIT skip
// with a reason (the 3D/plan geometry logic is covered by unit tests in
// src/lib/procedural/__tests__). Remove the skip to run it locally with a GPU.

function mockLedger(page: import("@playwright/test").Page) {
  return Promise.all([
    page.route("**/api/bldrgst/title**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(TITLE_RESPONSE) }),
    ),
    ...["recap", "floors", "areas", "basis", "jijugu"].map((ep) =>
      page.route(`**/api/bldrgst/${ep}**`, (route) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(EMPTY_LEDGER) }),
      ),
    ),
    page.route("**/api/vworld/footprint**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ polygon: null, error: null }) }),
    ),
  ]);
}

test.describe("Plan View", () => {
  test.skip(
    ({ browserName }) => browserName === "chromium",
    "WebGL/R3F canvas does not reliably mount under headless software GL; 3D + plan geometry is unit-tested in src/lib/procedural/__tests__. Run locally with a GPU to exercise the toggle.",
  );

  test("plan/3D toggle round-trips without crashing", async ({ page }) => {
    await mockLedger(page);
    await page.goto("/building/11110-10100-0-0001-0000");

    const canvas = page.locator("canvas");
    // No silent else: if the viewer never mounts, this FAILS loudly.
    await expect(canvas).toBeVisible({ timeout: 20000 });

    const planButton = page
      .getByRole("button", { name: /plan|2d|평면/i })
      .or(page.locator("button").filter({ hasText: /plan|2d|평면/i }))
      .first();
    await expect(planButton).toBeVisible({ timeout: 5000 });

    await planButton.click();
    await planButton.click();
    await expect(canvas).toBeVisible();
  });
});
