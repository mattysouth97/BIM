// src/lib/mep/index.ts — canonical MEP engine public surface.
export * from "./types";
export {
  planMepSystems,
  planMepSystemsForRecipe,
  mepOptionsFromRecipe,
  clearMepPlanCache,
  MEP_GENERATOR_VERSION,
} from "./plan";
export { buildMepContext, type MepBuildingContext, type MepContextOptions, type CadRoomInput } from "./context";
export { validateMepModel, systemLengths, type MepValidationReport, type MepClash, type MepScoreBreakdown } from "./validate";
export {
  buildRenderInstructions,
  type MepRenderInstructions,
  type RunInstruction,
  type FittingInstruction,
  type HangerInstruction,
  type TerminalInstruction,
  type EquipmentInstruction,
} from "./geometry";
export { chooseArchetype, buildingUseFamily, serviceBands } from "./rules";
