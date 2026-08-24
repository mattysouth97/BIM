import { defineConfig, devices } from "@playwright/test";

function normalizeExternalBaseURL(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("E2E_BASE_URL must use http or https.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function managedPort(value: string | null | undefined): number {
  const candidate = value?.trim();
  if (!candidate) return 3000;
  if (!/^\d+$/.test(candidate)) {
    throw new Error("E2E_PORT must be an integer between 1 and 65535.");
  }
  const port = Number(candidate);
  if (port < 1 || port > 65_535) {
    throw new Error("E2E_PORT must be an integer between 1 and 65535.");
  }
  return port;
}

const externalBaseURL = normalizeExternalBaseURL(process.env.E2E_BASE_URL);
const explicitManagedPort = process.env.E2E_PORT?.trim() || null;
if (externalBaseURL && explicitManagedPort) {
  throw new Error("Set E2E_BASE_URL for an external server or E2E_PORT for a Playwright-managed server, not both.");
}
const port = managedPort(explicitManagedPort);
const managedBaseURL = `http://127.0.0.1:${port}`;
const baseURL = externalBaseURL ?? managedBaseURL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(externalBaseURL
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
          url: managedBaseURL,
          // An explicit port denotes a Playwright-owned server and must never
          // reuse an unrelated process already listening there.
          reuseExistingServer: explicitManagedPort == null,
        },
      }),
});
