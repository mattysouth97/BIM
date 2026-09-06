import type { MaterialBinding } from "@/lib/rendering/material-expression";
import { solveConstructions, type SolvedConstruction } from "./constructions";
import type { ReferenceBuildingManifest } from "./manifest";

export type MaterialSurfaceSelection = Readonly<{ binding: MaterialBinding; revision: number }>;

/** A surface can name an interior/otherwise filtered set. Resolve the exact
 * source ref, never a similar-looking name or the first envelope assembly.
 */
export function selectedMaterialConstruction(manifest: ReferenceBuildingManifest, selection?: MaterialSurfaceSelection | null): SolvedConstruction | null {
  const ref = selection?.binding.assemblyRef;
  if (!ref) return null;
  return solveConstructions(manifest).find((construction) => construction.ref === ref) ?? null;
}

export function materialSelectionGap(binding: MaterialBinding, isKo: boolean): string {
  switch (binding.status) {
    case "single_material": return isKo ? "원본에 단일 재료만 연결되어 있어 다층 구성을 표시할 수 없습니다." : "The source assigns a single material, so no layer stack is available.";
    case "ambiguous": return isKo ? "여러 재료 연결이 있어 하나의 층 구성으로 결정할 수 없습니다." : "Several material assignments prevent choosing one layer stack.";
    case "unsupported": return isKo ? "원본 재료 연결 형식은 현재 층 구성으로 해석되지 않습니다." : "This source material assignment cannot currently be resolved as a layer stack.";
    case "layer_set": return isKo ? "원본에 재료층 연결은 있으나 해당 층 구성 데이터가 게시되지 않았습니다." : "A layer set is assigned in the source, but its assembly details are not published.";
    default: return isKo ? "이 표면에 원본 재료 연결이 확인되지 않았습니다." : "No source material assignment was established for this surface.";
  }
}
