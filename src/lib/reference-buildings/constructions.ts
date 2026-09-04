/**
 * A reference building's U-values, solved from its own layer stacks.
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
 * honest direction, and is the reason these buildings were chosen.
 *
 * There is one mapping table per building, selected by `manifest.id`. Not one
 * shared table: "Insulation" and "99 Isolatie - EPS" are the same idea in two
 * languages, but a name that means one material in one model can mean another
 * in the next, and a table that quietly grows to cover every building is a
 * table nobody can read against the model it describes.
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

/**
 * Schependomlaan's 23 distinct Dutch layer names, one row each.
 *
 * Two things are true of this model that are not true of the Clinic's, and
 * both shape the table. First, the exterior wall is not an assembly: its
 * three leaves are three separate layer sets, so no row here solves a wall —
 * the composite is `SCHEPENDOMLAAN_CAVITY_WALL` in `schependomlaan-energy.ts`
 * and is labelled an inference there. Second, several of these names are
 * functions rather than materials ("99 Lichte scheidingswand - normaal",
 * "99 Isolatie - zwevende dekvloer"), so the material behind them is read
 * from the ASSEMBLY the layer appears in, and that reading is recorded in the
 * note rather than left implicit.
 *
 * The library has no Dutch entries and none are added: `GENERIC_MATERIALS`
 * is governed by ENERGY_STANDARD_TRACEABILITY.md and a reference building is
 * not the place to grow it. Where the nearest entry is a poor fit, the note
 * says so and says which way the error runs.
 */
