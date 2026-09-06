import { genericMaterialById } from "@/lib/energy-standards/materials";
import { layerMappingsFor, type SolvedConstruction, type SolvedLayer } from "./constructions";

/** Illustrations of a named source material, never a measured finish or a GLB binding. */
export type MaterialSampleKind = "concrete" | "masonry" | "brick" | "wood" | "board" | "mortar" | "metal" | "panel" | "framing" | "fibre" | "foam" | "membrane" | "air" | "unknown";

export type MaterialSample = Readonly<{
  kind: MaterialSampleKind;
  ko: string;
  en: string;
  colour: string;
  image?: string;
  size?: string;
}>;

const SAMPLES: Record<MaterialSampleKind, MaterialSample> = {
  concrete: { kind: "concrete", ko: "콘크리트", en: "Concrete", colour: "#aaa9a1", image: "url('/textures/concrete_rough/color.jpg')", size: "180px" },
  masonry: { kind: "masonry", ko: "조적재", en: "Masonry", colour: "#d0cbbd", image: "linear-gradient(0deg, transparent 94%, #938e8055 94%), linear-gradient(90deg, transparent 96%, #938e8055 96%)", size: "64px 28px" },
  brick: { kind: "brick", ko: "점토 벽돌", en: "Clay brick", colour: "#a97357", image: "url('/textures/brick/color.jpg')", size: "180px" },
  wood: { kind: "wood", ko: "목재", en: "Wood", colour: "#b9a17c", image: "url('/textures/wood/color.jpg')", size: "180px" },
  board: { kind: "board", ko: "보드", en: "Board", colour: "#dfddd3", image: "repeating-linear-gradient(0deg, transparent 0 4px, #7777770a 4px 5px)" },
  mortar: { kind: "mortar", ko: "모르타르", en: "Mortar", colour: "#bdb9aa", image: "radial-gradient(circle, #6e6b6544 0.6px, transparent 1.2px)", size: "4px 4px" },
  metal: { kind: "metal", ko: "금속", en: "Metal", colour: "#a9b1b5", image: "url('/textures/metal_panel/color.jpg')", size: "180px" },
  panel: { kind: "panel", ko: "단열 패널", en: "Insulated panel", colour: "#c3c8c7", image: "repeating-linear-gradient(90deg, transparent 0 48px, #71808066 48px 50px)" },
  framing: { kind: "framing", ko: "프레임층", en: "Framing layer", colour: "#d6dbdc", image: "repeating-linear-gradient(90deg, #687984 0 3px, #e0e7e8 3px 6px, transparent 6px 30px)" },
  fibre: { kind: "fibre", ko: "섬유 단열재", en: "Fibre insulation", colour: "#cab879", image: "repeating-linear-gradient(35deg, transparent 0 3px, #f3e7b877 3px 4px), repeating-linear-gradient(-40deg, transparent 0 5px, #766c3540 5px 6px)" },
  foam: { kind: "foam", ko: "단열 보드", en: "Insulation board", colour: "#e3dfc9", image: "radial-gradient(circle, #8a896c44 0.7px, transparent 1.2px)", size: "5px 5px" },
  membrane: { kind: "membrane", ko: "방수막", en: "Waterproof membrane", colour: "#545958", image: "repeating-linear-gradient(0deg, transparent 0 3px, #ffffff10 3px 4px)" },
  air: { kind: "air", ko: "공기층", en: "Air space", colour: "#e5eff1", image: "repeating-linear-gradient(45deg, transparent 0 8px, #8c9fa733 8px 9px)" },
  unknown: { kind: "unknown", ko: "외관 미확인", en: "Appearance unknown", colour: "#dddeda", image: "repeating-linear-gradient(135deg, transparent 0 7px, #747a7433 7px 8px)" },
};

// Exact source names, reviewed independently of the thermal mapping. In particular,
// calcium-silicate/CMU must not look like the concrete-brick lambda surrogate;
// a metal stud's air-R approximation must not make the source metal disappear.
const SOURCE_SAMPLE: Readonly<Record<string, MaterialSampleKind>> = {
  "Insulation - Insulated Panel": "panel",
  "Metal - Firring": "framing",
  "Metal - Stud Layer": "framing",
  "Structure - Steel Bar Joist Layer": "framing",
  "Wood - Sheathing - plywood": "wood",
  "Wood - Dimensional Lumber": "wood",
  "Wood - Flooring": "wood",
  Plasterboard: "board",
  "Type-X Plasterboard": "board",
  Concrete: "concrete",
  "Concrete - Cast In Situ": "concrete",
  "Concrete - Cast in Situ Lightweight": "concrete",
  "Roofing - EPDM Membrane": "membrane",
  "Insulation / Thermal Barriers - Rigid insulation": "foam",
  "Insulation / Thermal Barriers - Semi-rigid insulation": "fibre",
  "Metal - Decking": "metal",
  "Roofing - Metal": "metal",
  "Masonry - Brick": "brick",
  "Masonry - Concrete Block": "masonry",
  "Misc. Air Layers - Air Space": "air",
  "Masonry - Grout": "mortar",
  "03 Metselwerk - kalkzandsteen C": "masonry",
  "03 mw-baksteen - bruin (staand)": "brick",
  "03 mw-baksteen - bruin (liggend)": "brick",
  "03 mw-baksteen - geel (staand)": "brick",
  "03 mw-baksteen - geel (liggend)": "brick",
  "99 Isolatie - Glaswol 70mm": "fibre",
  "99 Isolatie - Glaswol 190mm": "fibre",
  "99 Isolatie - Glaswol zacht": "fibre",
  "99 Isolatie - EPS": "foam",
  "02 Beton gewapend - prefab VLOER": "concrete",
  "02 Beton gewapend - prefab": "concrete",
  "02 Beton ongewapend C": "concrete",
  "24 Cementdekvloer 90mm": "mortar",
  "24 Cementdekvloer 70mm": "mortar",
  "01 Hout - hardhout": "wood",
  "01 plaatmateriaal - multiplex": "wood",
  "01 plaatmateriaal - spaanplaat - wit": "board",
  "99 Lucht frame": "framing",
  "Leichtbeton 102890359": "concrete",
  "Stahlbeton 65690": "concrete",
  "Stahlbeton 2747937872": "concrete",
  "Kalksandstein 2816491304": "masonry",
  "Kalksandstein 2774059904": "masonry",
};

export function sourceMaterialSample(buildingId: string, ifcName: string): MaterialSample {
  // A source name in a new building needs review even if its spelling is familiar.
  if (!layerMappingsFor(buildingId).some((mapping) => mapping.ifcName === ifcName)) return SAMPLES.unknown;
  const sample = SAMPLES[SOURCE_SAMPLE[ifcName] ?? "unknown"];
  return ifcName === "03 mw-baksteen - geel (staand)" || ifcName === "03 mw-baksteen - geel (liggend)"
    ? { ...sample, colour: "#cab783" }
    : sample;
}

export function layerThermalDetail(layer: SolvedLayer, construction: SolvedConstruction) {
  const material = layer.mapping?.materialId ? genericMaterialById(layer.mapping.materialId) : undefined;
  const totalR = construction.result?.totalResistanceM2KPerW;
  const resistance = layer.resistanceM2KPerW;
  return {
    material: material ?? null,
    // A partial assembly has no defensible denominator. Unknown never means zero.
    shareOfTotal: totalR !== undefined && totalR > 0 && resistance !== null ? resistance / totalR : null,
    fixedResistance: layer.conductivityWPerMK === null && resistance !== null,
  };
}
