# 그린리모델링 사업 — Research Dossier for the BIM Simulator

**Date:** 2026-04-30
**Author:** Phase D₁ research pass
**Purpose:** Ground the Twin-stage CAPEX/ROI simulator in the real Korean
Green Remodeling Support Project structure rather than the placeholder
"DEFAULT_ECONOMIC_ASSUMPTIONS" we shipped in Phase B.
**Source quality:** Mix of official program portals, MOLIT/national-law
references, news coverage of the 2026 program restart, and peer-reviewed
analyses. Where program parameters have changed across years, the
**most-recent confirmed (2026)** number is preferred.

---

## TL;DR for the engine

**그린리모델링 (GR) is not one subsidy. It is two distinct tracks with very
different economic effects on a retrofit project's NPV/IRR.**

| Track | Building scope | Effect on the simulator's math |
|---|---|---|
| **공공건축물 직접지원** (public-building direct support) | Schools, public housing, healthcare, central/local-government buildings | Reduces **effective CAPEX** by 50% (Seoul + central) or 70% (other local) |
| **민간건축물 이자지원** (private-building interest support) | Private residential + non-residential | Reduces **effective discount rate** for the project's financing portion by 4–5.5 percentage points (loan-cost subsidy, not capex grant) |

The simulator currently supports only the first effect (`subsidyRatio` on
`EconomicAssumptions`). The second requires a small extension — a
`financingRateBuyDownPp` field that lowers the discount rate applied
to the cash-flow stream (or, equivalently, splits the discount rate into
financed and equity portions).

The simulator should let the user pick a track per scenario. Default = no
program (matches the legacy unsubsidized behavior) so existing tests don't
shift; presets `KOREAN_GR_PUBLIC_SEOUL_OR_CENTRAL`,
`KOREAN_GR_PUBLIC_LOCAL`, `KOREAN_GR_PRIVATE_BASE`, and
`KOREAN_GR_PRIVATE_HIGH_PERF` give one-click application.

---

## 1. Program operator + history

