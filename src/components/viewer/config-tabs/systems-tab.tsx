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
import { RotateCcw } from "lucide-react";

interface SystemsTabProps {
  buildingPk: string;
}

const HVAC_SYSTEM_TYPES = [
  { value: "individual", ko: "개별난방", en: "Individual" },
  { value: "central", ko: "중앙난방", en: "Central" },
  { value: "vrf", ko: "VRF 시스템", en: "VRF" },
  { value: "district", ko: "지역난방", en: "District" },
] as const;

const COOLING_TYPES = [
  { value: "split", ko: "개별냉방", en: "Split" },
  { value: "central-chiller", ko: "중앙냉방", en: "Central Chiller" },
  { value: "vrf", ko: "VRF", en: "VRF" },
  { value: "none", ko: "없음", en: "None" },
] as const;

const LIGHTING_CONTROLS = [
  { value: "manual", ko: "수동", en: "Manual" },
  { value: "occupancy-sensor", ko: "재실감지", en: "Occupancy Sensor" },
  { value: "daylight-dimming", ko: "주광연동", en: "Daylight Dimming" },
] as const;

const SOLAR_TYPES = [
  { value: "none", ko: "없음", en: "None" },
  { value: "rooftop-PV", ko: "옥상 태양광", en: "Rooftop PV" },
  { value: "BIPV", ko: "BIPV", en: "BIPV" },
] as const;

export function SystemsTab({ buildingPk }: SystemsTabProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const overrideProperty = useMaterialStore((s) => s.overrideProperty);
  const properties = useMaterialStore((s) => s.properties[buildingPk]);

  if (!properties) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {isKo ? "설비 데이터를 불러오는 중..." : "Loading systems data..."}
      </div>
    );
  }

  const set = (path: string, value: unknown) =>
    overrideProperty(buildingPk, path, value);

  const hvac = properties.hvac;
  const lighting = properties.lighting;
  const occupancy = properties.occupancy;
  const renewable = properties.renewable;

  const handleReset = () => {
    // Reset HVAC, lighting, occupancy, renewable to code-estimate defaults
    // by re-inferring (simplest: user can reload). For now we just mark source.
    set("hvac.heating.efficiency", 0.85);
    set("hvac.cooling.efficiency", 3.5);
    set("lighting.lightingPowerDensity", 8);
    set("lighting.controlType", "manual");
    set("occupancy.occupancyDensity", 0.06);
    set("renewable.solarPV.area", 0);
    set("renewable.solarPV.installed", false);
  };

  return (
    <div className="space-y-5 p-3">
      {/* ── HVAC ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "냉난방 (HVAC)" : "HVAC"}
        </h4>
        <div className="space-y-3">
          {/* Heating system type */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {isKo ? "난방 방식" : "Heating System"}
              </span>
            </div>
            <Select
              value={hvac.heating.systemType}
              onValueChange={(val) => set("hvac.heating.systemType", val)}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HVAC_SYSTEM_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {isKo ? t.ko : t.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cooling system type */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {isKo ? "냉방 방식" : "Cooling System"}
              </span>
            </div>
            <Select
              value={hvac.cooling.systemType}
              onValueChange={(val) => set("hvac.cooling.systemType", val)}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COOLING_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {isKo ? t.ko : t.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SliderRow
            label={isKo ? "난방 효율" : "Heating Efficiency"}
            value={Math.round(hvac.heating.efficiency * 100)}
            min={60}
            max={98}
            step={1}
            unit="%"
            decimals={0}
            onChange={(val) => set("hvac.heating.efficiency", val / 100)}
          />
          <SliderRow
            label={isKo ? "냉방 COP" : "Cooling COP"}
            value={hvac.cooling.efficiency}
            min={2.0}
            max={6.0}
            step={0.1}
            unit=""
            decimals={1}
            onChange={(val) => set("hvac.cooling.efficiency", val)}
          />
        </div>
      </section>

      {/* ── Lighting ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "조명" : "Lighting"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "조명밀도 (LPD)" : "Lighting Power Density"}
            value={lighting.lightingPowerDensity}
            min={5}
            max={25}
            step={0.5}
            unit="W/m²"
            decimals={1}
            onChange={(val) => set("lighting.lightingPowerDensity", val)}
          />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {isKo ? "제어 방식" : "Control Type"}
              </span>
            </div>
            <Select
              value={lighting.controlType}
              onValueChange={(val) => set("lighting.controlType", val)}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIGHTING_CONTROLS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {isKo ? t.ko : t.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Occupancy ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "재실" : "Occupancy"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "재실 밀도" : "Occupancy Density"}
            value={Math.round(1 / occupancy.occupancyDensity)}
            min={5}
            max={50}
            step={1}
            unit="m²/person"
            decimals={0}
            onChange={(val) => set("occupancy.occupancyDensity", 1 / val)}
          />
        </div>
      </section>

      {/* ── Renewables ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "신재생에너지" : "Renewables"}
        </h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {isKo ? "태양광 유형" : "Solar Type"}
              </span>
            </div>
            <Select
              value={
                !renewable.solarPV.installed
                  ? "none"
                  : renewable.solarPV.panelType === "thin-film"
                    ? "BIPV"
                    : "rooftop-PV"
              }
              onValueChange={(val) => {
                if (val === "none") {
                  set("renewable.solarPV.installed", false);
                  set("renewable.solarPV.area", 0);
                } else {
                  set("renewable.solarPV.installed", true);
                  set(
                    "renewable.solarPV.panelType",
                    val === "BIPV" ? "thin-film" : "monocrystalline"
                  );
                }
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOLAR_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {isKo ? t.ko : t.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SliderRow
            label={isKo ? "태양광 패널 면적" : "Solar Panel Area"}
            value={renewable.solarPV.area}
            min={0}
            max={500}
            step={10}
            unit="m²"
            decimals={0}
            onChange={(val) => {
              set("renewable.solarPV.area", val);
              set("renewable.solarPV.installed", val > 0);
            }}
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
        {isKo ? "기본값 복원" : "Reset to Defaults"}
      </Button>
    </div>
  );
}
