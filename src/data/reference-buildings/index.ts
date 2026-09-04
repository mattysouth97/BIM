/**
 * The registered-building catalog: the small, bundled list of authored BIM
 * models a user can open without uploading anything.
 *
 * This file is deliberately the *editorial* half of a catalog entry and nothing
 * else. Every number a card shows — floor area, storey count, space count,
 * envelope area — comes from the generated manifest beside the record, never
 * from here. The reason is not tidiness: a hand-carried "6,936 m², 2 storeys"
 * goes quietly wrong the moment extraction changes, and nothing catches it.
 * Areas need one source of truth a test can assert; names and one-line
 * descriptions need a human. So: **no numeric field belongs in this file, ever.**
 *
 * It is bundled rather than fetched because the workspace's empty state has to
 * list what is on offer before the user has chosen anything — a fetch there
 * would trade a list that always renders for a spinner that sometimes fails.
 * The records themselves stay out of the bundle; they are megabytes.
 *
 * This is not a new front door. The catalog hangs off the existing
 * `method=sample` entry (`/diagnostics/new?method=sample&building=<id>`), and
 * the 건축물대장 register lookup remains the product's primary entry — see
 * AGENTS.md, "The product shape is fixed".
 */

export type ReferenceBuildingCatalogEntry = Readonly<{
  /** Matches `ReferenceBuildingRecord.id`; asserted by the catalog test. */
  id: string;
  name: Readonly<{ ko: string; en: string }>;
  /** One line under the name. Editorial copy, not extracted text. */
  summary: Readonly<{ ko: string; en: string }>;
  /**
   * Shown verbatim wherever the building is named, because the licence
   * requires it. Not a number, so it belongs here rather than the manifest —
   * but the manifest carries it too, and they must agree.
   */
  attribution: string;
}>;

/** Where a building's generated files live, derived so they cannot drift. */
export const REFERENCE_BUILDING_BASE_PATH = "/reference-buildings";

/**
 * The extracted record — the full model, fetched on demand.
 *
 * Derived from the id rather than stored per entry: a hand-typed URL beside a
 * hand-typed id is two things that can disagree, and the disagreement shows up
 * as a 404 at the moment a user clicks.
 */
export function referenceBuildingRecordUrl(id: string): string {
  return `${REFERENCE_BUILDING_BASE_PATH}/${id}/model.json`;
}

/** The generated manifest — every figure a card displays. */
export function referenceBuildingManifestUrl(id: string): string {
  return `${REFERENCE_BUILDING_BASE_PATH}/${id}/manifest.json`;
}

export const REFERENCE_BUILDING_CATALOG: readonly ReferenceBuildingCatalogEntry[] =
  Object.freeze([
    Object.freeze({
      id: "bs-medical-dental-clinic",
      name: Object.freeze({
        ko: "메디컬·덴탈 클리닉",
        en: "Medical-Dental Clinic",
      }),
      summary: Object.freeze({
        ko: "buildingSMART 공개 표준 IFC 모델. 도면이 아니라 작성된 BIM 모델로 들어오는 첫 번째 등록 건물입니다.",
        en: "A buildingSMART open-standard IFC model — the first registered building that enters as an authored BIM model rather than a drawing.",
      }),
      attribution: "buildingSMART International — Medical-Dental Clinic sample project (CC BY 4.0)",
    }),
  ]);

export function findReferenceBuilding(
  id: string | undefined,
): ReferenceBuildingCatalogEntry | null {
  if (!id) return null;
  return REFERENCE_BUILDING_CATALOG.find((entry) => entry.id === id) ?? null;
}
