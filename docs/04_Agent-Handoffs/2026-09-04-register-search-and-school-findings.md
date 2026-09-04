# 서울청운초등학교 — what was wrong, what was fixed, what is still open

Written 2026-09-04 by session `green [fe5dbc]`. Everything here is measured, not
inferred; each item says how it was measured so nobody re-derives it.

The user's report was: *"the MEP mapping has an error for 서울청운초등학교. A lot of
things are not working here."* It was not one bug. Two are fixed; five are open
with owners; one turned out to be narrower than first reported.

## The building

    mgmBldrgstPk  1002122071
    routable URL  /building/11110-10100-0-0123-0000     <- NOT /building/1002122071
    dongNm        서울청운초등학교
    mainPurpsCd   10000  교육연구시설
    5F / 2B, 19.5 m, 건축면적 2,749.71 m², 연면적 12,957.58 m², 대지면적 9,585.5 m²
    strctCd 21 철근콘크리트구조, useAprDay 20050218
    서울특별시 종로구 청운동 123번지 / 자하문로 105

Real numbers throughout — no documented zeros — so the whole "unavailable data"
class of causes is ruled out for this building.

Reproduce the register row:

```bash
curl -s -H "Origin: https://bim-self.vercel.app" \
  "https://bim-self.vercel.app/api/bldrgst/title?sigunguCd=11110&bjdongCd=10100&numOfRows=100&pageNo=4"
```

Local dev cannot do this: `DATA_GO_KR_API_KEY` is unset on this machine, so the
proxy returns 401. Production has it (`/api/health` → `keys.dataGoKr: true`).

## Fixed

**The 주용도 filter only examined one page.** `ledger-lookup.tsx` matched
`mainPurpsCd` client-side over a single 20-row page, and pagination was *hidden*
while a filter was active — a guard against silently dropping matches from other
pages, which instead made the failure total. 청운동 holds **358** rows and the
school is **row 344**, so filtering 교육연구시설 reported **zero** of the **21**
that exist. Fixed in `86ba601`: `searchAllBuildings` pages the district, filtering
runs across all of it, the pager returns over the filtered set, and a truncated
sweep says "N of M examined" rather than presenting itself as complete.

The lesson, worth keeping: **a guard that makes a failure total instead of partial
is worse than the failure it prevented.**

**The QueryClient trap.** `dd0162d` adds `src/test-utils/render-with-query.tsx`
(`renderWithQuery`, `queryWrapper`, `testQueryClient`). Use it instead of bare
`render()` for any tree that might query — five test files had already hand-rolled
the same wrapper, and a bare `render()` fails with `No QueryClient set` the moment
someone adds a hook, blaming the provider rather than the change.

## Open, with owners

**Floor area overstated by 48.5% — purple.** The twin extrudes 건축면적 uniformly
over all 7 storeys: `2749.71 × 7 = 19,247.97 m²` against the register's stated
연면적 of `12,957.58 m²`. The twin reports `Rooms: 7 · 19247.6 m²`, which matches
the prism to **0.37 m²**. This moves the headline number: the page shows
**51.2 kWh/m²·yr**, and the same absolute demand over the real area is **76.1**.

**No interior subdivision — purple. This is the answer to the MEP question.** For
a 12,958 m² school the twin contains `Rooms: 7` (exactly 1.00 per storey, mean
area 2,749.7 m² — a whole floor plate), `Doors: 2`, `Mechanical Equipment: 11`,
`Walls: 28`, `Windows: 925`. plant→riser→main→branch→terminal has no terminals to
serve because each floor is one undivided space. **The MEP engine is not broken;
it is being asked to zone a building with no interior.** Nothing in `src/lib/mep`
was touched, and its clash/gravity/connectivity thresholds are not implicated.

**A school is labelled 업무시설 — orange.** `rules.ts:181-190`:
`buildingUseFamily("10000")` takes prefix `"10"`, matches none of 01/02/14/03/04/07,
returns `"default"`; `chooseArchetype` then falls to the era branch and returns
archetype `vrf` with reason **"2000년 이후 업무시설: 시스템에어컨(VRF) + 환기유닛 관행"**.
The reason string asserts 업무시설 for a 교육연구시설. An assumption is fine; one
that misnames the building's use class is the honesty defect the
stated-versus-assumed invariant exists to prevent, in a place `createEnergyFact`
does not reach.

