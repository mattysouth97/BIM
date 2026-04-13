"use client";

import { useMaterialStore } from "@/store/material-store";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { X, Thermometer, Wind, Sun, Zap } from "lucide-react";

interface MaterialPanelProps {
  buildingPk: string;
  visible: boolean;
  onClose: () => void;
}

export function MaterialPanel({ buildingPk, visible, onClose }: MaterialPanelProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const properties = useMaterialStore((s) => s.properties[buildingPk]);
  const selectedElement = useMaterialStore((s) => s.selectedElement);

  if (!visible || !properties) return null;

  const sourceBadge = (source: string) => {
    const labels: Record<string, { text: string; variant: "default" | "secondary" | "outline" }> = {
      "code-estimate": { text: isKo ? "규정 기반 추정" : "Code Estimate", variant: "secondary" },
      "user-input": { text: isKo ? "사용자 입력" : "User Input", variant: "default" },
      "ifc-import": { text: isKo ? "설계 데이터" : "IFC Import", variant: "outline" },
      "energy-cert": { text: isKo ? "에너지효율등급" : "Energy Cert", variant: "outline" },
    };
    const label = labels[source] || labels["code-estimate"];
    return <Badge variant={label.variant} className="text-[10px]">{label.text}</Badge>;
  };

  return (
    <div className="absolute top-3 left-3 z-20 w-80 max-h-[460px] overflow-y-auto rounded-lg border bg-card/95 backdrop-blur shadow-xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{isKo ? "재료 속성" : "Material Properties"}</span>
        </div>
        <div className="flex items-center gap-2">
          {sourceBadge(properties.source)}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Envelope Summary */}
        <Section icon={<Thermometer className="h-3.5 w-3.5" />} title={isKo ? "외피 성능" : "Envelope"}>
          <Row label={isKo ? "벽체 U-value" : "Wall U-value"} value={`${properties.envelope.walls[0]?.uValue.toFixed(3)} W/(m²·K)`} />
          <Row label={isKo ? "지붕 U-value" : "Roof U-value"} value={`${properties.envelope.roof.uValue.toFixed(3)} W/(m²·K)`} />
          <Row label={isKo ? "바닥 U-value" : "Floor U-value"} value={`${properties.envelope.groundFloor.uValue.toFixed(3)} W/(m²·K)`} />
          <Row label={isKo ? "창호 U-value" : "Window U-value"} value={`${properties.envelope.windows.uValue.toFixed(2)} W/(m²·K)`} />
          <Row label="SHGC" value={properties.envelope.windows.shgc.toFixed(2)} />
          <Row label={isKo ? "유리 타입" : "Glass Type"} value={properties.envelope.windows.glassType} />
          <Row label={isKo ? "기밀성 (ACH₅₀)" : "Airtightness"} value={`${properties.envelope.airtightness.ach50} ACH`} />
        </Section>

        <Separator />

        {/* HVAC */}
        <Section icon={<Wind className="h-3.5 w-3.5" />} title="HVAC">
          <Row label={isKo ? "난방 방식" : "Heating"} value={`${properties.hvac.heating.systemType} (${properties.hvac.heating.fuelType})`} />
          <Row label={isKo ? "난방 효율" : "Heating Eff."} value={`${(properties.hvac.heating.efficiency * 100).toFixed(0)}%`} />
          <Row label={isKo ? "냉방 방식" : "Cooling"} value={properties.hvac.cooling.systemType} />
          <Row label={isKo ? "냉방 효율" : "Cooling COP"} value={properties.hvac.cooling.efficiency.toFixed(1)} />
          <Row label={isKo ? "환기" : "Ventilation"} value={properties.hvac.ventilation.type} />
          {properties.hvac.ventilation.heatRecoveryEfficiency > 0 && (
            <Row label={isKo ? "열회수율" : "Heat Recovery"} value={`${(properties.hvac.ventilation.heatRecoveryEfficiency * 100).toFixed(0)}%`} />
          )}
        </Section>

        <Separator />

        {/* Lighting & Occupancy */}
        <Section icon={<Zap className="h-3.5 w-3.5" />} title={isKo ? "조명/재실" : "Lighting/Occupancy"}>
          <Row label={isKo ? "조명밀도" : "LPD"} value={`${properties.lighting.lightingPowerDensity} W/m²`} />
          <Row label={isKo ? "조명 타입" : "Lamp Type"} value={properties.lighting.lampType} />
          <Row label={isKo ? "재실밀도" : "Occupancy"} value={`${properties.occupancy.occupancyDensity} 인/m²`} />
          <Row label={isKo ? "내부발열" : "Internal Gain"} value={`${properties.occupancy.internalHeatGain} W/m²`} />
        </Section>

        <Separator />

        {/* Renewable */}
        <Section icon={<Sun className="h-3.5 w-3.5" />} title={isKo ? "신재생에너지" : "Renewables"}>
          <Row label={isKo ? "태양광" : "Solar PV"} value={properties.renewable.solarPV.installed ? `${properties.renewable.solarPV.capacity} kWp` : (isKo ? "미설치" : "None")} />
          <Row label={isKo ? "태양열" : "Solar Thermal"} value={properties.renewable.solarThermal.installed ? `${properties.renewable.solarThermal.collectorArea} m²` : (isKo ? "미설치" : "None")} />
          <Row label={isKo ? "지열" : "Geothermal"} value={properties.renewable.geothermal.installed ? `COP ${properties.renewable.geothermal.cop}` : (isKo ? "미설치" : "None")} />
        </Section>

        {/* Code reference */}
        <div className="text-[10px] text-muted-foreground pt-1">
          {isKo ? `기준연도: ${properties.codeYear}년 건축물 에너지절약설계기준` : `Based on ${properties.codeYear} Korean Building Energy Code`}
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
