/**
 * The Clinic's U-values, solved from its own layer stacks.
 *
 * This module is where the building stops being evidence and starts being an
 * assumption, and the split is deliberate. The manifest carries what the IFC
 * states — layer order, layer names, thicknesses, each citable to an entity.
 * It carries no conductivity, because the file carries none: a coordination
 * model routinely has no `IfcMaterialProperties` at all. So every λ here is a
 * mapping *we* chose, and it is named, sourced and reversible rather than
 * folded into a number.
 *
 * That is why this lives in `src/` and not in the build script. Putting a
 * solved U-value into `manifest.json` would file an assumption alongside
 * evidence in a document whose whole claim is that it only reports what the
 * model says.
 *
 * The direction of travel matters too. The other builders in this repo start
 * from a target U — an era table, a code ceiling — and solve backwards for a
 * plausible insulation thickness. This one goes layers → U, which is the
 * honest direction, and is the reason this building was chosen.
 */

import {
  calculateAssembly,
  type AssemblyCalcResult,
  type HeatFlowDirection,
} from "@/lib/energy-standards/assembly";
import { GENERIC_MATERIALS } from "@/lib/energy-standards/materials";
import type { ReferenceBuildingManifest } from "./manifest";

/** How a layer name was resolved to a thermal property. */
export type LayerBasis =
  /** Resolved to a `GENERIC_MATERIALS` entry, by λ or by a cavity's fixed R. */
  | "generic_material"
  /** The model names the layer but nothing in the library matches it. */
  | "unresolved";

export type LayerMapping = Readonly<{
  /** Exact `IfcMaterialLayer` material name, as the file spells it. */
  ifcName: string;
  basis: LayerBasis;
  /** `GENERIC_MATERIALS` id, when `basis` is `generic_material`. */
  materialId?: string;
  /** Why this mapping and not another. Shown in the assumption ledger. */
  basisNote: string;
}>;

/**
 * IFC layer name → thermal property, one row per name the Clinic actually
 * uses. A hand-written table on purpose.
 *
 * `searchGenericMaterials` must never be used for this. It substring-matches
 * `nameKo`/`nameEn` only, so "Glass" returns glass wool, and "Insulation",
 * "Plasterboard" and "Metal" return nothing at all — a search that fails
 * silently on three of the five layers in the exterior wall.
 */