- **Current operator:** 그린리모델링 창조센터 (Green Remodeling Innovation Center), under the **Korea Authority of Land & Infrastructure Safety** (국토안전관리원). Operations historically tied to **LH** (Korea Land & Housing Corporation) and the **Korea Real Estate Board** at various points. The official portal is [greenremodeling.or.kr](https://www.greenremodeling.or.kr).
- **Policy ownership:** **Ministry of Land, Infrastructure and Transport (MOLIT)** — the program is administered under MOLIT's energy-performance-improvement portfolio.
- **Legal basis:** [그린리모델링 지원사업 운영 등에 관한 고시](https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000225858) (administrative rule on Green Remodeling Support Project operation).
- **History:** First launched **2014** as the 그린리모델링 이자지원사업 (interest-support project). Approximately **80,000 private-building cases** supported over 2014–2023. Program was **suspended for 2024**. **Restart announced March 2026** per multiple Korean news outlets, with the parameters captured below.

## 2. Public-building direct-support track (공공건축물 그린리모델링 지원사업)

### Subsidy ratio (capex grant)

| Building owner | Subsidy ratio |
|---|---|
| **Central government / national + Seoul Metropolitan Government** | **50%** of project cost |
| **Other local governments (other 시·도, 시·군·구)** | **70%** of project cost |

Source: [그린리모델링창조센터 국토안전관리원](https://www.greenremodeling.or.kr/) — search-result extraction (the homepage cites "서울특별시, 중앙·공공의 경우 해당 사업비의 50%, 그 외 지방자치단체는 70% 지원").

### Eligible buildings

- Schools, public housing, public healthcare facilities, libraries, government office buildings, daycare centers, community centers, and other public buildings owned by central or local government.
- Per MOLIT's 2020 statistic cited in [Yonsei energy-environmental-economic assessment paper (2023)](https://www.sciencedirect.com/science/article/abs/pii/S037877882300289X), **75% of Korean buildings are 15+ years old** and qualify as candidates for green remodeling.

### Funding cap

- Per-project cap varies by building type and year of allocation; published guidelines are at [공공건축물 그린리모델링 지원사업 가이드라인](https://www.greenremodeling.or.kr/include/filedown.asp?bid=notice&nFileSeq=14740). For the simulator, encode the percentage and let the absolute cap be a future refinement (the gigantic public projects are uncommon in our user base).

### Covered work scope

Required: at least one of the **필수공사** (mandatory works) — insulation
improvement, high-performance windows, airtightness, high-efficiency
HVAC, HRV, BEMS. Optional: cool roof, landscaping, water-saving devices,
metering, renewable energy.

For our simulator's category mapping:

| Our `RetrofitCategory` | GR public-track coverage | Notes |
|---|---|---|
| `envelope` | ✅ Mandatory work | Wall/roof/window/floor insulation all eligible |
| `hvac` | ✅ Mandatory work | Boiler, HRV, heat pump conversion eligible |
| `lighting` | ✅ Optional | LED + smart controls eligible but lower-priority for funding selection |
| `renewable` | 🟡 Partial | Solar PV typically routed through the **separate 신재생에너지 보급사업** (renewable energy supply project) rather than this program. **For the simulator: do NOT apply GR public subsidy to solar by default.** |

## 3. Private-building interest-support track (민간건축물 이자지원사업)

### Mechanism

Private building owners take a **commercial loan** to fund retrofit
construction. The government subsidizes a portion of the **loan interest**.
This is **not** a direct CAPEX reduction — the owner still finances 100%
of the construction cost; what's reduced is their cost of capital over
the loan term.

### Interest-support rates (2026 program parameters)

| Tier | Interest support rate | Eligibility |
|---|---|---|
| **Base** | **4.5 percentage points** | Standard private retrofit, energy performance improvement < 20% |
| **Tier 2** | **4.0 pp** | Energy performance improvement ≥ 20% OR window energy grade ≥ 3 (residential) |
| **Tier 3 (high)** | **5.5 pp** | Energy performance improvement ≥ 30% OR applicant is low-income / multi-child / elderly / newlywed household |

Sources:
- [3년 만에 그린리모델링 이자지원 재개…최대 5.5% 지원 - 매일신문](https://www.imaeil.com/page/view/2026031609291143104)
- [이자 최대 5.5% 지원…민간 그린리모델링 사업 3년 만에 재개 - 한국AI부동산신문](https://www.kairnews.com/news/474520)
- [국토교통부, '그린리모델링' 최대 5.5% 이자 지원 - 뉴스팸](https://www.newspem.com/23231)

### Loan limit (2026)

- Non-residential large buildings: **₩200 billion** (raised from ₩50 billion in prior years).
- Residential and small commercial: lower per-applicant caps; check the program portal at application time.

### How this enters the simulator

Given an annual interest-support rate of `s` percentage points, on a
loan-financed retrofit:

- The owner's **effective financing cost** = `loan_rate - s`. With Korean
commercial retrofit loan rates ~5–6% in 2025–2026, Tier 1 (4.5 pp) drops
the effective rate to ~0.5–1.5%, and Tier 3 (5.5 pp) can produce a
near-zero effective rate.
- For NPV calculation: the appropriate discount rate for the financed
portion of cash flow drops by `s`. A simulator that uses the same
`discountRate` for everything either:
  - **Overstates NPV** if it uses the post-subsidy 0.5–1.5% rate as if
    the equity portion were also financed at that rate, or
  - **Understates NPV** if it ignores the subsidy entirely.

The cleanest engine extension: add a `financingMix` field to
`EconomicAssumptions`:

```ts
interface EconomicAssumptions {
  // ... existing fields ...
  financingMix?: {
    /** Fraction of CAPEX financed via subsidized loan (0..1). */
    debtFraction: number;
    /** Pre-subsidy nominal loan rate (e.g., 0.055 for 5.5%). */
    loanRatePreSubsidy: number;
    /** Interest-support buy-down in percentage points (e.g., 0.045 for 4.5pp). */
    interestSupportPp: number;
    /** Equity (non-financed) portion uses the global discountRate. */
  };
}
```

Effective discount rate becomes the WACC:
```
effectiveRate = debtFraction × max(0, loanRatePreSubsidy − interestSupportPp)
              + (1 − debtFraction) × discountRate
```

Default `debtFraction = 0` (current behavior — full equity, no GR
private support). Setting `debtFraction = 0.7` and `interestSupportPp =
0.045` simulates a typical Korean private retrofit at 70% LTV with the
base GR support tier.

## 4. Eligibility rules to encode

### Building age

- **No formal minimum age** in either track at the program level.
- However, retrofit measures only generate energy savings if the building's current envelope U-values exceed modern targets — i.e., if it predates the **2008 enhanced insulation standard** or the **2018 zero-energy push**. Our `material-inference.ts` already infers U-values from `constructionYear` via era priors; measures self-filter (no measure is generated when current U ≤ target U).

### Building type filter for the simulator

- `useTypeCode = 0 (residential), 1 (office), 2 (mixed), 3 (retail), 4 (other)` — **all** are eligible candidates. The track determines whether the user gets direct subsidy (public route, requires public ownership) or interest support (private route).
- The simulator should ask the user **once** which track applies, not infer it from the building record (we don't have ownership data in `BuildingRecord`).

## 5. Cost basis reconciliation (KICT vs LH vs program)

Our `cost-database.ts` currently uses **KICT 2024** unit costs for envelope
measures (e.g., wall insulation ₩120,000/m², window replacement ₩350,000/m²).
The program guideline references published in 그린리모델링 사업 use a similar
order of magnitude but may differ by ±10–20% per item. For the simulator's
purpose (ROI ranking, not bid pricing), KICT 2024 is acceptable. **Action:**
add a footnote in the UI that costs are KICT 2024 estimates; project bids
will vary.

## 6. Performance targets

The program is performance-graded. Our default target U-values
(`KOREAN_2020_TARGET_U_VALUES` in `envelope-retrofits.ts`: wall 0.15,
roof 0.15, window 0.9, floor 0.18 W/m²K) match the **2020 Korean energy
code (제로에너지건축물 정의 등에 관한 고시)** and are the de-facto target
for GR-supported envelope work. Two derived performance tiers the
program rewards:

- **20% improvement vs baseline** → unlocks Tier 2 interest support (private)
- **30% improvement vs baseline** → unlocks Tier 3 interest support (private)

Our simulator can compute "improvement vs baseline" from
`(annualEnergySaving / preRetrofitDemand)` once we wire in the per-building
demand. For Phase D₂, default to "private base" tier (4.5 pp) and let the
user override; precise tier auto-selection is a Phase D₂.5 polish.

## 7. Required engine + UI changes (driving D₂–D₄)

### Engine (`src/lib/retrofit/`)

1. **`cost-database.ts`** — add four named presets:
   ```ts
   export const KOREAN_GR_PUBLIC_SEOUL_OR_CENTRAL: EconomicAssumptions = { /* 50% subsidy ... */ };
   export const KOREAN_GR_PUBLIC_LOCAL: EconomicAssumptions = { /* 70% subsidy ... */ };
   export const KOREAN_GR_PRIVATE_BASE: EconomicAssumptions = { /* 4.5pp on 70% LTV ... */ };
   export const KOREAN_GR_PRIVATE_HIGH_PERF: EconomicAssumptions = { /* 5.5pp on 70% LTV ... */ };
   ```

2. **`economic-model.ts`** — add the `financingMix` field on
   `EconomicAssumptions` and an `effectiveDiscountRate` helper that
   collapses `(discountRate, financingMix)` → single rate via WACC.
   `computeFinancials` uses the effective rate.

3. **`economic-model.test.ts`** — add tests for:
   - WACC calculation with debtFraction=0 (current behavior — unchanged)
   - WACC with debtFraction=0.7 + interestSupportPp=0.045 (private base tier)
   - Subsidy + financingMix together (rare combo, but well-defined)
   - The four named presets produce sensible NPVs on a typical envelope measure

4. **`useRetrofitScenario`** — add `programTrack: "none" | "public-seoul" | "public-local" | "private-base" | "private-high"` parameter, pick the corresponding preset.

### UI

5. **Track selector** — a small chip group in the simulator header letting
the user pick "no program / public Seoul / public local / private base /
private high-performance". Default = "no program" (matches Phase A/B/C
behavior).

6. **Source-of-truth unification** — both `scene-outliner.tsx` (left
image) and the Phase C overlay must read from `useRetrofitScenario`
instead of separately calling `assembleRetrofitReport`. After
unification, the numbers are guaranteed to agree.

7. **Restyle (D₄)** — match the white-background, slider-with-readout,
Korean-label aesthetic of the screenshots. Drop the dark editorial
overlay components.

## 8. Sources

### Official + government

- [그린리모델링창조센터 국토안전관리원 (Green Remodeling Innovation Center, Korea Authority of Land & Infrastructure Safety)](https://www.greenremodeling.or.kr/)
- [그린리모델링 지원사업 운영 등에 관한 고시 (administrative rule)](https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000225858)
- [공공건축물 그린리모델링 지원사업 가이드라인 (public-building program guideline PDF)](https://www.greenremodeling.or.kr/include/filedown.asp?bid=notice&nFileSeq=14740)
- [공공건축물 사업 - 사업개요](https://www.greenremodeling.or.kr/n1/business/bus1000.asp)
- [한국부동산원-그린리모델링 창조센터 운영](https://www.reb.or.kr/reb/cm/cntnts/cntntsView.do?mi=10345&cntntsId=1575)
- [그린리모델링 - 정책뉴스 | 대한민국 정책브리핑](https://www.korea.kr/special/policyCurationView.do?newsId=148899635)

### News (2026 program restart)

- [3년 만에 그린리모델링 이자지원 재개…최대 5.5% 지원 - 매일신문](https://www.imaeil.com/page/view/2026031609291143104)
- [이자 최대 5.5% 지원…민간 그린리모델링 사업 3년 만에 재개 - 한국AI부동산신문](https://www.kairnews.com/news/474520)
- [국토교통부, '그린리모델링' 최대 5.5% 이자 지원 - 뉴스팸](https://www.newspem.com/23231)
- ['그린리모델링' 사업 3년 만에 재개…창호교체 시장 달아오른다 - 헤럴드경제](https://biz.heraldcorp.com/article/10709515)
- [LH, 민간건축물 그린리모델링 이자 지원 사업 신청 접수 - LH 보도자료](https://www.lh.or.kr/gallery.es?mid=a10502000000&bid=0003&b_list=8&act=view&list_no=8691&nPage=288&vlist_no_npage=460&keyField=&orderby=)

### Academic / industry analyses

- [Energy-environmental-economic assessment of green retrofit policy to achieve 2050 carbon-neutrality in South Korea (Yonsei, ScienceDirect 2023)](https://www.sciencedirect.com/science/article/abs/pii/S037877882300289X)
- [Prefabricated Envelope Green Remodeling Potential of Public Office Buildings in Korea (MDPI Buildings 2024)](https://www.mdpi.com/2075-5309/14/7/2182)
- [Evaluation of Energy and CO₂ Reduction Through Envelope Retrofitting (MDPI Energies 2025)](https://www.mdpi.com/1996-1073/18/15/4129)
- [Analysis of the Energy and Economic Effects of Green Remodeling for Old Buildings: A Case Study of Public Daycare Centers in South Korea (MDPI Energies 2023)](https://www.mdpi.com/1996-1073/16/13/4961)
- [Building Energy Efficiency in Korea: Regulations, Smart Solutions & Success Stories (Veolia Korea)](https://www.veolia.kr/en/planet/building-energy-efficiency-regulations-smart-solutions)
- [Building Retrofit Program — Seoul Solution policy archive](https://seoulsolution.kr/en/content/building-retrofit-program)

## 9. Open questions for D₂

1. The screenshots show absolute KRW figures (₩20.6억 총 투자비, etc.) that don't match what our Phase C overlay computes. Is this because the screenshots are the legacy `report-engine.ts` output running on a *different* building, or are the same inputs producing different outputs? D₃ will resolve by collapsing both UIs onto one engine — the cause becomes irrelevant once unified.
2. Loan term assumption. GR private interest support typically applies for the full loan amortization period; Korean retrofit loans run 5–10 years. The simulator's analysis horizon is 20 years. We'll either (a) assume the loan amortizes within the analysis horizon and apply the buy-down to its years only, or (b) use the buy-down as a constant rate adjustment for simplicity. **D₂ default: option (b)** (simple); **D₂.5 polish: option (a)** if accuracy matters.
3. Whether to expose the full `financingMix` controls in the UI (debtFraction slider, loanRate input) or hide them behind the named presets. **Recommended: hide behind presets** for v1; expose advanced controls in a "고급" expand-on-demand section if user feedback asks for it.

---

**End of D₁.** Ready to proceed to D₂ (engine extension) when authorized.
