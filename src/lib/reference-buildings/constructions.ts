/**
 * A reference building's U-values, solved from its own layer stacks.
 *
 * The manifest carries source layer order, names and thicknesses. Where a
 * source actually states conductivity with verified units, it takes priority.
 * Otherwise the per-building mapping is an explicit, reversible assumption.
 * Source properties and any sourced design conversion retain their citations.
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
  | "source_property"
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
  /** Sourced conversion from declared to design conductivity, where applicable. */
  sourceConductivityFactor?: Readonly<{ factor: number; ref: string }>;
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
      "unventilated air layer, horizontal flow. Insulating that cavity would " +
      "increase its resistance, so this is an assumption to verify. Steel stud bridging is likewise " +
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
      "from 0.125 to 0.100 m²K/W.",
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
      "states. Its resistance is calculated with assumed λ 0.036; " +
      "the contribution depends on the complete layer set and surface resistances.",
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
      "a product figure dressed as a generic table value.",
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
      "nearer 1.7, so this over-states the layer's conductivity.",
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
      "ρ 600 / λ 0.14, rather than the plywood value used here.",
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
      "here over-states the resistance of a thin void. " +
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
 * The Duplex Apartment's layer names.
 *
 * Both this building and the Clinic are Autodesk Revit Architecture 2011 US
 * models, so eight of these names are the SAME strings the Clinic uses and
 * carry the same mapping. That overlap is a reason to keep two tables rather
 * than merge them: the two buildings agree today, and a merged table would
 * make a future disagreement — the same name meaning something different in
 * another model — impossible to express.
 *
 * Nine names are this building's own. None of them resolves by substring
 * search either: "Masonry - Brick", "Site - Grass" and "Roofing - Barrier"
 * all return nothing from `searchGenericMaterials`.
 */
