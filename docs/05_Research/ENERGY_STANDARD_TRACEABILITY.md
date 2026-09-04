---
type: research
status: reference
created: 2026-08-31
tags: [energy, eco2, zeb, standards, traceability]
---

# ENERGY_STANDARD_TRACEABILITY

Standards ledger for the ECO2-native energy diagnostic. Every implemented
coefficient, threshold or formula cites a row here. Verification status is
explicit — **verified-official** (fetched from an authoritative source this
session), **training-knowledge** (well-established, not re-fetched), or
**assumption** (engineering assumption, labelled in the UI as such).

The product NEVER claims "ECO2 equivalent", "인증 적합" or "공식 결과".
Everything it computes is 설계 검토용 참고 계산 (design-stage diagnostic),
displayed with the 기준 버전 below.

## 1. Regulatory framework (verified-official, 2026-08-31)

| ID | Standard | Version / date | What it governs | Source | Status |
|---|---|---|---|---|---|
| STD-ZEB-RULE | 제로에너지건축물 인증 기준 | 국토교통부고시 제2024-893호, 시행 2025-01-01 | ZEB certification: grades, 자립률, 1차E 기준. Absorbed the former 건축물 에너지효율등급 인증 (2025-01 통합, ZEB플러스 등급 신설) | law.go.kr admRulSeq 2100000251410; zeb.energy.or.kr | verified-official |
| STD-ZEB-GRADES | ZEB 인증 등급표 | 2025 scheme | Grade = the better of (에너지자립률, 1차에너지소요량) — see §2 | zeb.energy.or.kr/BC/BC03/BC03_05_002.do (fetched) | verified-official |
| STD-SAVING | 건축물의 에너지절약설계기준 | 국토교통부고시 제2025-738호, 2025-12-16 고시, 시행 2025-12-31 | 별표1 지역별 부위별 열관류율 한계 (§3), 단열재 등급, 지역구분; 에너지소요량 평가 기준 200→150 kWh/m²·yr 강화 | law.go.kr admRulSeq 2100000269510 + official 별표1 attachment (fetched, numbers extracted) | verified-official |
| STD-ECO2 | ECO2 (인증 평가 프로그램) | ECO2_2025V1 (2025 게시) | ZEB 인증 계산: 월별 준정상상태법, 66개 기상지역, 난방·냉방·급탕·조명·환기 5개 부문 | beec.energy.or.kr BC04_05_002 (program notice) | verified-official (existence/scope; algorithm internals NOT public) |
| STD-ECO2OD | ECO2-OD | v2018-lineage, current online 소비총량 평가 | 에너지절약계획서 내 건축물 에너지소요량 평가서; ISO 13790 기반, 동일 5부문 | kibea.org, kosata.org, min24.energy.or.kr manual | verified-official (scope) |
| STD-ISO13790 | ISO 13790 (KS L ISO 13790) | 2008 | Monthly quasi-steady heating/cooling need method that ECO2/ECO2-OD derive from (utilization factors η, gain/loss balance) | referenced by ECO2-OD documentation | training-knowledge (method), publicly documented |
| STD-ISO52016 | ISO 52016-1 | 2017 | Successor to 13790 (hourly + monthly); NOT currently the normative Korean method — Korean programs remain on the 13790-family monthly method | — | training-knowledge |
| STD-ISO6946 | ISO 6946 / KS F 2277 계열 | current | Assembly R/U calculation: R_T = Rsi + Σ(d/λ) + Rse; surface resistances | — | training-knowledge (universal method) |

**What ECO2 calculates (and this app mirrors):** monthly 에너지 요구량
(난방·냉방) via gain/loss balance with utilization factors → 에너지 소요량
per 부문 (난방·냉방·급탕·조명·환기) applying system efficiencies →
1차 에너지소요량 via 환산계수 → (ZEB) 자립률 with renewable production.

**What cannot be reproduced exactly:** ECO2's internal coefficients
(부분부하 곡선, 배관손실 상세, monthly 기상 66지점 데이터셋, 소요량 보정)
are not published. This app implements the documented method family and
verified thresholds, validates its own physics analytically, and reports
결과 as 참고 진단 — never as the certification number. See
`docs/05_Research/validation/reference-cases/README.md`.

