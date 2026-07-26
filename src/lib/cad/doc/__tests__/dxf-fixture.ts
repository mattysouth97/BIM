// src/lib/cad/doc/__tests__/dxf-fixture.ts
// Shared DXF text builder for mapper tests. Not a test file — vitest must
// not collect it, so it carries no .test suffix.

/** Build a minimal DXF file. Pass raw tag/value lines per section. */
export function makeDxf(opts: {
  insunits?: number;
  tables?: string[];   // raw TABLES section lines
  blocks?: string[];   // raw BLOCKS section lines
  entities: string[];  // raw ENTITIES section lines
}): string {
  const L: string[] = [];
  L.push("0", "SECTION", "2", "HEADER");
  if (opts.insunits !== undefined)
    L.push("9", "$INSUNITS", "70", String(opts.insunits));
  L.push("0", "ENDSEC");
  if (opts.tables)
    L.push("0", "SECTION", "2", "TABLES", ...opts.tables, "0", "ENDSEC");
  if (opts.blocks)
    L.push("0", "SECTION", "2", "BLOCKS", ...opts.blocks, "0", "ENDSEC");
  L.push("0", "SECTION", "2", "ENTITIES", ...opts.entities, "0", "ENDSEC");
  L.push("0", "EOF");
  return L.join("\n");
}

export const LINE_MM = [
  "0", "LINE", "8", "WALLS", "10", "0", "20", "0", "11", "1000", "21", "2000",
];
