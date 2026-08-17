"use client";

// src/store/blueprint-store.ts
//
// The schematic editor's working state: one BlueprintSpec, the tool in hand,
// the in-progress drawing, and the validation report that follows every change.
//
// NOT persisted, for the same reason the session store is not: a blueprint is
// what you are drawing right now, and a stale one resurrected on the next visit
// would silently become design authority for a building nobody asked for.
//
// EVERY mutation goes through `blueprint/builders.ts`. Nothing here appends to
// `spec.zones` by hand — the builders are what make a drawn rectangle a SEMANTIC
// object (provenance stamped, floors listed, hold declared) rather than four
// coordinates. Removal is the one operation the builders do not cover, so it
// lives here and cleans up the references the removed object leaves behind.
//
// Determinism: ids come from a session counter, never from Date.now or
// Math.random, so the same sequence of drawing actions always yields the same
// blueprint — which is what makes "regenerate from this schematic" repeatable.

import { create } from "zustand";

import {
  addAnchor,
  addBoundary,
  addCirculationEdge,
  addCirculationNode,
  addCore,
  addPlacement,
  addVoid,
  addZone,
  blueprintPlacements,
  emptyBlueprint,
  makePolyLoop,
  makeRectLoop,
  preservationPlan,
  validateBlueprint,
  type BlueprintFidelityReport,
  type BlueprintSpec,
  type BlueprintValidationReport,
  type CirculationNode,
  type FidelityMode,
  type PointMm,
  type PreservationPlan,
  type Region,
  type SchematicPlacementTool,
} from "@/lib/generative/blueprint";
import {
  defaultFamilyForTool,
  getAuthoringFamily,
} from "@/lib/bim/family-catalog";
import type {
  CadImportReport,
  CadLayerAssignments,
} from "@/lib/generative/blueprint/import-cad-file";
import type { CadFileFormat } from "@/lib/generative/blueprint/read-cad-file";
import type { SpaceType } from "@/lib/generative/spec/building-spec";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type SchematicTool =
  | "select"
  | "boundary"
  | "void"
  | "core"
  | "entrance"
  | "circulation"
  | "zone"
  | "column"
  | "lighting"
  | "furniture";

export const PLACEMENT_TOOLS: SchematicPlacementTool[] = [
  "column",
  "lighting",
  "furniture",
];

export function isPlacementTool(tool: string): tool is SchematicPlacementTool {
  return tool === "column" || tool === "lighting" || tool === "furniture";
}

/** Tools that can be drawn either as a dragged rectangle or a clicked polygon. */
export type ShapeMode = "rect" | "polygon";

export type VoidKind = "atrium" | "courtyard";

export type CirculationNodeKind = CirculationNode["kind"];

/**
 * Programs the editor offers. Every entry is a `SpaceType` the downstream
 * solver can actually place; the schema would accept the rest, but a zone
 * tagged "mechanical" is a plant room the schematic layer has no way to size,
 * so the picker stays with what a schematic legitimately decides.
 */
export const ZONE_PROGRAMS: SpaceType[] = [
  "office-open",
  "office-cellular",
  "meeting",
  "lobby",
  "reception",
  "retail",
  "laboratory",
  "classroom",
  "residential-unit",
  "atrium",
  "circulation",
  "storage",
];

export const CIRCULATION_NODE_KINDS: CirculationNodeKind[] = [
  "entrance",
  "lobby",
  "junction",
  "corridor-node",
  "stair",
  "elevator",
];

export type Draft =
  | { kind: "polygon"; tool: SchematicTool; pointsMm: PointMm[] }
  | { kind: "rect"; tool: SchematicTool; startMm: PointMm; endMm: PointMm }
  | null;

/**
 * Where an imported blueprint came from, kept so the inspector can say it out
 * loud: a schematic the user did not draw must never be presented as one they
 * did. Carries no timestamp — the store is deterministic, and "when" is not
 * something the schematic depends on.
 */
