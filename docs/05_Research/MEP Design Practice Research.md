---
type: research
status: reference
created: 2026-08-31
tags: [mep, hvac, plumbing, electrical, fire, routing, bim]
---

# MEP Design Practice Research

Rules extracted from real MEP engineering and BIM coordination practice, each
classified so the generator can label its own output honestly:

- **U** — universal engineering principle (physics or near-universal practice)
- **H** — heuristic (common practice, defensible default, not law)
- **C** — code-specific (jurisdictional; must be labelled, never presented as certified)
- **M** — manufacturer/product-specific

Every rule states: what it is, why it matters, which system it affects, how it
influences generation, and how it can be tested. The implementation constant for
each rule lives in `src/lib/mep/rules/` and cites the rule ID below.

## 1. System topology

- **T1 (U)** — Every distribution system is a tree (or tree-with-loop for
  specific systems like sprinkler grids and hot-water recirc) rooted at a source:
  plant/AHU/panel/riser. Terminals never connect point-to-point to each other.
  *Generation:* build graphs source-outward: plant → riser → floor main → branch
  → terminal. *Test:* every terminal has exactly one path to a source; no orphan
  segments.
- **T2 (U)** — Supply and return/exhaust are separate networks with separate
  topology. A supply diffuser and a return grille never share a duct. *Test:*
  no edge joins two systems of different `service`.
- **T3 (U)** — Flow accumulates toward the source. A segment's design flow equals
  the sum of downstream terminal demands (with diversity factor ≤ 1).
  *Test:* monotone non-increasing flow from root to leaf.
- **T4 (H)** — Vertical distribution concentrates in shafts/risers aligned floor
  to floor; horizontal distribution branches from the riser per floor. Random
  floor-to-floor offsets are a hallmark of fake models. *Test:* riser segments
  share XY within tolerance across floors.
- **T5 (U)** — Electrical follows a strict hierarchy: utility/transformer → main
  switchboard → distribution board → branch panel → circuit → load. Loads never
  wire directly to the switchboard. *Test:* every load's path passes through
  exactly one panel.

## 2. HVAC air side

- **A1 (U)** — Duct sizing from airflow and velocity: `A = Q / v`. Design
  velocities (low-pressure commercial): mains 5–8 m/s, branches 3–5 m/s,
  terminal runouts 2–3 m/s (ASHRAE Fundamentals ch. 21 ranges). *Generation:*
  size each segment from accumulated flow at the class velocity; snap to
  standard sizes. *Test:* computed velocity within class band.
- **A2 (H)** — Rectangular duct standard increments: 50 mm steps (SMACNA
  practice); keep aspect ratio ≤ 4:1 (friction and fabrication). Round duct
  standard diameters: 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000 mm
  (ISO/EN preferred series, common in KR). *Test:* all emitted sizes ∈ catalog.
- **A3 (H)** — Cooling-driven supply airflow ≈ sensible load / (ρ·cp·ΔT), with
  ΔT ≈ 10 K ⇒ roughly **1.2–1.8 L/s per m²** of conditioned office floor
  (≈ 4–6.5 m³/h·m²). Use per-use-type W/m² loads already in the energy core.
  Label ESTIMATED. *Test:* zone airflow within plausible band for its use.
- **A4 (C, KR/ASHRAE 62.1)** — Minimum outdoor air per person ~ 25 m³/h·person
  (KR 기계설비 기준) / 62.1 rates. Drives OA duct + AHU OA intake existence,
  labelled code-indicative only.
- **A5 (H)** — One diffuser serves roughly 9–16 m² (2.5–4 m throw); diffusers
  placed on a ceiling grid, centred in the served zone, ≥ 600 mm from walls.
  *Test:* every occupied room ≥ 1 diffuser; spacing within band.
- **A6 (U)** — Duct fittings are real objects: elbows (radius or mitred with
  vanes), tees/taps, transitions where size changes, flexible connectors at
  fan/AHU connections. A size change without a transition fitting is invalid.
  *Test:* at every node where adjacent segment sizes differ, a
  transition/reducer fitting exists.
- **A7 (H)** — AHU location: rooftop or dedicated mechanical room; VAV/FCU in
  ceiling void near served zone; vertical supply/return risers in mechanical
  shafts. Sizing: AHU footprint scales with airflow (~1 m² per 1000 m³/h + core,
  M-class estimate).

