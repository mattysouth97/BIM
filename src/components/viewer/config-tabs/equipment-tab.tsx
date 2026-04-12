"use client";

import { useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import { useEquipmentStore } from "@/store/equipment-store";
import { SliderRow } from "./slider-row";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCcw } from "lucide-react";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "@/lib/layers/mep-equipment-params";

interface EquipmentTabProps {
  buildingPk: string;
}

const VRF_LOCATIONS = [
  { value: "roof", ko: "옥상", en: "Roof" },
  { value: "perimeter", ko: "외주부", en: "Perimeter" },
] as const;

/** Styled native checkbox row consistent with the panel's xs text/muted pattern */
function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-primary"
      />
      <span className="text-muted-foreground">{label}</span>
    </label>
  );
}

export function EquipmentTab({ buildingPk }: EquipmentTabProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  // Subscribe to params record directly (stable reference); fall back to module-level default.
  // DO NOT call s.getParams(buildingPk) — it creates a new object via JSON.parse every render,
  // triggering React's "getSnapshot should be cached" warning and infinite-loop risk.
  const params =
    useEquipmentStore((s) => s.params[buildingPk]) ?? DEFAULT_MEP_EQUIPMENT_PARAMS;
  const overrideParam = useEquipmentStore((s) => s.overrideParam);
  const setParams = useEquipmentStore((s) => s.setParams);

  const set = useCallback(
    (path: string, value: unknown) => overrideParam(buildingPk, path, value),
    [buildingPk, overrideParam]
  );

  const handleReset = useCallback(
    () =>
      setParams(
        buildingPk,
        JSON.parse(JSON.stringify(DEFAULT_MEP_EQUIPMENT_PARAMS))
      ),
    [buildingPk, setParams]
  );

  /** Validator: lighting fixture height < 0.08 m may be invisible at distance */
  const validateFixtureHeight = useCallback(
    (v: number) =>
      v < 0.08
        ? isKo
          ? "조명이 너무 얇아 보이지 않을 수 있음"
          : "Fixture may be invisible at distance"
        : null,
    [isKo]
  );

  const { chiller, boiler, ahu, dhw, lightingFixture, electricalPanel } =
    params;

  return (
    <div className="space-y-5 p-3">
      {/* ── Section 1: Chiller (냉동기) ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "냉동기 (Chiller)" : "Chiller"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "본체 폭" : "Body Width"}
            value={chiller.bodyWidth}
            min={1.0}
            max={4.0}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("chiller.bodyWidth", val)}
          />
          <SliderRow
            label={isKo ? "본체 깊이" : "Body Depth"}
            value={chiller.bodyDepth}
            min={0.8}
            max={3.0}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("chiller.bodyDepth", val)}
          />
          <SliderRow
            label={isKo ? "본체 높이" : "Body Height"}
            value={chiller.bodyHeight}
            min={1.0}
            max={2.5}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("chiller.bodyHeight", val)}
          />
          <SliderRow
            label={isKo ? "배관 반경" : "Pipe Stub Radius"}
            value={chiller.pipeStubRadius}
            min={0.05}
            max={0.25}
            step={0.01}
            unit="m"
            decimals={2}
            onChange={(val) => set("chiller.pipeStubRadius", val)}
          />
          <CheckboxRow
            label={isKo ? "냉각탑 표시" : "Show Cooling Tower"}
            checked={chiller.showCoolingTower}
            onChange={(v) => set("chiller.showCoolingTower", v)}
          />
        </div>
      </section>

      {/* ── Section 2: Boiler (보일러) ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "보일러 (Boiler)" : "Boiler"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "반경" : "Radius"}
            value={boiler.radius}
            min={0.3}
            max={1.0}
            step={0.05}
            unit="m"
            decimals={2}
            onChange={(val) => set("boiler.radius", val)}
          />
          <SliderRow
            label={isKo ? "높이" : "Height"}
            value={boiler.height}
            min={1.0}
            max={3.0}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("boiler.height", val)}
          />
          <SliderRow
            label={isKo ? "연통 높이" : "Flue Height"}
            value={boiler.flueHeight}
            min={0.4}
            max={1.5}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("boiler.flueHeight", val)}
          />
          <SliderRow
            label={isKo ? "VRF 실외기 / 층" : "VRF Heads / Floor"}
            value={boiler.vrfHeadsPerFloor}
            min={1}
            max={4}
            step={1}
            unit=""
            decimals={0}
            onChange={(val) => set("boiler.vrfHeadsPerFloor", val)}
          />
          <CheckboxRow
            label={isKo ? "VRF 실외기 표시" : "Show VRF Outdoor Units"}
            checked={boiler.vrfHeads}
            onChange={(v) => set("boiler.vrfHeads", v)}
          />
          {/* VRF location select */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {isKo ? "VRF 위치" : "VRF Location"}
              </span>
            </div>
            <Select
              value={boiler.vrfLocation}
              onValueChange={(val) => set("boiler.vrfLocation", val)}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VRF_LOCATIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {isKo ? t.ko : t.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Section 3: AHU (공기조화기) ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "공기조화기 (AHU)" : "Air Handling Unit (AHU)"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "폭" : "Width"}
            value={ahu.width}
            min={0.8}
            max={2.0}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("ahu.width", val)}
          />
          <SliderRow
            label={isKo ? "높이" : "Height"}
            value={ahu.height}
            min={0.5}
            max={1.5}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("ahu.height", val)}
          />
          <SliderRow
            label={isKo ? "깊이" : "Depth"}
            value={ahu.depth}
            min={0.5}
            max={1.5}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("ahu.depth", val)}
          />
          <SliderRow
            label={isKo ? "층당 대수" : "Units per Floor"}
            value={ahu.unitsPerFloor}
            min={1}
            max={4}
            step={1}
            unit=""
            decimals={0}
            onChange={(val) => set("ahu.unitsPerFloor", val)}
          />
          <CheckboxRow
            label={isKo ? "덕트 스텁 표시" : "Show Duct Stubs"}
            checked={ahu.showDuctStubs}
            onChange={(v) => set("ahu.showDuctStubs", v)}
          />
          <CheckboxRow
            label={isKo ? "팬 페이스 표시" : "Show Fan Face"}
            checked={ahu.showFanFace}
            onChange={(v) => set("ahu.showFanFace", v)}
          />
        </div>
      </section>

      {/* ── Section 4: DHW (급탕 시스템) ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "급탕 시스템 (DHW)" : "Domestic Hot Water (DHW)"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "탱크 반경" : "Tank Radius"}
            value={dhw.tankRadius}
            min={0.3}
            max={1.0}
            step={0.05}
            unit="m"
            decimals={2}
            onChange={(val) => set("dhw.tankRadius", val)}
          />
          <SliderRow
            label={isKo ? "탱크 높이" : "Tank Height"}
            value={dhw.tankHeight}
            min={1.0}
            max={3.0}
            step={0.1}
            unit="m"
            decimals={1}
            onChange={(val) => set("dhw.tankHeight", val)}
          />
          <CheckboxRow
            label={isKo ? "펌프 표시" : "Show Pump"}
            checked={dhw.showPump}
            onChange={(v) => set("dhw.showPump", v)}
          />
          <CheckboxRow
            label={isKo ? "단열 자켓" : "Insulation Jacket"}
            checked={dhw.showInsulationJacket}
            onChange={(v) => set("dhw.showInsulationJacket", v)}
          />
        </div>
      </section>

      {/* ── Section 5: Lighting Fixture (조명기구) ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "조명기구 (Lighting Fixture)" : "Lighting Fixture"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "폭" : "Width"}
            value={lightingFixture.width}
            min={0.3}
            max={1.2}
            step={0.05}
            unit="m"
            decimals={2}
            onChange={(val) => set("lightingFixture.width", val)}
          />
          <SliderRow
            label={isKo ? "깊이" : "Depth"}
            value={lightingFixture.depth}
            min={0.2}
            max={0.8}
            step={0.05}
            unit="m"
            decimals={2}
            onChange={(val) => set("lightingFixture.depth", val)}
          />
          <SliderRow
            label={isKo ? "두께" : "Height"}
            value={lightingFixture.height}
            min={0.05}
            max={0.3}
            step={0.01}
            unit="m"
            decimals={2}
            validate={validateFixtureHeight}
            onChange={(val) => set("lightingFixture.height", val)}
          />
          <CheckboxRow
            label={isKo ? "디퓨저 면 표시" : "Show Diffuser Face"}
            checked={lightingFixture.showDiffuserFace}
            onChange={(v) => set("lightingFixture.showDiffuserFace", v)}
          />
        </div>
      </section>

      {/* ── Section 6: Electrical Panel (분전반) ── */}
      <section>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isKo ? "분전반 (Electrical Panel)" : "Electrical Panel"}
        </h4>
        <div className="space-y-3">
          <SliderRow
            label={isKo ? "폭" : "Width"}
            value={electricalPanel.width}
            min={0.3}
            max={1.0}
            step={0.05}
            unit="m"
            decimals={2}
            onChange={(val) => set("electricalPanel.width", val)}
          />
          <SliderRow
            label={isKo ? "높이" : "Height"}
            value={electricalPanel.height}
            min={0.4}
            max={1.5}
            step={0.05}
            unit="m"
            decimals={2}
            onChange={(val) => set("electricalPanel.height", val)}
          />
          <SliderRow
            label={isKo ? "깊이" : "Depth"}
            value={electricalPanel.depth}
            min={0.1}
            max={0.4}
            step={0.02}
            unit="m"
            decimals={2}
            onChange={(val) => set("electricalPanel.depth", val)}
          />
          <CheckboxRow
            label={isKo ? "도어 외곽선 표시" : "Show Door Outline"}
            checked={electricalPanel.showDoorOutline}
            onChange={(v) => set("electricalPanel.showDoorOutline", v)}
          />
          <CheckboxRow
            label={isKo ? "차단기 격자 표시" : "Show Breaker Grid"}
            checked={electricalPanel.showBreakerGrid}
            onChange={(v) => set("electricalPanel.showBreakerGrid", v)}
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
