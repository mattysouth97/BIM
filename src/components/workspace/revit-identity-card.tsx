"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useSelectionStore } from "@/store/selection-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useMaterialStore } from "@/store/material-store";
import { resolveRevitIdentity } from "@/lib/bim/revit-identity";
import { resolveAssetSlot } from "@/lib/bim/asset-slots";
import { Badge } from "@/components/ui/badge";

export function RevitIdentityCard() {
  const { t, lang } = useT();
  const buildingPk = useActiveBuildingPk();
  const recipe = useEffectiveRecipe(buildingPk);
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const selectedType = useSelectionStore((s) => s.selectedType);
  const selectedEquipment = useSelectionStore((s) => s.selectedEquipment);

  const identity = useMemo(
    () =>
      resolveRevitIdentity({
        kind: selectedType ?? "wall",
        strctCd: recipe?.strctCd,
        curtainWall: recipe?.curtainWall?.enabled,
        wallThicknessM: recipe?.wallThickness,
        columnSizeM: recipe?.column.size,
        materialSource: materials?.source,
        equipment: selectedEquipment,
      }),
    [selectedType, selectedEquipment, recipe, materials]
  );

  const asset = resolveAssetSlot(identity.assetSlot);

  return (
    <div className="border-b px-3 py-2.5" data-testid="revit-identity-card">
      <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {t("카테고리 · 패밀리 · 타입", "Category · Family · Type")}
      </p>
      <p className="text-xs font-medium leading-snug">
        {lang === "ko" ? identity.displayKo : identity.displayEn}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
          LOD {identity.lod}
        </Badge>
        <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
          {identity.familyKind === "system"
            ? t("시스템 패밀리", "System family")
            : t("로드형 패밀리", "Loadable family")}
        </Badge>
        {identity.ifcClass && (
          <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
            {identity.ifcClass}
          </Badge>
        )}
        <Badge
          variant="outline"
          className={`h-4 px-1.5 text-[9px] ${
            asset.source === "manifest"
              ? "border-cyan-300 text-cyan-700"
              : "text-muted-foreground"
          }`}
        >
          {asset.source === "manifest"
            ? t("3D 에셋", "3D asset")
            : t("절차형 폴백", "Procedural fallback")}
        </Badge>
      </div>
    </div>
  );
}
