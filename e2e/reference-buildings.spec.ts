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
  /** Independent geometry regression pins, not values read back from the UI. */
  pv?: { modules: number; kWp: number };
}>;

/**
 * `zeroDeltaReason()`'s three values, as `retrofit-delta-strip.tsx` emits them
 * on `data-zero-reason`. Listed here so a fifth value has to be added
 * deliberately rather than passing as "some string was present".
 */
const KNOWN_ZERO_REASONS = ["nothing-chosen", "only-unpriced", "targets-met"];

// Grades are on the table the use code selects (3b9ff6a): the three
// dwellings are scored 주거, the Clinic by density. kWh/m² did not move.
const BUILDINGS: readonly Expected[] = [
  { id: "bs-medical-dental-clinic", titleKo: "메디컬-덴탈 클리닉", grade: "1+", demandPerSqm: "108.8" },
  { id: "schependomlaan", titleKo: "스헤펜돔라안 아파트", grade: "1++", demandPerSqm: "40.5" },
  { id: "duplex-apartment", titleKo: "듀플렉스 아파트", grade: "4", demandPerSqm: "142.6" },
  // The fourth building states NO services models at all — its manifest
  // carries an empty `serviceLayers`, so the layers panel is the fabric row
  // and nothing else, and its licence is KIT/IAI's own grant rather than a
  // Creative Commons one. Both are read from the manifest below rather than
  // written here, so neither can be quietly assumed to match the others'.
  { id: "fzk-haus", titleKo: "FZK 하우스", grade: "2", demandPerSqm: "92.6", pv: { modules: 44, kWp: 17.6 } },
  { id: "kit-office", titleKo: "KIT 오피스", grade: "5", demandPerSqm: "269.1" },
  { id: "klassiqua-office-1970", titleKo: "Klassiqua 1970 오피스", grade: "2", demandPerSqm: "177.1", pv: { modules: 84, kWp: 33.6 } },
];

