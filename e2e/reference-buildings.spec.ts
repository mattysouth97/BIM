import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

import { seedSeenTours } from "./helpers/app-state";

/**
 * The first e2e on `/models/*`. Until this file there was none — three
 * published buildings, a page that mounts the degree-day engine, and nothing
 * asserting any of it in a browser.
 *
 * ── What this file is really for ───────────────────────────────────────────
 * A first visit to `/models/duplex-apartment` was observed on 2026-09-06 with
 * the energy strip absent and a reload fixing it, which would be a store race
 * in `useSeedReferenceEnergy` → `useEnergyMetrics`. bim-54 could not reproduce
 * it with cleared storage in a visible tab. Playwright gives every test a
 * fresh context — no localStorage, nothing seeded, the exact condition the
 * race needs — so `renders its energy strip on a FIRST visit` below is the
 * arbiter. If it is green, the earlier observation was something else about
 * that dev server; if it is red, this is the reproduction.
 *
 * ── Two traps this file is written around ─────────────────────────────────
 * 1. **Do not use `page.waitForFunction` to wait for these numbers.** It
 *    polls on the page's own rAF, which is exactly what a throttled or
 *    backgrounded page does not supply — so it would both hang on a hidden
 *    page AND, by running, hand the page frames it would not otherwise have.
 *    Playwright's `expect(locator)` polls from the driver instead. Every wait
 *    here is an `expect` on DOM text.
 * 2. **The numbers are rAF-animated, and that cuts both ways.**
 *    `AnimatedValue` renders the true value in JSX and then animates
 *    `textContent` from 0 over 400 ms. A page with no frames keeps the
 *    correct value; a page with frames converges on it; a page with a FEW
 *    frames freezes part-way, which is the "numbers at ~4 % of target"
 *    already recorded in this repo. `expect(...).toContainText` with a
 *    generous timeout is correct for all three, and a frozen mid-animation
 *    value fails it — which is a finding, not a flake.
 */

type Expected = Readonly<{
  id: string;
  /** Korean title on the page, from the manifest's `name.ko`. */
  titleKo: string;
  /**
   * What the engine computes for this building's own inputs, headless, on
   * this commit. `demandPerSqm` and the grade are what the strip renders.
   * Owned by the unit tests in `src/lib/reference-buildings/__tests__/`;
   * if those move, this file is meant to go red rather than quietly agree.
   */
  grade: string;
  demandPerSqm: string;
  /**
   * Whether changing the subsidy track moves the MODELLED before/after, as
   * opposed to moving the economics. False is a recorded defect, not a
   * property of the building — see the delta test below.
   */
  deltaMovesWithTrack: boolean;
}>;

// Grades are on the table the use code selects (3b9ff6a): the three
// dwellings are scored 주거, the Clinic by density. kWh/m² did not move.
const BUILDINGS: readonly Expected[] = [
  { id: "bs-medical-dental-clinic", titleKo: "메디컬-덴탈 클리닉", grade: "1+", demandPerSqm: "108.8", deltaMovesWithTrack: true },
  // Measured 2026-09-06: 공공 지자체 takes this building from 1/5 selected
  // measures to 2/5 and its NPV from ₩6201만 to ₩6345만, and the delta strip
  // goes on saying "선택된 측정치는 이 실행의 kWh/m²를 움직이지 않습니다" —
  // that the selected measures move no kWh/m² — through both. See the delta
  // test for why that sentence is a stronger claim than the module can make.
  { id: "schependomlaan", titleKo: "스헤펜돔라안 아파트", grade: "1++", demandPerSqm: "40.5", deltaMovesWithTrack: false },
  { id: "duplex-apartment", titleKo: "듀플렉스 아파트", grade: "4", demandPerSqm: "142.6", deltaMovesWithTrack: true },
  // The fourth building states NO services models at all — its manifest
  // carries an empty `serviceLayers`, so the layers panel is the fabric row
  // and nothing else, and its licence is KIT/IAI's own grant rather than a
  // Creative Commons one. Both are read from the manifest below rather than
  // written here, so neither can be quietly assumed to match the others'.
  //
  // Measured 2026-09-06, and it is the SECOND building with the delta-strip
  // defect: 공공 지자체 takes it 1/6 → 2/6 measures and NPV ₩1954만 →
  // ₩2036만, with the strip saying through both that the selected measures
  // move no kWh/m².
  { id: "fzk-haus", titleKo: "FZK 하우스", grade: "2", demandPerSqm: "92.6", deltaMovesWithTrack: false },
];

type Manifest = {
  id: string;
  licence: string;
  serviceLayers?: { id: string; ko: string; en: string; flow?: { file: string | null } }[];
};