export interface BlueprintImportProvenance {
  fileName: string;
  format: CadFileFormat;
  /** CadDocument id — the file name the CAD reader was given. */
  documentId: string;
  /** The layer→role mapping the user CONFIRMED, not the one that was guessed. */
  assignments: CadLayerAssignments;
  report: CadImportReport;
}

/**
 * The provenance, but only while it still describes the CURRENT blueprint —
 * i.e. history has not been undone back past the import that set it. One
 * definition, used by both the store getter and the inspector's selector.
 */
export function activeImportOf(state: {
  importProvenance: BlueprintImportProvenance | null;
  importDepth: number;
  past: unknown[];
}): BlueprintImportProvenance | null {
  return state.importProvenance && state.past.length >= state.importDepth
    ? state.importProvenance
    : null;
}

/** What the last successful generation was built from. */
export interface GeneratedFromBlueprint {
  generationId: string;
  blueprint: BlueprintSpec;
  blueprintValidation: BlueprintValidationReport;
  compiledLocks: string[];
  /**
   * The measured deviation between `blueprint` and the building generation
   * produced. Kept HERE, beside the blueprint it was measured against, because
   * the two are one artefact: a report shown next to a different building would
   * be a number describing geometry nobody is looking at.
   */
  fidelity: BlueprintFidelityReport;
}

/**
 * The fidelity report, but only while the design on screen is the one it
 * measured. `designGenerationId` is `DesignState.generationId`; an edit, an
 * undo to another branch or a fresh prompt generation all change it, and the
 * report must disappear rather than be silently re-attributed to a building it
 * never saw. Same binding rule the plan overlay uses for the blueprint itself.
 */
export function fidelityForDesign(
  lastGenerated: GeneratedFromBlueprint | null,
  designGenerationId: string | null | undefined,
): BlueprintFidelityReport | null {
  if (!lastGenerated || !designGenerationId) return null;
  return lastGenerated.generationId === designGenerationId
    ? lastGenerated.fidelity
    : null;
}

/* ------------------------------------------------------------------ */
/* Pure helpers (exported for tests and for the canvas)                */
/* ------------------------------------------------------------------ */

export const DEFAULT_SNAP_MM = 500;

/** Grid snap. `snapMm <= 0` means the pointer position is kept exactly. */
export function snapPoint(point: PointMm, snapMm: number): PointMm {
  if (snapMm <= 0) {
    return { xMm: Math.round(point.xMm), zMm: Math.round(point.zMm) };
  }
  return {
    xMm: Math.round(point.xMm / snapMm) * snapMm,
    zMm: Math.round(point.zMm / snapMm) * snapMm,
  };
}

/** Constrain to the dominant axis relative to an anchor — the Shift behaviour. */
export function orthoPoint(anchor: PointMm, point: PointMm): PointMm {
  return Math.abs(point.xMm - anchor.xMm) >= Math.abs(point.zMm - anchor.zMm)
    ? { xMm: point.xMm, zMm: anchor.zMm }
    : { xMm: anchor.xMm, zMm: point.zMm };
}

export function rectRegion(a: PointMm, b: PointMm): Region | null {
  const widthMm = Math.abs(b.xMm - a.xMm);
  const depthMm = Math.abs(b.zMm - a.zMm);
  if (widthMm < 1 || depthMm < 1) return null;
  return {
    kind: "rect",
    originMm: {
      xMm: Math.round((a.xMm + b.xMm) / 2),
      zMm: Math.round((a.zMm + b.zMm) / 2),
    },
    widthMm,
    depthMm,
    rotationRad: 0,
  };
}

/** Inclusive storey range with no storey 0 — the schema forbids one. */
export function floorRange(from: number, to: number): number[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const out: number[] = [];
  for (let n = lo; n <= hi; n += 1) {
    if (n !== 0) out.push(n);
  }
  return out.length > 0 ? out : [1];
}

interface Seg {
  a: PointMm;
  b: PointMm;
}

/**
 * Straight edges of every boundary loop. Curves are reduced to their chord:
 * the native editor only ever draws lines, and an entrance snapped to the chord
 * of an imported arc is a millimetre-scale approximation of a door position,
 * not a wrong one.
 */