type Manifest = {
  id: string;
  licence: string;
  architecturalDetails?: { file: string };
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
      // The measured roof planes arrive by fetch after first paint and move
      // the PV kWp on the delta strip and the legend's PV line when they do.
      // Every "before" snapshot below must be taken after that, or a change
      // the fetch made is read as a change the click made.
      await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute(
        "data-roof-planes",
        "ready",
        { timeout: FIRST_PAINT },
      );
      await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-model-loaded", "true", { timeout: FIRST_PAINT });
    });

    test("the PV modules drawn are the modules the legend counts", async ({ page }) => {
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });
      const row = page.locator("[data-measure-chip-row]");
      await expect(row).toBeVisible({ timeout: FIRST_PAINT });
      const solar = row.locator('[data-measure-chip^="solar-pv"]').first();
      if (building.pv) await expect(solar).toBeVisible();
      if ((await solar.count()) === 0) {
        const details = page.getByTestId("reference-pv-utilisation");
        await details.locator("summary").click();
        await expect(page.getByTestId("reference-pv-totals").locator("td:nth-last-child(2)")).toHaveText("0");
        await expect(page.getByTestId("reference-pv-totals").locator("td:last-child")).toHaveText("0.0");
        await expect(page.getByTestId("reference-pv-table").locator('tbody tr[data-pv-excluded=""]')).toHaveCount(0);
        return;
      }
      if ((await solar.getAttribute("data-measure-chosen")) !== "true") await solar.click();
      const legend = page.getByTestId("reference-retrofit-legend");
      await expect(legend).toHaveAttribute("data-pv-modules", /^\d+$/, { timeout: FIRST_PAINT });
      const counted = await legend.getAttribute("data-pv-modules");
      if (building.pv) {
        expect(Number(counted)).toBe(building.pv.modules);
        await expect(solar).toContainText(`${building.pv.kWp.toFixed(1)} kWp`);
      }
      await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute(
        "data-pv-drawn",
        counted ?? "",
        { timeout: FIRST_PAINT },
      );
      // The legend says where the modules are and where they are not.
      await expect(legend).toContainText("kWp");
      const details = page.getByTestId("reference-pv-utilisation");
      await details.locator("summary").click();
      const table = page.getByTestId("reference-pv-table");
      await expect(table).toBeVisible();
      const rows = table.locator("tbody tr");
      let sumModules = 0;
      let sumCapacity = 0;
      for (const cells of await rows.locator("td:nth-last-child(2)").allTextContents()) sumModules += Number(cells);
      for (const cells of await rows.locator("td:last-child").allTextContents()) sumCapacity += Number(cells);
      expect(sumModules).toBe(Number(counted));
      expect(sumCapacity).toBeCloseTo(sumModules * 0.4, 6);
      const totals = page.getByTestId("reference-pv-totals");
      await expect(totals.locator("td:nth-last-child(2)")).toHaveText(String(sumModules));
      await expect(totals.locator("td:last-child")).toHaveText(sumCapacity.toFixed(1));
      await expect(solar).toContainText(`${sumCapacity.toFixed(1)} kWp`);
    });

    test("roof inspection clears the energy panels and restores the chosen work", async ({ page }) => {
      const viewer = page.getByTestId("reference-model-viewer");
      const overlay = page.getByTestId("reference-energy-overlays").locator("[data-twin-instrument-frame]");
      const selectedBefore = await page.locator('[data-measure-chosen="true"]').count();
      const focus = page.getByTestId("reference-view-inspection");
      await focus.focus();
      await page.keyboard.press("Enter");
      await expect(focus).toHaveAttribute("aria-pressed", "true");
      await expect(overlay).toBeHidden();
      await page.getByTestId("reference-view-roof").click();
      await expect(viewer).toHaveAttribute("data-view", "roof");
      await expect(viewer.locator("canvas")).toBeVisible();
      await page.getByTestId("reference-view-exterior").click();
      await expect(viewer).toHaveAttribute("data-view", "exterior");
      await focus.click();
      await expect(overlay).toBeVisible();
      await expect(page.locator('[data-measure-chosen="true"]')).toHaveCount(selectedBefore);
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
      if (building.id === "kit-office") {
        await expect(page.getByTestId("reference-energy-scope-notice")).toContainText("475.92");
        await expect(page.getByTestId("reference-energy-scope-notice")).toContainText("가정");
        await expect(page.getByTestId("reference-energy-scope-notice")).toContainText("지하");
      }
      if (building.id === "klassiqua-office-1970") {
        const scope = page.getByTestId("reference-energy-scope-notice");
        await expect(scope).toContainText("실제 준공 건물이 아닌 1970년 연구용 오피스 원형");
        await expect(scope).toContainText("냉방 전력 0");
        await expect(scope).toContainText("쾌적성을 보장하지 않습니다");
        await expect(scope).toContainText("서울 기후·기밀·운전효율·재실은 가정");
        await expect(scope).toContainText("열교 손실이 작게 나올 수 있습니다");
      }
      await expect(strip.getByText(building.grade, { exact: true }).first()).toBeVisible();
    });

    test("lists every services layer the manifest carries", async ({ page }) => {
      await page.getByTestId("reference-info-tab-layers").click();
      const manifest = manifestFor(building.id);
      const panel = page.getByTestId("reference-model-layers");
      await expect(panel).toBeVisible({ timeout: FIRST_PAINT });

      // Every source service in this building's manifest needs a control.
      const services = manifest.serviceLayers ?? [];
      for (const layer of services) {
        await expect(page.getByTestId(`reference-model-layer-${layer.id}`)).toBeVisible();
        await expect(panel).toContainText(layer.ko);
      }

      // Count all controls, including the independent architectural details.
      // A flow control requires an actual flow file; absence is not invented.
      const flowRow = services.some((layer) => layer.flow?.file) ? 1 : 0;
      await expect(page.getByTestId("reference-model-layer-fabric")).toBeVisible();
      await expect(
        panel.locator('[data-testid^="reference-model-layer-"]:not([data-testid$="-note"])'),
      ).toHaveCount(1 + services.length + flowRow + (manifest.architecturalDetails ? 1 : 0));
    });

    test("carries the licence its grant requires", async ({ page }) => {
      await page.getByTestId("reference-info-tab-data").click();
      const manifest = manifestFor(building.id);
      const credit = page.getByTestId("reference-model-attribution");
      await expect(credit).toBeVisible({ timeout: FIRST_PAINT });
      // CC BY makes the credit a condition, not a courtesy — a page that
      // renders the building without it is in breach.
      await expect(credit).toContainText(manifest.licence);
    });

    test("a measure chip changes the model, and clicking it again puts it back", async ({ page }) => {
      // Each measure controls the chosen work and the energy delta.
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });
      const row = page.locator("[data-measure-chip-row]");
      await expect(row).toBeVisible({ timeout: FIRST_PAINT });

      // Resolve the chip's ID FIRST and locate by that. Keying the locator on
      // `data-measure-chosen` — the attribute this test exists to flip — means
      // the element stops matching the moment the click lands, and the very
      // next assertion fails with "element(s) not found" about a chip that is
      // sitting right there. It did, on all four buildings.
      //
      // Prefer an envelope measure: those are the ones `computeRetrofitDelta`
      // prices, so toggling one is guaranteed to move the before/after. A
      // lighting or PV chip may be real work the module cannot price, and this
      // test would then be asserting the delta strip's blind spot.
      const envelope = row.locator('[data-measure-chip^="envelope-"]');
      const target = (await envelope.count()) ? envelope.first() : row.locator("[data-measure-chip]").first();
      await expect(target).toBeVisible({ timeout: FIRST_PAINT });
      const chipId = await target.getAttribute("data-measure-chip");
      const chip = row.locator(`[data-measure-chip="${chipId}"]`);

      // Toggle either direction and restore the initial selection.
      const startedChosen = (await chip.getAttribute("data-measure-chosen")) === "true";
      const flipped = startedChosen ? "false" : "true";
      const restored = startedChosen ? "true" : "false";

      const readDelta = async () =>
        (await deltaStrip(page).innerText()).replace(/\s+/g, " ").trim();

      const deltaBefore = await readDelta();

      await chip.click();
      await expect(chip).toHaveAttribute("data-measure-chosen", flipped);
      await expect(chip).toHaveAttribute("aria-pressed", flipped);
      await expect.poll(readDelta, { timeout: 15_000 }).not.toBe(deltaBefore);

      await chip.click();
      await expect(chip).toHaveAttribute("data-measure-chosen", restored);
      await expect.poll(readDelta, { timeout: 15_000 }).toBe(deltaBefore);
    });

    test("the 3D legend follows the chosen work, not the knapsack's", async ({ page }) => {
      // Split from the delta assertions above because on ONE building these
      // two disagree, and a single test could not say which half moved.
      //
      // The Clinic is expected-to-fail, and the mechanism is exact rather than
      // suspected. `reference-model-viewer.tsx:390` hands `RetrofitLegend` the
      // raw `selectedMeasureIds` — the knapsack's publication — while the 3D
      // beside it is derived from `useProposalVisualIds()`, i.e. the user's
      // applied set. Its own comment at :258 says the visual deliberately does
      // NOT read the raw field; the legend then does. On three buildings the
      // two sets overlap at first load and the gap is invisible. The Clinic's
      // knapsack recommends none of its six at the default budget, so turning
      // a chip on draws the measure and leaves the legend saying "현재
      // 예산·트랙에서 선택된 개선 항목 없음" — a caption describing a different
      // selection from the picture it labels.
      //
      // Fixed by b61eba2 (Lane 3B), which landed one merge before this spec:
      // the legend now reads `useEffectiveMeasureIds()`, the same resolved set
      // the 3D renders. The `test.fail()` that recorded the defect flipped to an
      // unexpected pass at merge and was removed here; the test now guards
      // against the wiring regressing on every building, the Clinic included.

      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });
      const row = page.locator("[data-measure-chip-row]");
      await expect(row).toBeVisible({ timeout: FIRST_PAINT });

      const envelope = row.locator('[data-measure-chip^="envelope-"]');
      const target = (await envelope.count()) ? envelope.first() : row.locator("[data-measure-chip]").first();
      await expect(target).toBeVisible({ timeout: FIRST_PAINT });
      const chipId = await target.getAttribute("data-measure-chip");
      const chip = row.locator(`[data-measure-chip="${chipId}"]`);

      const legend = page.getByTestId("reference-retrofit-legend");
      const readLegend = async () =>
        ((await legend.count()) ? await legend.innerText() : "").replace(/\s+/g, " ").trim();
      const legendBefore = await readLegend();

      await chip.click();
      await expect.poll(readLegend, { timeout: 15_000 }).not.toBe(legendBefore);

      await chip.click();
      await expect.poll(readLegend, { timeout: 15_000 }).toBe(legendBefore);
    });

    test("removed funding controls and old saved programs cannot change the estimate", async ({ page }) => {
      const rail = page.locator("[data-twin-rail]");
      await expect(rail).toBeVisible({ timeout: FIRST_PAINT });
      const readRail = async () => (await rail.innerText()).replace(/\s+/g, " ").trim();
      const baseline = await readRail();
      await expect(page.locator("[data-twin-track-selector]")).toHaveCount(0);
      await expect(rail).not.toContainText("보조금 반영");
      await page.evaluate(() => localStorage.setItem("bim-scenario-state", JSON.stringify({
        state: { programTrack: "public-seoul-or-central" }, version: 0,
      })));
      await page.reload();
      await expect(page.getByTestId("reference-model-viewer")).toHaveAttribute("data-roof-planes", "ready", { timeout: FIRST_PAINT });
      await expect(rail).toBeVisible({ timeout: FIRST_PAINT });
      await expect.poll(readRail, { timeout: FIRST_PAINT }).toBe(baseline);
      await expect(page.locator("[data-twin-track-selector]")).toHaveCount(0);
    });

    test("at first load the recommended chips are the chosen set the rail counts", async ({ page }) => {
      // Scoped to first load ON PURPOSE, and it is not the standing equality
      // this test was briefed as. `ScenarioRail` is handed
      // `selection={scenario.chosen}`, so its `N/M개 선택` is the CHOSEN set
      // and not the knapsack's optimum — the HUD's own comment says as much.
      // The two agree only because `appliedMeasureIds` is seeded ONCE from the
      // first recommendation. That seeding is worth pinning precisely because
      // the obvious "fix" — re-seeding whenever the sets diverge — would undo
      // every deselection and let a financing click move the building again,
      // which is the behaviour 3C exists to remove.
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });
      const row = page.locator("[data-measure-chip-row]");
      await expect(row).toBeVisible({ timeout: FIRST_PAINT });

      // NOT asserted to be non-zero: the Clinic's knapsack recommends none
      // of its six measures at the default budget on the unsubsidised track,
      // so zero is a real recommendation and 0 === 0 is the invariant holding,
      // not the test failing to look.
      const chosen = await row.locator('[data-measure-chip][data-measure-chosen="true"]').count();

      // `data-measure-recommended` (bim-24, b5a68ca) rather than the 추천 text
      // this counted first. A count of a fact rather than of a rendering, and
      // it survives the chip names having gone bilingual in the same commit —
      // the text form was language-coupled (the English render reads
      // "Suggested") and would have started counting zero.
      const recommended = await row.locator('[data-measure-recommended="true"]').count();
      expect(recommended).toBe(chosen);

      // And the rail is reporting that same set rather than a second one.
      const railCount = (await page.locator("[data-twin-rail]").innerText()).match(
        /(\d+)\/(\d+)개 선택/,
      );
      expect(railCount).not.toBeNull();
      expect(Number(railCount![1])).toBe(chosen);

      // The reset-to-recommendation button exists only where the two differ,
      // so at first load it must be absent — the same invariant from the
      // other side.
      await expect(page.locator("[data-measure-reset-to-recommended]")).toHaveCount(0);
    });

    test("says which kind of nothing it is when the before/after is flat", async ({ page }) => {
      // Replaces two `test.fail()` markers. The apartment and FZK used to say
      // "the selected measures do not move this run's kWh/m²" — a claim about
      // the BUILDING — where the supportable claim was about the module. 3C
      // made that distinction explicit as `data-zero-reason`, so asserting the
      // attribute rather than the sentence means this test and the unit test
      // behind `zeroDeltaReason()` check one value instead of two renderings.
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });
      const strip = deltaStrip(page);
      await expect(strip).toBeVisible({ timeout: FIRST_PAINT });

      const zero = strip.locator("[data-zero-reason]");
      if ((await zero.count()) === 0) {
        // A moving before/after is the other legitimate state, and then the
        // strip must actually show a delta rather than be silently empty.
        await expect(strip).toContainText("kWh/m²·yr");
        return;
      }
      expect(KNOWN_ZERO_REASONS).toContain(await zero.first().getAttribute("data-zero-reason"));
    });
  });
}

