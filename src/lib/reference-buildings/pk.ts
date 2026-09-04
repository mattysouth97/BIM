// src/lib/reference-buildings/pk.ts
//
// The store key shape for an authored reference model, kept in a module with
// no other imports so a hook that only needs to recognise the prefix does
// not pull the building's recipe, materials and standards library into its
// bundle.

export const REFERENCE_BUILDING_PK_PREFIX = "ref:";

/** True for a key minted by `referenceBuildingPk` — never a 건축물대장 관리번호. */
export function isReferenceBuildingPk(pk: string): boolean {
  return pk.startsWith(REFERENCE_BUILDING_PK_PREFIX);
}
