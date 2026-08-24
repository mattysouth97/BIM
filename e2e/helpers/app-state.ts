import type { Page } from "@playwright/test";

const SEEN_TOURS_APP_STATE = JSON.stringify({
  state: {
    language: "ko",
    hasSeenTour: true,
    hasSeenHomeTour: true,
    hasSeenTwinTour: true,
  },
  version: 1,
});

/** Keep product tours from intercepting controls in flows that are not testing onboarding. */
export async function seedSeenTours(page: Page): Promise<void> {
  await page.addInitScript((serializedState) => {
    localStorage.setItem("korea-building-info-storage", serializedState);
  }, SEEN_TOURS_APP_STATE);
}
