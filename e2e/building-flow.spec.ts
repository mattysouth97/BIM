import { test, expect } from "@playwright/test";
import { TITLE_RESPONSE, EMPTY_LEDGER } from "./fixtures/ledger";

// P2-09 — real, content-specific e2e (was green-by-construction: the old
// suite navigated to an invalid /building/test-id and asserted the page
// contained "</div>", which any rendered page passes). These specs assert
// named data and deterministic behavior, and mock data.go.kr at the network
// layer (no live API, no API key in CI).

test.describe("Landing + search chrome", () => {
  test("hero states the GreenRetrofit value proposition", async ({ page }) => {
    await page.goto("/");
    // Retitled in P2-04 — assert the actual product identity, not just "a page".
    await expect(
      page.getByRole("heading", { name: /GreenRetrofit Simulator|그린리모델링 투자 시뮬레이터/ }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("search UI (tabs or input) is present", async ({ page }) => {
    await page.goto("/");
    const searchArea = page.getByRole("tablist").or(page.locator("input")).first();
    await expect(searchArea).toBeVisible({ timeout: 15000 });
  });

  test("shows the API-key banner when no key is configured", async ({ page }) => {
    await page.goto("/");
    // Deterministic, real behavior — the amber banner appears without a key.
    await expect(
      page.getByText(/No API key configured|API 키가 설정되지 않았습니다/),
    ).toBeVisible({ timeout: 15000 });
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
