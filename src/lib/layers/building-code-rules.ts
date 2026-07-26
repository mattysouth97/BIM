// src/lib/layers/building-code-rules.ts
// Korean building-code rules that decide WHICH building systems exist and
// HOW they are configured, derived from the recipe's era and size.
//
// Buildings are not configured arbitrarily — the code of the permit period
// dictates the systems. The 3D twin mirrors the rules that shaped the real
// building:
//
// - 승용승강기 (passenger elevator): 건축법 제64조 requires elevators in
//   buildings of 6+ floors (연면적 조건 simplified away — the ledger's floor
//   count is the reliable signal). A 3-floor 근생 building genuinely has no
//   elevator, so the twin must not render one.
//
// - 스프링클러 (sprinklers): 소방시설 설치 및 관리에 관한 법률 시행령 별표 4
//   requires sprinklers on all floors of 11+ floor buildings (전층 적용
//   post-2005). Low-rise buildings rely on extinguishers, hydrant cabinets,
//   and detectors instead — which is exactly what their ledgers show.
//
// - 가스 공급 (gas supply): 도시가스 (city gas) distribution reached Seoul in
//   the late 1980s and spread nationwide through the 1990s. Buildings
//   permitted before 1990 were built for LPG cylinder service (외부 용기
//   보관함 + 조정기); 1990+ buildings get an underground city-gas service
//   line with an exterior meter. Both eras share the same code constraint:
//   도시가스사업법 시행규칙 requires gas piping to run EXPOSED on the
//   exterior wall (노출 배관 원칙) — never buried inside walls — which is
//   why Korean facades carry visible yellow risers.
//
// - 수직 배관 스택 (stacked wet zones): not a statute but universal practice
//   enforced through 설비 심의 — bathrooms/kitchens stack vertically floor
//   over floor so supply/drain risers run straight. The twin stacks its wet
//   zones for the same reason.

import type { BuildingRecipe } from "@/lib/procedural/types";

export type GasSupplyType = "city-gas" | "lpg";

export interface BuildingCodeRules {
  /** 건축법 제64조 — 6층 이상 승용승강기 설치 의무 */
  elevatorRequired: boolean;
  /** 소방시설법 시행령 별표 4 — 11층 이상 전층 스프링클러 */
  sprinklersRequired: boolean;
  /** 도시가스 보급 시기 기준 — pre-1990 permits ran on LPG cylinders */
  gasSupply: GasSupplyType;
}

/** Eras whose permits predate nationwide city-gas distribution. */
const LPG_ERAS: ReadonlySet<string> = new Set(["pre-1970", "1970-1989"]);

/**
 * Derives the code rules that shaped this building. Pure + deterministic —
 * generators call it independently and agree, same contract as
 * computeCoreLayout().
 */
export function getBuildingCodeRules(recipe: BuildingRecipe): BuildingCodeRules {
  const aboveFloorCount = recipe.floors.filter((f) => f.type === "above").length;

  return {
    elevatorRequired: aboveFloorCount >= 6,
    sprinklersRequired: aboveFloorCount >= 11,
    gasSupply: LPG_ERAS.has(recipe.era) ? "lpg" : "city-gas",
  };
}
