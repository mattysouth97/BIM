/**
 * Type declarations for earcut@3 (no @types/earcut available).
 * earcut@3 is an ES module with a default export and a named `flatten` export.
 */
declare module "earcut" {
  /**
   * Triangulates a polygon given as a flat array of vertex coordinates.
   * @param data - Flat array of vertex coordinates [x0,y0, x1,y1, ...]
   * @param holeIndices - Array of hole start indices in the data array
   * @param dim - Number of coordinates per vertex (default 2)
   * @returns Flat array of triangle vertex indices
   */
  export default function earcut(
    data: number[],
    holeIndices?: number[],
    dim?: number
  ): number[];

  /**
   * Converts GeoJSON polygon coordinates to the flat array format expected by earcut.
   * @param data - GeoJSON-style polygon rings [[x,y], ...] or [[[x,y], ...], ...]
   * @returns Object with vertices (flat), holes (hole start indices), and dimensions
   */
  export function flatten(data: number[][][]): {
    vertices: number[];
    holes: number[];
    dimensions: number;
  };
}
