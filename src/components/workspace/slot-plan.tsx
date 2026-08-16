"use client";

import { useCallback, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useEffectiveRecipe } from "@/hooks/use-twin-fidelity";
import { computeCoreLayout } from "@/lib/layers/core-layout";

interface SlotPlanProps {
  buildingPk: string;
}

/** 2D plan of the plate with a single draggable service-core handle. */
export function SlotPlan({ buildingPk }: SlotPlanProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const recipe = useEffectiveRecipe(buildingPk);
  const setOverride = useRecipeStore((s) => s.setOverride);
  const svgRef = useRef<SVGSVGElement>(null);

  const onPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!recipe || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const nz = (clientY - rect.top) / rect.height;
      const x = (nx - 0.5) * recipe.footprintWidth;
      const z = (nz - 0.5) * recipe.footprintDepth;
      setOverride(buildingPk, "serviceCore", { x, z });
    },
    [recipe, buildingPk, setOverride],
  );

  if (!recipe) return null;

  const layout = computeCoreLayout(recipe);
  const w = recipe.footprintWidth;
  const d = recipe.footprintDepth;
  const toX = (x: number) => ((x / w) + 0.5) * 100;
  const toY = (z: number) => ((z / d) + 0.5) * 100;

  return (
    <div className="px-3 py-2 space-y-1.5" data-testid="slot-plan">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {isKo ? "서비스 코어" : "Service core"}
      </p>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {isKo
          ? "점을 끌어 코어를 이 평면에 맞춥니다. +Z가 남측(정면)입니다."
          : "Drag the dot to park the core on this plate. +Z is south (front)."}
      </p>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className="w-full aspect-[4/3] rounded-md border bg-muted/30 cursor-crosshair"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          onPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          onPointer(e.clientX, e.clientY);
        }}
      >
        <rect x="4" y="4" width="92" height="92" fill="none" stroke="currentColor" strokeOpacity="0.25" />
        {/* North is -Z = top of this map */}
        <text x="50" y="10" textAnchor="middle" fontSize="4" fill="currentColor" opacity="0.6">
          N
        </text>
        <circle
          cx={toX(layout.elevator.shafts[0]?.x ?? 0)}
          cy={toY(layout.elevator.bankZ)}
          r="4"
          className="fill-cyan-600"
        />
        <circle
          cx={toX(layout.roofChiller.x)}
          cy={toY(layout.roofChiller.z)}
          r="2.2"
          className="fill-orange-500"
        />
      </svg>
      <div className="flex gap-3 text-[9px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-cyan-600" />
          {isKo ? "코어" : "Core"}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-orange-500" />
          {isKo ? "옥상 플랜트" : "Roof plant"}
        </span>
      </div>
    </div>
  );
}
