// src/lib/retrofit/measure-visuals.ts
// P2-20 — maps the user's applied retrofit measures onto the 3D visual state.
//
// Pure and synchronous: measure IDs in, boolean visual flags out. The scene
// (procedural-building-model, building-layers, solar-panels) consumes the
// flags; this module knows nothing about THREE.js.
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

/** Derive the visual flags from the applied measure IDs. */
export function deriveVisualState(appliedIds: Iterable<string>): RetrofitVisualState {
  const state = { ...NO_RETROFIT_VISUALS };
  for (const id of appliedIds) {
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