## 3. Hydronics (chilled/hot water)

- **W1 (U)** — Pipe sizing from flow and velocity: 1.0–2.5 m/s for mains,
  0.6–1.2 m/s for branches; or pressure-gradient ≤ ~400 Pa/m. Standard nominal
  diameters (mm): 15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300.
  *Test:* velocity in band, sizes ∈ catalog.
- **W2 (U)** — Two-pipe minimum: supply and return run in parallel pairs with
  ~100–200 mm offset. Terminals (FCU/AHU coils) connect to both. *Test:* every
  hydronic terminal touches one supply and one return network.
- **W3 (H)** — Flow from load: `Q = P / (ρ·cp·ΔT)`, ΔT ≈ 5 K chilled / 10 K
  heating ⇒ chilled water ≈ 0.048 L/s per kW.
- **W4 (U)** — Insulation on chilled (condensation) and hot (loss) piping —
  render as increased apparent diameter, track as attribute.

## 4. Plumbing / drainage

- **P1 (U)** — Sanitary drainage is gravity: constant slope **2% for ≤ DN80,
  1% for ≥ DN100** (IPC/KR practice band 1–2%), always downhill toward the
  stack; invert elevation strictly decreases downstream. *Test:* every drainage
  segment's downstream invert < upstream invert; slope in band.
- **P2 (U)** — Drainage topology: fixture → branch → stack (vertical) → building
  drain. Stacks live in plumbing shafts/wet walls adjacent to fixture clusters.
  *Test:* every fixture reaches a stack; stack XY aligned floor-to-floor.
- **P3 (U)** — Vent piping parallels drainage, rises, and terminates above roof;
  every fixture group is vented. Simplified: one vent stack per sanitary stack.
- **P4 (H)** — Fixture-unit sizing (Hunter curve, simplified): branch DN50 up to
  ~6 FU, DN80 ~20 FU, stack DN100 typical for a residential/office stack.
  Label ESTIMATED.
- **P5 (U)** — Domestic water is pressurized and tree-topology from riser;
  cold + hot (+ recirc where hot run > ~15 m). Hot water originates at a water
  heater/boiler, not at the street. *Test:* DHW network's root is a heat source.
- **P6 (H)** — Wet services cluster: toilets/kitchens stack vertically; their
  fixtures sit within ~2 m of a wet wall/shaft. Routing wet branches across dry
  zones is a red flag.
- **P7 (U)** — Condensate drains from every cooling coil (FCU/AHU) route with
  slope to nearest drainage point.

## 5. Fire protection

- **F1 (C, NFPA 13-indicative)** — Sprinkler coverage: one head per ≤ 12 m²
  (light hazard, ~20.9 m²max but 3.0–4.6 m spacing typical); max spacing 4.6 m,
  min 1.8 m; ≥ 100 mm from walls, ≤ 2.3 m from any wall. Always label
  indicative, never certified.
- **F2 (H)** — Topology: fire riser (in stair/core) → floor control valve
  assembly → cross main → branch lines (parallel, regular spacing) → heads.
  Branch lines run perpendicular to the cross main — the comb pattern is the
  single most recognizable sprinkler signature. *Test:* branch lines parallel,
  spacing regular ±10%.
- **F3 (H)** — Pipe schedule (NFPA 13 light hazard, indicative): DN25 → 1 head
  … 2 heads DN25, 3 → DN32, 5 → DN40, 10 → DN50, 30 → DN65, 60 → DN80,
  cross main ≥ DN100.
- **F4 (U)** — Sprinklers sit below other services (heads must be unobstructed
  at ceiling); mains coordinate above ceiling with ~300 mm zone.

## 6. Electrical / low voltage

- **E1 (U)** — See T5 hierarchy. Panels serve a floor or zone (H: one lighting +
  one power panel per ~1000 m² floor area); electrical rooms/risers stack
  vertically.
- **E2 (H)** — Horizontal distribution: cable tray along corridors for feeders
  and heavy runs, conduit for branches. Tray widths: 150/300/450/600 mm.
  *Test:* tray segments lie within corridor zones.
- **E3 (H)** — Load densities (office, KR practice): lighting ~10–12 W/m²
  (LED era ~6 W/m²), receptacles ~20–30 VA/m², HVAC equipment from mechanical
  loads. Demand factors ~0.7–0.9. Label ESTIMATED.