export const SCHEPENDOMLAAN_LAYER_MAPPINGS: readonly LayerMapping[] = Object.freeze([
  {
    ifcName: "03 Metselwerk - kalkzandsteen C",
    basis: "generic_material",
    materialId: "st-brick",
    basisNote:
      "Calcium-silicate (kalkzandsteen) blockwork, the cavity wall's inner " +
      "leaf and most of the internal load-bearing walls. The library has no " +
      "calcium-silicate row, so the concrete-brick entry at λ 0.8 stands in; " +
      "real kalkzandsteen is nearer λ 1.0, which would cut a 100 mm leaf's R " +
      "from 0.125 to 0.100 — 0.7 % of the cavity wall.",
  },
  {
    ifcName: "03 mw-baksteen - bruin (staand)",
    basis: "generic_material",
    materialId: "st-redbrick",
    basisNote:
      "Clay facing brick, the cavity wall's outer leaf. Direct match to the " +
      "library's clay-brick entry. Colour (bruin/geel) and bond " +
      "(staand/liggend) are appearance, not conductivity — all four brick " +
      "rows map to the same material.",
  },
  {
    ifcName: "03 mw-baksteen - bruin (liggend)",
    basis: "generic_material",
    materialId: "st-redbrick",
    basisNote:
      "Clay facing brick laid flat. Same material as the other three brick " +
      "rows; the bond changes the elevation, not the conductivity.",
  },
  {
    ifcName: "03 mw-baksteen - geel (staand)",
    basis: "generic_material",
    materialId: "st-redbrick",
    basisNote:
      "Yellow clay facing brick. Mapped to the same clay-brick entry as the " +
      "brown: the library's row is a clay brick, and 'geel' is the fired " +
      "clay's colour, not a different material.",
  },
  {
    ifcName: "03 mw-baksteen - geel (liggend)",
    basis: "generic_material",
    materialId: "st-redbrick",
    basisNote:
      "Yellow clay facing brick laid flat. Same material as the other three " +
      "brick rows.",
  },
  {
    ifcName: "99 Isolatie - Glaswol 70mm",
    basis: "generic_material",
    materialId: "ins-gw",
    basisNote:
      "Glass wool, the cavity insulation. Note the model's own " +
      "inconsistency: this layer is named '70mm' and the assembly that uses " +
      "it, IFC_isolatie_110mm_glaswol, states 110 mm. The STATED thickness " +
      "is used and the name is ignored — a name is not a quantity.",
  },
  {
    ifcName: "99 Isolatie - Glaswol 190mm",
    basis: "generic_material",
    materialId: "ins-gw",
    basisNote:
      "Glass wool, the roof panel's insulation, at the 190 mm the assembly " +
      "states. This single layer is 96 % of the roof's resistance, so the " +
      "λ 0.036 chosen here is the roof's U-value in all but name.",
  },
  {
    ifcName: "99 Isolatie - Glaswol zacht",
    basis: "generic_material",
    materialId: "ins-gw",
    basisNote:
      "Soft-batt glass wool in the dormer cheek. Same library entry as the " +
      "other two glass-wool rows; 'zacht' describes the batt's density " +
      "class, which the model does not quantify.",
  },
  {
    ifcName: "99 Isolatie - EPS",
    basis: "generic_material",
    materialId: "ins-eps1",
    basisNote:
      "Expanded polystyrene under the ground floor and in the edge strip. " +
      "Mapped to EPS type 1 (λ 0.036) rather than the graphite type 2, " +
      "because the model states no product and type 1 is the plain board.",
  },
  {
    ifcName: "99 Isolatie - zwevende dekvloer",
    basis: "generic_material",
    materialId: "ins-eps1",
    basisNote:
      "A 20 mm resilient layer under a floating screed. The name states a " +
      "FUNCTION, not a material: these are EPS-T or resilient mineral wool " +
      "in Dutch practice, λ 0.036-0.040, so the EPS entry is within the " +
      "band. Interior floor build-up, never envelope.",
  },
  {
    ifcName: "02 Beton gewapend - prefab VLOER",
    basis: "generic_material",
    materialId: "st-rc",
    basisNote:
      "The 200 mm kanaalplaat (hollow-core) ground-floor slab, treated as " +
      "SOLID reinforced concrete. Its voids give the real slab more " +
      "resistance than this, so the mapping understates the floor; the " +
      "library has no hollow-core entry and an effective λ for one would be " +
      "a product figure dressed as a generic table value. 2.3 % of the " +
      "stack's resistance either way.",
  },
  {
    ifcName: "02 Beton gewapend - prefab",
    basis: "generic_material",
    materialId: "st-rc",
    basisNote:
      "Precast reinforced concrete, the breedplaat shells and the 200 mm " +
      "intermediate floors. Direct match to the library's structural entry.",
  },
  {
    ifcName: "02 Beton ongewapend C",
    basis: "generic_material",
    materialId: "st-rc",
    basisNote:
      "Unreinforced concrete in the EPS stortstrook edge detail. The " +
      "library has only the reinforced entry (λ 2.3); plain concrete is " +
      "nearer 1.7, so this over-states the layer's conductivity — it is " +
      "5 % of that assembly's resistance.",
  },
  {
    ifcName: "24 Cementdekvloer 90mm",
    basis: "generic_material",
    materialId: "fin-mortar",
    basisNote:
      "Cement screed. Direct match to the library's cement-mortar entry at " +
      "λ 1.4, at the 90 mm the assembly states rather than the name's.",
  },
  {
    ifcName: "24 Cementdekvloer 70mm",
    basis: "generic_material",
    materialId: "fin-mortar",
    basisNote:
      "Cement screed, the floating-floor variant. Same material as the " +
      "90 mm row; only the thickness differs and the assembly states it.",
  },
  {
    ifcName: "01 Hout - hardhout",
    basis: "generic_material",
    materialId: "wd-structural",
    basisNote:
      "Hardwood, the IFC_kozijn_90x114 window frame. The library carries " +
      "only structural softwood (λ 0.14, ρ 500); hardwood is nearer λ 0.18 " +
      "at ρ 700, so this flatters the frame. It does not reach the energy " +
      "numbers: the window U is an assumption (A-GLAZING), not a solved " +
      "assembly.",
  },
  {
    ifcName: "01 plaatmateriaal - multiplex",
    basis: "generic_material",
    materialId: "wd-plywood",
    basisNote:
      "Direct match: 'multiplex' is Dutch for plywood, and this is the " +
      "library's plywood-sheathing entry at the 18 mm stated.",
  },
  {
    ifcName: "01 plaatmateriaal - spaanplaat - wit",
    basis: "generic_material",
    materialId: "wd-plywood",
    basisNote:
      "White-faced particleboard, the roof panel's and dormer cheek's inner " +
      "lining. Mapped to plywood (λ 0.13); EN 12524 puts particleboard at " +
      "ρ 600 / λ 0.14, so the difference is under 8 % on an 11 mm layer " +
      "worth 1.5 % of the roof.",
  },
  {
    ifcName: "99 Lichte scheidingswand - normaal",
    basis: "generic_material",
    materialId: "st-lwc",
    basisNote:
      "The assemblies that use this name are IFC_separatiewand_gasbeton_70/" +
      "100mm, so the material is aerated concrete (gasbeton) — the " +
      "library's ALC entry at λ 0.16. Read from the assembly, not the layer " +
      "name, because the name states only that the partition is light. " +
      "IFC_HSB_70mm uses the SAME layer name for a timber-frame partition, " +
      "which is the model contradicting itself; both are interior.",
  },
  {
    ifcName: "99 Lichte scheidingswand - hydro",
    basis: "generic_material",
    materialId: "st-lwc",
    basisNote:
      "The moisture-resistant aerated-concrete partition used in bathrooms. " +
      "'Hydro' is a water-resistance grade, not a different conductivity.",
  },
  {
    ifcName: "99 Lichte scheidingswand - gipsblokken",
    basis: "generic_material",
    materialId: "fin-plasterboard-iso",
    basisNote:
      "Solid gypsum blocks. Mapped to the ISO plasterboard entry (λ 0.25) " +
      "rather than the Korean-practice one (0.18), following the library's " +
      "own note that non-Korean buildings take the EN 12524 row. Solid " +
      "blocks are denser than board and run nearer λ 0.35, so this " +
      "over-states their resistance; interior partition, never envelope.",
  },
  {
    ifcName: "99 Lucht frame",
    basis: "generic_material",
    materialId: "air-10",
    basisNote:
      "A framed void: 5 mm in the roof panel, 50 mm in the suspended " +
      "ceiling. Two problems, both disclosed rather than tuned. (1) 5 mm is " +
      "below every available row — ISO 6946 Table 2's flat values start at " +
      "25 mm and the library's smallest cavity is 10 mm — so the 0.14 used " +
      "here over-states that layer by about 0.03 m²K/W, 0.5 % of the roof. " +
      "(2) The name says 'frame': the void is SUBDIVIDED, which breaks " +
      "ISO 6946 5.3.1 outright, and the bridge is unrepresented. A " +
      "name-keyed table also cannot carry two heat-flow directions for one " +
      "name, and this layer is upward in the roof and downward in the " +
      "ceiling.",
  },
  {
    ifcName: "12 Schoonloopmat",
    basis: "unresolved",
    basisNote:
      "An 8 mm entrance dirt-trap mat. The library has no textile or matting " +
      "entry and there is no honest nearest match, so IFC schoonloopmat " +
      "reports no U-value rather than borrowing one. It is a floor covering " +
      "inside the entrance, not an envelope element, so nothing depends on it.",
  },
]);

