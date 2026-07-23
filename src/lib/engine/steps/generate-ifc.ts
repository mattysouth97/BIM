// src/lib/engine/steps/generate-ifc.ts
//
// Deterministic IFC4 writer for Slice-1: builds an IfcProject/IfcSite/IfcBuilding/
// IfcBuildingStorey hierarchy, one IfcWallStandardCase per footprint edge per
// storey (extruded to storeyHeightM, thickness wallThicknessM), and one IfcSlab
// per storey (profile = footprint), then serializes via the injected write
// session. Geometry is pure, deterministic TS — never LLM-generated.
//
// Coordinate mapping (see src/lib/cad/README.md): the engine's footprint points
// are [x, z] in the repo's meters/XZ-plane/origin-centered convention (Y-up,
// three.js style). IFC is Z-up, so repo (x, z) maps to IFC (X, Y) and vertical
// elevation becomes IFC Z.
//
// Scope note (Slice-1, honest about what's deferred): this writer targets a
// structurally valid IFC4 file sufficient for this pipeline's own validate/score
// steps and for loading in a viewer — it does not implement IfcOwnerHistory,
// IfcUnitAssignment, or IfcDoor/IfcWindow openings (all deferred per the plan).
//
// Entity field names and express type codes below were verified against
// node_modules/web-ifc/web-ifc-api.d.ts and node_modules/web-ifc/web-ifc-api.js
// (IFC4 schema block) — not from prior memory of the web-ifc API.

import type { FusedModel, GeneratedElement } from "../types";
import type { IfcWriteSession, RawIfcLine } from "../../ifc/ifc-session";

// Verified IFC4 express type codes (node_modules/web-ifc/web-ifc-api.js).
const IFC4_TYPE = {
  PROJECT: 103090709,
  SITE: 4097777520,
  BUILDING: 4031249490,
  BUILDING_STOREY: 3124254112,
  REL_AGGREGATES: 160246688,
  REL_CONTAINED_IN_SPATIAL_STRUCTURE: 3242617779,
  LOCAL_PLACEMENT: 2624227202,
  AXIS2_PLACEMENT_3D: 2740243338,
  DIRECTION: 32440307,
  CARTESIAN_POINT: 1123145078,
  POLYLINE: 3724593414,
  ARBITRARY_CLOSED_PROFILE_DEF: 3798115385,
  EXTRUDED_AREA_SOLID: 477187591,
  SHAPE_REPRESENTATION: 4240577450,
  PRODUCT_DEFINITION_SHAPE: 673634403,
  GEOMETRIC_REPRESENTATION_CONTEXT: 3448662350,
  WALL_STANDARD_CASE: 3512223829,
  SLAB: 1529196076,
} as const;

let guidCounter = 0;
/**
 * Slice-1 GlobalId: unique per process but NOT the compressed 22-char IFC GUID
 * format (that requires web-ifc's CreateIFCGloballyUniqueId, not part of our
 * minimal write-session surface). Good enough to round-trip through this
 * pipeline's validate/score steps and any IFC viewer.
 */
function guid(): string {
  guidCounter += 1;
  return `bimengine-${Date.now().toString(36)}-${guidCounter.toString(36)}`;
}

function line(type: number, fields: Record<string, unknown>): RawIfcLine {
  // expressID: -1 marks this as a new, unwritten entity — web-ifc's WriteLine
  // auto-writes nested line objects shaped like this and rewrites them in
  // place as Handles (see ifc-session.ts).
  return { expressID: -1, type, ...fields };
}

const measure = (value: number) => ({ type: 4, value }); // IfcLengthMeasure / IfcReal / IfcPositiveLengthMeasure
const label = (value: string) => ({ type: 1, value }); // IfcLabel
const enumValue = (value: string) => ({ type: 3, value }); // e.g. IfcElementCompositionEnum.ELEMENT

function point3(x: number, y: number, z: number): RawIfcLine {
  return line(IFC4_TYPE.CARTESIAN_POINT, { Coordinates: [measure(x), measure(y), measure(z)] });
}

function point2(x: number, y: number): RawIfcLine {
  return line(IFC4_TYPE.CARTESIAN_POINT, { Coordinates: [measure(x), measure(y)] });
}

function direction(x: number, y: number, z: number): RawIfcLine {
  return line(IFC4_TYPE.DIRECTION, { DirectionRatios: [measure(x), measure(y), measure(z)] });
}

function axis2Placement3D(location: RawIfcLine, axis: RawIfcLine | null, refDirection: RawIfcLine | null): RawIfcLine {
  return line(IFC4_TYPE.AXIS2_PLACEMENT_3D, { Location: location, Axis: axis, RefDirection: refDirection });
}