export const CLINIC_LAYER_MAPPINGS: readonly LayerMapping[] = Object.freeze([
  {
    ifcName: "Insulation - Insulated Panel",
    basis: "generic_material",
    materialId: "pnl-imp-pir42",
    basisNote:
      "Insulated metal panels are PIR/PUR-cored; the panel is 42 mm and the " +
      "library entry is the sourced 42 mm IMP.",
  },
  {
    ifcName: "Metal - Firring",
    basis: "generic_material",
    materialId: "air-iso-h25",
    basisNote:
      "A furring cavity, treated as an unventilated air layer at ISO 6946 " +
      "Table 2's horizontal value. Steel bridging through it is IGNORED, " +
      "which flatters the wall — a stated simplification.",
  },
  {
    ifcName: "Wood - Sheathing - plywood",
    basis: "generic_material",
    materialId: "wd-plywood",
    basisNote:
      "Direct match: plywood sheathing, used at the 19 mm the model states " +
      "rather than the library's typical thickness.",
  },
  {
    ifcName: "Metal - Stud Layer",
    basis: "generic_material",
    materialId: "air-iso-h25",
    basisNote:
      "THE LARGEST ASSUMPTION IN THIS BUILDING. The model names no insulation " +
      "in the 152 mm stud cavity, so none is assumed and it is treated as an " +
      "unventilated air layer, horizontal flow. Filling it with an R-13 batt " +
      "would take the wall from U 0.404 to U 0.218 — 1.85x better — so this " +
      "is the assumption to argue with first. Steel stud bridging is likewise " +
      "ignored, which pushes the other way.",
  },
  {
    ifcName: "Plasterboard",
    basis: "generic_material",
    materialId: "fin-gypsum",
    basisNote:
      "Direct match: gypsum plasterboard, the library's own finish entry.",
  },
  {
    ifcName: "Type-X Plasterboard",
    basis: "generic_material",
    materialId: "fin-gypsum",
    basisNote:
      "Type-X differs from plain board in fire rating, not conductivity.",
  },
  {
    ifcName: "Concrete - Cast In Situ",
    basis: "generic_material",
    materialId: "st-rc",
    basisNote:
      "Direct match: reinforced cast-in-situ concrete, the library's " +
      "structural entry.",
  },
  {
    ifcName: "Concrete - Cast in Situ Lightweight",
    basis: "generic_material",
    materialId: "st-lwc",
    basisNote:
      "Direct match: lightweight structural concrete, distinct from the " +
      "normal-weight entry above and materially less conductive.",
  },
  {
    ifcName: "Roofing - EPDM Membrane",
    basis: "generic_material",
    materialId: "mb-epdm",
    basisNote:
      "Direct match: single-ply EPDM roofing membrane. Its resistance is " +
      "small but it is the layer keeping water off the insulation below.",
  },
  {
    ifcName: "Insulation / Thermal Barriers - Rigid insulation",
    basis: "generic_material",
    materialId: "ins-polyiso",
    basisNote:
      "Rigid board over a metal deck under EPDM is polyisocyanurate in this " +
      "assembly type. Named rather than searched: 'Rigid insulation' matches " +
      "nothing in the library by substring.",
  },
  {
    ifcName: "Metal - Decking",
    basis: "generic_material",
    materialId: "mt-steel-deck",
    basisNote:
      "Profiled steel deck. Its thermal resistance is negligible and it is " +
      "included for completeness rather than effect.",
  },
  {
    ifcName: "Roofing - Metal",
    basis: "generic_material",
    materialId: "mt-steel-deck",
    basisNote:
      "Standing-seam steel sheet, mapped to the same steel entry as the deck " +
      "— the profile differs, the conductivity does not.",
  },
  {
    ifcName: "Structure - Steel Bar Joist Layer",
    basis: "generic_material",
    materialId: "air-iso-u25",
    basisNote:
      "A 286 mm joist zone that is mostly air with steel webs through it, " +
      "treated as one unventilated cavity at ISO 6946's UPWARD value (0.16), " +
      "not the horizontal one — Table 2 is direction-dependent and borrowing " +
      "the horizontal row here would read 6% better than the roof is. The " +
      "steel webs break Table 2's premise and are unrepresented, so this is " +
      "the optimistic bound. The assembly names NO insulation in its 330 mm.",
  },
]);

const BY_NAME = new Map(CLINIC_LAYER_MAPPINGS.map((m) => [m.ifcName, m]));
const MATERIAL_BY_ID = new Map(GENERIC_MATERIALS.map((m) => [m.id, m]));

export type SolvedLayer = Readonly<{
  ifcName: string;
  thicknessM: number;
  /** The IFC entity this layer's thickness was read from. */
  ref: string;
  mapping: LayerMapping | null;
  conductivityWPerMK: number | null;
  resistanceM2KPerW: number | null;
}>;

export type SolvedConstruction = Readonly<{
  id: string;
  name: string;
  direction: HeatFlowDirection;
  totalThicknessM: number;
  layers: readonly SolvedLayer[];
  /** Null when any layer is unresolved — never a partial U. */
  uValueWPerM2K: number | null;
  result: AssemblyCalcResult | null;
  /** Layer names the table does not cover. A U is refused while non-empty. */
  unresolved: readonly string[];
  /** Every assumption that went into the U, for the ledger. */
  assumptions: readonly Readonly<{ layer: string; basisNote: string }>[];
}>;

/**
 * Heat-flow direction per assembly, from what the assembly IS.
 *
 * ISO 6946's surface resistances differ by direction, and getting this wrong
 * is a quiet few percent. Walls are horizontal flow, roofs upward, ground and
 * intermediate floors downward.
 */
function directionFor(name: string): HeatFlowDirection {
  const lower = name.toLowerCase();
  if (lower.includes("roof") || lower.includes("ceiling")) return "upward";
  if (lower.includes("floor") || lower.includes("slab")) return "downward";
  return "horizontal";
}

/**
 * Solve one assembly's U-value from its stated layers.
 *
 * Refuses rather than approximates: if any layer name is not in the mapping
 * table, `uValueWPerM2K` is null and the offending names are listed. A U-value
 * computed from four of five layers is not a worse U-value, it is a different
 * assembly's U-value.
 */