/**
 * Mapping table per building, by `manifest.id`.
 *
 * An unknown id gets an empty table, which makes every layer unresolved and
 * every U-value null. That is the correct failure: a new reference building
 * with no table of its own must show that it has none, not silently borrow
 * the Clinic's Anglophone names and resolve nothing while looking healthy.
 */
const LAYER_MAPPINGS_BY_BUILDING: Readonly<Record<string, readonly LayerMapping[]>> =
  Object.freeze({
    "bs-medical-dental-clinic": CLINIC_LAYER_MAPPINGS,
    schependomlaan: SCHEPENDOMLAAN_LAYER_MAPPINGS,
  });

export function layerMappingsFor(buildingId: string): readonly LayerMapping[] {
  return LAYER_MAPPINGS_BY_BUILDING[buildingId] ?? [];
}

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
export function directionFor(name: string): HeatFlowDirection {
  const lower = name.toLowerCase();
  if (lower.includes("roof") || lower.includes("ceiling")) return "upward";
  if (lower.includes("floor") || lower.includes("slab")) return "downward";
  // Dutch, for Schependomlaan. `dakkapel` is a DORMER: its zijwang is a
  // vertical cheek, so it must be caught before `dakplaat`/`dakvloer` or a
  // wall would be solved with a roof's surface resistances. Getting this
  // wrong is not free — the roof reads U 0.1768 on the horizontal row
  // against 0.1776 on the upward one, which is the flattering direction.
  if (lower.includes("dakkapel")) return "horizontal";
  if (
    lower.includes("dakplaat") ||
    lower.includes("dakvloer") ||
    lower.includes("plafond")
  ) {
    return "upward";
  }
  if (
    lower.includes("vloer") ||
    lower.includes("kanaalplaat") ||
    lower.includes("breedplaat")
  ) {
    return "downward";
  }
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
  mappings: readonly LayerMapping[],
): SolvedConstruction {
  const direction = directionFor(assembly.name);
  const byName = new Map(mappings.map((m) => [m.ifcName, m]));
  const unresolved: string[] = [];
  const assumptions: { layer: string; basisNote: string }[] = [];

  const layers: SolvedLayer[] = assembly.layers.map((layer) => {
    const mapping = byName.get(layer.name) ?? null;
    // Two ways to be unresolved, and the difference is worth keeping. A name
    // the table does not carry at all is a GAP — nobody has looked. A row
    // with `basis: "unresolved"` is a DECISION: somebody looked, found no
    // honest match in the library, and wrote down why. The second keeps its
    // mapping so the reason travels with the layer; both refuse a U.
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
    if (mapping.basis === "unresolved") {
      unresolved.push(layer.name);
      return {
        ifcName: layer.name,
        thicknessM: layer.thicknessM,
        ref: layer.ref,
        mapping,
        conductivityWPerMK: null,
        resistanceM2KPerW: null,
      };
    }

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

/** Every assembly the manifest carries, solved with that building's table. */
export function solveConstructions(
  manifest: ReferenceBuildingManifest,
): readonly SolvedConstruction[] {
  const mappings = layerMappingsFor(manifest.id);
  return (manifest.assemblies ?? []).map((a) => solveConstruction(a, mappings));
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
/** The Clinic's original rule, unchanged: its assembly names say what they are. */
const CLINIC_ENVELOPE_NAMES = (c: SolvedConstruction): boolean =>
  /exterior|roof|slab on grade|foundation/i.test(c.name);

/**
 * Schependomlaan needs an explicit list, not a keyword rule.
 *
 * `kalkzandsteen` names five assemblies and only two of them — the 100 and
 * 120 mm leaves bim-bf identified at 17:19 — are the cavity wall's inner
 * leaf; the 175, 214 and 300 mm ones are internal and party walls, and a
 * keyword rule would put three interior walls on the envelope list. The other
 * direction is worse: nothing in this model's Dutch names matches
 * `exterior|roof|slab on grade|foundation`, so the Clinic's rule applied here
 * returns an EMPTY envelope section rather than a wrong one.
 *
 * This list is therefore provisional in the same way the wall identification
 * is — see `A-ENVELOPE-ASSEMBLY-SET` in `schependomlaan-energy.ts`. Note also
 * that the three cavity leaves appear here SEPARATELY, at their own
 * U-values, because that is how the model states them; the composite wall is
 * an inference and lives in the energy inputs, not here.
 */
const SCHEPENDOMLAAN_ENVELOPE_ASSEMBLY_IDS: ReadonlySet<string> = new Set([
  "assembly-ifc-dakplaat-geisoleerd-rc-4-00", // roof panel
  "assembly-ifc-dakkapel-zijwang", // dormer cheek
  "assembly-ifc-vloer-geisoleerde-kanaalplaat-rc-3-00", // ground floor
  "assembly-ifc-vloer-eps-stortstrook-rc-3-00", // ground-floor edge strip
  "assembly-ifc-kalkzandsteen-100mm", // cavity wall, inner leaf
  "assembly-ifc-kalkzandsteen-120mm", // cavity wall, inner leaf
  "assembly-ifc-isolatie-110mm-glaswol", // cavity wall, insulation
  "assembly-ifc-baksteen-roodbruin-100mm-staand", // cavity wall, outer leaf
  "assembly-ifc-baksteen-roodbruin-100mm-liggend",
  "assembly-ifc-baksteen-kopergeel-100mm-staand",
  "assembly-ifc-baksteen-kopergeel-100mm-liggend",
  "assembly-ifc-kozijn-90x114", // window frame
]);

const ENVELOPE_PREDICATES: Readonly<
  Record<string, (c: SolvedConstruction) => boolean>
> = Object.freeze({
  "bs-medical-dental-clinic": CLINIC_ENVELOPE_NAMES,
  schependomlaan: (c) => SCHEPENDOMLAAN_ENVELOPE_ASSEMBLY_IDS.has(c.id),
});

export function envelopeConstructions(
  manifest: ReferenceBuildingManifest,
): readonly SolvedConstruction[] {
  const isEnvelope = ENVELOPE_PREDICATES[manifest.id] ?? CLINIC_ENVELOPE_NAMES;
  return solveConstructions(manifest)
    .filter(isEnvelope)
    .sort((a, b) => (b.uValueWPerM2K ?? -1) - (a.uValueWPerM2K ?? -1));
}