**`SYSTEM_RATIOS` fallback is silent — orange.** `system-breakdown.ts:112`:
`SYSTEM_RATIOS[prefix] ?? DEFAULT_RATIOS`, with no flag, provenance or assumption
record. The table holds only 01/02/07/14. Measured use mix of 청운동:
`01000×200, 02000×71, 04000×45, 10000×21, 03000×10, 06000×3, Z8000×3, 05000×2,
11000×2, 23000×1` — so **77 of 358 buildings (21.5%) get generic ratios silently**.
Extending the table is a data question (MOLIT), not a code one: do not invent
ratios. `DEFAULT_RATIOS.dhw = 0.12` is implausible for a school with a 급식실.

**`mgmBldrgstPk` destroyed by float64 — orange.** `api-proxy.ts:66` reads the body
as text; **`:100` then does a plain `JSON.parse`**, so a bare 22-digit integer
becomes a lossy double. Raw production response contains
`"mgmBldrgstPk":1.0000000000000052e+21`. **16 of 358 rows (4.5%)** are affected,
13 distinct mangled values, and **3 of those are each shared by two different
buildings** — mutually indistinguishable and permanently unaddressable. The digits
are still intact in the text at `:66`, so quoting long integer literals before
parsing fixes it. Independent of the school (its pk is 10 digits).

**Four `cad-request-panel` tests — carried known-red.** After `dd0162d` the
provider error is gone and one of five passes. The remaining four fail as
`Unable to find an element by: [data-testid="cad-request-result"]`: the test's
`fetch` catch-all returns `{reader:"deterministic", model:null}` for
`/api/osm/building` and `/api/cad/web-evidence`, which is not valid for either, so
the run never reaches a result. Fixture gap in `0ba9c38`'s feature; the mock
shapes were deliberately not guessed. Carried because this red names its own
cause — the previous one blamed the provider and misdirected two sessions.

## Narrower than first reported

**`/building/<mgmBldrgstPk>` 404s, but normal search is unaffected.**
`isRoutableBuildingId` → `parseBuildingId` (`constants.ts:200-202`) requires
exactly five hyphen-separated parts, so every register pk 404s. **But
`search-results-table.tsx:284` already composes the correct id** via
`encodeBuildingId(sigunguCd, bjdongCd, platGbCd, bun, ji)`, so a searching user is
fine. Only someone arriving with a raw pk — a bookmark, the register itself, or an
agent — hits it. Worth a friendlier not-found; a redirect is **not** derivable,
since pk → 번/지 cannot be computed locally.

**VWorld returns the wrong building here, but it was not the cause.**
`/api/vworld/footprint?lat=37.5865&lng=126.9690` returns a 5-point ring of
**94.4 m²** with `groundFloors: 2`, graded `source: "building"` — i.e. observed —
against a register stating 2,749.71 m² and 5 storeys, a **29.1×** error. Real
defect, and distinct from the parcel bug: that was "the lot reported as the
building", this is "the wrong building reported as the building". But the twin
never used it (the `Rooms` arithmetic above proves it used 건축면적), and yellow's
`e3e1534` area-sanity guard now sets aside candidates outside 0.5×–2.0× of
건축면적. On this building the 3,116 m² OSM ring was already winning.

## API facts worth not rediscovering

- **`numOfRows` is capped at 100.** Requested 500 and 1000; both returned
  `numOfRows: 100, items: 100`. A district costs one request per 100 rows.
- **`mainPurpsCd` is ignored by the register** — it must be filtered client-side,
  which is why the filter has to see the whole district to be honest.
- The register's four endpoints fail independently: this building's page shows
  **건축물대장 2/4**.
- `/api/cad/web-evidence` returns **HTTP 200** with `{"available":false}` when
  `ANTHROPIC_API_KEY` is unset — deliberate (the route is healthy, the capability
  is unconfigured), but the body is the only signal, so status-code monitoring
  reads a permanently-unusable source as healthy.
