# KIT Office ingestion — 2026-09-07

Candidate: KIT/IAI `AC20-Institute-Var-2.ifc` (IFC4, ArchiCAD 20, exported
2017-01-11). The source explicitly calls it a fictional office example, and
`IfcSite.Description` says `No real site`. Its coordinates are rejected.

Source and explicit unrestricted-use grant, with required KIT/IAI attribution:
https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples

Download: https://www.ifcwiki.org/images/9/98/AC20-Institute-Var-2.ifc
SHA-256: `cfb2124497b25d9a72101075e84be0feb44ff669cb1bd3251be11efebeea945c`
The build configuration pins that hash; no raw IFC is committed.

## Measured and independently checked

- 82 enclosed spaces, 2,266.66 m²: basement 451.70, ground 455.80,
  first upper 441.62, second upper 441.62, attic storey 475.92 m².
- Attic storey = two `Dachboden` rooms (403.56 m²) + stair/circulation
  (72.36 m²). Its heating/occupancy is not stated.
- 362 PHYSICAL/EXTERNAL boundary links select 44 unique walls. Names are
  ambiguous and `IsExternal` absent. Their stated `NetSideArea` sums to
  940.81155257706 m², rounded 940.81. Boundary surface areas are not used.
- 206 exterior windows, 309.50 m²; one exterior door, 4.20 m².
- Basement slab union 516 m²; exposed outline perimeter 112 m.
- 21 curved roof strips. Element surface sum 793.93 m² double-counts overlaps;
  the energy input uses the sky-visible roof-plane sum 659.54 m² instead.
  Independent outline-area/normal-y calculation gives 659.49479 m²; the
  0.045 m² difference is artifact rounding. Projection union is 632 m².
- GLB: 2.08 MB, 40,288 triangles. No services model is supplied.

## Named limitations

Thermal and operating inputs are estimates: concrete-brick conductivity
surrogate for the stated calcium-silicate masonry, uninsulated metal-roof
limit, Korean office/glazing/airtightness defaults, Seoul climate, and all
enclosed spaces assumed conditioned. Including the attic can understate
intensity; assuming no roof insulation can overstate retrofit savings;
pricing basement walls against outdoor air can overstate heating demand.
`energy.scopeNotice` carries these directions for prominent display.

The roof does not fit a supported flat/gable/hip/sawtooth typology, so none is
assigned. The current portrait-module and setback policy fits **0 PV modules**
on its narrow curved strips. The roof table explains all exclusions and the
scenario proposes no PV measure; no area-ratio capacity is substituted.

Baseline under those assumptions: **269.133683 kWh/m²·yr**, Korean
non-residential **grade 5**, primary **450.492262 kWh/m²·yr**. Annual heating
591,045.630864 kWh, cooling 18,988.923931 kWh.

## Verification and handoff

541 relevant tests passed before adding the final baseline pin. A full run
then reported 5,230 passed / 2 failed / 4 skipped: both failures were the new
Office row in `pv-claims.test.tsx` dereferencing an optional roof typology.
The corrected row checks zero-capacity/no-PV-claim behavior explicitly.
TypeScript and targeted ESLint passed. One temporary browser smoke passed
after correcting its initial locator (the intensity is in the HUD, not the
side panel); root owns final visual inspection and full integrated E2E.

Root must render `scopeNotice` beside the measurement status, and consume
`manifest.areas.exteriorWallNote` instead of the generic tessellation-only
label, before production. These UI changes are intentionally owned by the
coordinator, not reported complete here.
