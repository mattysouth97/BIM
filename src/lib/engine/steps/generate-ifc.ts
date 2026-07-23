// src/lib/engine/steps/generate-ifc.ts
//
// Deterministic IFC4 writer for Slice-1: builds an IfcProject/IfcSite/IfcBuilding/
// IfcBuildingStorey hierarchy, one IfcWallStandardCase per footprint edge per
// storey (extruded to storeyHeightM, thickness wallThicknessM), and one IfcSlab
// per storey (profile = footprint), then serializes via the injected write
// session. Geometry is pure, deterministic TS — never LLM-generated.
//
// Slice-2 adds window openings: when `model.facade` is set, a row of
// IfcWindow instances is placed along each wall edge (count/positions from
// the pure computeWindowLayout() below), each hosted via a real
// IfcOpeningElement void (IfcRelVoidsElement wall<->opening,
// IfcRelFillsElement opening<->window) rather than faked/implicit. Windows
// are placement estimates from the era-based facade recipe — never measured
// — so they are scored honestly low (see score.ts's FACADE_SCORE) and always
// HITL-flagged.
//
// Coordinate mapping (see src/lib/cad/README.md): the engine's footprint points
// are [x, z] in the repo's meters/XZ-plane/origin-centered convention (Y-up,
// three.js style). IFC is Z-up, so repo (x, z) maps to IFC (X, Y) and vertical
// elevation becomes IFC Z.
//
// Scope note (honest about what's still deferred): this writer targets a
// structurally valid IFC4 file sufficient for this pipeline's own validate/score
// steps and for loading in a viewer — it does not implement IfcOwnerHistory
// (deferred per the plan). It DOES emit an IfcUnitAssignment (metres / square
// metres) per spec §4 — see A1 below.
//
// Slice-3 adds a single ground-floor entrance IfcDoor: on storey 0 only,
// after that storey's windows, one door is hosted via the same void/fill
// machinery as windows, centered on pickEntranceEdge()'s edge (the outer
// ring's longest edge — ties broken by the lowest index). The door is a
// heuristic placement (no measured entrance data) and is scored exactly like
// a window (see score.ts) — always HITL-flagged, never presented as measured.
// Honest simplification: the door may visually overlap a window placed on
// the same entrance edge — Slice-3 scope is honest hosting + provenance, not
// clash-free detailed geometry.
//
// Entity field names and express type codes below were verified against
// node_modules/web-ifc/web-ifc-api.d.ts and node_modules/web-ifc/web-ifc-api.js
// (IFC4 schema block) — not from prior memory of the web-ifc API. This
// includes IfcUnitAssignment/IfcSIUnit's ToRawLineData field order (`i.UnitType,
// i.Prefix, i.Name` for IfcSIUnit; `i.Units` for IfcUnitAssignment — Dimensions
// is always forced null by web-ifc's writer regardless of what's supplied) and
// was confirmed end-to-end by a real write→read round-trip against
// web-ifc-node.wasm (see generate-ifc-roundtrip.integration.test.ts).
//
// Slice-2 (window openings): IfcOpeningElement / IfcRelVoidsElement / IfcWindow
// / IfcRelFillsElement field orders below were verified the same way, against
// web-ifc-api.js's `ToRawLineData[2]` table (index 2 = the "IFC4" schema slot
// in `SchemaNames`, confirmed via `SchemaNames[2] = ["IFC4"]` in that file) —
// specifically: IfcOpeningElement = [GlobalId, OwnerHistory, Name, Description,
// ObjectType, ObjectPlacement, Representation, Tag, PredefinedType];
// IfcRelVoidsElement = [GlobalId, OwnerHistory, Name, Description,
// RelatingBuildingElement, RelatedOpeningElement]; IfcWindow = [GlobalId,
// OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation,
// Tag, OverallHeight, OverallWidth, PredefinedType, PartitioningType,
// UserDefinedPartitioningType]; IfcRelFillsElement = [GlobalId, OwnerHistory,
// Name, Description, RelatingOpeningElement, RelatedBuildingElement].
//
// Slice-3 (entrance door): IfcDoor's field order was verified the same way —
// ToRawLineData[2][395920057] = [GlobalId, OwnerHistory, Name, Description,
// ObjectType, ObjectPlacement, Representation, Tag, OverallHeight,
// OverallWidth, PredefinedType, OperationType, UserDefinedOperationType] —
// identical shape to IfcWindow except OperationType/UserDefinedOperationType
// in place of PartitioningType/UserDefinedPartitioningType.
//
// Slice-4 (detailed opening geometry): the Slice-2/3 placeholder single-box
// Body representation for IfcWindow/IfcDoor is replaced by a realistic
// assembly of deterministic IfcExtrudedAreaSolid items — a frame (four thin
// members forming the opening border, ~0.05m deep into the wall), a thin
// glass pane inset within the frame, and a central vertical mullion (window
// only; the door gets a lighter frame + single solid panel, no glass/
// mullion). This ONLY changes what's inside each window/door product shape's
// Items array — the void/fill hosting (IfcOpeningElement/IfcRelVoidsElement/
// IfcRelFillsElement) and the one-IfcWindow-per-position/one-IfcDoor
// GeneratedElement accounting are unchanged. No new IFC entity types: this
// reuses IfcExtrudedAreaSolid's existing (already-verified) [SweptArea,
// Position, ExtrudedDirection, Depth] field order — Position (previously
// always null) is now populated with a translation-only IfcAxis2Placement3D
// per member, the same null-Axis/null-RefDirection pattern already used
// (and round-trip-verified) for wall/opening/window placements elsewhere in
// this file.

