// src/lib/engine/orchestrator.ts
//
// Reducer-style orchestrator chaining the five Slice-1 engine steps:
// ingest -> fuse -> generateIfc -> validate -> score. Pure aside from the
// injected (or lazily-resolved) IFC write session — see IfcWriteSession in
// src/lib/ifc/ifc-session.ts. No React, no Zustand, no window.

import type { IfcWriteSession } from "../ifc/ifc-session";
import { getSharedIfcWriteSession } from "../ifc/ifc-session";
import { ingest } from "./steps/ingest";
import { fuse } from "./steps/fuse";
import { generateIfc } from "./steps/generate-ifc";
import { validate } from "./steps/validate";
import { score } from "./steps/score";
import type { BimEngineInput, BimEngineResult } from "./types";

/**
 * Runs the full Slice-1 pipeline for a single building: fuses multi-source
 * spatial features into one FusedModel, generates a structurally valid IFC4
 * file for it, validates the generated geometry, and scores each element's
 * confidence (flagging low-confidence elements for HITL review).
 *
 * `session` is optional so callers (tests) can inject a fake write session;
 * when omitted, the shared real IfcWriteSession is awaited lazily.
 */
export async function runEngine(
  input: BimEngineInput,
  session?: IfcWriteSession
): Promise<BimEngineResult> {
  const writeSession = session ?? (await getSharedIfcWriteSession());

  const features = ingest(input);
  const { model, conflicts } = fuse(input, features);
  const { ifcBytes, elements: generatedElements } = await generateIfc(model, writeSession);
  const validation = validate(model, generatedElements);
  const { elements, hitlFlags } = score(generatedElements, validation);

  return {
    ifcBytes,
    model,
    elements,
    hitlFlags,
    conflicts,
    validation,
  };
}