- **E4 (U)** — Every mechanical equipment item is also an electrical load and
  must connect to a panel. *Test:* AHU/pump/chiller nodes appear as loads in
  the electrical graph.
- **E5 (U)** — Low-voltage (data/FA/BMS) may share tray routes but is a separate
  system with separate provenance; fire alarm devices connect to FA loops, not
  power circuits.

## 7. Coordination & service zones

- **Z1 (H, near-universal BIM practice)** — Ceiling-void vertical order, top to
  bottom: **(1) gravity drainage (slope-locked, wins all conflicts), (2) large
  supply/return/exhaust ducts, (3) cable tray, (4) pressurized water piping,
  (5) sprinkler branch pipes, (6) sprinkler heads/lights/diffusers at ceiling.**
  Configurable per project; the engine treats it as an elevation-band
  assignment, not a hard law. *Test:* each system's segments lie within its band
  unless a recorded crossing exists.
- **Z2 (U)** — Clearance ≠ geometry. Model maintenance envelopes: VAV/FCU
  600 mm access below; panels 900–1100 mm in front (NEC 110.26-indicative,
  KR similar); AHU one full unit-width service side; valve access.
  *Test:* clearance volumes intersect no other system's physical geometry.
- **Z3 (U)** — Never route through structural columns/beams or shear walls.
  Slab penetrations only at declared sleeve/shaft locations. *Test:* zero
  hard clashes vs structure.
- **Z4 (H)** — Corridors are the horizontal highways: mains run over corridors,
  branches enter rooms perpendicular to the corridor wall. This single rule
  produces most of the "designed by a human" look. *Test:* ≥ 70% of main-length
  within corridor/circulation zones.
- **Z5 (H)** — Orthogonal routing: segments run parallel to the building grid;
  45° only for drainage offsets. Bends minimized; two bends within < 1 m is a
  routing failure (except fitting offsets).

## 8. Sizing labels

Every numeric output carries one of: `calculated` (from physics with real
inputs), `estimated` (heuristic from floor area/use), `defaulted` (catalog
default), `imported` (from CAD/register), `user` (explicit input). This mirrors
the project's existing evidence discipline (`createEnergyFact`); MEP facts use
the same taxonomy but a separate lighter-weight mechanism (see architecture doc).

## 9. Korean practice notes (C)

- 기계설비법/KDS 31 govern mechanical building services; KDS 31 10 10 general,
  KDS 31 20/25 HVAC & plumbing. The app targets KR: use SI mm sizes, 25 m³/h·인
  ventilation, 열관류율 already era-indexed elsewhere.
- Korean apartment (아파트) practice: individual boilers (개별난방) or district
  heating (지역난방) per unit; vertical wet stacks at bathroom/kitchen; FCU rare —
  floor heating loops instead. The generator picks system archetype by 주용도
  (main use) from the register.
- Office practice: central AHU + VAV or EHP(VRF) per floor is dominant; VRF
  (시스템에어컨) extremely common post-2000.

## 10. System archetype selection (H)

| Use (register 주용도) | Era | HVAC archetype | Heat source |
|---|---|---|---|
| 업무시설 (office) | <2000 | Central AHU + perimeter FCU | Boiler + chiller |
| 업무시설 | ≥2000 | VRF + OA ventilation units | Heat pump (VRF) |
| 공동주택 (residential) | any | Floor heating + individual ERV | Individual/district boiler |
| 근린생활/판매 (retail) | any | Packaged AHU / ceiling cassettes | Rooftop / VRF |
| default | — | VRF | Heat pump |

*Test:* archetype choice is deterministic from (use, era) and recorded as an
assumption with this table as source.

## References consulted (concept level)

ASHRAE Handbook—Fundamentals (duct/pipe sizing chapters), SMACNA HVAC Duct
Construction Standards (rectangular increments, aspect ratio), NFPA 13
(sprinkler spacing/schedule concept), IPC/UPC (drainage slope, fixture units,
venting concept), NEC Art. 110.26 (working clearance concept), ISO 19650 /
buildingSMART IFC4 distribution schema (IfcDistributionSystem/FlowSegment/
FlowFitting/FlowTerminal), Revit MEP routing conventions (system-first,
connector-based), KDS 31 (Korean building-services design standards concept),
국토교통부 기계설비 설계기준. All encoded values above are engineering-practice
bands, not verbatim code citations; anything marked C is indicative only.