import type { FacadeParams, FusedModel, GeneratedElement } from "../types";
import { ENGINE_CONSTANTS } from "../types";
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
  UNIT_ASSIGNMENT: 180925521,
  SI_UNIT: 448429030,
  OPENING_ELEMENT: 3588315303,
  REL_VOIDS_ELEMENT: 1401173127,
  WINDOW: 3304561284,
  REL_FILLS_ELEMENT: 3940055652,
  // Slice-3: verified against node_modules/web-ifc/web-ifc-api.js's
  // ToRawLineData[2] (IFC4 schema slot) entry for 395920057: [GlobalId,
  // OwnerHistory, Name, Description, ObjectType, ObjectPlacement,
  // Representation, Tag, OverallHeight, OverallWidth, PredefinedType,
  // OperationType, UserDefinedOperationType] — same shape as IfcWindow save
  // for OperationType/UserDefinedOperationType replacing PartitioningType/
  // UserDefinedPartitioningType.
  DOOR: 395920057,
} as const;

// IFC-compressed IfcGloballyUniqueId alphabet: 64 chars, base64-like but
// IFC-specific ordering (0-9, A-Z, a-z, _, $) — verified against
// node_modules/web-ifc/web-ifc-api.d.ts's CreateIFCGloballyUniqueId doc and
// the buildingSMART-documented GUID compression scheme (a 128-bit UUID's 16
// bytes are split into byte[0] + five 3-byte groups; byte[0] encodes to 2
// base64 digits, each 3-byte/24-bit group encodes to 4 base64 digits, for
// 2 + 5*4 = 22 chars total).
const IFC_GUID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

function base64Digits(value: number, digitCount: number): string {
  let out = "";
  for (let i = 0; i < digitCount; i += 1) {
    const shift = digitCount - i - 1;
    const digit = Math.floor(value / 64 ** shift) % 64;
    out += IFC_GUID_ALPHABET[digit];
  }
  return out;
}

/**
 * Pure compression: 32-hex-char UUID (no dashes) -> 22-char IFC-compressed
 * GlobalId. Exported for unit testing — generate-ifc.test.ts round-trips it
 * against a local decompress helper to prove the byte-grouping is correct.
 */
