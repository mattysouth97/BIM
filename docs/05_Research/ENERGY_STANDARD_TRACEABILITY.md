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
| Layer↔U consistency | `energy-diagnostics/ledger-baseline-model.ts` `assumedLayers` (insulation thickness solved to the era U; empty when unreachable) | `material-standards.test.ts` exact ISO-6946 round-trip |
| 별표1/ZEB assessment | `energy-diagnostics/standards-assessment.ts` (presentation-only; ZEB row always 참고용) | `material-standards.test.ts` |
| 민감도 (real runs) | `energy-diagnostics/sensitivity.ts` (thickness sweep + parameter ranking; every point = one engine run) | `material-standards.test.ts` determinism + monotonicity |
| 기준 버전 UI | `components/energy-diagnostics/standards-panel.tsx` (engine id/version, input hash, standards list) | live QA 2026-08-31 |
