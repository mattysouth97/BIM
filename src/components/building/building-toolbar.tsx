"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { BrTitleInfo } from "@/lib/types";
import { DEMO_BUILDING_PK, DRAWING_BUILDING_PK } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useBlueprintStore } from "@/store/blueprint-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { mergeRecipeOverrides } from "@/lib/procedural/recipe";
import {
  footprintRingsOfRecipe,
  footprintToBlueprint,
} from "@/lib/generative/blueprint/from-footprint";
import { stashSeedBlueprint } from "@/lib/generative/blueprint/seed-handoff";
import { useT } from "@/lib/i18n";
import { useHydration } from "@/hooks/use-hydration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportDropdown } from "@/components/export/export-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  PanelRightOpen,
  PanelRightClose,
  Globe,
  Shapes,
} from "lucide-react";

interface BuildingToolbarProps {
  title: BrTitleInfo | null;
  exportData: Record<string, unknown>[];
  exportFilename: string;
  loading: boolean;
}

export function BuildingToolbar({
  title,
  exportData,
  exportFilename,
  loading,
}: BuildingToolbarProps) {
  const hydrated = useHydration();
  const { t, lang } = useT();
  const setLanguage = useAppStore((s) => s.setLanguage);
  const sidePanelOpen = useAppStore((s) => s.sidePanelOpen);
  const toggleSidePanel = useAppStore((s) => s.toggleSidePanel);

  const router = useRouter();
  const buildingPk = useActiveBuildingPk();
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const recipeOverrides = useRecipeStore((s) => s.overrides[buildingPk]);

  // The plate the user is looking at, overrides included — a footprint edited
  // in the workspace is the one a new design should start from.
  const seedFootprint = useMemo(() => {
    if (!baseRecipe) return null;
    const recipe = recipeOverrides
      ? mergeRecipeOverrides(baseRecipe, recipeOverrides)
      : baseRecipe;
    const rings = footprintRingsOfRecipe(recipe);
    if (!rings) return null;
    return {
      rings,
      name: recipe.buildingName || title?.bldNm || buildingPk,
      floors: Math.max(1, recipe.floors.filter((f) => f.type === "above").length),
    };
  }, [baseRecipe, recipeOverrides, title?.bldNm, buildingPk]);

  const startEnergyDiagnostic = () => {
    if (!seedFootprint) return;
    const seed = footprintToBlueprint({
      name: seedFootprint.name,
      footprintPolygonM: seedFootprint.rings,
      floors: seedFootprint.floors,
    });
    // Preserve the current footprint as contextual geometry authoring input.
    // The destination remains the single Energy Diagnostic product workflow.
    useBlueprintStore.getState().loadBlueprint(seed);
    stashSeedBlueprint(seed);
    router.push("/diagnostics/new?method=create");
  };

  const isKo = lang === "ko";
  const isDemo = title?.mgmBldrgstPk === DEMO_BUILDING_PK;
  const isDrawing = title?.mgmBldrgstPk === DRAWING_BUILDING_PK;
  const displayName = title
    ? title.bldNm || title.platPlcNm || "건물명 없음"
    : null;

  return (
    <div className="flex items-center justify-between h-12 px-3 border-b bg-background/95 backdrop-blur shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">
            {t("홈", "Home")}
          </span>
        </Link>

        <div className="h-4 w-px bg-border shrink-0" />

        {loading && !title ? (
          <Skeleton className="h-5 w-32" />
        ) : displayName ? (
          <span
            className="text-sm font-semibold truncate min-w-0 flex-1"
            title={displayName}
          >
            {displayName}
          </span>
        ) : null}

        {isDemo && (
          <Badge
            variant="outline"
            className="text-[10px] shrink-0 border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            {isKo ? "데모 데이터" : "Demo data"}
          </Badge>
        )}
        {isDrawing && (
          <Badge
            variant="outline"
            className="text-[10px] shrink-0 border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300"
          >
            {isKo ? "도면" : "Drawing"}
          </Badge>
        )}

        {title?.mainPurpsCdNm && (
          <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">
            {title.mainPurpsCdNm}
          </Badge>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 shrink-0">
        {hydrated && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={startEnergyDiagnostic}
            disabled={!seedFootprint}
            title={
              seedFootprint
                ? t(
                    "이 건물의 평면 윤곽으로 에너지 진단을 시작합니다",
                    "Start an energy diagnostic from this building's footprint",
                  )
                : t(
                    "평면 윤곽이 없어 진단 모델을 시작할 수 없습니다",
                    "No footprint is available to start a diagnostic model",
                  )
            }
          >
            <Shapes className="size-4" />
            <span className="hidden md:inline">
              {t("에너지 진단", "Energy diagnostic")}
            </span>
          </Button>
        )}

        <ExportDropdown data={exportData} filename={exportFilename} />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setLanguage(lang === "ko" ? "en" : "ko")}
          title={t("Switch to English", "한국어로 전환")}
        >
          <Globe className="size-4" />
        </Button>

        {hydrated && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleSidePanel}
            title={sidePanelOpen ? t("패널 닫기", "Close panel") : t("패널 열기", "Open panel")}
          >
            {sidePanelOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
