import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("docs/rendering/qa");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"],
});

function storage(mode, cameraPreset = "architectural-exterior", timeOfDay = "12:00") {
  return {
    "korea-building-info-storage": JSON.stringify({
      state: {
        apiKey: "",
        language: "ko",
        sidePanelOpen: true,
        hasSeenTour: true,
        hasSeenHomeTour: true,
        hasSeenTwinTour: true,
      },
      version: 1,
    }),
    "bim-workflow-state": JSON.stringify({
      state: {
        stage: "twin",
        completion: { search: true, upload: true, params: true, twin: true, report: false },
      },
      version: 1,
    }),
    "bim-render-settings": JSON.stringify({
      state: {
        mode,
        quality: "high",
        timeOfDay,
        weather: "clear",
        cameraPreset,
      },
      version: 1,
    }),
  };
}

async function capture(page, name) {
  await page.locator("canvas").last().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(5000);
  await page.mouse.move(20, 20);
  await page.evaluate(() => {
    document.querySelectorAll(".driver-overlay, .driver-popover").forEach((el) => el.remove());
  });
  const overlay = page.getByTestId("render-mode-overlay");
  const overlayCount = await overlay.count();
  const modeLabel = overlayCount
    ? await overlay.locator("button.bg-primary").first().textContent()
    : "missing-overlay";
  console.log(name, "overlay=", overlayCount, "active=", modeLabel);
  await page.screenshot({ path: path.join(OUT, `${name}-full.png`) });
  const viewport = page.locator("[data-tour=viewport]");
  if (await viewport.count()) {
    await viewport.screenshot({ path: path.join(OUT, `${name}.png`) });
  } else {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  }
}

async function openDemo(page, store) {
  await page.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, store);
  await page.goto("http://127.0.0.1:3000/building/demo", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  const twin = page.getByRole("button", { name: /디지털 트윈|Twin/ }).first();
  await twin.waitFor({ timeout: 60_000 });
  await twin.click({ force: true }).catch(() => {});
}

const shots = [
  { name: "01-bim-iso", mode: "bim", camera: "architectural-exterior", time: "12:00" },
  { name: "02-realistic-iso", mode: "realistic", camera: "architectural-exterior", time: "12:00" },
  { name: "03-realistic-golden", mode: "realistic", camera: "architectural-exterior", time: "golden" },
  { name: "04-realistic-street", mode: "realistic", camera: "street", time: "12:00" },
  { name: "05-realistic-aerial", mode: "realistic", camera: "birds-eye", time: "12:00" },
  { name: "06-hyperreal-iso", mode: "hyperreal", camera: "architectural-exterior", time: "12:00" },
];

for (const shot of shots) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (err) => console.warn("pageerror", shot.name, err.message));
  await openDemo(page, storage(shot.mode, shot.camera, shot.time));
  await capture(page, shot.name);
  await page.close();
}

await browser.close();
console.log("done");
