// src/lib/generative/workspace-handoff.ts
//
// What "open this design as a building" means besides writing IndexedDB and
// pushing /building/GEN-…. Authoring lives on the schematic; the twin is a
// review of the compiled BIM, so the interior is on and the 3D authoring
// palette is not the destination.

import { useLayerStore } from "@/store/layer-store";
import { useWorkflowStore } from "@/store/workflow-store";

/** Put the twin workspace in the mode a just-generated design is opened for. */
export function prepareGeneratedWorkspaceSession(): void {
  useLayerStore.getState().setInteriorVisible(true);
  const stage = useWorkflowStore.getState().stage;
  if (stage !== "twin" && stage !== "report") {
    useWorkflowStore.getState().setStage("twin");
  }
}
