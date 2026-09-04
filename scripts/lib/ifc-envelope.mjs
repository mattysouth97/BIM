// scripts/lib/ifc-envelope.mjs
//
// Build-time extraction of the thermal envelope from an IFC coordination model.
//
// The governing choice here is to read the envelope from SPACE BOUNDARIES
// rather than by matching element names, and it is worth stating why, because
// the name-matching version looks simpler and is wrong.
//
// An `IfcRelSpaceBoundary` exists only where a real element bounds a real
// space. Filtering to `.PHYSICAL. + .EXTERNAL.` therefore yields, by
// construction, the surfaces that separate conditioned space from outside — and
// drops everything that merely looks like envelope. In the Medical-Dental
// Clinic that silently and correctly excludes a `Curtain Wall:Chain Link Fence`
// (whose `Glazing Material` is `Metal - Chain Link`, so a name-driven importer
// would glaze the building with a fence), eight interior storefronts, an
// exterior paving slab, and 40 of the 58 windows, which are interior vision
// panels. None of those needs a special case; none of them bounds a space.
//
// The exception is roofs and ground floors: a typical architectural model
// carries no external horizontal boundaries, so those come from element
// geometry in the structural model and are marked `viaSpaceBoundary: false` so
// the weaker route stays visible in the record.

import { num, refId, str } from "./ifc-reader.mjs";

/** Round to a sane number of decimals — IFC reals carry float dust. */
const r6 = (value) => Math.round(value * 1e6) / 1e6;
const r3 = (value) => Math.round(value * 1e3) / 1e3;

/**
 * `IfcBuildingStorey`, elevation-ordered, with floor-to-floor derived from the
 * next storey up.
 *
 * Storeys arrive in file order, not elevation order, and a model routinely
 * carries datum levels that are not storeys — this file has a `TOF Footing` at
 * -1.0 m and a `Roof - Main` at +9.25 m alongside two real floors. Both are
 * returned, flagged rather than dropped: the roof datum is what gives the top
 * storey its height, and discarding it here would mean re-deriving it later
 * from something less reliable.
 */
export function extractStoreys(file, webIfc) {
  // `Elevation` is an ATTRIBUTE length, so it is in the file's declared unit —
  // not necessarily metres. A millimetre file reported storeys at -1000 m
  // before this scale existed. Geometry is unaffected: web-ifc tessellates to
  // metres regardless.
  const toM = file.units?.lengthToMetres ?? 1;
  const raw = file
    .byType(webIfc.IFCBUILDINGSTOREY)
    .map((line) => ({
      expressID: line.expressID,
      name: str(line.Name) ?? "",
      // Elevations come out as e.g. -3.5e-13; that is zero.
      elevationM: r6((num(line.Elevation) ?? 0) * toM),
    }))
    .sort((left, right) => left.elevationM - right.elevationM);

  return raw.map((storey, index) => {
    const next = raw[index + 1];
    return Object.freeze({
      id: `storey-${slug(storey.name)}`,
      name: storey.name,
      elevationM: Math.abs(storey.elevationM) < 1e-6 ? 0 : storey.elevationM,
      floorToFloorHeightM: next ? r3(next.elevationM - storey.elevationM) : 0,
      expressID: storey.expressID,
      ref: file.ref(storey.expressID),
    });
  });
}

/**
 * `IfcSpace` with its area quantity and owning storey.
 *
 * Two traversals are needed and both appear in the wild: IFC2X3 aggregates
 * spaces onto a storey through `IfcRelAggregates`, while elements are placed
 * through `IfcRelContainedInSpatialStructure`. Authoring tools disagree about
 * which applies to spaces, so both are followed and the first hit wins.
 *
 * The area is read from whatever `IfcQuantityArea` the model actually carries
 * rather than a hardcoded name — this file names it `GSA BIM Area` inside a
 * `GSA Space Areas` set, which no generic reader would guess. The name that was
 * read is returned so the record can cite it instead of implying a standard
 * quantity that isn't there.
 */