function boundarySegments(spec: BlueprintSpec): Seg[] {
  const out: Seg[] = [];
  for (const boundary of spec.boundaries) {
    for (const segment of boundary.loop.segments) {
      if (segment.kind === "polyline") {
        for (let i = 0; i + 1 < segment.pointsMm.length; i += 1) {
          out.push({ a: segment.pointsMm[i], b: segment.pointsMm[i + 1] });
        }
        continue;
      }
      out.push({ a: segment.startMm, b: segment.endMm });
    }
  }
  return out;
}

/** Closest point on any boundary edge, or null when nothing is drawn yet. */
export function nearestBoundaryPoint(
  spec: BlueprintSpec,
  point: PointMm,
): PointMm | null {
  let best: PointMm | null = null;
  let bestDistance = Infinity;

  for (const { a, b } of boundarySegments(spec)) {
    const dx = b.xMm - a.xMm;
    const dz = b.zMm - a.zMm;
    const lengthSq = dx * dx + dz * dz;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.xMm - a.xMm) * dx + (point.zMm - a.zMm) * dz) / lengthSq,
            ),
          );
    const projected = {
      xMm: Math.round(a.xMm + t * dx),
      zMm: Math.round(a.zMm + t * dz),
    };
    const distance = Math.hypot(point.xMm - projected.xMm, point.zMm - projected.zMm);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = projected;
    }
  }

  return best;
}

/**
 * Remove one object and everything that referenced it.
 *
 * A dangling reference is a P0 violation, so deleting a circulation node has to
 * take its edges with it — otherwise "delete" would quietly make the blueprint
 * invalid and the user would learn about it from the issues panel.
 */
export function removeObject(spec: BlueprintSpec, id: string): BlueprintSpec {
  const boundaries = spec.boundaries.filter((b) => b.loop.id !== id);
  const voids = spec.voids.filter((v) => v.id !== id && regionLoopId(v.region) !== id);
  const cores = spec.cores.filter((c) => c.id !== id && regionLoopId(c.region) !== id);
  const zones = spec.zones.filter((z) => z.id !== id && regionLoopId(z.region) !== id);
  const anchors = spec.anchors.filter((a) => a.id !== id);
  const placements = blueprintPlacements(spec).filter((p) => p.id !== id);
  const nodes = spec.circulation.nodes.filter((n) => n.id !== id);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = spec.circulation.edges.filter(
    (e) => e.id !== id && nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId),
  );

  const survivingIds = new Set<string>([
    ...boundaries.map((b) => b.loop.id),
    ...voids.map((v) => v.id),
    ...cores.map((c) => c.id),
    ...zones.map((z) => z.id),
    ...anchors.map((a) => a.id),
    ...placements.map((p) => p.id),
    ...nodes.map((n) => n.id),
    ...edges.map((e) => e.id),
  ]);

  return {
    ...spec,
    boundaries,
    voids,
    cores,
    zones,
    anchors,
    placements,
    circulation: { nodes, edges },
    // A zone that listed the deleted object as a member, and any fidelity
    // override naming it, would both dangle.
    fidelityOverrides: spec.fidelityOverrides.filter((o) =>
      survivingIds.has(o.targetId),
    ),
    relationships: spec.relationships.filter(
      (r) =>
        r.fromId !== id && (r.toId === undefined || r.toId !== id),
    ),
  };
}

function regionLoopId(region: Region): string | null {
  return region.kind === "loop" ? region.loop.id : null;
}

/**
 * Highest `-<n>` suffix among a blueprint's ids.
 *
 * An imported blueprint arrives with ids the store's own counter would happily
 * mint again ("core-1"), and a duplicate id is a P0 violation. Loading one
 * therefore pushes `seq` past everything already in it.
 */
