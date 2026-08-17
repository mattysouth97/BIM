// src/lib/generative/blueprint/index.ts
//
// Barrel for the schematic layer: schema + validation + fidelity + builders +
// the compiler down to BuildingSpec + the measurement of what survived it.

export * from "./blueprint-spec";
export * from "./segment-curves";
// SVG blueprint import (`svgToSegments` / `fromSvgString`) and the reviewable
// import-with-report wrapper the schematic dialog drives it through.
export * from "./from-svg";
export * from "./import-svg-file";
export * from "./validate-blueprint";
export * from "./fidelity";
export * from "./builders";
export * from "./compile";
export * from "./metrics";
export * from "./apply-placements";
