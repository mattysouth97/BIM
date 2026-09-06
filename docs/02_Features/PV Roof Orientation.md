# PV roof orientation and source clearance

Verified 2026-09-07. This corrects the older north/south interpretation in the PV placement methodology handoff.

The installed web-ifc maps IFC coordinates `(x, y, z)` to the viewer's `(x, z, -y)` frame. A committed runtime fixture verifies that an IFC slab centred at `(0, 10, 1)` is tessellated at `(0, 1, -10)`. IFC project north `+Y` is therefore viewer `-Z`.

For an upward plane normal `n`, `y = (d - nx*x - nz*z)/ny`. Height decreases in the horizontal direction `(nx, nz)`. The old extractor negated that direction and published uphill bearings. Its flat-rack counterpart used `+Z` as north, making panels described as south-facing physically face north.

`roofAzimuthDeg` now uses the descending direction. `roof-planes.json` carries optional `trueNorthDeg`, clockwise from project north; bearings use that stated north when available and explicitly assumed project north otherwise. Pitched module footprints and rotations follow the measured normal, including its precise foreshortening, rather than a bearing or tilt rounded for display. Racks face south relative to the same north reference.

FZK Haus states TrueNorth in `AC20-FZK-Haus.ifc` directions `#60` and `#372`: `(0.766044443119, 0.642787609687)`, or 50° clockwise. Raycast roof normals from its actual GLB therefore face 130° and 310°. Both are outside the existing 315°–45° exclusion sector, so each slope holds 22 modules: **44 modules / 17.6 kWp**. This is an orientation-policy result, not a new guarantee of equal solar yield on southeast and northwest roofs. The screening yield model remains a regional estimate and does not independently simulate each slope's shading/yield.

Other published counts remain Clinic 453, Schependomlaan 10, Duplex 14 and KIT Office 0. Clinic's accepted usable area changes by approximately 0.021 m² when opposite curved facets are correctly classified; its two fitted flat decks and module count stay the same.

The renderer's cell face points along local +Y, sits 0.5 mm above the 40 mm frame, and uses the exact layout instance transform. Tests raycast the centres and four near-corner samples of each actual rendered module against the source core GLB for the four models that fit PV; no sampled cell face is buried or within 1 mm of source geometry. KIT produces no PV visual because no module fits. These checks do not establish that every possible camera view is alias-free or that a simplified roof-plane representation includes every future obstruction.

`node scripts/rebuild-roof-bearings.mjs` regenerates bearings and QA SVG labels from published normals plus each manifest's stated north. It preserves all source geometry, areas, elevations and obstruction records. Full extraction uses the same function. Repeating the regeneration must be byte-identical.

The orientation defect was discovered during shimmering investigation, but no evidence established it as the cause of temporal shimmer. Camera-depth precision and source face contacts are separate rendering concerns.