export const DUPLEX_LAYER_MAPPINGS: readonly LayerMapping[] = Object.freeze([
  {
    ifcName: "Masonry - Brick",
    basis: "generic_material",
    materialId: "st-redbrick",
    basisNote:
      "The exterior wall's 92 mm outer leaf: clay facing brick, the library's " +
      "red-brick entry at λ 0.78. Distinct from Masonry - Concrete Block " +
      "below, which is the structural inner leaf of the same wall.",
  },
  {
    ifcName: "Masonry - Concrete Block",
    basis: "generic_material",
    materialId: "st-brick",
    basisNote:
      "193 mm CMU, mapped to the library's concrete-brick entry at λ 0.8. A " +
      "US CMU is HOLLOW and the library has no hollow-block row, so this " +
      "treats it as solid and understates the wall — see A-CONCRETE-BLOCK-" +
      "LAMBDA. Its share depends on the complete layer set.",
  },
  {
    ifcName: "Misc. Air Layers - Air Space",
    basis: "generic_material",
    materialId: "air-iso-h25",
    basisNote:
      "The one layer in this building that lands exactly on its entry: the " +
      "model states 25 mm and air-iso-h25 IS ISO 6946 Table 2's 25 mm " +
      "unventilated cavity at horizontal heat flow. No interpolation.",
  },
  {
    ifcName: "Insulation / Thermal Barriers - Rigid insulation",
    basis: "generic_material",
    materialId: "ins-polyiso",
    basisNote:
      "Same name and same mapping as the Clinic's: rigid board in a US 2011 " +
      "wall or roof of this type is polyisocyanurate. It appears twice in " +
      "this model, 50 mm in the wall and 76 mm in the roof, and is the only " +
      "insulation either assembly names.",
  },
  {
    ifcName: "Metal - Stud Layer",
    basis: "generic_material",
    materialId: "air-iso-h25",
    basisNote:
      "Same name and same mapping as the Clinic's, and the same reasoning: " +
      "the model names a stud layer and names nothing in it, so it is read " +
      "as an unventilated air cavity and steel bridging is ignored. Here it " +
      "is 41 mm rather than the Clinic's 152 mm, so it costs this building " +
      "far less — see A-STUD-CAVITY for the counterfactual.",
  },
  {
    ifcName: "Plasterboard",
    basis: "generic_material",
    materialId: "fin-gypsum",
    basisNote: "Direct match: gypsum plasterboard, the library's finish entry.",
  },
  {
    ifcName: "Concrete",
    basis: "generic_material",
    materialId: "st-rc",
    basisNote:
      "The 127 mm slab on grade's only layer. Mapped to reinforced concrete " +
      "rather than a plain-concrete entry because a slab on grade is meshed; " +
      "the library carries no unreinforced structural row in any case.",
  },
  {
    ifcName: "Concrete - Cast In Situ",
    basis: "generic_material",
    materialId: "st-rc",
    basisNote:
      "Same name and same mapping as the Clinic's. Used by the two Foundation " +
      "- Concrete walls and by the exterior entrance pad, neither of which is " +
      "on the envelope list.",
  },
  {
    ifcName: "Roofing - EPDM Membrane",
    basis: "generic_material",
    materialId: "mb-epdm",
    basisNote:
      "Same name and same mapping as the Clinic's: single-ply EPDM. Under a " +
      "planted roof here rather than exposed, so it is the root barrier's " +
      "substrate as much as the waterproofing.",
  },
  {
    ifcName: "Wood - Sheathing - plywood",
    basis: "generic_material",
    materialId: "wd-plywood",
    basisNote:
      "Same name and same mapping as the Clinic's, at the 19 mm the model " +
      "states. The roof deck over the joists.",
  },
  {
    ifcName: "Wood - Dimensional Lumber",
    basis: "generic_material",
    materialId: "wd-structural",
    basisNote:
      "THE ROOF'S LARGEST LAYER AND ITS LARGEST ASSUMPTION. 286 mm, solved " +
      "as solid softwood at λ 0.14 because that is the layer the model " +
      "states — but a dimensional-lumber layer in a joist roof is joists at " +
      "centres with air or batt between them, so ISO 6946 5.3.1's " +
      "unsubdivided premise does not hold. The solid-timber approximation " +
      "gives more resistance than an uninsulated cavity would. " +
      "See A-JOIST-ZONE. Also used by the intermediate floor, which is not " +
      "envelope.",
  },
  {
    ifcName: "Wood - Flooring",
    basis: "generic_material",
    materialId: "wd-structural",
    basisNote:
      "16 mm finish flooring, the library's structural-timber λ for want of a " +
      "flooring row. It is a finish over the intermediate floor and over the " +
      "slab, and neither assembly it belongs to is on the envelope list.",
  },
  {
    ifcName: "Insulation / Thermal Barriers - Semi-rigid insulation",
    basis: "generic_material",
    materialId: "ins-mw",
    basisNote:
      "3 mm under the wood finish floor — an acoustic underlay by thickness " +
      "rather than a thermal layer. Semi-rigid board is mineral wool; the " +
      "mapping is honest and the layer is negligible and not on the envelope.",
  },
  {
    ifcName: "Ceramic Tile",
    basis: "unresolved",
    basisNote:
      "10 mm bathroom tile. The library has no ceramic-tile row and there is " +
      "no honest nearest match — stone is three times the conductivity and " +
      "mortar is close but is the layer BELOW it, which this model names " +
      "separately as Masonry - Grout. It is a finish inside the dwelling, so " +
      "nothing on the envelope depends on it.",
  },
  {
    ifcName: "Masonry - Grout",
    basis: "generic_material",
    materialId: "fin-mortar",
    basisNote:
      "3 mm tile bed, mapped to the library's mortar entry. A finish layer " +
      "inside the dwelling; nothing on the envelope depends on it.",
  },
  {
    ifcName: "Site - Grass",
    basis: "unresolved",
    basisNote:
      "64 mm of growing medium on the Live Roof. The library has no soil or " +
      "substrate row, and inventing a λ for one would put a number in the " +
      "stack that no table supports — a green roof's benefit is evaporative " +
      "and thermal-mass anyway, neither of which this engine models. Reported " +
      "unresolved and dropped from the roof assembly, which removes " +
      "resistance and so reads conservatively. See A-GREEN-ROOF.",
  },
  {
    ifcName: "Roofing - Barrier",
    basis: "unresolved",
    basisNote:
      "6 mm, and the name states a FUNCTION rather than a material — a vapour " +
      "or root barrier, both films whose resistance is negligible at this " +
      "thickness, and the library has a row for neither. Dropped from the " +
      "energy-path roof assembly; any uncounted positive resistance makes " +
      "that estimate more conservative. See A-ROOF-BARRIER.",
  },
]);