## 2. ZEB 인증 등급 (verified-official — zeb.energy.or.kr, fetched 2026-08-31)

Grade = the HIGHER of the two criteria. 1차E figure is (소요량 − 신재생 상쇄).

| 등급 | 에너지자립률 | 1차E 주거 (kWh/m²·yr) | 1차E 비주거 (kWh/m²·yr) |
|---|---|---|---|
| ZEB+ | ≥ 120% | < −10 | < −70 |
| 1등급 | ≥ 100% | < 10 | < −30 |
| 2등급 | ≥ 80% | < 30 | < 10 |
| 3등급 | ≥ 60% | < 50 | < 50 |
| 4등급 | ≥ 40% | < 70 | < 90 |
| 5등급 | ≥ 20% | < 90 | < 130 |

Implementation: `src/lib/energy-standards/zeb.ts` (`zebGradeOf`).

## 3. 별표1 지역별 부위별 열관류율 한계 (W/m²·K) — verified-official
(official 별표1 attachment of the current rule, fetched from law.go.kr)

거실의 외벽, 외기 직접:
| | 중부1 | 중부2 | 남부 | 제주 |
|---|---|---|---|---|
| 공동주택 | 0.150 | 0.170 | 0.220 | 0.290 |
| 공동주택 외 | 0.170 | 0.240 | 0.320 | 0.410 |

거실의 외벽, 외기 간접: 공동주택 0.210/0.240/0.310/0.410 · 공동주택 외 0.240/0.340/0.450/0.560

최상층 거실 반자/지붕: 직접 0.150/0.150/0.180/0.250 · 간접 0.210/0.210/0.260/0.350

최하층 거실 바닥(외기 직접): 난방 0.150/0.170/0.220/0.290 · 비난방 0.170/0.200/0.250/0.330
최하층 거실 바닥(외기 간접): 난방 0.210/0.240/0.310/0.410 · 비난방 0.240/0.290/0.350/0.470
바닥난방 층간바닥: 0.810

창 및 문, 외기 직접: 공동주택 0.900/1.000/1.200/1.600 · 공동주택 외(창) 1.300/1.500/1.800/2.200 · 공동주택 외(문) 1.500
창 및 문, 외기 간접: 공동주택 1.300/1.500/1.700/2.000 · 공동주택 외(창) 1.600/1.900/2.200/2.800 · 공동주택 외(문) 1.900
공동주택 세대현관문·방화문: 직접 1.400 / 간접 1.800

지역구분(1)~(3): 중부1 = 강원 내륙(춘천 등)·경기북부 일부·충북 제천·경북 봉화/청송,
중부2 = 서울·인천·대전·세종·경기 나머지·충청 대부분 등, 남부 = 부산·대구·울산·광주·
전남·경남·경북 남부 등, 제주도 별도.

Implementation: `src/lib/energy-standards/u-value-limits.ts`.

## 4. Physics formulas implemented

