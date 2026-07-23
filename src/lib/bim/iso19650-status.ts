// src/lib/bim/iso19650-status.ts
// P2-22 — ISO 19650-2-ALIGNED information-container status for the twin's
// data sources.
//
// ISO 19650-2 is a delivery-phase information-management process standard:
// information containers move through Work in Progress → Shared → Published
// (→ Archived) states in a CDE, each carrying an ID, status, and revision.
// The familiar suitability codes (S0/S2/…/A) come from the BS EN ISO 19650-2
// UK National Annex, not the international text. We ALIGN with that
// vocabulary to describe our federated sources honestly — this is not a
// claim of ISO 19650 compliance (the standard certifies a management
// process, not software).
//
// Container states map to real provenance in this app:
//   건축물대장 (government ledger)  → Published, code A  (authorized data)
//   CAD footprint (user upload)     → Shared,    code S2 (for information)
//   Estimated geometry/equipment    → WIP,       code S0 (era-inferred)

export type ContainerState = "wip" | "shared" | "published";

export interface InfoContainer {
  /** Short container key */
  key: "ledger" | "cad" | "estimated";
  /** UK-annex-style suitability code */
  suitability: "A" | "S2" | "S0";
  state: ContainerState;
  labelKo: string;
  labelEn: string;
  noteKo: string;
  noteEn: string;
}

export const CONTAINER_STATE_LABELS: Record<ContainerState, { ko: string; en: string }> = {
  wip: { ko: "작업 중 (WIP)", en: "Work in progress" },
  shared: { ko: "공유됨 (Shared)", en: "Shared" },
  published: { ko: "공표됨 (Published)", en: "Published" },
};

/**
 * The twin's information containers with their honest status.
 * The CAD container only exists once the user committed a footprint.
 */
export function buildingInfoContainers(opts: { hasCadFootprint: boolean }): InfoContainer[] {
  const containers: InfoContainer[] = [
    {
      key: "ledger",
      state: "published",
      suitability: "A",
      labelKo: "건축물대장",
      labelEn: "Building ledger",
      noteKo: "정부 공표 데이터 (국토교통부 건축HUB)",
      noteEn: "Government-published data (MOLIT 건축HUB)",
    },
  ];
  if (opts.hasCadFootprint) {
    containers.push({
      key: "cad",
      state: "shared",
      suitability: "S2",
      labelKo: "CAD 외곽선",
      labelEn: "CAD footprint",
      noteKo: "사용자 제공 도면 — 정보 공유 적합(S2)",
      noteEn: "User-supplied drawing — suitable for information (S2)",
    });
  }
  containers.push({
    key: "estimated",
    state: "wip",
    suitability: "S0",
    labelKo: "추정 지오메트리·설비",
    labelEn: "Estimated geometry & equipment",
    noteKo: "연대 기반 추정 — 실측 아님(S0)",
    noteEn: "Era-inferred estimates — not measured (S0)",
  });
  return containers;
}