test("Klassiqua keeps source design values, clipped geometry and operating assumptions distinct", async ({ page }, testInfo) => {
  await seedSeenTours(page);
  await page.addInitScript(() => {
    const stored = JSON.parse(localStorage.getItem("korea-building-info-storage")!);
    stored.state.language = "en";
    localStorage.setItem("korea-building-info-storage", JSON.stringify(stored));
  });
  await page.goto("/models/klassiqua-office-1970");
  const viewer = page.getByTestId("reference-model-viewer");
  await expect(viewer).toHaveAttribute("data-material-status", "ready", { timeout: FIRST_PAINT });
  const overview = page.getByTestId("reference-model-energy");
  const wall = overview.locator("dl > div").filter({ has: page.getByText("Gross wall", { exact: true }) });
  const gross = Number((await wall.locator("dd").first().innerText()).replaceAll(",", "").match(/[\d.]+/)?.[0]);
  const wallRead = (await wall.locator("dd").last().innerText()).replaceAll(",", "");
  const [, windowArea, wwr, opaqueArea] = wallRead.match(/windows ([\d.]+) m² \(WWR ([\d.]+) %\) · opaque ([\d.]+) m² \(doors included\)/)!;
  expect(gross).toBe(1215.4);
  expect(Number(windowArea)).toBe(379.9);
  expect(Number(opaqueArea)).toBe(835.5);
  expect(Number(windowArea) + Number(opaqueArea)).toBeCloseTo(gross, 1);
  expect(Number(wwr)).toBeCloseTo(Number(windowArea) / gross * 100, 1);
  await expect(overview).toContainText("420.9 · 427.4 m² · 5,275 m³");
  await overview.locator("summary").filter({ hasText: "input basis records" }).click();
  const source = page.getByTestId("reference-assumption-S-SOURCE-THERMAL");
  await expect(source).toContainText("full wall U 1.05, roof U 0.62, effective ground U 0.45, whole-window Uw 4.18");
  await expect(source).toContainText("archetype design calculations, not measured in-use properties");
  await expect(source).toContainText("Ground U already includes ISO 13370; no second ground solver");
  const scope = page.getByTestId("reference-assumption-A-ENVELOPE-SCOPE");
  await expect(scope).toContainText("All 48 spaces are conditioned");
  await expect(scope).toContainText("0–14 m; parapet faces are excluded");
  await expect(scope).toContainText("30.13% façade window ratio has a different façade scope");
  const scenario = page.getByTestId("reference-assumption-A-SCENARIO-T1");
  await expect(scenario).toContainText("table 3.5 (PDF page 19)");
  await expect(scenario).toContainText("Heating efficiency 0.90 and gas DHW efficiency 0.85 are BIMFIT assumptions");
  const doorText = await page.getByTestId("reference-assumption-A-DOORS").innerText();
  const [, doorU, wallU, doorArea, deficit] = doorText.match(/\(([\d.]+)−([\d.]+)\)×([\d.]+) = ([\d.]+) W\/K/)!;
  expect([Number(doorU), Number(wallU), Number(doorArea)]).toEqual([4.33, 1.05, 2.78]);
  expect((Number(doorU) - Number(wallU)) * Number(doorArea)).toBeCloseTo(Number(deficit), 8);

  await page.getByTestId("reference-info-tab-materials").click();
  const roof = page.locator('[data-construction-id="assembly-roofing-insulation-bituminioussheeting-gravel-165mm"]');
  const toggle = roof.getByTestId("material-construction-toggle");
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  await roof.getByRole("group", { name: "Select a source material layer" }).getByRole("button").first().click();
  const layer = roof.getByTestId("material-layer-detail");
  await expect(layer).toContainText("Thermal property stated in source");
  await expect(layer.getByTestId("material-thermal-source")).toContainText(".ifc#85253");
  const conversion = layer.getByTestId("material-design-conversion");
  const [, declared, factor, design] = (await conversion.innerText()).match(/λD ([\d.]+) × ([\d.]+) = λB ([\d.]+) W\/mK/)!;
  expect([Number(declared), Number(factor)]).toEqual([0.045, 1.03]);
  expect(Number(declared) * Number(factor)).toBeCloseTo(Number(design), 8);
  const resistance = Number((await layer.innerText()).match(/R ([\d.]+) m²K\/W/)?.[1]);
  expect(resistance).toBeCloseTo(0.06 / Number(design), 3);
  await expect(conversion.getByRole("link")).toHaveAttribute("href", /21727160\/files\/.*\.pdf#page=13$/);
  await expect(roof).toContainText("building energy input may instead use ground coupling, combined wall leaves or a source-stated U");
  await page.screenshot({ path: testInfo.outputPath("klassiqua-source-material.png") });

  await page.getByTestId("reference-info-tab-data").click();
  const data = page.getByTestId("reference-info-panel-data");
  await data.locator("summary").filter({ hasText: "Model quantities & evidence" }).click();
  const floor = data.locator("dl > div").filter({ has: page.getByText("Floor area", { exact: true }) });
  expect(Number((await floor.locator("dd").first().innerText()).replaceAll(",", "").match(/[\d.]+/)?.[0])).toBe(1507);
  await expect(floor).toContainText("48 spaces with no area quantity use measured plan unions");
  await expect(data).toContainText("832.7 m²");
  await expect(data).toContainText("floor-edge bands");
  await expect(data).toContainText("(0–14 m)");
  await expect(data).toContainText("Upper parapet faces are recorded separately and excluded");
});
