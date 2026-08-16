"use client";

import { useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useEffectiveRecipe } from "@/hooks/use-twin-fidelity";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useTypeCodes from "@/data/use-type-codes.json";

const COMMON_USES = (useTypeCodes as Array<{ code: string; ko: string; en: string }>).filter(
  (u) =>
    ["01000", "02000", "03000", "04000", "07000", "14000", "15000", "17000", "18000"].includes(
      u.code,
    ),
);

interface FloorStackEditorProps {
  buildingPk: string;
}

export function FloorStackEditor({ buildingPk }: FloorStackEditorProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const recipe = useEffectiveRecipe(buildingPk);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const setOverride = useRecipeStore((s) => s.setOverride);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);

  const setFloor = useCallback(
    (floorNo: number, field: "height" | "useCode" | "excluded", value: unknown) => {
      setOverride(buildingPk, `floorEdits.${floorNo}.${field}`, value);
    },
    [buildingPk, setOverride],
  );

  if (!recipe) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        {isKo ? "층 데이터가 없습니다." : "No floor data."}
      </p>
    );
  }

  const sourceFloors = recipe.floors.length > 0 ? recipe.floors : baseRecipe?.floors ?? [];
  const excludedNos = new Set(
    Object.entries(overrides?.floorEdits ?? {})
      .filter(([, e]) => e.excluded)
      .map(([k]) => Number(k)),
  );
  const ghostExcluded = (baseRecipe?.floors ?? [])
    .filter((f) => excludedNos.has(f.floorNo) && !sourceFloors.some((s) => s.floorNo === f.floorNo));
  const floors = [...sourceFloors, ...ghostExcluded].sort((a, b) => {
    if (a.type !== b.type) return a.type === "below" ? -1 : 1;
    return a.floorNo - b.floorNo;
  });

  return (
    <div className="space-y-2 px-3 py-2" data-testid="floor-stack-editor">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "층 스택" : "Floor stack"}
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            onClick={() =>
              setOverride(buildingPk, "floorCount", Math.max(1, (overrides?.floorCount ?? recipe.floors.filter((f) => f.type !== "below").length) + 1))
            }
          >
            {isKo ? "+ 층" : "+ Floor"}
          </Button>
        </div>
      </div>
      <ul className="space-y-1.5">
        {floors.map((f) => {
          const edit = overrides?.floorEdits?.[String(f.floorNo)];
          const useCode = edit?.useCode ?? f.useCode ?? recipe.mainPurpsCd;
          return (
            <li
              key={`${f.type}-${f.floorNo}`}
              className="rounded-md border bg-card px-2 py-1.5 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium tabular-nums">
                  {f.type === "below" ? `B${Math.abs(f.floorNo)}` : `${f.floorNo}F`}
                </span>
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={!!edit?.excluded}
                    onChange={(e) => setFloor(f.floorNo, "excluded", e.target.checked)}
                  />
                  {isKo ? "제외" : "Exclude"}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-1 text-[10px] text-muted-foreground">
                  {isKo ? "층고" : "H"}
                  <input
                    type="number"
                    min={2.2}
                    max={8}
                    step={0.1}
                    value={edit?.height ?? f.height}
                    onChange={(e) => setFloor(f.floorNo, "height", Number(e.target.value))}
                    className="h-6 w-full rounded border bg-background px-1.5 text-xs tabular-nums"
                  />
                  <span>m</span>
                </label>
              </div>
              <Select
                value={useCode}
                onValueChange={(v) => setFloor(f.floorNo, "useCode", v)}
              >
                <SelectTrigger className="h-7 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_USES.map((u) => (
                    <SelectItem key={u.code} value={u.code} className="text-[10px]">
                      {isKo ? u.ko : u.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
