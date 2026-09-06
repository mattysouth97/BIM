# TalTech Mäemaja reference model

The source is the real Tallinn University of Technology office/laboratory in
[SmartlivingEPC public building BIM model and measurements, v1](https://zenodo.org/records/15782433)
(CC BY 4.0). The IFC export date, 2025-04-03, is not a construction date.
The separately published meter archive is neither included in this export nor
used to calibrate the screening calculations. Seoul comparison weather and
Korean emissions/grade factors are explicitly assumed.

Source file: `DS3_TalTech_V4.ifc`, 38,728,810 bytes, SHA-256
`05919eee0701b955d3d08501c4889c879d9c486e2389a6a1a5cdaad32a5d10ba`.
The Zenodo MD5 is `c1b4a6df891a1ae8f311eea6a149ed2a`.

## Quantities and interpretation

- All 115 spaces state floor quantities: 3,486.12 m² in basement and three upper
  floors. All also state net volume; open tessellation does not replace those
  quantities. Conditioning every room is an explicit assumption.
- Forty walls linked by physical/external boundaries contribute 1,939.94 m².
  Twelve supply NetSideArea; 28 use the source's Dimensions.Area fallback.
  Comparable walls with both properties agree. Boundary areas are not used.
- Counted glazing is 548.52 m² and doors 58.34 m². These are selected subsets,
  not a complete opening survey; excluded hosts and unresolved openings remain
  available in `openings.json`. Ninety room meshes fail the closed-solid test,
  which limits geometric classification but not stated room quantities.
- Ground area is the 1,173.44 m² union of selected basement slabs. Its 524.97 m
  outer boundary contains slab gaps/fragmentation and is only a surrogate for
  thermally exposed perimeter. The slab-on-ground approximation can overstate
  basement ground loss; basement walls are also priced against outdoor air.

`source-physics.json` preserves property, property-set, type and occurrence
references, units, and differently named conflicting statements. Its hash is
in the manifest and baseline dataset. Standard typed ThermalTransmittance
is preferred to conflicting textual alternatives, with that selection named
in the assumptions. The derived unit is kg·s⁻³·K⁻¹, or W/(m²·K).

Wall UA is 257.3443629814 W/K over 1,939.9379238014 m². Counted windows state
Uw 0.66 W/(m²·K); the included 30.234 m² curtain-wall aperture has no selected
source U and uses a named 1.4 stand-in. Doors state U 1, while the engine's
shared opaque-wall treatment understates their heat loss. No thermal
conductivity is invented from the material names.

Source equipment names identify district heating. Text properties supply
efficiency 1, representative chiller efficiency 4.03 (interpreted as COP), and
recovery 0.82. These are source design statements interpreted for screening,
not seasonal measurements. Ventilation, schedules and laboratory process loads
remain assumptions. The shared DHW input cannot express district heat; its
gas-boiler stand-in is explicitly identified as inconsistent with the source
system, rather than presented as installed equipment.

## Geometry and source PV

The core mesh retains source geometry. An additional 983 of 985 selected
architectural elements have geometry: 877 coverings, 102 columns, two beams
and two railings. Two coverings have no mesh. Source MEP contains 528 typed
occurrences, including 48 solar-array occurrences; counts are not a complete
survey of installed equipment.

Those 48 arrays state **192 modules and 63.36 kWp**, obtained by summing
`Data.Total Number of Modules` and `Other.RatedElectricPowerOutput`.
All nine array types state 15° inclination in source degree units. A separate
430.06 W field is repeated on every occurrence and conflicts with the array
ratings; it is retained but not selected. Technology and representative south
orientation remain assumptions. An aggregate existing module-face area is not
established. The current grade conversion does not read baseline PV capacity.

Proposal obstructions use one conservative convex envelope per connected
source equipment shadow, plus source-named parapet walls. Holes/concavities
are filled, disconnected components remain separate, and exact source meshes
are unchanged. Height association tolerances are selection rules, not measured
mounting gaps. Every existing source array must be associated with a published
roof before the import tests pass. A bounded micrometre snap fallback handles
area-accounting boolean failures; module corner/edge containment retains the
unrounded roof and obstruction rings.

PV winter row spacing uses the accepted source site latitude 59.3949928283°,
which requires more space between rows than Seoul. This geometric solar-angle
input is separate from the energy engine's explicitly assumed Seoul weather.

IFC4 port ownership uses IfcRelNests: one source-directed and 345 ambiguous
connections, none unresolved. The combined model does not establish the
viewer animation's binary supply/return roles, so no flow animation is
published. Bidirectional connectivity is retained as a count, not invented
flow.

Human-readable assembly and roof-family slugs collide in this file. Collision
members receive stable source-derived suffixes; distinct source objects never
share a selection ID. Existing unique IDs remain unchanged.

KL-04 roof #325938 has reversed source face winding with a positive placement
determinant: a source ray at X=-13.741179567555069, Z=16.853 hits the top at
Y=-12.51774794497 with a downward normal and the underside at
Y=-13.05256349195 with an upward normal. An explicit source-reference override
reverses triangle order for roof-surface selection only. It changes no source
vertex, mesh appearance, or arbitrary mounting gap. The selected roof plane
carries this evidence in `windingCorrection`.

## Rebuild

```
node scripts/build-reference-building.mjs --building taltech-maemaja --generated-at 2026-09-07T00:00:00.000Z
```

The pinned IFC is cached outside the repository. Build outputs belong under
`public/reference-buildings/taltech-maemaja/`; the raw IFC is downloaded from
the attributed source. The existing model page and dataset catalogue pick up
the registered ID, without another entry workflow.

## Validation checkpoint

783 tests across 44 reference-model, retrofit, ring and PV-table files passed;
TypeScript and scoped ESLint passed. Actual rendered cell-face centres and
four near-corner samples clear the source core mesh. At the source latitude,
10 additional modules (4.0 kWp) fit: six on KL-02, two on KL-03 and two on
KL-04. The three geometry layers retain 79,571 core triangles, 40,555 placed
architectural-detail triangles and 26,776 MEP triangles. Source body geometry
is not claimed complete where the IFC tessellator provides no usable mesh.

Browser presentation, production routing and the additional material-rendering
variant are integration checks performed in the main checkout; they are not
implied by these extraction and numerical tests.