function localPlacement(relTo: RawIfcLine | null, relativePlacement: RawIfcLine): RawIfcLine {
  return line(IFC4_TYPE.LOCAL_PLACEMENT, { PlacementRelTo: relTo, RelativePlacement: relativePlacement });
}

function closedProfile(points: RawIfcLine[]): RawIfcLine {
  const outerCurve = line(IFC4_TYPE.POLYLINE, { Points: points });
  return line(IFC4_TYPE.ARBITRARY_CLOSED_PROFILE_DEF, {
    ProfileType: enumValue("AREA"),
    ProfileName: null,
    OuterCurve: outerCurve,
  });
}

function extrudedSolid(profile: RawIfcLine, depthM: number, extrudeDirection: RawIfcLine): RawIfcLine {
  return line(IFC4_TYPE.EXTRUDED_AREA_SOLID, {
    SweptArea: profile,
    Position: null,
    ExtrudedDirection: extrudeDirection,
    Depth: measure(depthM),
  });
}

function productShape(context: RawIfcLine, items: RawIfcLine[]): RawIfcLine {
  const shapeRepresentation = line(IFC4_TYPE.SHAPE_REPRESENTATION, {
    ContextOfItems: context,
    RepresentationIdentifier: label("Body"),
    RepresentationType: label("SweptSolid"),
    Items: items,
  });
  return line(IFC4_TYPE.PRODUCT_DEFINITION_SHAPE, {
    Name: null,
    Description: null,
    Representations: [shapeRepresentation],
  });
}

function ringToPolylinePoints(ring: [number, number][]): RawIfcLine[] {
  return ring.map(([x, z]) => point2(x, z));
}

/**
 * Builds an IFC4 model for `model` (project/site/building/storey hierarchy,
 * per-edge walls, per-floor slabs) and returns the serialized bytes plus a
 * flat accounting of every generated element with its provenance.
 */