export function highestIdSuffix(spec: BlueprintSpec): number {
  const ids: string[] = [
    ...spec.boundaries.map((b) => b.loop.id),
    ...spec.voids.flatMap((v) => [v.id, regionLoopId(v.region) ?? ""]),
    ...spec.cores.flatMap((c) => [c.id, regionLoopId(c.region) ?? ""]),
    ...spec.zones.flatMap((z) => [z.id, regionLoopId(z.region) ?? ""]),
    ...spec.anchors.map((a) => a.id),
    ...blueprintPlacements(spec).map((p) => p.id),
    ...spec.circulation.nodes.map((n) => n.id),
    ...spec.circulation.edges.map((e) => e.id),
  ];

  let highest = 0;
  for (const id of ids) {
    const match = /-(\d+)(?:-loop)?$/.exec(id);
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const UNDO_CAP = 50;
const DEFAULT_NAME = "Untitled schematic";

interface BlueprintState {
  blueprint: BlueprintSpec;
  validation: BlueprintValidationReport;

  tool: SchematicTool;
  shapeMode: ShapeMode;
  voidKind: VoidKind;
  zoneProgram: SpaceType;
  circulationNodeKind: CirculationNodeKind;
  /** Family the Column / Light / Furniture tool will drop on the next click. */
  placementFamilyId: string;
  snapMm: number;
  /** Storeys every newly drawn object is assigned to. */
  floorFrom: number;
  floorTo: number;

  draft: Draft;
  /** Chained circulation: the node the next click connects back to. */
  chainFromNodeId: string | null;
  selectedId: string | null;

  past: BlueprintSpec[];
  future: BlueprintSpec[];
  /** Monotonic id counter; part of the state so undo does not reuse an id. */
  seq: number;

  lastGenerated: GeneratedFromBlueprint | null;

  /** Set by `loadBlueprint`; null for a natively drawn schematic. */
  importProvenance: BlueprintImportProvenance | null;
  /**
   * `past.length` at the moment the import landed. The provenance describes the
   * CURRENT blueprint only while history sits at or above that depth — undoing
   * past the import must not leave the inspector claiming a file the working
   * blueprint no longer came from.
   */
  importDepth: number;

  /* --- derived --- */
  floorNos: () => number[];
  preservation: () => PreservationPlan;
  canUndo: () => boolean;
  canRedo: () => boolean;
  activeImport: () => BlueprintImportProvenance | null;

  /* --- settings --- */
  setTool: (tool: SchematicTool) => void;
  setShapeMode: (mode: ShapeMode) => void;
  setVoidKind: (kind: VoidKind) => void;
  setZoneProgram: (program: SpaceType) => void;
  setCirculationNodeKind: (kind: CirculationNodeKind) => void;
  setPlacementFamily: (familyId: string) => void;
  setSnap: (snapMm: number) => void;
  setFloors: (from: number, to: number) => void;
  setFidelityMode: (mode: FidelityMode) => void;
  rename: (name: string) => void;

  /* --- drawing --- */
  addPoint: (point: PointMm, ortho?: boolean) => void;
  closePolygon: () => void;
  startRect: (point: PointMm) => void;
  updateRect: (point: PointMm, ortho?: boolean) => void;
  commitRect: () => void;
  placeEntrance: (point: PointMm) => void;
  placeCirculationNode: (point: PointMm) => void;
  placePlacement: (point: PointMm) => void;
  cancelDraft: () => void;

  /* --- editing --- */
  select: (id: string | null) => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  reset: (name?: string) => void;
  /**
   * Replace the working blueprint wholesale — the CAD import's landing point.
   * One history entry, so a mapping the user regrets is one Ctrl+Z away.
   */
  loadBlueprint: (
    spec: BlueprintSpec,
    provenance?: BlueprintImportProvenance | null,
  ) => void;

  noteGenerated: (result: GeneratedFromBlueprint) => void;
}

function initial(name: string): BlueprintSpec {
  return emptyBlueprint(name);
}

export const useBlueprintStore = create<BlueprintState>((set, get) => {
  /** Apply a builder result: record history, re-validate, clear the draft. */
  const apply = (
    next: BlueprintSpec,
    extra: Partial<BlueprintState> = {},
  ): Partial<BlueprintState> => {
    const previous = get().blueprint;
    return {
      blueprint: next,
      validation: validateBlueprint(next),
      past: [...get().past, previous].slice(-UNDO_CAP),
      future: [],
      draft: null,
      ...extra,
    };
  };

  const nextId = (prefix: string): { id: string; seq: number } => {
    const seq = get().seq + 1;
    return { id: `${prefix}-${seq}`, seq };
  };

  const snap = (point: PointMm) => snapPoint(point, get().snapMm);

  return {
    blueprint: initial(DEFAULT_NAME),
    validation: validateBlueprint(initial(DEFAULT_NAME)),

    tool: "boundary",
    shapeMode: "rect",
    voidKind: "atrium",
    zoneProgram: "office-open",
    circulationNodeKind: "junction",
    placementFamilyId: defaultFamilyForTool("column").id,
    snapMm: DEFAULT_SNAP_MM,
    floorFrom: 1,
    floorTo: 3,

    draft: null,
    chainFromNodeId: null,
    selectedId: null,

    past: [],
    future: [],
    seq: 0,

    lastGenerated: null,
    importProvenance: null,
    importDepth: 0,

    floorNos: () => floorRange(get().floorFrom, get().floorTo),
    preservation: () => preservationPlan(get().blueprint),
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
    activeImport: () => activeImportOf(get()),

    setTool: (tool) =>
      set((state) => {
        const next: Partial<BlueprintState> = {
          tool,
          draft: null,
          chainFromNodeId: null,
        };
        if (isPlacementTool(tool)) {
          const current = getAuthoringFamily(state.placementFamilyId);
          if (!current || current.tool !== tool) {
            next.placementFamilyId = defaultFamilyForTool(tool).id;
          }
        }
        return next;
      }),
    setShapeMode: (shapeMode) => set({ shapeMode, draft: null }),
    setVoidKind: (voidKind) => set({ voidKind }),
    setZoneProgram: (zoneProgram) => set({ zoneProgram }),
    setCirculationNodeKind: (circulationNodeKind) => set({ circulationNodeKind }),
    setPlacementFamily: (familyId) => {
      const family = getAuthoringFamily(familyId);
      if (!family || !isPlacementTool(family.tool)) return;
      set({ placementFamilyId: family.id, tool: family.tool });
    },
    setSnap: (snapMm) => set({ snapMm: Math.max(0, Math.round(snapMm)) }),
    setFloors: (from, to) =>
      set({
        floorFrom: Math.max(-8, Math.min(120, Math.round(from))),
        floorTo: Math.max(-8, Math.min(120, Math.round(to))),
      }),
    setFidelityMode: (mode) =>
      set(apply({ ...get().blueprint, fidelityMode: mode })),
    rename: (name) =>
      set(apply({ ...get().blueprint, name: name.slice(0, 120) || DEFAULT_NAME })),

    /* --- polygon drawing --- */

    addPoint: (point, ortho = false) =>
      set((state) => {
        const draft = state.draft;
        const existing = draft?.kind === "polygon" ? draft.pointsMm : [];
        const last = existing[existing.length - 1];
        const raw = ortho && last ? orthoPoint(last, point) : point;
        const snapped = snapPoint(raw, state.snapMm);
        // A repeated click on the same vertex would create a zero-length
        // segment, which validates as an unclosed loop.
        if (last && last.xMm === snapped.xMm && last.zMm === snapped.zMm) return state;
        return {
          draft: {
            kind: "polygon",
            tool: state.tool,
            pointsMm: [...existing, snapped],
          },
        };
      }),

    closePolygon: () => {
      const state = get();
      const draft = state.draft;
      if (draft?.kind !== "polygon" || draft.pointsMm.length < 3) return;

      const floorNos = floorRange(state.floorFrom, state.floorTo);

      if (draft.tool === "boundary") {
        const { id, seq } = nextId("boundary");
        set(
          apply(
            addBoundary(state.blueprint, {
              loop: makePolyLoop(id, draft.pointsMm),
              floorNos,
              role: "outline",
            }),
            { seq, selectedId: id },
          ),
        );
        return;
      }

      if (draft.tool === "void") {
        const { id, seq } = nextId("void");
        set(
          apply(
            addVoid(state.blueprint, {
              id,
              kind: state.voidKind,
              region: { kind: "loop", loop: makePolyLoop(`${id}-loop`, draft.pointsMm) },
              floorNos,
            }),
            { seq, selectedId: id },
          ),
        );
        return;
      }

      if (draft.tool === "zone") {
        const { id, seq } = nextId("zone");
        set(
          apply(
            addZone(state.blueprint, {
              id,
              program: state.zoneProgram,
              region: { kind: "loop", loop: makePolyLoop(`${id}-loop`, draft.pointsMm) },
              floorNos,
            }),
            { seq, selectedId: id },
          ),
        );
        return;
      }

      if (draft.tool === "core") {
        const { id, seq } = nextId("core");
        set(
          apply(
            addCore(state.blueprint, {
              id,
              region: { kind: "loop", loop: makePolyLoop(`${id}-loop`, draft.pointsMm) },
              floorNos,
            }),
            { seq, selectedId: id },
          ),
        );
      }
    },

    /* --- rectangle drawing --- */

    startRect: (point) =>
      set((state) => ({
        draft: {
          kind: "rect",
          tool: state.tool,
          startMm: snapPoint(point, state.snapMm),
          endMm: snapPoint(point, state.snapMm),
        },
      })),

    updateRect: (point, ortho = false) =>
      set((state) => {
        const draft = state.draft;
        if (draft?.kind !== "rect") return state;
        const snapped = snapPoint(point, state.snapMm);
        const corner = ortho
          ? // A square, measured on the longer side.
            (() => {
              const size = Math.max(
                Math.abs(snapped.xMm - draft.startMm.xMm),
                Math.abs(snapped.zMm - draft.startMm.zMm),
              );
              return {
                xMm:
                  draft.startMm.xMm +
                  Math.sign(snapped.xMm - draft.startMm.xMm) * size,
                zMm:
                  draft.startMm.zMm +
                  Math.sign(snapped.zMm - draft.startMm.zMm) * size,
              };
            })()
          : snapped;
        return { draft: { ...draft, endMm: corner } };
      }),

    commitRect: () => {
      const state = get();
      const draft = state.draft;
      if (draft?.kind !== "rect") return;
      const floorNos = floorRange(state.floorFrom, state.floorTo);
      const region = rectRegion(draft.startMm, draft.endMm);
      if (!region) {
        set({ draft: null });
        return;
      }

      if (draft.tool === "boundary") {
        const { id, seq } = nextId("boundary");
        const minX = Math.min(draft.startMm.xMm, draft.endMm.xMm);
        const minZ = Math.min(draft.startMm.zMm, draft.endMm.zMm);
        set(
          apply(
            addBoundary(state.blueprint, {
              loop: makeRectLoop(id, {
                xMm: minX,
                zMm: minZ,
                widthMm: Math.abs(draft.endMm.xMm - draft.startMm.xMm),
                depthMm: Math.abs(draft.endMm.zMm - draft.startMm.zMm),
              }),
              floorNos,
              role: "outline",
            }),
            { seq, selectedId: id },
          ),
        );
        return;
      }

      if (draft.tool === "core") {
        const { id, seq } = nextId("core");
        set(
          apply(
            addCore(state.blueprint, {
              id,
              region,
              floorNos,
              contents: ["stair", "elevator"],
            }),
            { seq, selectedId: id },
          ),
        );
        return;
      }

      if (draft.tool === "void") {
        const { id, seq } = nextId("void");
        set(
          apply(
            addVoid(state.blueprint, {
              id,
              kind: state.voidKind,
              region,
              floorNos,
            }),
            { seq, selectedId: id },
          ),
        );
        return;
      }

      if (draft.tool === "zone") {
        const { id, seq } = nextId("zone");
        set(
          apply(
            addZone(state.blueprint, {
              id,
              program: state.zoneProgram,
              region,
              floorNos,
            }),
            { seq, selectedId: id },
          ),
        );
        return;
      }

      set({ draft: null });
    },

    /* --- anchors + circulation --- */

    placeEntrance: (point) => {
      const state = get();
      const onBoundary = nearestBoundaryPoint(state.blueprint, point);
      // An entrance is a point ON the envelope. Without a boundary there is no
      // envelope, so there is nothing to attach it to.
      if (!onBoundary) return;
      const { id, seq } = nextId("entrance");
      set(
        apply(
          addAnchor(state.blueprint, {
            id,
            kind: "entrance",
            positionMm: onBoundary,
            floorNos: [floorRange(state.floorFrom, state.floorTo)[0]],
          }),
          { seq, selectedId: id },
        ),
      );
    },

    placeCirculationNode: (point) => {
      const state = get();
      const nodeStep = nextId("node");
      const position = snap(point);
      let next = addCirculationNode(state.blueprint, {
        id: nodeStep.id,
        kind: state.circulationNodeKind,
        positionMm: position,
        floorNos: floorRange(state.floorFrom, state.floorTo),
      });
      let seq = nodeStep.seq;

      // Consecutive clicks build a route: the edge is what makes the graph
      // connected, and a disconnected node is a P1 violation.
      if (state.chainFromNodeId) {
        seq += 1;
        next = addCirculationEdge(next, {
          id: `edge-${seq}`,
          fromNodeId: state.chainFromNodeId,
          toNodeId: nodeStep.id,
          kind: "horizontal",
        });
      }

      set(apply(next, { seq, chainFromNodeId: nodeStep.id, selectedId: nodeStep.id }));
    },

    placePlacement: (point) => {
      const state = get();
      if (!isPlacementTool(state.tool)) return;
      const family = getAuthoringFamily(state.placementFamilyId);
      if (!family || family.tool !== state.tool) return;
      const prefix =
        state.tool === "column" ? "column" : state.tool === "lighting" ? "light" : "furn";
      const { id, seq } = nextId(prefix);
      set(
        apply(
          addPlacement(state.blueprint, {
            id,
            familyId: family.id,
            tool: state.tool,
            positionMm: snap(point),
            floorNos: floorRange(state.floorFrom, state.floorTo),
          }),
          { seq, selectedId: id },
        ),
      );
    },

    cancelDraft: () => set({ draft: null, chainFromNodeId: null }),

    /* --- editing --- */

    select: (id) => set({ selectedId: id }),

    deleteSelected: () => {
      const state = get();
      if (!state.selectedId) return;
      set(apply(removeObject(state.blueprint, state.selectedId), { selectedId: null }));
    },

    undo: () =>
      set((state) => {
        const previous = state.past[state.past.length - 1];
        if (!previous) return state;
        return {
          blueprint: previous,
          validation: validateBlueprint(previous),
          past: state.past.slice(0, -1),
          future: [state.blueprint, ...state.future].slice(0, UNDO_CAP),
          draft: null,
          selectedId: null,
        };
      }),

    redo: () =>
      set((state) => {
        const next = state.future[0];
        if (!next) return state;
        return {
          blueprint: next,
          validation: validateBlueprint(next),
          past: [...state.past, state.blueprint].slice(-UNDO_CAP),
          future: state.future.slice(1),
          draft: null,
          selectedId: null,
        };
      }),

    reset: (name = DEFAULT_NAME) => {
      const blank = initial(name);
      set({
        blueprint: blank,
        validation: validateBlueprint(blank),
        draft: null,
        chainFromNodeId: null,
        selectedId: null,
        past: [],
        future: [],
        seq: 0,
        lastGenerated: null,
        importProvenance: null,
        importDepth: 0,
      });
    },

    loadBlueprint: (spec, provenance = null) => {
      const state = get();
      set(
        apply(spec, {
          selectedId: null,
          chainFromNodeId: null,
          // Ids arriving with the import must never be minted a second time.
          seq: Math.max(state.seq, highestIdSuffix(spec)),
          importProvenance: provenance,
          importDepth: Math.min(state.past.length + 1, UNDO_CAP),
        }),
      );
    },

    noteGenerated: (result) => set({ lastGenerated: result }),
  };
});
