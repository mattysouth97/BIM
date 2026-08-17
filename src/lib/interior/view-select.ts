// src/lib/interior/view-select.ts
//
// What a VIEWPORT draws of the solved interior.
//
// `buildInteriorModel` returns the whole storey stack for a snapshot. A viewport
// wants a subset of it — and only when a toggle says so — and it wants the same
// model object back when nothing changed, because the R3F mount rebuilds its
// InstancedMeshes whenever the model identity changes.
//
// All three decisions (gate, filter, rebuild guard) are pure, so they live here
// rather than inside an effect where they could only be exercised by mounting a
// WebGL canvas.

import type { BimModelSnapshot } from "@/lib/bim/model/types";

import { buildInteriorModel } from "./build";
import type { InteriorBuildOptions, InteriorModel } from "./types";

export interface InteriorViewOptions extends InteriorBuildOptions {
  /**
   * False ⇒ nothing is drawn AND nothing is built. Building the model of a
   * hidden layer would walk every element in the snapshot for a group that is
   * never added to the scene. Omitted ⇒ enabled: the caller resolves its own
   * default (store toggle in the workspace, always-on in the studio) before
   * calling, so this file never has to know which viewport it is serving.
   */
  enabled?: boolean;
  /**
   * Draw only these storeys (`floorNo`, the `level:<n>` suffix).
   * `null`/`undefined` means "no restriction" — NOT "nothing", which is what an
   * empty array means. Same distinction `isolationFloors` in
   * `generative/session/navigation.ts` makes for the recipe.
   */
  floors?: readonly number[] | null;
}

export interface InteriorView {
  model: InteriorModel;
  /** Storeys to draw, ascending: `model.floors` ∩ `options.floors`. */
  floors: number[];
}

/* ------------------------------------------------------------------ */
/* Rebuild guard                                                       */
/* ------------------------------------------------------------------ */

/**
 * `includeExterior` is the only build input besides the snapshot — floor
 * filtering happens AFTER the build, so two views of the same building that
 * differ only by isolation share one model.
 */
export function interiorOptionsKey(options: InteriorBuildOptions): string {
  return options.includeExterior ? "with-exterior" : "interior-only";
}

/**
 * Per-snapshot-identity cache of built models.
 *
 * A `BimModelSnapshot` is replaced wholesale on every command (bim-model-store
 * never mutates one in place), so object identity IS the version — and a
 * WeakMap means a snapshot the store has moved past takes its cached model with
 * it. At most two entries per snapshot: `includeExterior` on and off.
 */
const modelCache = new WeakMap<BimModelSnapshot, Map<string, InteriorModel>>();

export function interiorModelFor(
  snapshot: BimModelSnapshot,
  options: InteriorBuildOptions = {},
): InteriorModel {
  const key = interiorOptionsKey(options);
  let byKey = modelCache.get(snapshot);
  if (!byKey) {
    byKey = new Map();
    modelCache.set(snapshot, byKey);
  }
  const cached = byKey.get(key);
  if (cached) return cached;
  const built = buildInteriorModel(snapshot, {
    includeExterior: options.includeExterior === true,
  });
  byKey.set(key, built);
  return built;
}

/* ------------------------------------------------------------------ */
/* Floor filtering                                                     */
/* ------------------------------------------------------------------ */

/**
 * The storeys to draw: the model's own floors, restricted to `filter` when one
 * is given. A requested floor the model does not have is dropped rather than
 * drawn empty, and the result keeps the model's ascending order regardless of
 * the order the filter arrived in.
 */
export function selectInteriorFloors(
  model: InteriorModel,
  filter: readonly number[] | null | undefined,
): number[] {
  if (filter === null || filter === undefined) return [...model.floors];
  const wanted = new Set(filter);
  return model.floors.filter((floorNo) => wanted.has(floorNo));
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

/**
 * The interior a viewport should mount, or `null` when it should mount nothing
 * (toggle off, or no snapshot loaded yet). Returning null rather than an empty
 * model keeps "hidden" and "this building has no solved interior" distinct at
 * the call site.
 */
export function planInteriorView(
  snapshot: BimModelSnapshot | null | undefined,
  options: InteriorViewOptions = {},
): InteriorView | null {
  if (!snapshot) return null;
  if (options.enabled === false) return null;

  const model = interiorModelFor(snapshot, options);
  const floors = selectInteriorFloors(model, options.floors);
  return { model, floors };
}
