// src/lib/layers/mep-coordinator.ts
// Coordinates MEP generator outputs into named sub-groups for independent visibility toggling.
// Sub-groups are children of the main MEP THREE.Group — main toggle propagates visibility down,
// sub-toggles control individual children.

import * as THREE from "three";
import type { MepSubLayerId } from "./types";
import { MEP_SUB_IDS, GENERATOR_TO_MEP_SUB } from "./types";

/**
 * Creates (or reuses) 4 named child groups inside the MEP THREE.Group:
 *   sub-mep-electrical, sub-mep-hvac, sub-mep-lighting, sub-mep-dhw
 *
 * Idempotent: if a sub-group already exists by name, it is reused rather than duplicated.
 *
 * @param mepGroup - The main MEP THREE.Group (from LayerManager.getGroup("mep"))
 * @returns Map from MepSubLayerId to its corresponding THREE.Group child
 */
export function setupMepSubGroups(mepGroup: THREE.Group): Map<MepSubLayerId, THREE.Group> {
  const subGroups = new Map<MepSubLayerId, THREE.Group>();

  for (const subId of MEP_SUB_IDS) {
    const groupName = `sub-${subId}`;
    let child = mepGroup.getObjectByName(groupName) as THREE.Group | undefined;

    if (!child) {
      child = new THREE.Group();
      child.name = groupName;
      mepGroup.add(child);
    }

    subGroups.set(subId, child);
  }

  return subGroups;
}

/**
 * Routes a generator's output group into the correct MEP sub-group (or directly to the
 * MEP group if the generator is unmapped).
 *
 * Mapped generators are placed inside their named sub-group so they can be toggled
 * independently. Unmapped generators are added directly to the MEP group — they remain
 * visible under the main MEP toggle but have no sub-toggle. See GENERATOR_TO_MEP_SUB in
 * ./types.ts for the current mapping.
 *
 * @param mepGroup        - The main MEP THREE.Group
 * @param generatorGroupName - The .name of the generator's output group (e.g. "layer-3-cooling")
 * @param generatorOutput - The THREE.Group produced by the generator
 */
export function assignToSubGroup(
  mepGroup: THREE.Group,
  generatorGroupName: string,
  generatorOutput: THREE.Group
): void {
  const subId = GENERATOR_TO_MEP_SUB[generatorGroupName];

  if (subId !== undefined) {
    // Mapped generator — place inside the named sub-group
    const subGroup = mepGroup.getObjectByName(`sub-${subId}`) as THREE.Group | undefined;
    if (subGroup) {
      subGroup.add(generatorOutput);
    } else {
      // Sub-group not yet set up — fall back to flat MEP group and warn
      console.warn(
        `[mep-coordinator] Sub-group "sub-${subId}" not found. ` +
          `Call setupMepSubGroups() before assignToSubGroup(). ` +
          `Falling back to flat MEP group for "${generatorGroupName}".`
      );
      mepGroup.add(generatorOutput);
    }
  } else {
    // Unmapped generator (no entry in GENERATOR_TO_MEP_SUB) — add flat to MEP group
    mepGroup.add(generatorOutput);
  }
}