/**
 * FZK Haus is the odd one out: this building states real per-element
 * `ThermalTransmittance` values (see `fzk-haus-energy.ts`'s `A-STATED-U-PRIMARY`),
 * so THIS table is the disclosed cross-check, not the primary source — the
 * energy path uses the stated U directly. Two of its three material names
 * carry no real conductivity at all: `Leichtbeton` maps to the library's
 * autoclaved-lightweight-concrete row on name and category, and `Solid` is
 * an ArchiCAD placeholder object name, not a material specification, so it
 * resolves to nothing rather than a guess.
 */
export const FZK_HAUS_LAYER_MAPPINGS: readonly LayerMapping[] = Object.freeze([
  {
    ifcName: "Leichtbeton 102890359",
    basis: "generic_material",
    materialId: "st-lwc",
    basisNote:
      "Lightweight/aerated concrete, mapped to the library's autoclaved-" +
      "lightweight-concrete row (λ 0.16, 500 kg/m³). Used at two thicknesses " +
      "in this model — 0.3 m on the exterior walls, 0.24 m on the interior " +
      "partitions. The generic layer calculation differs from the file's " +
      "own stated U 0.4, which the energy path uses " +
      "instead (A-STATED-U-PRIMARY).",
  },
  {
    ifcName: "Stahlbeton 65690",
    basis: "generic_material",
    materialId: "st-rc",
    basisNote:
      "Reinforced concrete, direct match. The 0.2 m ground slab (Bodenplatte) " +
      "has no insulation layer at all — this is its only stated layer — so " +
      "the solved R_f (0.087 m²K/W) feeds ISO 13370 directly rather than a " +
      "generic-library air-to-air U (A-GROUND-STATED-U-NOT-AIR-TO-AIR).",
  },
  {
    ifcName: "Solid 397409098",
    basis: "unresolved",
    basisNote:
      "An ArchiCAD generic-object placeholder name, not a material " +
      "specification — unlike the wall's 'Leichtbeton' or the slab's " +
      "'Stahlbeton', it names no physical substance. Used on the roof decks " +
      "(Dach-1/Dach-2) and the mezzanine floor (Slab-033); the roof's stated " +
      "U 0.3 is used as-is (A-ROOF-MATERIAL-UNIDENTIFIED) because there is " +
      "nothing here to solve a second reading from.",
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
export const KIT_OFFICE_LAYER_MAPPINGS: readonly LayerMapping[] = Object.freeze([
  { ifcName: "Stahlbeton 2747937872", basis: "generic_material", materialId: "st-rc", basisNote: "Reinforced concrete, mapped to the generic library at the model's stated 0.30 m slab thickness. Ground coupling is solved separately; this air-to-air assembly U is not the basement U." },
  ...["Kalksandstein 2816491304", "Kalksandstein 2774059904"].map((ifcName): LayerMapping => ({ ifcName, basis: "generic_material", materialId: "st-brick", basisNote: "Calcium-silicate masonry: no matching library entry exists. Generic concrete-brick conductivity is an explicit surrogate (A-WALL-CONDUCTIVITY), not a measured property or an exact material identity. Thickness is read from each layer set." })),
]);

const KLASSIQUA_DOCUMENTATION = "https://zenodo.org/records/21727160/files/2026-07_Klassiqua_Buero_Archetypen_Dokumentation.pdf";
export const KLASSIQUA_LAYER_MAPPINGS: readonly LayerMapping[] = Object.freeze([
  ...["Insulation_MineralWool_Lambda0.045_1970", "Insulation_MineralWool_InDryWall_Lambda0.040", "ImpactSoundInsulation_EPS_Lambda0.040", "Insulation_XPS_Lambda0.045_1970"].map((ifcName): LayerMapping => ({
    ifcName, basis: "source_property", sourceConductivityFactor: { factor: 1.03, ref: `${KLASSIQUA_DOCUMENTATION}#page=13` },
    basisNote: "Source insulation conductivity is declared lambda D. The source documentation specifies design lambda B = lambda D x 1.03; this layer calculation applies that factor.",
  })),
]);

const LAYER_MAPPINGS_BY_BUILDING: Readonly<Record<string, readonly LayerMapping[]>> =
  Object.freeze({
    "bs-medical-dental-clinic": CLINIC_LAYER_MAPPINGS,
    schependomlaan: SCHEPENDOMLAAN_LAYER_MAPPINGS,
    "duplex-apartment": DUPLEX_LAYER_MAPPINGS,
    "fzk-haus": FZK_HAUS_LAYER_MAPPINGS,
    "kit-office": KIT_OFFICE_LAYER_MAPPINGS,
    "klassiqua-office-1970": KLASSIQUA_LAYER_MAPPINGS,
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
  thermalSource?: Readonly<{ ref: string; declaredConductivityWPerMK: number; designFactor: number; conversionRef?: string }>;
}>;

export type SolvedConstruction = Readonly<{
  id: string;
  ref?: string;
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
    const source = layer.sourceThermalProperties;
    if (source) {
      const factor = mapping?.sourceConductivityFactor?.factor ?? 1;
      if (!(source.conductivityWPerMK > 0) || !Number.isFinite(source.conductivityWPerMK) || !source.ref?.startsWith("ifc://") || !(factor > 0) || !Number.isFinite(factor)) {
        unresolved.push(`${layer.name} (invalid source conductivity)`);
        return { ifcName: layer.name, thicknessM: layer.thicknessM, ref: layer.ref, mapping, conductivityWPerMK: null, resistanceM2KPerW: null };
      }
      const conductivity = source.conductivityWPerMK * factor;
      return {
        ifcName: layer.name, thicknessM: layer.thicknessM, ref: layer.ref,
        // Do not display a superseded generic assumption beside a source value.
        mapping: mapping?.basis === "source_property" ? mapping : null,
        conductivityWPerMK: conductivity, resistanceM2KPerW: layer.thicknessM / conductivity,
        thermalSource: { ref: source.ref, declaredConductivityWPerMK: source.conductivityWPerMK, designFactor: factor, conversionRef: mapping?.sourceConductivityFactor?.ref },
      };
    }
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
      ref: assembly.ref,
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
    ref: assembly.ref,
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

/**
 * The Duplex is a Revit 2011 US model like the Clinic, so the Clinic's
 * keyword rule very nearly works on it — and "very nearly" is why it gets a
 * list instead.
 *
 * `exterior|roof|slab on grade|foundation` matches six of this model's
 * fifteen assemblies, and two of the six are not envelope:
 *
 *   Floor:150mm Exterior Slab on Grade — matches TWICE over, on "exterior"
 *     and on "slab on grade", and is the outdoor entrance pad. The ground
 *     extraction already excluded its two elements by measurement, on the
 *     evidence that no conditioned room stands on either (manifest
 *     groundSlabs[], `excludedReason`). Letting the keyword rule put its
 *     assembly on the envelope list would print a U-value for 50.84 m² of
 *     slab that carries no envelope area — the two halves of this repo
 *     disagreeing about the same two elements, in the same manifest.
 *   Basic Wall:Foundation - Concrete (417mm / 435mm) — below grade, which is
 *     a different boundary condition and a different U. The Clinic's rule
 *     includes its foundation walls and this list does not; that is a
 *     deliberate divergence, not an oversight, and it matches how this
 *     building's own wall set is taken (A-WALL-SET-SCOPE excludes the six
 *     Foundation - Concrete walls for exactly this reason). Reading them
 *     air-to-air would report a wall that is not exposed to air.
 *
 * So the list is the three assemblies the energy path actually prices.
 */
const DUPLEX_ENVELOPE_ASSEMBLY_IDS: ReadonlySet<string> = new Set([
  "assembly-basic-wall-exterior-brick-on-block", // the whole opaque wall, 267.16 m²
  "assembly-basic-roof-live-roof-over-wood-joist-flat-roof", // the single roof, 132.93 m²
  "assembly-floor-127mm-slab-on-grade", // the ground slab, 129.69 m²
]);

const ENVELOPE_PREDICATES: Readonly<
  Record<string, (c: SolvedConstruction) => boolean>
> = Object.freeze({
  "bs-medical-dental-clinic": CLINIC_ENVELOPE_NAMES,
  schependomlaan: (c) => SCHEPENDOMLAAN_ENVELOPE_ASSEMBLY_IDS.has(c.id),
  "duplex-apartment": (c) => DUPLEX_ENVELOPE_ASSEMBLY_IDS.has(c.id),
});

export function envelopeConstructions(
  manifest: ReferenceBuildingManifest,
): readonly SolvedConstruction[] {
  const isEnvelope = ENVELOPE_PREDICATES[manifest.id] ?? CLINIC_ENVELOPE_NAMES;
  return solveConstructions(manifest)
    .filter(isEnvelope)
    .sort((a, b) => (b.uValueWPerM2K ?? -1) - (a.uValueWPerM2K ?? -1));
}