export async function generateIfc(
  model: FusedModel,
  session: IfcWriteSession,
): Promise<{ ifcBytes: Uint8Array; elements: GeneratedElement[] }> {
  const modelId = session.createModel();
  const elements: GeneratedElement[] = [];

  const worldContext = line(IFC4_TYPE.GEOMETRIC_REPRESENTATION_CONTEXT, {
    ContextIdentifier: null,
    ContextType: label("Model"),
    CoordinateSpaceDimension: 3,
    Precision: null,
    WorldCoordinateSystem: axis2Placement3D(point3(0, 0, 0), direction(0, 0, 1), direction(1, 0, 0)),
    TrueNorth: null,
  });

  const project = line(IFC4_TYPE.PROJECT, {
    GlobalId: label(guid()),
    OwnerHistory: null,
    Name: label(model.title || model.pk),
    Description: null,
    ObjectType: null,
    LongName: null,
    Phase: null,
    RepresentationContexts: [worldContext],
    UnitsInContext: null,
  });
  session.writeLine(modelId, project);

  const sitePlacement = localPlacement(null, axis2Placement3D(point3(0, 0, 0), null, null));
  const site = line(IFC4_TYPE.SITE, {
    GlobalId: label(guid()),
    OwnerHistory: null,
    Name: label("Site"),
    Description: null,
    ObjectType: null,
    ObjectPlacement: sitePlacement,
    Representation: null,
    LongName: null,
    CompositionType: enumValue("ELEMENT"),
    RefLatitude: null,
    RefLongitude: null,
    RefElevation: null,
    LandTitleNumber: null,
    SiteAddress: null,
  });
  session.writeLine(modelId, site);

  const buildingPlacement = localPlacement(sitePlacement, axis2Placement3D(point3(0, 0, 0), null, null));
  const building = line(IFC4_TYPE.BUILDING, {
    GlobalId: label(guid()),
    OwnerHistory: null,
    Name: label(model.title || model.pk),
    Description: null,
    ObjectType: null,
    ObjectPlacement: buildingPlacement,
    Representation: null,
    LongName: null,
    CompositionType: enumValue("ELEMENT"),
    ElevationOfRefHeight: null,
    ElevationOfTerrain: null,
    BuildingAddress: null,
  });
  session.writeLine(modelId, building);

  session.writeLine(
    modelId,
    line(IFC4_TYPE.REL_AGGREGATES, {
      GlobalId: label(guid()),
      OwnerHistory: null,
      Name: null,
      Description: null,
      RelatingObject: project,
      RelatedObjects: [site],
    }),
  );
  session.writeLine(
    modelId,
    line(IFC4_TYPE.REL_AGGREGATES, {
      GlobalId: label(guid()),
      OwnerHistory: null,
      Name: null,
      Description: null,
      RelatingObject: site,
      RelatedObjects: [building],
    }),
  );

  const outerRing = model.footprint[0] ?? [];
  const edgeCount = Math.max(outerRing.length - 1, 0);
  const storeys: RawIfcLine[] = [];

  for (let storeyIndex = 0; storeyIndex < model.floors; storeyIndex += 1) {
    const elevation = storeyIndex * model.storeyHeightM;
    const storeyPlacement = localPlacement(buildingPlacement, axis2Placement3D(point3(0, 0, elevation), null, null));
    const storey = line(IFC4_TYPE.BUILDING_STOREY, {
      GlobalId: label(guid()),
      OwnerHistory: null,
      Name: label(`Storey ${storeyIndex}`),
      Description: null,
      ObjectType: null,
      ObjectPlacement: storeyPlacement,
      Representation: null,
      LongName: null,
      CompositionType: enumValue("ELEMENT"),
      Elevation: measure(elevation),
    });
    session.writeLine(modelId, storey);
    storeys.push(storey);

    const storeyProducts: RawIfcLine[] = [];

    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      const [x1, z1] = outerRing[edgeIndex];
      const [x2, z2] = outerRing[edgeIndex + 1];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const edgeLength = Math.hypot(dx, dz) || 1e-6;
      const ux = dx / edgeLength;
      const uz = dz / edgeLength;

      const wallPlacement = localPlacement(
        storeyPlacement,
        axis2Placement3D(point3(x1, z1, 0), direction(0, 0, 1), direction(ux, uz, 0)),
      );
      const wallProfile = closedProfile([
        point2(0, 0),
        point2(edgeLength, 0),
        point2(edgeLength, model.wallThicknessM),
        point2(0, model.wallThicknessM),
        point2(0, 0),
      ]);
      const wallShape = productShape(worldContext, [
        extrudedSolid(wallProfile, model.storeyHeightM, direction(0, 0, 1)),
      ]);
      const wall = line(IFC4_TYPE.WALL_STANDARD_CASE, {
        GlobalId: label(guid()),
        OwnerHistory: null,
        Name: label(`Wall ${storeyIndex}-${edgeIndex}`),
        Description: null,
        ObjectType: null,
        ObjectPlacement: wallPlacement,
        Representation: wallShape,
        Tag: null,
        PredefinedType: null,
      });
      const wallExpressId = session.writeLine(modelId, wall);
      storeyProducts.push(wall);
      elements.push({
        expressId: wallExpressId,
        kind: "wall",
        storey: storeyIndex,
        geomSource: model.footprintSource,
        heightSource: model.heightSource,
      });
    }

    const slabPlacement = localPlacement(storeyPlacement, axis2Placement3D(point3(0, 0, 0), null, null));
    const slabProfile = closedProfile(ringToPolylinePoints(outerRing));
    const slabShape = productShape(worldContext, [
      extrudedSolid(slabProfile, model.wallThicknessM, direction(0, 0, -1)),
    ]);
    const slab = line(IFC4_TYPE.SLAB, {
      GlobalId: label(guid()),
      OwnerHistory: null,
      Name: label(`Slab ${storeyIndex}`),
      Description: null,
      ObjectType: null,
      ObjectPlacement: slabPlacement,
      Representation: slabShape,
      Tag: null,
      PredefinedType: null,
    });
    const slabExpressId = session.writeLine(modelId, slab);
    storeyProducts.push(slab);
    elements.push({
      expressId: slabExpressId,
      kind: "slab",
      storey: storeyIndex,
      geomSource: model.footprintSource,
      heightSource: model.heightSource,
    });

    session.writeLine(
      modelId,
      line(IFC4_TYPE.REL_CONTAINED_IN_SPATIAL_STRUCTURE, {
        GlobalId: label(guid()),
        OwnerHistory: null,
        Name: null,
        Description: null,
        RelatedElements: storeyProducts,
        RelatingStructure: storey,
      }),
    );
  }

  session.writeLine(
    modelId,
    line(IFC4_TYPE.REL_AGGREGATES, {
      GlobalId: label(guid()),
      OwnerHistory: null,
      Name: null,
      Description: null,
      RelatingObject: building,
      RelatedObjects: storeys,
    }),
  );

  const ifcBytes = session.saveModel(modelId);
  session.closeModel(modelId);
  return { ifcBytes, elements };
}
