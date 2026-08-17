// src/lib/generative/__tests__/mesh-dxf-fixture.ts
//
// Hand-written DXF text holding 3D mesh entities. Not a test file — vitest must
// not collect it, so it carries no .test suffix.
//
// These are real group-code streams, fed to the real `dxf-parser`: the point of
// the mesh reader is that it survives what that parser actually produces
// (including the empty trailing vertex it appends to every 3DFACE), so a
// hand-built parse result would test nothing.

export type Pt3 = readonly [number, number, number];

/** Build a minimal DXF file around a raw ENTITIES body. */
export function meshDxf(opts: { insunits?: number; entities: string[] }): string {
  const L: string[] = [];
  L.push("0", "SECTION", "2", "HEADER");
  if (opts.insunits !== undefined) {
    L.push("9", "$INSUNITS", "70", String(opts.insunits));
  }
  L.push("0", "ENDSEC");
  L.push("0", "SECTION", "2", "ENTITIES", ...opts.entities, "0", "ENDSEC");
  L.push("0", "EOF");
  return L.join("\n");
}

const FACE_CODES = [
  [10, 20, 30],
  [11, 21, 31],
  [12, 22, 32],
  [13, 23, 33],
] as const;

/**
 * One 3DFACE. A triangle is written the way AutoCAD writes it — as a quad with
 * its last corner repeated — because that is what the reader has to cope with.
 */
export function face3d(layer: string, points: readonly Pt3[]): string[] {
  const corners = points.length === 3 ? [...points, points[2]] : points.slice(0, 4);
  const out = ["0", "3DFACE", "8", layer];
  corners.forEach((p, i) => {
    out.push(String(FACE_CODES[i][0]), String(p[0]));
    out.push(String(FACE_CODES[i][1]), String(p[1]));
    out.push(String(FACE_CODES[i][2]), String(p[2]));
  });
  return out;
}

/** A vertical wall panel from (x0,y0) to (x1,y1), spanning z0 → z1. */
export function wall(
  layer: string,
  a: readonly [number, number],
  b: readonly [number, number],
  z0: number,
  z1: number,
): string[] {
  return face3d(layer, [
    [a[0], a[1], z0],
    [b[0], b[1], z0],
    [b[0], b[1], z1],
    [a[0], a[1], z1],
  ]);
}

/** A horizontal quad slab at height `z`, from its two opposite corners. */
export function slab(
  layer: string,
  min: readonly [number, number],
  max: readonly [number, number],
  z: number,
): string[] {
  return face3d(layer, [
    [min[0], min[1], z],
    [max[0], min[1], z],
    [max[0], max[1], z],
    [min[0], max[1], z],
  ]);
}

/** Walls around a closed plan ring, plus optional floor/roof slabs. */
export function wallRing(
  layer: string,
  ring: ReadonlyArray<readonly [number, number]>,
  z0: number,
  z1: number,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    out.push(...wall(layer, ring[i], ring[(i + 1) % ring.length], z0, z1));
  }
  return out;
}

/**
 * A polyface-mesh POLYLINE: one quad, given as four mesh vertices followed by
 * a face record indexing them (1-based, DXF codes 71–74).
 */
export function polyfaceQuad(layer: string, corners: readonly Pt3[]): string[] {
  const out = [
    "0", "POLYLINE", "8", layer, "66", "1", "70", "64",
    "71", String(corners.length), "72", "1",
  ];
  for (const [x, y, z] of corners) {
    out.push(
      "0", "VERTEX", "8", layer,
      "10", String(x), "20", String(y), "30", String(z),
      "70", "192",
    );
  }
  out.push(
    "0", "VERTEX", "8", layer, "10", "0", "20", "0", "30", "0", "70", "128",
    "71", "1", "72", "2", "73", "3", "74", "4",
  );
  out.push("0", "SEQEND", "8", layer);
  return out;
}

/* ------------------------------------------------------------------ */
/* Whole buildings                                                     */
/* ------------------------------------------------------------------ */

/** 10 × 6 × 3 m box: four wall panels, a floor and a roof. Metres. */
export const BOX_RING = [
  [0, 0],
  [10, 0],
  [10, 6],
  [0, 6],
] as const;

export const BOX_DXF = meshDxf({
  insunits: 6,
  entities: [
    ...wallRing("MESH", BOX_RING, 0, 3),
    ...slab("MESH", [0, 0], [10, 6], 0),
    ...slab("MESH", [0, 0], [10, 6], 3),
  ],
});

/** The same box drawn in MILLIMETRES, declared as such. */
export const BOX_MM_DXF = meshDxf({
  insunits: 4,
  entities: [
    ...wallRing(
      "MESH",
      BOX_RING.map((p) => [p[0] * 1000, p[1] * 1000] as const),
      0,
      3000,
    ),
    ...slab("MESH", [0, 0], [10_000, 6000], 0),
    ...slab("MESH", [0, 0], [10_000, 6000], 3000),
  ],
});

/** L-shaped plan, walls only, 9 m tall — three storeys at the 3.5 m assumption. */
export const L_RING = [
  [0, 0],
  [20, 0],
  [20, 12],
  [12, 12],
  [12, 20],
  [0, 20],
] as const;

export const L_DXF = meshDxf({
  insunits: 6,
  entities: [...wallRing("MESH", L_RING, 0, 9)],
});

/**
 * A flat slab pair, everything below the default 1.2 m cut: the slice finds
 * nothing and the footprint projection has to take over.
 */
export const FLAT_SLAB_DXF = meshDxf({
  insunits: 6,
  entities: [
    ...slab("MESH", [0, 0], [10, 6], 0),
    ...slab("MESH", [0, 0], [10, 6], 0.5),
  ],
});

/** Two disjoint vertical panels: nothing closes, either way. */
export const OPEN_PANELS_DXF = meshDxf({
  insunits: 6,
  entities: [
    ...wall("MESH", [0, 0], [10, 0], 0, 3),
    ...wall("MESH", [0, 20], [10, 20], 0, 3),
  ],
});

/** A polyface-mesh floor slab, 8 × 5 m — the other mesh entity DXF can carry. */
export const POLYFACE_DXF = meshDxf({
  insunits: 6,
  entities: [
    ...polyfaceQuad("PF", [
      [0, 0, 0],
      [8, 0, 0],
      [8, 5, 0],
      [0, 5, 0],
    ]),
  ],
});

/** An ordinary 2D plan — the regression case that must not change path. */
export const PLAN_2D_DXF = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LWPOLYLINE", "8", "A-WALL", "90", "4", "70", "1",
  "10", "0", "20", "0",
  "10", "20000", "20", "0",
  "10", "20000", "20", "12000",
  "10", "0", "20", "12000",
  "0", "ENDSEC", "0", "EOF",
].join("\n");

/** A DXF holding neither 2D geometry nor a mesh. */
export const EMPTY_DXF = meshDxf({ insunits: 6, entities: [] });
