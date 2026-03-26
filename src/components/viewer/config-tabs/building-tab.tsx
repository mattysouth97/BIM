"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { useRecipeStore } from "@/store/recipe-store";
import { SliderRow } from "./slider-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface BuildingTabProps {
  buildingPk: string;
}

export function BuildingTab({ buildingPk }: BuildingTabProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const setOverride = useRecipeStore((s) => s.setOverride);
  const resetOverrides = useRecipeStore((s) => s.resetOverrides);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const recipe = useMemo(
    () => useRecipeStore.getState().getEffectiveRecipe(buildingPk),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildingPk, baseRecipe, overrides]
  );

  if (!recipe) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {isKo ? "건물 데이터를 불러오는 중..." : "Loading building data..."}
      </div>
    );
  }

  const set = (path: string, value: number | string) =>
    setOverride(buildingPk, path, value);

  // Helper to read a value — prefer overrides, fallback to recipe
  const v = (path: string, fallback: number): number => {
    const parts = path.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let obj: any = overrides;
    for (const p of parts) {
      obj = obj?.[p];
    }
    return typeof obj === "number" ? obj : fallback;
  };

  const roofType = (overrides?.roof?.type as string) ?? recipe.roof.type;

  return (
    <div className="space-y-5 p-3">
      {/* ── Geometry ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "형상" : "Geometry"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "가로 폭" : "Footprint Width"}
            value={v("footprintWidth", recipe.footprintWidth)}
            min={4} max={50} step={0.5} unit="m"
            onChange={(val) => set("footprintWidth", val)}
          />
          <SliderRow
            label={isKo ? "세로 깊이" : "Footprint Depth"}
            value={v("footprintDepth", recipe.footprintDepth)}
            min={4} max={50} step={0.5} unit="m"
            onChange={(val) => set("footprintDepth", val)}
          />
          <SliderRow
            label={isKo ? "층수" : "Floor Count"}
            value={v("floorCount", recipe.floors.length)}
            min={1} max={30} step={1} unit=""
            decimals={0}
            onChange={(val) => set("floorCount", val)}
          />
          <SliderRow
            label={isKo ? "층고" : "Floor Height"}
            value={v("floorHeight", recipe.floors[0]?.height ?? 3.0)}
            min={2.5} max={5.0} step={0.1} unit="m"
            decimals={1}
            onChange={(val) => set("floorHeight", val)}
          />
        </div>
      </section>

      {/* ── Facade ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "파사드" : "Facade"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "창면적비" : "Window Ratio"}
            value={v("facade.windowRatio", recipe.facade.windowRatio) * 100}
            min={10} max={80} step={5} unit="%"
            decimals={0}
            onChange={(val) => set("facade.windowRatio", val / 100)}
          />
          <SliderRow
            label={isKo ? "멀리온 깊이" : "Mullion Depth"}
            value={v("facade.mullionDepth", recipe.facade.mullionDepth)}
            min={0.02} max={0.15} step={0.01} unit="m"
            onChange={(val) => set("facade.mullionDepth", val)}
          />
          <SliderRow
            label={isKo ? "창대 높이" : "Sill Height"}
            value={v("facade.sillHeight", recipe.facade.sillHeight)}
            min={0.5} max={1.2} step={0.05} unit="m"
            onChange={(val) => set("facade.sillHeight", val)}
          />
          <SliderRow
            label={isKo ? "솔리드 패널 비율" : "Solid Panel Chance"}
            value={v("facade.solidPanelChance", recipe.facade.solidPanelChance) * 100}
            min={0} max={50} step={5} unit="%"
            decimals={0}
            onChange={(val) => set("facade.solidPanelChance", val / 100)}
          />
          <SliderRow
            label={isKo ? "파라펫 높이" : "Parapet Height"}
            value={v("facade.parapetHeight", recipe.facade.parapetHeight)}
            min={0} max={1.5} step={0.1} unit="m"
            decimals={1}
            onChange={(val) => set("facade.parapetHeight", val)}
          />
        </div>
      </section>

      {/* ── Structure ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "구조" : "Structure"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "기둥 간격" : "Column Spacing"}
            value={v("column.spacing", recipe.column.spacing)}
            min={3} max={10} step={0.5} unit="m"
            decimals={1}
            onChange={(val) => set("column.spacing", val)}
          />
          <SliderRow
            label={isKo ? "기둥 크기" : "Column Size"}
            value={v("column.size", recipe.column.size)}
            min={0.2} max={0.8} step={0.05} unit="m"
            onChange={(val) => set("column.size", val)}
          />
          <SliderRow
            label={isKo ? "슬래브 두께" : "Slab Thickness"}
            value={v("slab.thickness", recipe.slab.thickness)}
            min={0.1} max={0.4} step={0.02} unit="m"
            onChange={(val) => set("slab.thickness", val)}
          />
          <SliderRow
            label={isKo ? "벽 두께" : "Wall Thickness"}
            value={v("wallThickness", recipe.wallThickness)}
            min={0.1} max={0.5} step={0.02} unit="m"
            onChange={(val) => set("wallThickness", val)}
          />
        </div>
      </section>

      {/* ── Roof ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "지붕" : "Roof"}
        </h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {isKo ? "지붕 유형" : "Roof Type"}
              </span>
            </div>
            <Select
              value={roofType}
              onValueChange={(val) => set("roof.type", val)}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">
                  {isKo ? "평지붕" : "Flat"}
                </SelectItem>
                <SelectItem value="gable">
                  {isKo ? "박공지붕" : "Gable"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {roofType === "gable" && (
            <SliderRow
              label={isKo ? "박공 높이" : "Gable Height"}
              value={v("roof.gableHeight", recipe.roof.gableHeight)}
              min={0} max={5} step={0.5} unit="m"
              decimals={1}
              onChange={(val) => set("roof.gableHeight", val)}
            />
          )}
        </div>
      </section>

      {/* ── Reset ── */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => resetOverrides(buildingPk)}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        {isKo ? "기본값 복원" : "Reset to Defaults"}
      </Button>
    </div>
  );
}