export function solveConstruction(
  assembly: NonNullable<ReferenceBuildingManifest["assemblies"]>[number],
): SolvedConstruction {
  const direction = directionFor(assembly.name);
  const unresolved: string[] = [];
  const assumptions: { layer: string; basisNote: string }[] = [];

  const layers: SolvedLayer[] = assembly.layers.map((layer) => {
    const mapping = BY_NAME.get(layer.name) ?? null;
    if (!mapping) {
      unresolved.push(layer.name);
      return {
        ifcName: layer.name,
        thicknessM: layer.thicknessM,
        ref: layer.ref,
        mapping: null,
        conductivityWPerMK: null,
        resistanceM2KPerW: null,
      };
    }
    assumptions.push({ layer: layer.name, basisNote: mapping.basisNote });

    const material = mapping.materialId
      ? MATERIAL_BY_ID.get(mapping.materialId)
      : undefined;
    if (!material) {
      // The table names a material the library does not have. That is a bug in
      // the table, not a property of the building, so it must not silently
      // become a default.
      unresolved.push(`${layer.name} (no material ${mapping.materialId})`);
      return {
        ifcName: layer.name,
        thicknessM: layer.thicknessM,
        ref: layer.ref,
        mapping,
        conductivityWPerMK: null,
        resistanceM2KPerW: null,
      };
    }
    // A library entry carries EITHER a conductivity or, for a cavity, a
    // fixed resistance. Neither is a failure state to paper over: a material
    // with neither cannot contribute a resistance and is reported.
    const lambda = material.conductivityWPerMK ?? null;
    const fixedR = material.fixedResistanceM2KPerW ?? null;
    if (lambda === null && fixedR === null) {
      unresolved.push(`${layer.name} (material ${material.id} states no λ and no R)`);
      return {
        ifcName: layer.name,
        thicknessM: layer.thicknessM,
        ref: layer.ref,
        mapping,
        conductivityWPerMK: null,
        resistanceM2KPerW: null,
      };
    }
    return {
      ifcName: layer.name,
      thicknessM: layer.thicknessM,
      ref: layer.ref,
      mapping,
      conductivityWPerMK: lambda,
      resistanceM2KPerW: lambda !== null ? layer.thicknessM / lambda : fixedR,
    };
  });

  if (unresolved.length > 0) {
    return {
      id: assembly.id,
      name: assembly.name,
      direction,
      totalThicknessM: assembly.totalThicknessM,
      layers,
      uValueWPerM2K: null,
      result: null,
      unresolved,
      assumptions,
    };
  }

  const result = calculateAssembly(
    layers.map((l) => ({
      id: l.ifcName,
      thicknessM: l.thicknessM,
      ...(l.conductivityWPerMK !== null
        ? { conductivityWPerMK: l.conductivityWPerMK }
        : { fixedResistanceM2KPerW: l.resistanceM2KPerW ?? 0 }),
    })),
    direction,
  );

  return {
    id: assembly.id,
    name: assembly.name,
    direction,
    totalThicknessM: assembly.totalThicknessM,
    layers,
    uValueWPerM2K: result.uValueWPerM2K,
    result,
    unresolved,
    assumptions,
  };
}

/** Every assembly the manifest carries, solved. */
export function solveConstructions(
  manifest: ReferenceBuildingManifest,
): readonly SolvedConstruction[] {
  return (manifest.assemblies ?? []).map(solveConstruction);
}

/**
 * The assemblies that separate inside from outside, worst first.
 *
 * Worst first because that is the order the question gets asked in: the
 * standing-seam roof at U 3.45 sits beside an EPDM roof at 0.317, and burying
 * the bad one under an alphabetical list is how a building comes to look
 * better than it is. Interior partitions are excluded — they move heat between
 * rooms, not out of the building.
 */
export function envelopeConstructions(
  manifest: ReferenceBuildingManifest,
): readonly SolvedConstruction[] {
  return solveConstructions(manifest)
    .filter((c) => /exterior|roof|slab on grade|foundation/i.test(c.name))
    .sort((a, b) => (b.uValueWPerM2K ?? -1) - (a.uValueWPerM2K ?? -1));
}
