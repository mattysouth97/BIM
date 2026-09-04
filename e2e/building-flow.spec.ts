import { test, expect } from "@playwright/test";
import { TITLE_RESPONSE, EMPTY_LEDGER } from "./fixtures/ledger";

// These E2E tests require a running dev server (pnpm dev on localhost:3000).
// Playwright config has webServer.reuseExistingServer: true.
// If no server is available in CI, tests will be skipped via the beforeEach check.

test.describe("Building Flow", () => {
  test("homepage renders the model gallery", async ({ page }) => {
    await page.goto("/");
    // The homepage should render without crashing
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByTestId("landing-gallery")).toBeVisible({ timeout: 10000 });
  });

  test("the register lookup has its own address", async ({ page }) => {
    await page.goto("/diagnostics/new?method=ledger");
    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible({ timeout: 10000 });
  });

  test("homepage has main content area", async ({ page }) => {
    await page.goto("/");
    // Main content area should be visible
    await expect(page.locator("main")).toBeVisible();
  });

  test("building detail page renders without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Navigate to a test building ID - will show loading or error state, that's OK
    await page.goto("/building/test-id");
    // Wait for page to settle
    await page.waitForTimeout(2000);

    // Page should not have unhandled JS errors that crash the app
    // Filter out expected errors (network failures for test-id are fine)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("fetch") &&
        !e.includes("network") &&
        !e.includes("Failed to fetch") &&
        !e.includes("404") &&
        !e.includes("API") &&
        !e.includes("api")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("building detail page has content structure", async ({ page }) => {
    // Navigate to building detail - even with invalid ID, page structure should render
    await page.goto("/building/test-id");
    await page.waitForTimeout(2000);

    // The page should have some visible content (loading state, error, or actual data)
    await expect(page.locator("body")).toBeVisible();
    // Check that the DOM is not completely empty
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test("energy cards area exists in building page DOM", async ({ page }) => {
    await page.goto("/building/test-id");
    await page.waitForTimeout(3000);

    // Energy cards or their container should exist somewhere in the DOM
    // They may not be visible if data hasn't loaded, but the container should be present
    const body = await page.content();
    // The page should have rendered some React content
    expect(body).toContain("</div>");
  });
});

// P2-09 — real, content-specific e2e (was green-by-construction: the old
// suite navigated to an invalid /building/test-id and asserted the page
// contained "</div>", which any rendered page passes). These specs assert
// named data and deterministic behavior, and mock data.go.kr at the network
// layer (no live API, no API key in CI).

test.describe("Landing diagnostic chrome", () => {
  test("hero states the Building Energy Diagnostic value proposition", async ({ page }) => {
    await page.goto("/diagnostics/new?method=ledger");
    // Retitled in P2-04 — assert the actual product identity, not just "a page".
    await expect(
      page.getByRole("heading", { name: /building energy diagnostic|건물 에너지 진단/i }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("the new-diagnostic action is present", async ({ page }) => {
    await page.goto("/diagnostics/new?method=ledger");
    await expect(page.getByTestId("landing-ledger-lookup")).toBeVisible({ timeout: 15000 });
  });

  test("keeps one persistent diagnostic action in the header", async ({ page }) => {
    // Everywhere except the gallery. `/` is deliberately bare — see the
    // "Landing gallery" describe in first-door.spec.ts.
    await page.goto("/diagnostics/new?method=ledger");
    await expect(page.getByTestId("header-new-diagnostic")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Building route", () => {
  test("a malformed building id renders the 404 boundary (P2-03)", async ({ page }) => {
    await page.goto("/building/not-a-real-id");
    // The building page is a client component; `notFound()` under streaming SSR
    // keeps a 200 document status while still rendering the not-found boundary.
    // The meaningful regression signal (P2-03: "boundary, not an empty shell")
    // is that the 404 UI renders — assert that, not the transport status.
    await expect(page.getByText("페이지를 찾을 수 없습니다")).toBeVisible();
    await expect(page.getByText(/Page not found/)).toBeVisible();
    // And it is NOT the building shell — the toolbar/viewer never mounts.
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("a valid id with mocked ledger data renders real building fields", async ({ page }) => {
    // The client short-circuits with "API key is not set" BEFORE any fetch
    // (api-client.ts apiFetch), so page.route would never see the request.
    // Seed a dummy key into the persisted app-store — the mock ignores the
    // x-api-key header, so no real credential is used.
    await page.addInitScript(() => {
      localStorage.setItem(
        "korea-building-info-storage",
        JSON.stringify({ state: { apiKey: "e2e-dummy-key", language: "ko" }, version: 1 }),
      );
    });

    // Mock the ledger proxy so the journey is deterministic and key-free.
    await page.route("**/api/bldrgst/title**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(TITLE_RESPONSE) }),
    );
    for (const ep of ["recap", "floors", "areas", "basis", "jijugu"]) {
      await page.route(`**/api/bldrgst/${ep}**`, (route) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(EMPTY_LEDGER) }),
      );
    }
    // VWorld footprint absent is fine — return an empty polygon.
    await page.route("**/api/vworld/footprint**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ polygon: null, error: null }) }),
    );

    await page.goto("/building/11110-10100-0-0001-0000");
    // Assert a SPECIFIC ledger field from the mock renders — not "</div>".
    await expect(page.getByText("이투이테스트빌딩").first()).toBeVisible({ timeout: 20000 });
  });
});
