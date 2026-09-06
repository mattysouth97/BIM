// src/lib/retrofit/measure-visuals.ts
// P2-20 — maps a set of retrofit measures onto the 3D visual state.
//
// Pure and synchronous: measure IDs in, boolean visual flags out. The scene
// (procedural-building-model, building-layers, solar-panels) consumes the
// flags; this module knows nothing about THREE.js.
//
// WHERE THE IDS COME FROM — changed 2026-09-06. They are the knapsack's
// `selectedMeasureIds`, the same set the rail's NPV and the delta strip's kWh
// are computed from, gated by `scenario-store.previewProposal`. Until then
// they came from `appliedMeasureIds`, whose only writer lost its last caller
// when `397882b` deleted the "클릭하여 3D 적용" buttons — so nothing the user
// could click reached this module at all, while the code that drew the
// visuals looked alive. Read the set through `useProposalVisualIds()`
// (scenario-store) or `proposalVisualIds()` below; do NOT subscribe to the
// raw store fields, or the twin and the model pages drift into drawing
// different buildings from one selection.
//
// ID conventions (from the measure generators):
//   envelope-wall-insulation / envelope-roof-insulation /
//   envelope-window-replacement / envelope-floor-insulation
//   hvac-boiler-upgrade / hvac-heat-pump / hvac-hrv
//   lighting-led / lighting-led-smart
//   solar-pv-<roofType>

export interface RetrofitVisualState {
  /** envelope-wall-* → facade solid panels + mullions renewed */
  wallsUpgraded: boolean;
  /** envelope-roof-* → roof renewed */
  roofUpgraded: boolean;
  /** envelope-window-* → glass replaced (clearer, low-e blue) */
  windowsUpgraded: boolean;
  /** envelope-floor-* → slabs renewed */
  floorsUpgraded: boolean;
  /** hvac-* → MEP hvac sub-layer shown as new equipment */
  hvacUpgraded: boolean;
  /** lighting-* → MEP lighting sub-layer shown as new equipment */
  lightingUpgraded: boolean;
  /** solar-pv-* → PV array rendered on the roof */
  solarInstalled: boolean;
}

export const NO_RETROFIT_VISUALS: RetrofitVisualState = {
  wallsUpgraded: false,
  roofUpgraded: false,
  windowsUpgraded: false,
  floorsUpgraded: false,
  hvacUpgraded: false,
  lightingUpgraded: false,
  solarInstalled: false,
};

/** Accent applied to renewed opaque elements (emerald — "retrofit green"). */
export const UPGRADE_TINT = "#34d399";
/** Replacement glazing: clean low-e blue, clearer than the aged default. */
export const UPGRADE_GLASS_COLOR = "#a8d8f0";
export const UPGRADE_GLASS_OPACITY = 0.25;

// P2-23 — applied measures render the POST-RETROFIT state (real materials),
// with one shared low-intensity emerald emissive as the "proposed, not yet
// built" marker so the change reads as a preview, not decoration.
/** Fresh exterior finish after wall insulation (clean plaster/EIFS). */
export const RENEWED_WALL_COLOR = "#e8e6e0";
/** New roof membrane after roof insulation. */
export const RENEWED_ROOF_COLOR = "#c9ccd1";
/** New clean-metal equipment housing (HVAC replacement units). */
export const RENEWED_EQUIPMENT_COLOR = "#d4d8dd";
/** Shared "proposed" accent (emissive) + intensity for renewed surfaces. */
export const PROPOSAL_EMISSIVE = "#34d399";
export const PROPOSAL_EMISSIVE_INTENSITY = 0.06;

/**
 * One shared empty set, so "preview off" keeps a stable reference and the
 * layer generators do not regenerate on every render.
 */
const NO_MEASURE_IDS: string[] = [];

/**
 * The work in force. The user's chosen set wins; the knapsack's
 * recommendation stands in only until the HUD has seeded that set for this
 * building, so a page arrives useful rather than blank.
 *
 * After seeding, `applied` stays non-null — INCLUDING when the user empties
 * it. An empty array therefore means "the user chose nothing", which is not
 * the same as "not seeded yet" and must not fall back to the recommendation:
 * that would make deselecting the last chip silently restore the optimiser's
 * picks, which is the behaviour this whole lane exists to remove.
 */
export function effectiveMeasureIds(
  applied: string[] | null,
  recommended: string[] | null,
): string[] {
  if (applied !== null) return applied;
  return recommended ?? NO_MEASURE_IDS;
}

/**
 * The ids the model should draw as proposed. Pure half of
 * `useProposalVisualIds()` — the gate is here so it can be tested without a
 * store and read from a non-hook context.
 */
export function proposalVisualIds(
  previewProposal: boolean,
  measureIds: string[] | null,
): string[] {
  if (!previewProposal) return NO_MEASURE_IDS;
  return measureIds ?? NO_MEASURE_IDS;
}

/** Derive the visual flags from a set of measure IDs. */
export function deriveVisualState(measureIds: Iterable<string>): RetrofitVisualState {
  const state = { ...NO_RETROFIT_VISUALS };
  for (const id of measureIds) {
    if (id.startsWith("envelope-wall")) state.wallsUpgraded = true;
    else if (id.startsWith("envelope-roof")) state.roofUpgraded = true;
    else if (id.startsWith("envelope-window")) state.windowsUpgraded = true;
    else if (id.startsWith("envelope-floor")) state.floorsUpgraded = true;
    else if (id.startsWith("hvac-")) state.hvacUpgraded = true;
    else if (id.startsWith("lighting-")) state.lightingUpgraded = true;
    else if (id.startsWith("solar-pv")) state.solarInstalled = true;
  }
  return state;
}

/** True when any flag is on — lets consumers skip work entirely. */
export function hasAnyVisual(state: RetrofitVisualState): boolean {
  return Object.values(state).some(Boolean);
}