function manifestFor(id: string): Manifest {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "public", "reference-buildings", id, "manifest.json"),
      "utf8",
    ),
  ) as Manifest;
}

/**
 * The energy strip has no testid, so it is located by two things only it has
 * together: the ECO2 export button and the intensity text. The button alone
 * is not enough — its own `ml-auto` wrapper contains it and nothing else, and
 * `.last()` on that filter picks the wrapper, not the strip.
 */
function energyStrip(page: Page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: "ECO2" }) })
    .filter({ hasText: "kWh/m²·yr" })
    .last();
}

const deltaStrip = (page: Page) => page.locator("[data-retrofit-delta-strip]");

/**
 * The chips are `role="radio"` in a radiogroup, not buttons, and each one's
 * accessible name is its label AND its subsidy detail ("프로그램 없음" +
 * "무보조"), so the name has to be matched as a pattern rather than whole.
 */
const trackChip = (page: Page, label: RegExp) =>
  page.locator("[data-twin-track-selector]").getByRole("radio", { name: label });

/** Generous: a dev server may be compiling this route for the first time. */
const FIRST_PAINT = 45_000;

for (const building of BUILDINGS) {
  test.describe(`/models/${building.id}`, () => {
    test.beforeEach(async ({ page }) => {
      await seedSeenTours(page);
      // A fresh Playwright context already has empty storage. Asserted rather
      // than assumed, because "no persisted store" is the whole condition the
      // first-visit race needs and a leaked profile would make this file
      // green for the wrong reason.
      await page.addInitScript(() => {
        const seeded = Object.keys(localStorage).filter((k) => k.includes("material") || k.includes("recipe"));
        (window as unknown as { __seededKeys: string[] }).__seededKeys = seeded;
      });
      await page.goto(`/models/${building.id}`);
      await page.bringToFront();
    });

    test("renders its energy strip on a FIRST visit, with no reload", async ({ page }) => {
      // The store was empty when this page loaded.
      expect(
        await page.evaluate(() => (window as unknown as { __seededKeys: string[] }).__seededKeys),
      ).toEqual([]);

      await expect(page.getByRole("heading", { name: building.titleKo })).toBeVisible({
        timeout: FIRST_PAINT,
      });

      // Asserted in two steps on purpose, so a failure says WHICH thing
      // broke. `EnergyCards` returns null for the strip variant while
      // `metrics` is null, and the ECO2 button exists only inside that
      // variant — so this first assertion passing means the seed → metrics
      // chain ran, and a failure here IS the reported race. The value
      // assertions after it are a different claim: that what rendered is the
      // engine's number rather than a placeholder.
      await expect(page.getByRole("button", { name: "ECO2" })).toBeVisible({
        timeout: FIRST_PAINT,
      });

      const strip = energyStrip(page);
      await expect(strip).toBeVisible({ timeout: FIRST_PAINT });
      await expect(strip).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });

      // The rendered number is the engine's own, not a placeholder: the
      // animation settles on the value the headless run computes for these
      // inputs.
      await expect(strip).toContainText(`${building.demandPerSqm} kWh/m²·yr`, {
        timeout: FIRST_PAINT,
      });
      await expect(strip.getByText(building.grade, { exact: true }).first()).toBeVisible();
    });

    test("lists every services layer the manifest carries", async ({ page }) => {
      const manifest = manifestFor(building.id);
      const panel = page.getByTestId("reference-model-layers");
      await expect(panel).toBeVisible({ timeout: FIRST_PAINT });

      // The fabric layer is always there; the services layers are whatever
      // this building's own manifest declares — 3 for the Duplex, 3 for the
      // Clinic, 6 for Schependomlaan and NONE for FZK Haus.
      const services = manifest.serviceLayers ?? [];
      for (const layer of services) {
        await expect(page.getByTestId(`reference-model-layer-${layer.id}`)).toBeVisible();
        await expect(panel).toContainText(layer.ko);
      }

      // Counted, not just spot-checked, so the assertion still says something
      // about a building that declares no services at all: FZK Haus must show
      // the fabric row and nothing beside it. A loop over an empty array
      // asserts nothing, and "asserts nothing" and "asserts it is empty" are
      // different claims.
      //
      // The expected count is derived from the manifest rather than typed, so
      // it stays true per building: one fabric row, one per services layer,
      // and a flow-direction row ONLY where some layer actually shipped a
      // flow file. Schependomlaan has six services models and no flow file
      // among them, so it gets the heading and no toggle; FZK has neither.
      const flowRow = services.some((layer) => layer.flow?.file) ? 1 : 0;
      await expect(page.getByTestId("reference-model-layer-fabric")).toBeVisible();
      await expect(
        panel.locator('[data-testid^="reference-model-layer-"]:not([data-testid$="-note"])'),
      ).toHaveCount(1 + services.length + flowRow);
    });

    test("carries the licence its grant requires", async ({ page }) => {
      const manifest = manifestFor(building.id);
      const credit = page.getByTestId("reference-model-attribution");
      await expect(credit).toBeVisible({ timeout: FIRST_PAINT });
      // CC BY makes the credit a condition, not a courtesy — a page that
      // renders the building without it is in breach.
      await expect(credit).toContainText(manifest.licence);
    });

    test("answers the green-remodelling chips in the retrofit scenario", async ({ page }) => {
      // Wait for the engine before reading a baseline, or "before" is the
      // pre-seed state and every later comparison is against nothing.
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });

      const unsubsidised = trackChip(page, /프로그램 없음/);
      const localGov = trackChip(page, /공공 지자체/);
      // The page opens unsubsidised, so "before" is a real baseline.
      await expect(unsubsidised).toHaveAttribute("aria-checked", "true");

      const selection = page.getByText(/\d+\/\d+개 선택/).first();
      await expect(selection).toBeVisible({ timeout: FIRST_PAINT });
      const before = (await selection.innerText()).trim();

      // 70 % of CAPEX covered, so the knapsack can afford more of the same
      // measures: the selection must move.
      await localGov.click();
      await expect(localGov).toHaveAttribute("aria-checked", "true");
      await expect
        .poll(async () => (await selection.innerText()).trim(), { timeout: FIRST_PAINT })
        .not.toBe(before);

      // And back. A chip that changes the picture but cannot un-change it is
      // a one-way door, which is worse than one that does nothing.
      await unsubsidised.click();
      await expect(unsubsidised).toHaveAttribute("aria-checked", "true");
      await expect
        .poll(async () => (await selection.innerText()).trim(), { timeout: FIRST_PAINT })
        .toBe(before);
    });

    test("answers the green-remodelling chips in the modelled before/after", async ({ page }) => {
      // Separated from the scenario test on purpose, because on half these
      // buildings the two answers disagree and a single test could not say
      // which one moved.
      //
      // TWO of the four are marked expected-to-fail, and the shape is the
      // same on both. Measured 2026-09-06 under 프로그램 없음 → 공공 지자체:
      //
      //   Clinic      0/6 → 3/6   ₩0      → ₩1.3억   strip: 1+ → 1++, −42.8 kWh/m²·yr
      //   Duplex      moves
      //   Schependom. 1/5 → 2/5   ₩6201만 → ₩6345만  strip: unchanged
      //   FZK Haus    1/6 → 2/6   ₩1954만 → ₩2036만  strip: unchanged
      //
      // On the two that do not move, the money moves and a measure is added
      // while the strip says "the selected measures do not move this run's
      // kWh/m²" through both states. That sentence is a claim about the
      // BUILDING; what the module can support is a claim about ITSELF — that
      // nothing IT prices changed. `computeRetrofitDelta` already splits its
      // changes into priced and unpriced, so a selection made entirely of
      // measures it cannot price produces exactly this, and the zero-delta
      // branch reports it as physics rather than as its own gap. Note the
      // Clinic is the one building that starts at ZERO selected measures,
      // which is why it is the one whose strip visibly changes.
      //
      // Owned by the retrofit-delta lane, not this file. When it is fixed
      // these start passing and Playwright reports the unexpected pass,
      // which is the notification we want.
      test.fail(
        !building.deltaMovesWithTrack,
        "delta strip reports no kWh/m² change while the selection and NPV both move",
      );

      const delta = deltaStrip(page);
      await expect(delta).toBeVisible({ timeout: FIRST_PAINT });
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });

      const unsubsidised = trackChip(page, /프로그램 없음/);
      const localGov = trackChip(page, /공공 지자체/);
      await expect(unsubsidised).toHaveAttribute("aria-checked", "true");

      // Read the same way every time. `innerText` and `toHaveText` normalise
      // whitespace differently — one keeps the line breaks between the strip's
      // rows, the other concatenates them — so comparing one against the other
      // fails on formatting while the content is identical.
      const readDelta = async () => (await delta.innerText()).replace(/\s+/g, " ").trim();
      const before = await readDelta();

      await localGov.click();
      await expect(localGov).toHaveAttribute("aria-checked", "true");
      await expect.poll(readDelta, { timeout: 15_000 }).not.toBe(before);
      const subsidised = await readDelta();

      await unsubsidised.click();
      await expect(unsubsidised).toHaveAttribute("aria-checked", "true");
      await expect.poll(readDelta, { timeout: 15_000 }).toBe(before);
      expect(subsidised).not.toBe(before);
    });
  });
}