| ID | Variable | Unit | Formula / interpretation | Basis | Status |
|---|---|---|---|---|---|
| PHY-R-LAYER | Layer resistance R | m²K/W | R = d/λ (d in m) | ISO 6946 | universal |
| PHY-R-ASM | Assembly R_T | m²K/W | Rsi + ΣR_layer + R_cavity + Rse | ISO 6946 | universal |
| PHY-RSI-RSE | Surface resistances | m²K/W | wall: Rsi 0.11, Rse 0.043; roof(up): Rsi 0.086, Rse 0.043; floor(down): Rsi 0.15, Rse 0.043 — 실내표면 0.11/0.086/0.15 계열 per KS 관행 (에너지절약설계기준 해설서 값) | 해설서/KS | training-knowledge |
| PHY-U | Assembly U | W/m²K | U = 1/R_T | ISO 6946 | universal |
| PHY-HTR | Transmission coefficient H_tr | W/K | Σ U·A (existing engine: + additive ΔU_tb thermal-bridge surcharge on walls) | ISO 13789 | universal (simplified in engine) |
| PHY-HVE | Ventilation coefficient H_ve | W/K | ρ·c·V̇ = 0.34 Wh/m³K × ACH × Volume | ISO 13789 | universal |
| PHY-ANNUAL | Annual demand | kWh | Degree-day method: heating [Σh_air·HDD·24 + h_ground·ΔT_g·4380]/η; cooling [Σh_air·CDD·24 + A_win·SHGC·I_cool·0.7]/COP. **NOT the ISO 13790 monthly method** — no monthly loop, no utilization factors, no internal gains. Disclosed in-product as a screening approximation (adapter approximation ledger + StandardsPanel) | existing src/lib/energy engine | implemented (screening); 13790 monthly method NOT implemented |
| PHY-GROUND | Ground-floor U (slab on ground) | W/m²K | B' = A/(0.5P); d_t = w + λ_g(R_si+R_f+R_se); U = (2λ_g/(πB'+d_t))·ln(πB'/d_t+1) for d_t < B', else λ_g/(0.457B'+d_t). R_si 0.17 / R_se 0.04 are ISO 13370's own, NOT the 해설서 values in PHY-RSI-RSE | ISO 13370:2007 §9.1/§9.3 | implemented in `energy-standards/ground-coupling.ts`; **NOT yet wired into the engine** — `heat-loss.ts` still reads the ground-floor U from the assembly and compensates with a reduced ΔT (indoor vs 13.5 °C), which swaps the sink temperature but omits the soil resistance: ~14x too high end to end |
| PHY-PEF | 1차에너지 환산계수 | — | 전력 2.75, 연료(가스·유류) 1.1, 지역난방 0.728, 지역냉방 0.937 | 에너지절약설계기준/ECO2 관행 계수 | training-knowledge — factor set embedded in every result (`primary.factorsUsed`) |

## 5. Material property library sources

Generic λ/ρ/c values in `src/lib/energy-standards/materials.ts` are drawn
from the 단열재 등급분류 (에너지절약설계기준 별표2 가~라 등급 관행 값) and
KS-typical published ranges. Every entry carries `source` and
`confidence: "generic"`; manufacturer-certified values must be entered by
the user and are stored with `confidence: "certified"` + provenance.
None are presented as manufacturer performance. Representative anchors
(training-knowledge, mid-range of published bands):

- EPS (비드법 2종) λ ≈ 0.031–0.037 → entries per grade
- XPS (압출법) λ ≈ 0.027–0.031
- PIR/PUR 준불연 보드 λ ≈ 0.023–0.028 · 페놀폼 λ ≈ 0.018–0.021
- 글라스울/미네랄울 λ ≈ 0.033–0.042
- 철근콘크리트 λ 1.6–2.3 (2.3 사용, 해설서 값), 시멘트모르타르 1.4,
  석고보드 0.18, 콘크리트벽돌 0.6–0.96, 목재 0.12–0.17, 화강석 2.9–3.3
- 공기층 R: 20mm+ 비환기 중공층 ≈ 0.17–0.18 m²K/W

## 5.1 International tabulated design values (non-Korean reference buildings)

Added 2026-09-04 for reference building #1, the buildingSMART Medical-Dental
Clinic (a US building). **Korean 별표 values are a substitution there, not a
source.** Citing them as though they described that building would be the same
category of error the stated-versus-assumed invariant exists to prevent, so
these entries cite international tables directly and say which.

Source hierarchy applied, in order:
EN ISO 10456:2007 / EN 12524:2000 → KS / 별표 → a named manufacturer figure,
labelled as a manufacturer figure and never promoted to a standard.

**On citing EN 12524 rather than ISO 10456.** EN ISO 10456:2007 is not freely
readable. Its tabulated design values were carried forward from EN 12524:2000,
which is. Every row below quotes **EN 12524:2000 Table 1** by that table's own
row name. This is written down rather than glossed: the values are cited as
what was actually read, not as an ISO table nobody opened.

| id | value | Source, by row | Note |
|---|---|---|---|
| `mb-epdm` | λ 0.25, ρ 1150, c 1000 | EN 12524:2000 Table 1, "Ethylene propylene diene monomer (EPDM)" | |
| `ins-polyiso` | λ 0.0253, c 1400 | ASTM C1289 LTTR design value R-5.7/in → λ = 0.0254 / (5.7 × 0.1761102); c from EN 12524:2000 Table 2, rigid PU foam | **ρ deliberately unset** — EN 12524 gives only a 28–55 kg/m³ range, and a range is not a design value |
| `mt-steel-deck` | λ 50, ρ 7800, c 450 | EN 12524:2000 Table 1, "Steel" | R ≈ 0.0008 m²K/W at 38 mm. Listed so the layer stack matches the drawing, not because it resists anything |
| `wd-plywood` | λ 0.13, ρ 500, c 1600 | EN 12524:2000 Table 1, "Plywood", ρ = 500 row | The table also lists 300→0.09, 700→0.17, 1000→0.24 |
| `pnl-imp-pir42` | fixed R 1.75 m²K/W at 42 mm | Manufacturer aged R-6.0/in, **a manufacturer figure, not a table value** | Published aged band R-6.0…6.5/in ⇒ 1.66–1.89. A composite product, so it carries an R for one thickness, not a λ |
| `air-iso-h25` | fixed R 0.18 | ISO 6946:2007 Table 2, unventilated air layer, horizontal heat flow | Table 2 is flat at 0.18 for 25/50/100/300 mm horizontal |
| `fin-plasterboard-iso` | λ 0.25, ρ 900, c 1000 | EN 12524:2000 Table 1, "Gypsum plasterboard"; table note (b): λ includes the paper liners | Coexists with `fin-gypsum` (KS 0.18). Different sources, not a typo — see below |

### Two existing values, checked rather than assumed

- **`fin-gypsum` λ 0.18 is a KS-practice value and stays.** EN 12524 lists
  gypsum plasterboard at **0.25** (ρ 900); 0.18 is that table's *gypsum
  insulating plaster* at ρ 600. For a US building 0.18 overstates the board's
  resistance by 39% (0.089 vs 0.064 m²K/W on 16 mm) — about 1% of the wall's
  total R, so small in effect but wrong in provenance. Resolved additively:
  `fin-plasterboard-iso` added, `fin-gypsum` untouched.
- **`st-rc` λ 2.3 is confirmed usable.** EN 12524 gives reinforced concrete
  with 1% steel as ρ 2300 / λ 2.3 and with 2% steel as ρ 2400 / λ 2.5; the repo
  pairs λ 2.3 with ρ 2400. λ is what the U path reads, so the density mismatch
  changes nothing computed today. Left alone.

### What these produce, and the two findings that came out of it

Computed through `calculateAssembly` on the IFC's own thicknesses. Note these
carry the repo's **Korean 별표 surface resistances** (walls 0.11/0.043, roofs
0.086/0.043) rather than ISO 6946 Table 1 (0.13/0.04, 0.10/0.04) — a documented
substitution in `assembly.ts` worth ~1% here.

| Assembly | Layers (mm) | U (W/m²K) |
|---|---|---|
| Roof | EPDM 6 / polyiso 76 / steel deck 38 | **0.317** |
| Exterior wall | IMP 42 / cavity 38 / plywood 19 / cavity 152 / plasterboard 16 | **0.404** |
| Ground slab | concrete 150 | 3.87 — see finding 2 |

1. **The roof is R-17.1ci, not R-20ci.** 76 mm at the ASTM C1289 LTTR design
   value is R-17.1; ASHRAE 90.1-2007's "insulation entirely above deck" R-20ci
   needs ≈ 89 mm. No real rigid insulation reaches R-20 in 76 mm — polyiso is
   already the best of the candidates. So the modelled roof falls one board
   increment short of the standard it was expected to match; either the 76 mm
   is not the as-designed thickness, or the building does not meet 90.1-2007
   above deck. This is a finding about the model, not a value to tune.
2. **The ground slab must not be given an air-to-air U at all.** 150 mm of
   concrete alone computes to 3.87 W/m²K, which is arithmetically correct and
   physically meaningless: a slab on grade loses heat to the ground, which is
   ISO 13370 ground-coupling, not `calculateAssembly`. Any number this path
   produces for a ground floor is wrong by construction.
3. **The steel-stud cavity is the largest unquantified error in the wall.**
   ISO 6946 §5.3.1 assumes an air layer that is *not* subdivided; the 152 mm
   layer is subdivided by steel studs. Treating it as 0.18 m²K/W ignores the
   framing bridge entirely, which for steel framing is tens of percent, not a
   rounding error. The entry says so in its own `sourceNoteKo`. Correcting it
   needs ISO 10211 numerical or the ASHRAE zone method — neither is in scope
   here, and the honest output is a stated assumption, not a nudged λ.

Regression: `src/lib/energy-standards/__tests__/clinic-materials.test.ts`,
which also pins every pre-existing entry's value so this section stays
additive-only.

## 6. Asset vs operational separation

Standardized(자산/설계) 평가 uses 표준 운전조건 (schedules, setpoints,
내부발열) and NEVER claims to predict utility bills. Operational data, where
present elsewhere in the product (BAS/고지서), stays in separate surfaces.
UI copy: "표준 조건 기준 설계 평가이며 실제 사용량과 다릅니다."

## 7. Implementation ledger (append-only)

| Row | Where implemented | Validation |
|---|---|---|
| STD-ZEB-GRADES | `src/lib/energy-standards/zeb.ts` (`zebGradeOf`) | `zeb.test.ts` vs table §2 (boundaries, monotonicity) |
| STD-SAVING 별표1 | `src/lib/energy-standards/u-value-limits.ts` | `u-value-limits.test.ts` spot checks vs table §3 |
| PHY-R-LAYER/R-ASM/RSI-RSE/U | `src/lib/energy-standards/assembly.ts` (`calculateAssembly`, `thicknessForTargetU`) | `assembly.test.ts` analytical + metamorphic |
| PHY-HTR/HVE/ANNUAL | existing `src/lib/energy/{heat-loss,annual-demand}.ts`, unchanged; reached via `energy-diagnostics/adapter.ts` | `heat-loss.test.ts` closed-form, `bim-accuracy.test.ts` tiers |
| PHY-PEF | `energy-diagnostics/adapter.ts` `derivePrimaryEnergy` using `PRIMARY_ENERGY_FACTORS` | `material-standards.test.ts` per-fuel algebra |
| §5 material library | `src/lib/energy-standards/materials.ts` (all `confidence: "generic"`) | reviewed against §5 bands |
| PHY-GROUND | `src/lib/energy-standards/ground-coupling.ts` (`slabOnGroundUValue`, `slabOnGroundUValueRange`) | `__tests__/ground-coupling.test.ts` — Clinic derivation, soil bound, B'/insulation monotonicity, branch continuity at d_t = B', and the end-to-end comparison against the current engine path |
| §5.1 international entries | same file, EN 12524 / ISO 6946 / ASTM C1289 family (still all `confidence: "generic"`) | `__tests__/clinic-materials.test.ts` — each sourced value pinned to its cited row, plus an additive-only guard over all 18 pre-existing entries |
| Layer↔U consistency | `energy-diagnostics/ledger-baseline-model.ts` `assumedLayers` (insulation thickness solved to the era U; empty when unreachable) | `material-standards.test.ts` exact ISO-6946 round-trip |
| 별표1/ZEB assessment | `energy-diagnostics/standards-assessment.ts` (presentation-only; ZEB row always 참고용) | `material-standards.test.ts` |
| 민감도 (real runs) | `energy-diagnostics/sensitivity.ts` (thickness sweep + parameter ranking; every point = one engine run) | `material-standards.test.ts` determinism + monotonicity |
| 기준 버전 UI | `components/energy-diagnostics/standards-panel.tsx` (engine id/version, input hash, standards list) | live QA 2026-08-31 |
