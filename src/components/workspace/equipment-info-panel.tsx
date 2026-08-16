"use client";

import React from "react";
import { X } from "lucide-react";
import { useSelectionStore } from "@/store/selection-store";
import { useAppStore } from "@/store/app-store";
import { useMaterialStore } from "@/store/material-store";
import { useTwinProvenanceStore } from "@/store/twin-provenance-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { MEP_SUB_CONFIGS } from "@/lib/layers/types";
import { Button } from "@/components/ui/button";
import { useState } from "react";

/**
 * EquipmentInfoPanel — renders in the right dock when a MEP mesh has been
 * clicked. Reads selectedEquipment from selection-store and displays the
 * inferred EquipmentSpec with an amber "추정" disclaimer on every value.
 *
 * Per EQ-02 (ROADMAP.md): no value appears as measured data.
 *   - Every spec row carries an inline amber "추정" badge.
 *   - A card-footer disclaimer reinforces the estimated nature of all data.
 * Per STD-01: Korean 1~5등급 grade badge per KS B 6364 or KSC IEC 62301.
 *
 * IMPORTANT: This component does NOT import EFFICIENCY_GRADE_COLORS or
 * EnergyGrade from properties-panel.tsx — those are the building-level
 * certification grades (1+++ to 7). Equipment grades are a separate
 * 1~5 scale defined in equipment-specs.ts (D-04 / Pitfall 3).
 */
export function EquipmentInfoPanel() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const info = useSelectionStore((s) => s.selectedEquipment);
  const clearEquipment = useSelectionStore((s) => s.clearEquipment);
  const buildingPk = useActiveBuildingPk();
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const overrideProperty = useMaterialStore((s) => s.overrideProperty);
  const patchProvenance = useTwinProvenanceStore((s) => s.patch);
  const confirmed = materials?.source === "user-input";
  const [cap, setCap] = useState("");
  const [year, setYear] = useState("");

  if (!info) return null;

  const { specs, subLayerId, componentType, floorNo } = info;
  const subConfig = MEP_SUB_CONFIGS[subLayerId];

  return (
    <div className="m-3 rounded-lg border border-border bg-card p-3 text-xs shadow-sm">
      {/* Header: category name + close button */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold text-sm">
            {isKo ? specs.categoryKo : specs.categoryEn}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {isKo ? subConfig.nameKo : subConfig.name}
            {" · "}
            {componentType}
            {floorNo !== null ? ` · ${floorNo}F` : ""}
          </div>
        </div>
        <button
          onClick={clearEquipment}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={isKo ? "닫기" : "Close"}
          aria-label={isKo ? "닫기" : "Close"}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Korean efficiency grade badge — 1~5등급 (NOT building grade 1+++~7) */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold text-white"
          style={{ backgroundColor: specs.gradeColor }}
        >
          {specs.efficiencyGradeLabel}
        </span>
        <span className="text-[10px] text-muted-foreground">{specs.standardRef}</span>
      </div>

      {/* Spec rows — each row tagged with an inline amber "추정" badge (EQ-02) */}
      <div className="space-y-0.5">
        <SpecRow
          label={isKo ? "용량" : "Capacity"}
          value={specs.capacity}
        />
        <SpecRow
          label={isKo ? "설치연도" : "Install Year"}
          value={`${isKo ? "약 " : "~"}${specs.installYear}${isKo ? "년" : ""}`}
        />
        <SpecRow
          label={isKo ? "연간 소비" : "Annual Use"}
          value={`${specs.annualKwh.toLocaleString()} kWh/${isKo ? "년" : "yr"}`}
        />
      </div>

      <div className="mt-2 space-y-1.5 border-t pt-2">
        <p className="text-[10px] font-semibold text-muted-foreground">
          {isKo ? "사양 확인" : "Confirm spec"}
        </p>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {isKo ? "용량 kW" : "Capacity kW"}
          <input
            type="number"
            min={1}
            className="h-6 flex-1 rounded border bg-background px-1.5 text-xs tabular-nums"
            placeholder={specs.capacity}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {isKo ? "설치연도" : "Year"}
          <input
            type="number"
            min={1960}
            max={2030}
            className="h-6 flex-1 rounded border bg-background px-1.5 text-xs tabular-nums"
            placeholder={String(specs.installYear)}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          className="h-6 w-full text-[10px]"
          disabled={!cap && !year}
          onClick={() => {
            const isHeat =
              info.subLayerId === "mep-hvac" &&
              (info.componentType.includes("heat") ||
                info.componentType.includes("boiler"));
            if (cap) {
              const n = Number(cap);
              if (Number.isFinite(n)) {
                overrideProperty(
                  buildingPk,
                  isHeat ? "hvac.heating.capacity" : "hvac.cooling.capacity",
                  n,
                );
              }
            }
            if (year) {
              const y = Number(year);
              if (Number.isFinite(y)) {
                patchProvenance(buildingPk, { equipmentInstallYear: y });
              }
            }
          }}
        >
          {isKo ? "확인 — 입력으로 저장" : "Confirm — save as input"}
        </Button>
      </div>

      <div className={`mt-3 rounded border px-2 py-1.5 ${
        confirmed
          ? "border-cyan-500/30 bg-cyan-500/10"
          : "border-amber-500/30 bg-amber-500/10"
      }`}>
        <p className={`text-[10px] leading-relaxed ${
          confirmed
            ? "text-cyan-700 dark:text-cyan-400"
            : "text-amber-700 dark:text-amber-400"
        }`}>
          {confirmed
            ? (isKo ? "일부 값은 사용자 입력입니다. 등급이 이 값을 사용합니다." : "Some values are user input. The grade uses them.")
            : (isKo ? "⚠ 모든 값은 추정치입니다 — 실측 데이터가 아닙니다." : "⚠ All values are estimated — not measured data.")}
        </p>
      </div>
    </div>
  );
}

/**
 * Single spec row with label, value, and mandatory amber "추정" badge.
 * Every value displayed in the equipment panel must carry this badge (EQ-02).
 */
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-medium tabular-nums">{value}</span>
        <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
          {label.includes("용량") || label.toLowerCase().includes("capacity") ? "추정" : "추정"}
        </span>
      </div>
    </div>
  );
}
