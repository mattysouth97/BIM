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
  const raw = file
    .byType(webIfc.IFCBUILDINGSTOREY)
    .map((line) => ({
      expressID: line.expressID,
      name: str(line.Name) ?? "",
      // Elevations come out as e.g. -3.5e-13; that is zero.
      elevationM: r6(num(line.Elevation) ?? 0),
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
  }),
  Object.freeze({
    pattern: /^\s*OPEN TO (BELOW|ABOVE)\b/i,
    reason:
      "a double-height void; the floor it opens through is already counted once on its own storey",
  }),
]);

export function classifySpaceFloorArea(name, longName) {
  const label = String(longName ?? name ?? "").trim();
  for (const rule of NON_FLOOR_SPACE_RULES) {
    if (rule.pattern.test(label)) {
      return Object.freeze({
        countsAsFloorArea: false,
        excludedFromFloorAreaReason: `"${label}" — ${rule.reason}`,
      });
    }
  }
  return Object.freeze({
    countsAsFloorArea: true,
    excludedFromFloorAreaReason: null,
  });
}

/** expressID → the first area/volume quantity attached to it, with its name. */
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
        areaSqm = num(quantity.AreaValue);
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
        const thicknessM = num(layer.LayerThickness);
        if (thicknessM === null) return null;
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
 * External physical space boundaries, with area and plan trace.
 *
 * Geometry chain, verified against this model with 277 of 277 resolving:
 *   IfcRelSpaceBoundary
 *     -> ConnectionGeometry (IfcConnectionSurfaceGeometry)
 *       -> SurfaceOnRelatingElement (IfcSurfaceOfLinearExtrusion)
 *          { SweptCurve -> IfcArbitraryOpenProfileDef -> Curve -> IfcPolyline,
 *            Position, ExtrudedDirection, Depth }
 * Area = polyline length x |Depth|. The swept curve is the element's plan
 * trace, which is exactly the shape the canonical model's `Surface.geometry`
 * wants, so it is carried through rather than reduced to a number.
 *
 * `unresolved` is returned rather than thrown on: a boundary whose geometry
 * cannot be read is a fact about the model that belongs in the record, and the
 * count is asserted to be zero by a test. Silently skipping them would shrink
 * the building with nothing to notice.
 */
export function extractExternalBoundaries(file, webIfc) {
  const boundaries = [];
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

    const lengthM = polylineLength(points);
    boundaries.push(
      Object.freeze({
        expressID: rel.expressID,
        ref: file.ref(rel.expressID),
        spaceExpressID: refId(rel.RelatingSpace),
        elementExpressID: element?.expressID ?? null,
        elementType: element ? file.typeName(element) : null,
        elementName: element ? (str(element.Name) ?? "") : "",
        heightM: r3(Math.abs(depthM)),
        lengthM: r3(lengthM),
        areaSqm: r3(lengthM * Math.abs(depthM)),
        planTraceLocal: Object.freeze(points.map((p) => Object.freeze([r3(p[0]), r3(p[1])]))),
        surfaceExpressID: surface.expressID,
      }),
    );
  }

  return { boundaries, unresolved, externalVirtual };
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
