import type { WorkflowStage } from "./stages";

/** Named entry doors on `/`. Each door promises a workspace stage.
 *  `cad` opens `/building/drawing` (blank 1-floor host), never the demo tower. */
export const WORKFLOW_DOORS = {
  demo: "twin",
  cad: "upload",
} as const satisfies Record<string, WorkflowStage>;

export type WorkflowDoor = keyof typeof WORKFLOW_DOORS;

export function doorStage(door: WorkflowDoor): WorkflowStage {
  return WORKFLOW_DOORS[door];
}
