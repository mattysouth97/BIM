"use client";

import { useAppStore } from "@/store/app-store";
import { useMaterialStore } from "@/store/material-store";
import { SliderRow } from "./slider-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw } from "lucide-react";
import { inferMaterialProperties } from "@/lib/material-inference";
import type { BrTitleInfo, BrFloorInfo } from "@/lib/types";

// Insulation presets — Korean name, insulation type name, approximate U-value
const INSULATION_PRESETS = [
  { key: "eps", ko: "EPS (비드법 보온판)", en: "EPS (Expanded Polystyrene)", uValue: 0.27 },
  { key: "xps", ko: "XPS (압출법 보온판)", en: "XPS (Extruded Polystyrene)", uValue: 0.22 },
  { key: "pir", ko: "PIR (경질우레탄폼)", en: "PIR (Polyisocyanurate)", uValue: 0.18 },
  { key: "glasswool", ko: "글라스울", en: "Glass Wool", uValue: 0.32 },
] as const;

// Glass type presets
const GLASS_TYPES = [
  { key: "single", ko: "단층 유리", en: "Single" },
  { key: "double", ko: "복층 유리", en: "Double" },
  { key: "triple", ko: "삼중 유리", en: "Triple" },
  { key: "low-e", ko: "로이 유리", en: "Low-E" },
] as const;

interface EnvelopeTabProps {
  buildingPk: string;
}

export function EnvelopeTab({ buildingPk }: EnvelopeTabProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const properties = useMaterialStore((s) => s.properties[buildingPk]);
  const overrideProperty = useMaterialStore((s) => s.overrideProperty);
  const setProperties = useMaterialStore((s) => s.setProperties);

  if (!properties) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {isKo ? "건물 데이터를 불러오는 중..." : "Loading building data..."}
      </div>
    );
  }

  const env = properties.envelope;
  const isUserInput = properties.source === "user-input";

  // Average wall U-value across all orientations
  const wallU = env.walls.length > 0
    ? env.walls.reduce((sum, w) => sum + w.uValue, 0) / env.walls.length
    : 0.5;

  const setEnvelope = (path: string, value: unknown) =>
    overrideProperty(buildingPk, `envelope.${path}`, value);

  const handleInsulationPreset = (key: string) => {
    const preset = INSULATION_PRESETS.find((p) => p.key === key);
    if (preset) {
      // Update all wall orientations U-value
      env.walls.forEach((_, i) => {
        overrideProperty(buildingPk, `envelope.walls.${i}.uValue`, preset.uValue);
        overrideProperty(buildingPk, `envelope.walls.${i}.rValue`, 1 / preset.uValue);
      });
    }
  };

  const handleGlassType = (key: string) => {
    // Map glass type display key to actual type
    const glassType = key === "low-e" ? "double" : key as "single" | "double" | "triple";
    const coating = key === "low-e" ? "low-e" : "none";
    setEnvelope("windows.glassType", glassType);
    setEnvelope("windows.coating", coating);
  };

  const currentGlassKey = env.windows.coating === "low-e"
    ? "low-e"
    : env.windows.glassType;

  const handleReset = () => {
    // Reconstruct a minimal BrTitleInfo for inference — use partial cast
    // since we only need fields used by inferMaterialProperties
    const title = {
      mgmBldrgstPk: buildingPk,
      bldNm: "",
      platPlcNm: "",
      newPlatPlc: "",
      sigunguCd: "11",
      bjdongCd: "",
      platGbCd: "0",
      bun: "",
      ji: "",
      mainPurpsCd: "",
      mainPurpsCdNm: "",
      etcPurps: "",
      strctCd: "11",
      strctCdNm: "",
      etcStrct: "",
      grndFlrCnt: 1,
      ugrndFlrCnt: 0,
      totArea: 0,
      archArea: 0,
      platArea: 0,
      bcRat: 0,
      vlRat: 0,
      useAprDay: "",
      pmsDay: "",
      stcnsDay: "",
      roofCd: "",
      roofCdNm: "",
      heit: 0,
      regstrGbCd: "",
      regstrGbCdNm: "",
      regstrKindCd: "",
      regstrKindCdNm: "",
    } satisfies BrTitleInfo;
    const inferred = inferMaterialProperties(title, [] as BrFloorInfo[]);
    setProperties(buildingPk, inferred);
  };

  return (
    <div className="space-y-5 p-3">
      {/* Source badge */}
      {isUserInput && (
        <Badge variant="default" className="text-[10px]">
          {isKo ? "사용자 입력" : "User Input"}
        </Badge>
      )}

      {/* ── Wall ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "외벽" : "Wall"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "벽체 열관류율" : "Wall U-value"}
            value={wallU}
            min={0.12} max={2.5} step={0.01} unit="W/(m²K)"
            onChange={(val) => {
              env.walls.forEach((_, i) => {
                overrideProperty(buildingPk, `envelope.walls.${i}.uValue`, val);
                overrideProperty(buildingPk, `envelope.walls.${i}.rValue`, 1 / val);
              });
            }}
          />

          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">
              {isKo ? "단열재 종류" : "Insulation Type"}
            </div>
            <Select onValueChange={handleInsulationPreset}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder={isKo ? "선택..." : "Select..."} />
              </SelectTrigger>
              <SelectContent>
                {INSULATION_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {isKo ? p.ko : p.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Window ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "창호" : "Window"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "창호 열관류율" : "Window U-value"}
            value={env.windows.uValue}
            min={0.8} max={5.0} step={0.1} unit="W/(m²K)"
            decimals={1}
            onChange={(val) => setEnvelope("windows.uValue", val)}
          />
          <SliderRow
            label="SHGC"
            value={env.windows.shgc}
            min={0.1} max={0.9} step={0.05} unit=""
            onChange={(val) => setEnvelope("windows.shgc", val)}
          />
          <SliderRow
            label={isKo ? "창면적비 (WWR)" : "WWR"}
            value={env.windows.windowToWallRatio.S * 100}
            min={10} max={80} step={5} unit="%"
            decimals={0}
            onChange={(val) => {
              const ratio = val / 100;
              setEnvelope("windows.windowToWallRatio", {
                N: ratio * 0.8,
                S: ratio * 1.2,
                E: ratio,
                W: ratio,
              });
            }}
          />

          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">
              {isKo ? "유리 종류" : "Glass Type"}
            </div>
            <Select value={currentGlassKey} onValueChange={handleGlassType}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GLASS_TYPES.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {isKo ? g.ko : g.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Roof & Floor ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "지붕 / 바닥" : "Roof & Floor"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "지붕 열관류율" : "Roof U-value"}
            value={env.roof.uValue}
            min={0.1} max={2.0} step={0.01} unit="W/(m²K)"
            onChange={(val) => setEnvelope("roof.uValue", val)}
          />
          <SliderRow
            label={isKo ? "바닥 열관류율" : "Floor U-value"}
            value={env.groundFloor.uValue}
            min={0.15} max={2.0} step={0.01} unit="W/(m²K)"
            onChange={(val) => setEnvelope("groundFloor.uValue", val)}
          />
        </div>
      </section>

      {/* ── Airtightness ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "기밀성" : "Airtightness"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label="ACH50"
            value={env.airtightness.ach50}
            min={0.5} max={10.0} step={0.5} unit="h⁻¹"
            decimals={1}
            onChange={(val) => setEnvelope("airtightness.ach50", val)}
          />
        </div>
      </section>

      {/* ── Reset ── */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleReset}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        {isKo ? "규정 기본값 복원" : "Reset to Code Defaults"}
      </Button>
    </div>
  );
}
