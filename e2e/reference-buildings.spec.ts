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
   * Whether a CAPEX track (공공 지자체) reports that it covers nothing in this
   * building's FRESH chosen set. Measured 2026-09-06, not reasoned: three of
   * the four say so, and the Clinic does not — see the test for why its
   * silence is a different fact from the others' noise.
   */
  capexCoversNothing: boolean;
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
  { id: "bs-medical-dental-clinic", titleKo: "메디컬-덴탈 클리닉", grade: "1+", demandPerSqm: "108.8", capexCoversNothing: false },
  { id: "schependomlaan", titleKo: "스헤펜돔라안 아파트", grade: "1++", demandPerSqm: "40.5", capexCoversNothing: true },
  { id: "duplex-apartment", titleKo: "듀플렉스 아파트", grade: "4", demandPerSqm: "142.6", capexCoversNothing: true },
  // The fourth building states NO services models at all — its manifest
  // carries an empty `serviceLayers`, so the layers panel is the fabric row
  // and nothing else, and its licence is KIT/IAI's own grant rather than a
  // Creative Commons one. Both are read from the manifest below rather than
  // written here, so neither can be quietly assumed to match the others'.
  { id: "fzk-haus", titleKo: "FZK 하우스", grade: "2", demandPerSqm: "92.6", capexCoversNothing: true },
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

    test("a measure chip changes the model, and clicking it again puts it back", async ({ page }) => {
      // 3C inverted this row: the PRIMARY control is now one chip per measure,
      // and the six financing chips moved beneath it. So the thing that moves
      // the building is a measure chip, and the previous version of this test
      // — which clicked a financing chip and demanded the model change — was
      // asserting something 3C makes invariant on purpose.
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });
      const row = page.locator("[data-measure-chip-row]");
      await expect(row).toBeVisible({ timeout: FIRST_PAINT });

      // Everything here goes through attributes, never coordinates: the chip
      // row sits directly above the financing row inside one section, so a
      // stray position lands on the wrong control and silently re-picks the
      // work instead of re-pricing it.
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

      // Either direction. The Clinic arrives with NOTHING chosen — its
      // knapsack recommends none of its six at the default budget on the
      // unsubsidised track — so this test cannot assume there is a selected
      // chip to turn off, only that a chip can be toggled and put back.
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

    test("a financing chip re-prices the work and does not re-pick it", async ({ page }) => {
      // The point of 3C: money is a consequence of the chosen work, never a
      // chooser of it. So this asserts a change AND an invariant, and the
      // invariant is the half that used to be wrong.
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });
      const rail = page.locator("[data-twin-rail]");
      await expect(rail).toBeVisible({ timeout: FIRST_PAINT });

      const readRail = async () => (await rail.innerText()).replace(/\s+/g, " ").trim();
      const readDelta = async () =>
        (await deltaStrip(page).innerText()).replace(/\s+/g, " ").trim();
      const chosenChips = page.locator('[data-measure-chip][data-measure-chosen="true"]');

      // There has to be work before financing can re-price anything. The
      // Clinic arrives with none chosen, and on an empty selection the rail is
      // all zeroes and correctly does not move for any track — which would
      // make this test pass vacuously on three buildings and fail on the one
      // that had nothing to price. So choose a measure first if none is.
      if ((await chosenChips.count()) === 0) {
        const first = page.locator("[data-measure-chip]").first();
        const id = await first.getAttribute("data-measure-chip");
        await first.click();
        await expect(page.locator(`[data-measure-chip="${id}"]`)).toHaveAttribute(
          "data-measure-chosen",
          "true",
        );
      }

      const railBefore = await readRail();
      const deltaBefore = await readDelta();
      const chosenBefore = await chosenChips.count();

      // 민간 기본 rather than 공공 지자체, and the reason is the assertion's
      // premise rather than a preference. RESOLVED by bim-24 after this test
      // first recorded 공공 지자체 leaving the rail byte-identical on all four
      // buildings and handed it over as an open question:
      //
      //   `KOREAN_GR_PRIVATE_BASE` carries only a `financingMix` and no
      //   `subsidyByCategory`, so the private tracks are CATEGORY-BLIND — the
      //   interest buy-down is taken on `debtFraction × effectiveCapex` and
      //   never looks at `measure.category`. It therefore moves NPV for any
      //   selection with a positive effective CAPEX, which is why this
      //   assertion holds on all four. The public tracks are category-KEYED
      //   and omit `renewable` on purpose, so a CAPEX track moves the rail
      //   only for the part of the selection it actually covers.
      //
      // The boundary matters and is why the block above guarantees a chosen
      // measure first: an EMPTY selection has zero effective CAPEX, so even a
      // rate track moves nothing. "Any non-empty selection" is the true
      // sentence; "any selection" would not be.
      const track = trackChip(page, /민간 기본/);
      await track.click();
      await expect(track).toHaveAttribute("aria-checked", "true");

      // Re-prices: the rail's numbers move.
      await expect.poll(readRail, { timeout: FIRST_PAINT }).not.toBe(railBefore);
      // Does not re-pick: the chosen set is untouched and the modelled
      // before/after is byte-identical. A financing chip that moved the
      // building would mean the money was choosing the work again.
      expect(await chosenChips.count()).toBe(chosenBefore);
      expect(await readDelta()).toBe(deltaBefore);
    });

    test("a CAPEX track says so when it covers nothing that is chosen", async ({ page }) => {
      // The sharper half of the financing story, and the one that fails loudly
      // if someone ever adds `renewable` to a public preset — a real product
      // decision that would otherwise arrive disguised as a config tweak.
      //
      // Measured across all four rather than reasoned, and the result is not
      // the Clinic-versus-FZK pair it was proposed as. THREE buildings raise
      // the flag under 공공 지자체, not one: each arrives with a single chosen
      // measure that resolves to a zero subsidy ratio under the public
      // presets. The Clinic does NOT raise it, and its silence is a different
      // fact from the others' — post-3C its knapsack recommends none of its
      // six at the default budget, so nothing is chosen, and an empty set
      // makes no coverage claim either way. Reading that absence as "the
      // Clinic's work is covered" would be exactly wrong.
      await expect(energyStrip(page)).toContainText("kWh/m²·yr", { timeout: FIRST_PAINT });
      await expect(page.locator("[data-measure-chip-row]")).toBeVisible({ timeout: FIRST_PAINT });

      const track = trackChip(page, /공공 지자체/);
      await track.click();
      await expect(track).toHaveAttribute("aria-checked", "true");

      const notice = page.locator("[data-track-covers-nothing]");
      if (building.capexCoversNothing) {
        await expect(notice).toHaveCount(1, { timeout: 15_000 });
      } else {
        // And the reason it is absent here, asserted rather than assumed.
        await expect(notice).toHaveCount(0);
        expect(
          await page.locator('[data-measure-chip][data-measure-chosen="true"]').count(),
        ).toBe(0);
      }
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