export function extractSpaces(file, webIfc, storeys) {
  const storeyByExpressID = new Map(storeys.map((s) => [s.expressID, s]));
  const spaceToStorey = new Map();

  for (const rel of file.byType(webIfc.IFCRELAGGREGATES)) {
    const parent = refId(rel.RelatingObject);
    if (!storeyByExpressID.has(parent)) continue;
    for (const child of rel.RelatedObjects ?? []) {
      spaceToStorey.set(refId(child), parent);
    }
  }
  for (const rel of file.byType(webIfc.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const parent = refId(rel.RelatingStructure);
    if (!storeyByExpressID.has(parent)) continue;
    for (const child of rel.RelatedElements ?? []) {
      const id = refId(child);
      if (!spaceToStorey.has(id)) spaceToStorey.set(id, parent);
    }
  }

  const quantities = quantityIndex(file, webIfc);

  return file.byType(webIfc.IFCSPACE).map((space) => {
    const storeyExpressID = spaceToStorey.get(space.expressID) ?? null;
    const area = quantities.get(space.expressID);
    const name = str(space.Name) ?? "";
    const longName = str(space.LongName);
    return Object.freeze({
      id: `space-${space.expressID}`,
      name,
      longName,
      ...classifySpaceFloorArea(name, longName),
      storeyId: storeyExpressID
        ? (storeyByExpressID.get(storeyExpressID)?.id ?? null)
        : null,
      floorAreaSqm: area ? r3(area.areaSqm) : null,
      volumeM3: area?.volumeM3 != null ? r3(area.volumeM3) : null,
      areaQuantityName: area?.areaName ?? null,
      expressID: space.expressID,
      ref: file.ref(space.expressID),
    });
  });
}

/**
 * Spaces an area plan counts that are not floor.
 *
 * An architectural area plan measures enclosed *areas*, which is not the same
 * set as a building's *floor*. In this model six spaces named `ROOF` and three
 * named `OPEN TO BELOW` account for 2,541.5 m² of a 6,935.8 m² total — so
 * summing every IfcSpace overstates floor area by 37 %. Since floor area is the
 * denominator of every intensity figure, that arrives as an energy number 37 %
 * too good with nothing in the model to contradict it.
 *
 * A rule table rather than a heuristic, because each exclusion has to be
 * defensible on its own and quotable in the record. Anything unmatched counts
 * as floor: the default must be to include, so that an unfamiliar space name
 * shows up as a number somebody questions rather than as a silent subtraction.
 */
const NON_FLOOR_SPACE_RULES = Object.freeze([
  Object.freeze({
    pattern: /^\s*ROOF\b/i,
    reason:
      "a roof surface modelled as a space; it has an area but is not enclosed floor",
    // Outdoor air. Nothing above a roof surface is heated.
    countsAsConditionedVolume: false,
  }),
  Object.freeze({
    pattern: /^\s*OPEN TO (BELOW|ABOVE)\b/i,
    reason:
      "a double-height void; the floor it opens through is already counted once on its own storey",
    // The void is the upper part of a conditioned room. Its floor must not be
    // counted twice; its air must not be dropped, because the ventilation
    // term multiplies volume directly and a two-storey concourse is mostly
    // void.
    countsAsConditionedVolume: true,
  }),
  Object.freeze({
    pattern: /^\s*MECH\.?\s*YARD\b/i,
    reason:
      "an outdoor equipment yard enclosed by a screen, not by envelope; it has outdoor air above it",
    countsAsConditionedVolume: false,
  }),
]);

export function classifySpaceFloorArea(name, longName) {
  const label = String(longName ?? name ?? "").trim();
  for (const rule of NON_FLOOR_SPACE_RULES) {
    if (rule.pattern.test(label)) {
      return Object.freeze({
        countsAsFloorArea: false,
        countsAsConditionedVolume: rule.countsAsConditionedVolume,
        excludedFromFloorAreaReason: `"${label}" — ${rule.reason}`,
      });
    }
  }
  return Object.freeze({
    countsAsFloorArea: true,
    countsAsConditionedVolume: true,
    excludedFromFloorAreaReason: null,
  });
}

function quantityIndex(file, webIfc) {
  const byObject = new Map();
  for (const rel of file.byType(webIfc.IFCRELDEFINESBYPROPERTIES)) {
    const definition = file.deref(rel.RelatingPropertyDefinition);
    if (!definition || file.typeName(definition) !== "IfcElementQuantity") {
      continue;
    }
    let areaSqm = null;
    let areaName = null;
    let volumeM3 = null;
    for (const q of definition.Quantities ?? []) {
      const quantity = file.deref(q);
      if (!quantity) continue;
      const kind = file.typeName(quantity);
      if (kind === "IfcQuantityArea" && areaSqm === null) {
        // Area has its own declared unit; it is NOT the length scale squared.
        // A file can declare MILLI.METRE lengths with plain SQUARE_METRE areas,
        // and squaring would divide every area by a million.
        const rawArea = num(quantity.AreaValue);
        areaSqm = rawArea === null ? null : rawArea * (file.units?.areaToSquareMetres ?? 1);
        areaName = str(quantity.Name);
      } else if (kind === "IfcQuantityVolume" && volumeM3 === null) {
        volumeM3 = num(quantity.VolumeValue);
      }
    }
    if (areaSqm === null && volumeM3 === null) continue;
    for (const object of rel.RelatedObjects ?? []) {
      const id = refId(object);
      if (id !== null && !byObject.has(id)) {
        byObject.set(id, { areaSqm, areaName, volumeM3 });
      }
    }
  }
  return byObject;
}

/**
 * `IfcMaterialLayerSet` → ordered layers with thicknesses, outside-in.
 *
 * Names and thicknesses only. This model — like most coordination models —
 * carries no `IfcMaterialProperties`, so there is no conductivity to read; a
 * field for it here would be null in every row and would invite someone to
 * quietly fill it with a default. The mapping from a layer name to a
 * conductivity is an assumption and belongs where assumptions are recorded.
 */
export function extractAssemblies(file, webIfc) {
  return file.byType(webIfc.IFCMATERIALLAYERSET).map((set) => {
    const layers = (set.MaterialLayers ?? [])
      .map((slot) => {
        const layer = file.deref(slot);
        if (!layer) return null;
        const material = file.deref(layer.Material);
        // Also an attribute length, so also unit-scaled.
        const rawThickness = num(layer.LayerThickness);
        if (rawThickness === null) return null;
        const thicknessM = rawThickness * (file.units?.lengthToMetres ?? 1);
        return Object.freeze({
          name: str(material?.Name) ?? "(unnamed)",
          thicknessM: r6(thicknessM),
          ref: file.ref(layer.expressID),
        });
      })
      .filter(Boolean);
    const name = str(set.LayerSetName) ?? "(unnamed assembly)";
    return Object.freeze({
      id: `assembly-${slug(name)}`,
      name,
      layers: Object.freeze(layers),
      totalThicknessM: r6(layers.reduce((sum, l) => sum + l.thicknessM, 0)),
      expressID: set.expressID,
      ref: file.ref(set.expressID),
    });
  });
}

/**
 * External physical space boundaries — CLASSIFICATION ONLY. Never areas.
 *
 * This function used to return `areaSqm` per boundary and a 2,007.7 m² total,
 * and every one of those numbers was wrong. Eight parallel investigations found
 * `IfcRelSpaceBoundary` unusable for measuring this model's envelope, five of
 * them independently. The defects compound:
 *
 *   1. The strips are (plan run length x ROOM height), not element faces —
 *      3,104 of 3,124 have z0 = 0 and Depth equal to the RelatingSpace's own
 *      extrusion depth.
 *   2. That room height is Revit's default 2.80 m, not the 4.57 m storey, so
 *      the ~1.8 m plenum above every suspended ceiling is bounded by nothing.
 *   3. Openings are never subtracted; the door and window strips lie inside
 *      the wall strips and contribute 84.5 m² of pure redundancy.
 *   4. 16 % is double-counted — raw 2,007.69 against a geometric union of
 *      1,686.46 — wherever a wall separates a room from an outdoor pseudo-space.
 *   5. Real envelope is missing: 18 exterior walls carry no boundary at all
 *      (125.6 m²), and 10 external storefronts another 133.1 m².
 *   6. A feet/metres unit bug corrupts the 20 non-full-height strips: the sill
 *      0.905 m is written as 0.905 x 3.28084 = 2.969 m. That is also why only
 *      18 of 58 windows appear — for the other 253 spaces the resulting depth
 *      is negative and the exporter emits nothing.
 *
 * And the claim these boundaries were originally chosen for — that they exclude
 * a fence "by construction" — is false. `Curtain Wall:Chain Link Fence` bounds
 * MECH. YARD, which is a modelled IfcSpace, and contributed 60.17 m² to that
 * dead total. Interior storefronts *are* correctly excluded, which is why the
 * claim survived casual checking.
 *
 * What the boundaries remain genuinely good for is the question element
 * geometry answers badly: WHICH elements face outdoors, and which space and
 * storey each one serves. So that is all this returns. Areas come from element
 * geometry, and the raw sums are reported only under
 * `invalidAreaDiagnostics`, named so that using one has to be deliberate.
 */
export function classifyExternalElements(file, webIfc) {
  const byElement = new Map();
  const unresolved = [];
  let externalVirtual = 0;

  for (const rel of file.byType(webIfc.IFCRELSPACEBOUNDARY)) {
    const external = str(rel.InternalOrExternalBoundary) === "EXTERNAL";
    if (!external) continue;
    if (str(rel.PhysicalOrVirtualBoundary) !== "PHYSICAL") {
      externalVirtual += 1;
      continue;
    }

    const element = file.deref(rel.RelatedBuildingElement);
    const geometry = file.deref(rel.ConnectionGeometry);
    const surface = geometry ? file.deref(geometry.SurfaceOnRelatingElement) : null;
    const profile = surface ? file.deref(surface.SweptCurve) : null;
    const curve = profile ? file.deref(profile.Curve) : null;
    const depthM = surface ? num(surface.Depth) : null;

    const points = polylinePoints(file, curve);
    if (!points || depthM === null || points.length < 2) {
      unresolved.push({
        expressID: rel.expressID,
        ref: file.ref(rel.expressID),
        reason: !points
          ? "swept curve is not a readable polyline"
          : depthM === null
            ? "extrusion depth unreadable"
            : "polyline has fewer than two points",
      });
      continue;
    }

    const elementExpressID = element?.expressID ?? null;
    if (elementExpressID === null) continue;
    const spaceExpressID = refId(rel.RelatingSpace);
    const existing = byElement.get(elementExpressID);
    if (existing) {
      existing.spaceExpressIDs.add(spaceExpressID);
      existing.boundaryCount += 1;
      existing.invalidStripAreaSqm += r3(polylineLength(points) * Math.abs(depthM));
    } else {
      byElement.set(elementExpressID, {
        elementExpressID,
        ref: file.ref(elementExpressID),
        elementType: file.typeName(element),
        elementName: str(element.Name) ?? "",
        spaceExpressIDs: new Set([spaceExpressID]),
        boundaryCount: 1,
        invalidStripAreaSqm: r3(polylineLength(points) * Math.abs(depthM)),
      });
    }
  }

  const elements = [...byElement.values()].map((entry) =>
    Object.freeze({
      elementExpressID: entry.elementExpressID,
      ref: entry.ref,
      elementType: entry.elementType,
      elementName: entry.elementName,
      /** Every space this element bounds — the reason to consult boundaries at all. */
      spaceExpressIDs: Object.freeze([...entry.spaceExpressIDs].sort((a, b) => a - b)),
      boundaryCount: entry.boundaryCount,
    }),
  );

  const byType = {};
  for (const entry of byElement.values()) {
    byType[entry.elementType] = r3(
      (byType[entry.elementType] ?? 0) + entry.invalidStripAreaSqm,
    );
  }

  return Object.freeze({
    /** Facing outdoors, one entry per distinct element. Areas are NOT here. */
    elements: Object.freeze(elements),
    unresolved: Object.freeze(unresolved),
    externalVirtualCount: externalVirtual,
    /**
     * The old, wrong totals. Kept so the record can state what a boundary sum
     * WOULD have said and mark it invalid — a future reader who recomputes
     * 2,007.7 from this file needs to find it already refuted rather than
     * conclude the extraction lost a third of the building. Deliberately
     * verbose to use, and never a source for any emitted area.
     */
    invalidAreaDiagnostics: Object.freeze({
      // The numbers are this file's; the sentence must be too. Until
      // 2026-09-04 it carried the Clinic's "missing 18 walls and 10
      // storefronts ... 60.17 m2 of chain-link fence" on every building,
      // including one whose sum was 0 and which has no fence.
      note:
        [...byElement.values()].length === 0
          ? "No space-boundary strips resolved in this file; there is no sum to refute."
          : "Space-boundary strip sums. INVALID as envelope areas: room-height not storey-height, " +
            "gross of openings, double-counted where boundaries overlap, and blind to any wall " +
            "without a resolvable boundary surface. Diagnostic only; never an emitted area.",
      rawSumSqm: r3(
        [...byElement.values()].reduce((sum, e) => sum + e.invalidStripAreaSqm, 0),
      ),
      rawSumByElementType: Object.freeze(byType),
    }),
  });
}

function polylinePoints(file, curve) {
  if (!curve || !Array.isArray(curve.Points)) return null;
  const points = [];
  for (const slot of curve.Points) {
    const point = file.deref(slot);
    const coords = point?.Coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const x = num(coords[0]);
    const y = num(coords[1]);
    if (x === null || y === null) return null;
    points.push([x, y]);
  }
  return points.length > 0 ? points : null;
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

/** Stable, filesystem- and id-safe slug from an IFC name. */
export function slug(value) {
  return (
    String(value)
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "unnamed"
  );
}