export function compressIfcGuid(hex32: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < 32; i += 2) bytes.push(parseInt(hex32.slice(i, i + 2), 16));
  let out = base64Digits(bytes[0], 2);
  for (let g = 0; g < 5; g += 1) {
    const value = (bytes[1 + g * 3] << 16) + (bytes[2 + g * 3] << 8) + bytes[3 + g * 3];
    out += base64Digits(value, 4);
  }
  return out;
}

function randomUuidHex32(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  // Fallback for environments without crypto.randomUUID (Slice-1 GUIDs only
  // need per-file uniqueness, not cryptographic randomness).
  let hex = "";
  for (let i = 0; i < 32; i += 1) hex += Math.floor(Math.random() * 16).toString(16);
  return hex;
}

/** Conforming 22-char IfcGloballyUniqueId (compressed from a random v4 UUID). */
function guid(): string {
  return compressIfcGuid(randomUuidHex32());
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

function extrudedSolid(
  profile: RawIfcLine,
  depthM: number,
  extrudeDirection: RawIfcLine,
  position: RawIfcLine | null = null,
): RawIfcLine {
  return line(IFC4_TYPE.EXTRUDED_AREA_SOLID, {
    SweptArea: profile,
    Position: position,
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
 * Pure window-row layout for a single wall edge (Slice-2). Returns the local
 * X offset (along the wall's own direction, left edge of each window box) for
 * every window that fits on an edge of `edgeLength` meters, given `facade`'s
 * width/spacing — count = floor(edgeLength / (windowWidth + windowSpacing)),
 * the row centered within the edge. Exported so validate.ts's
 * "openings-hosted" check can recompute the same expected layout from the
 * FusedModel alone (single source of truth — no duplicated placement math).
 */
export function computeWindowLayout(edgeLength: number, facade: FacadeParams): number[] {
  const pitch = facade.windowWidth + facade.windowSpacing;
  const count = Math.max(0, Math.floor(edgeLength / pitch));
  if (count === 0) return [];
  const totalSpan = count * facade.windowWidth + (count - 1) * facade.windowSpacing;
  const startOffset = (edgeLength - totalSpan) / 2;
  const positions: number[] = [];
  for (let i = 0; i < count; i += 1) {
    positions.push(startOffset + i * pitch);
  }
  return positions;
}

/**
 * Pure: the index of the longest edge of a closed outer ring (ties broken by
 * lowest index) — Slice-3's ground-floor entrance is centered on this edge.
 * Exported so validate.ts recomputes the same edge from the FusedModel alone
 * (single source of truth — no duplicated "which edge is the entrance"
 * logic). Returns 0 for a degenerate ring (fewer than 2 vertices).
 */
export function pickEntranceEdge(outerRing: [number, number][]): number {
  const edgeCount = Math.max(outerRing.length - 1, 0);
  let longestIndex = 0;
  let longestLength = -Infinity;
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const [x1, z1] = outerRing[edgeIndex];
    const [x2, z2] = outerRing[edgeIndex + 1];
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (length > longestLength) {
      longestLength = length;
      longestIndex = edgeIndex;
    }
  }
  return longestIndex;
}

/** Local-frame rectangle profile (0,0) -> (width, depth), closed. */
function rectangleProfile(width: number, depth: number): RawIfcLine {
  return closedProfile([
    point2(0, 0),
    point2(width, 0),
    point2(width, depth),
    point2(0, depth),
    point2(0, 0),
  ]);
}

// Slice-4: dimensions for the detailed window/door assemblies below (frame +
// glazing/panel + mullion). These are pure geometry constants scoped to
// this file's assembly builders, not provenance/scoring inputs — c.f.
// ENGINE_CONSTANTS.DEFAULT_DOOR, which IS reused below for the door's actual
// overall width/height (never duplicated here).
const OPENING_DETAIL = {
  /** Frame/panel depth into the wall (local Y axis), meters. */
  FRAME_DEPTH_M: 0.05,
  /** Cross-section width of each frame member (jamb/head/sill reveal), meters. */
  FRAME_MEMBER_WIDTH_M: 0.08,
  /** Glass pane thickness, centered within the frame's depth band, meters. */
  GLASS_THICKNESS_M: 0.02,
  /** Central vertical mullion cross-section width, meters. */
  MULLION_WIDTH_M: 0.06,
} as const;

interface FrameBand {
  /** Cross-section width of jamb/head/sill members, clamped to fit width/height. */
  memberWidth: number;
  /** Y (wall-depth) start of the frame/panel band, centered in wallThicknessM. */
  yStart: number;
  /** Y (wall-depth) extent of the frame/panel band, clamped to wallThicknessM. */
  yDepth: number;
}

/**
 * Shared frame-band geometry for the window and door assemblies below: how
 * deep into the wall (Y) the frame sits, and how wide each frame member's
 * cross-section is (clamped so it always fits within the opening). Pure —
 * deterministic from width/height/wallThicknessM alone.
 */
function frameBand(width: number, height: number, wallThicknessM: number): FrameBand {
  const yDepth = Math.min(OPENING_DETAIL.FRAME_DEPTH_M, wallThicknessM);
  const yStart = (wallThicknessM - yDepth) / 2;
  const memberWidth = Math.min(OPENING_DETAIL.FRAME_MEMBER_WIDTH_M, width / 4, height / 4);
  return { memberWidth, yStart, yDepth };
}

/**
 * Four thin extruded members (left jamb, right jamb, sill, head) forming the
 * border of a `width` x `height` opening, ~FRAME_DEPTH_M deep into the wall —
 * shared by both the window and door assemblies below (Slice-4). Pure,
 * deterministic IfcExtrudedAreaSolid items; no new IFC entity types.
 */
function buildFrameMembers(width: number, height: number, wallThicknessM: number): RawIfcLine[] {
  const { memberWidth, yStart, yDepth } = frameBand(width, height, wallThicknessM);
  const up = direction(0, 0, 1);
  const jambProfile = rectangleProfile(memberWidth, yDepth);
  const headSillWidth = Math.max(width - 2 * memberWidth, 0);
  const headSillProfile = rectangleProfile(headSillWidth, yDepth);
  return [
    // Left jamb: full height.
    extrudedSolid(jambProfile, height, up, axis2Placement3D(point3(0, yStart, 0), null, null)),
    // Right jamb: full height.
    extrudedSolid(jambProfile, height, up, axis2Placement3D(point3(width - memberWidth, yStart, 0), null, null)),
    // Sill: spans between the jambs at the bottom.
    extrudedSolid(headSillProfile, memberWidth, up, axis2Placement3D(point3(memberWidth, yStart, 0), null, null)),
    // Head (lintel): spans between the jambs at the top.
    extrudedSolid(
      headSillProfile,
      memberWidth,
      up,
      axis2Placement3D(point3(memberWidth, yStart, height - memberWidth), null, null),
    ),
  ];
}

/**
 * Thin glass pane inset within the frame (Slice-4): fills the opening between
 * the frame members, centered within the frame's depth band, thickness
 * GLASS_THICKNESS_M.
 */
function buildGlassPane(width: number, height: number, wallThicknessM: number): RawIfcLine {
  const { memberWidth, yStart, yDepth } = frameBand(width, height, wallThicknessM);
  const glassThickness = Math.min(OPENING_DETAIL.GLASS_THICKNESS_M, yDepth);
  const glassY = yStart + (yDepth - glassThickness) / 2;
  const glassWidth = Math.max(width - 2 * memberWidth, 0);
  const glassHeight = Math.max(height - 2 * memberWidth, 0);
  const profile = rectangleProfile(glassWidth, glassThickness);
  return extrudedSolid(
    profile,
    glassHeight,
    direction(0, 0, 1),
    axis2Placement3D(point3(memberWidth, glassY, memberWidth), null, null),
  );
}

/**
 * Central vertical mullion splitting the glazing (Slice-4): spans the same
 * depth band as the frame (deeper than the thin glass pane, so it visually
 * reads as dividing it), centered on the opening's width.
 */
function buildVerticalMullion(width: number, height: number, wallThicknessM: number): RawIfcLine {
  const { memberWidth, yStart, yDepth } = frameBand(width, height, wallThicknessM);
  const glassWidth = Math.max(width - 2 * memberWidth, 0);
  const glassHeight = Math.max(height - 2 * memberWidth, 0);
  const mullionWidth = Math.min(OPENING_DETAIL.MULLION_WIDTH_M, glassWidth / 2);
  const mullionX = memberWidth + (glassWidth - mullionWidth) / 2;
  const profile = rectangleProfile(mullionWidth, yDepth);
  return extrudedSolid(
    profile,
    glassHeight,
    direction(0, 0, 1),
    axis2Placement3D(point3(mullionX, yStart, memberWidth), null, null),
  );
}

/**
 * Solid door panel (Slice-4's "lighter treatment" for the entrance door — no
 * glass/mullion, just a frame + a single leaf filling the reveal).
 */
function buildDoorPanel(width: number, height: number, wallThicknessM: number): RawIfcLine {
  const { memberWidth, yStart, yDepth } = frameBand(width, height, wallThicknessM);
  const panelWidth = Math.max(width - 2 * memberWidth, 0);
  const panelHeight = Math.max(height - 2 * memberWidth, 0);
  const profile = rectangleProfile(panelWidth, yDepth);
  return extrudedSolid(
    profile,
    panelHeight,
    direction(0, 0, 1),
    axis2Placement3D(point3(memberWidth, yStart, memberWidth), null, null),
  );
}

/**
 * Full detailed IfcWindow Body representation (Slice-4): frame (4 members) +
 * glass pane + central vertical mullion — replaces the Slice-2 placeholder
 * box. Exported so generate-ifc.test.ts can assert the exact item count/
 * shape against a single source of truth (no duplicated magic numbers).
 */
export function buildWindowAssembly(width: number, height: number, wallThicknessM: number): RawIfcLine[] {
  return [
    ...buildFrameMembers(width, height, wallThicknessM),
    buildGlassPane(width, height, wallThicknessM),
    buildVerticalMullion(width, height, wallThicknessM),
  ];
}

/**
 * Full detailed IfcDoor Body representation (Slice-4): frame (4 members) + a
 * single solid panel — the "lighter treatment" (no glass/mullion) — replaces
 * the Slice-3 placeholder box. Exported for the same reason as
 * buildWindowAssembly above.
 */
export function buildDoorAssembly(width: number, height: number, wallThicknessM: number): RawIfcLine[] {
  return [...buildFrameMembers(width, height, wallThicknessM), buildDoorPanel(width, height, wallThicknessM)];
}

/** IfcSIUnit for a base (non-derived) SI unit, e.g. LENGTHUNIT/METRE. */
function siUnit(unitType: string, name: string): RawIfcLine {
  return line(IFC4_TYPE.SI_UNIT, {
    // Dimensions is always forced null by web-ifc's ToRawLineData for
    // IfcSIUnit regardless of what's supplied (verified in web-ifc-api.js) —
    // included explicitly here for documentation, not because it's read.
    Dimensions: null,
    UnitType: enumValue(unitType),
    Prefix: null,
    Name: enumValue(name),
  });
}

/**
 * IfcUnitAssignment for metres (length) and square metres (area) — Spec §4
 * requires this project's units be explicit rather than implicit/undefined.
 */
function unitAssignment(): RawIfcLine {
  return line(IFC4_TYPE.UNIT_ASSIGNMENT, {
    Units: [siUnit("LENGTHUNIT", "METRE"), siUnit("AREAUNIT", "SQUARE_METRE")],
  });
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
    UnitsInContext: unitAssignment(),
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
  // Slice-3: the single ground-floor entrance is centered on the longest
  // footprint edge — computed once, outside the storey loop, since it only
  // depends on the (storey-independent) footprint.
  const entranceEdgeIndex = edgeCount > 0 ? pickEntranceEdge(outerRing) : -1;
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
    // Slice-3: captured while iterating edges below, so the entrance door
    // (emitted after this storey's windows) can host itself on the same
    // wall/placement/edge-length as the entrance edge's IfcWallStandardCase.
    let entranceWall: RawIfcLine | null = null;
    let entranceWallPlacement: RawIfcLine | null = null;
    let entranceEdgeLength = 0;

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
      const wallProfile = rectangleProfile(edgeLength, model.wallThicknessM);
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

      if (storeyIndex === 0 && edgeIndex === entranceEdgeIndex) {
        entranceWall = wall;
        entranceWallPlacement = wallPlacement;
        entranceEdgeLength = edgeLength;
      }

      // Slice-2: windows are estimated (era-facade defaults), never measured —
      // hosted in this wall via a real IfcOpeningElement void, per the plan.
      // No facade => no windows on this (or any) edge.
      if (model.facade) {
        const facade = model.facade;
        const windowPositions = computeWindowLayout(edgeLength, facade);

        for (let winIndex = 0; winIndex < windowPositions.length; winIndex += 1) {
          const leftX = windowPositions[winIndex];

          const openingPlacement = localPlacement(
            wallPlacement,
            axis2Placement3D(point3(leftX, 0, facade.sillHeight), null, null),
          );
          const openingProfile = rectangleProfile(facade.windowWidth, model.wallThicknessM);
          const openingShape = productShape(worldContext, [
            extrudedSolid(openingProfile, facade.windowHeight, direction(0, 0, 1)),
          ]);
          const opening = line(IFC4_TYPE.OPENING_ELEMENT, {
            GlobalId: label(guid()),
            OwnerHistory: null,
            Name: label(`Opening ${storeyIndex}-${edgeIndex}-${winIndex}`),
            Description: null,
            ObjectType: null,
            ObjectPlacement: openingPlacement,
            Representation: openingShape,
            Tag: null,
            PredefinedType: null,
          });
          session.writeLine(modelId, opening);

          session.writeLine(
            modelId,
            line(IFC4_TYPE.REL_VOIDS_ELEMENT, {
              GlobalId: label(guid()),
              OwnerHistory: null,
              Name: null,
              Description: null,
              RelatingBuildingElement: wall,
              RelatedOpeningElement: opening,
            }),
          );

          // Window fills the same box the opening cuts, with a Slice-4
          // detailed assembly (frame + glass pane + central mullion) rather
          // than a single placeholder box — see buildWindowAssembly above.
          const windowPlacement = localPlacement(
            wallPlacement,
            axis2Placement3D(point3(leftX, 0, facade.sillHeight), null, null),
          );
          const windowShape = productShape(
            worldContext,
            buildWindowAssembly(facade.windowWidth, facade.windowHeight, model.wallThicknessM),
          );
          const windowLine = line(IFC4_TYPE.WINDOW, {
            GlobalId: label(guid()),
            OwnerHistory: null,
            Name: label(`Window ${storeyIndex}-${edgeIndex}-${winIndex}`),
            Description: null,
            ObjectType: null,
            ObjectPlacement: windowPlacement,
            Representation: windowShape,
            Tag: null,
            OverallHeight: measure(facade.windowHeight),
            OverallWidth: measure(facade.windowWidth),
            PredefinedType: null,
            PartitioningType: null,
            UserDefinedPartitioningType: null,
          });
          const windowExpressId = session.writeLine(modelId, windowLine);
          storeyProducts.push(windowLine);
          elements.push({
            expressId: windowExpressId,
            kind: "window",
            storey: storeyIndex,
            geomSource: model.footprintSource,
            heightSource: model.heightSource,
            facadeSource: model.facadeSource,
          });

          session.writeLine(
            modelId,
            line(IFC4_TYPE.REL_FILLS_ELEMENT, {
              GlobalId: label(guid()),
              OwnerHistory: null,
              Name: null,
              Description: null,
              RelatingOpeningElement: opening,
              RelatedBuildingElement: windowLine,
            }),
          );
        }
      }
    }

    // Slice-3: exactly one ground-floor entrance door, hosted via the same
    // void/fill pattern as windows, on the wall covering the outer ring's
    // longest edge (pickEntranceEdge). Emitted after this storey's windows
    // (per the plan) and independent of model.facade — the entrance exists
    // even when no window facade was supplied.
    if (storeyIndex === 0 && entranceWall && entranceWallPlacement) {
      const doorWidth = ENGINE_CONSTANTS.DEFAULT_DOOR.width;
      const doorHeight = ENGINE_CONSTANTS.DEFAULT_DOOR.height;
      const leftX = (entranceEdgeLength - doorWidth) / 2;

      const doorOpeningPlacement = localPlacement(
        entranceWallPlacement,
        axis2Placement3D(point3(leftX, 0, 0), null, null),
      );
      const doorOpeningProfile = rectangleProfile(doorWidth, model.wallThicknessM);
      const doorOpeningShape = productShape(worldContext, [
        extrudedSolid(doorOpeningProfile, doorHeight, direction(0, 0, 1)),
      ]);
      const doorOpening = line(IFC4_TYPE.OPENING_ELEMENT, {
        GlobalId: label(guid()),
        OwnerHistory: null,
        Name: label(`Entrance Opening ${storeyIndex}`),
        Description: null,
        ObjectType: null,
        ObjectPlacement: doorOpeningPlacement,
        Representation: doorOpeningShape,
        Tag: null,
        PredefinedType: null,
      });
      session.writeLine(modelId, doorOpening);

      session.writeLine(
        modelId,
        line(IFC4_TYPE.REL_VOIDS_ELEMENT, {
          GlobalId: label(guid()),
          OwnerHistory: null,
          Name: null,
          Description: null,
          RelatingBuildingElement: entranceWall,
          RelatedOpeningElement: doorOpening,
        }),
      );

      // Door fills the same box the opening cuts, with a Slice-4 detailed
      // (but lighter, per the plan) assembly — frame + single solid panel,
      // no glass/mullion — see buildDoorAssembly above. May visually overlap
      // a window placed on the same entrance edge (documented Slice-3 scope
      // limitation, unaffected by the Slice-4 geometry upgrade).
      const doorPlacement = localPlacement(
        entranceWallPlacement,
        axis2Placement3D(point3(leftX, 0, 0), null, null),
      );
      const doorShape = productShape(
        worldContext,
        buildDoorAssembly(doorWidth, doorHeight, model.wallThicknessM),
      );
      const doorLine = line(IFC4_TYPE.DOOR, {
        GlobalId: label(guid()),
        OwnerHistory: null,
        Name: label(`Entrance Door ${storeyIndex}`),
        Description: null,
        ObjectType: null,
        ObjectPlacement: doorPlacement,
        Representation: doorShape,
        Tag: null,
        OverallHeight: measure(doorHeight),
        OverallWidth: measure(doorWidth),
        PredefinedType: null,
        OperationType: null,
        UserDefinedOperationType: null,
      });
      const doorExpressId = session.writeLine(modelId, doorLine);
      storeyProducts.push(doorLine);
      elements.push({
        expressId: doorExpressId,
        kind: "door",
        storey: 0,
        geomSource: model.footprintSource,
        heightSource: model.heightSource,
        // The door's placement is an estimate (centered on the longest edge,
        // never measured) — scored via the same FACADE_SCORE table as
        // windows (see score.ts), so this must always be set.
        facadeSource: model.facadeSource ?? "era-estimate",
      });

      session.writeLine(
        modelId,
        line(IFC4_TYPE.REL_FILLS_ELEMENT, {
          GlobalId: label(guid()),
          OwnerHistory: null,
          Name: null,
          Description: null,
          RelatingOpeningElement: doorOpening,
          RelatedBuildingElement: doorLine,
        }),
      );
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
