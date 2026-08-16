"use client";

import { useMaterialStore } from "@/store/material-store";
import { useT } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  X,
  Settings,
  Building2,
  Thermometer,
  Cog,
  Layers,
  BarChart2,
  Wrench,
} from "lucide-react";
import { BuildingTab } from "./config-tabs/building-tab";
import { EnvelopeTab } from "./config-tabs/envelope-tab";
import { SystemsTab } from "./config-tabs/systems-tab";
import { EquipmentTab } from "./config-tabs/equipment-tab";
import { LayersTab } from "./config-tabs/layers-tab";
import { EnergyBreakdownChart } from "./energy-breakdown-chart";

interface ConfigPanelProps {
  buildingPk: string;
  visible: boolean;
  onClose: () => void;
}

const sourceBadgeLabels: Record<
  string,
  { ko: string; en: string; variant: "default" | "secondary" | "outline" }
> = {
  "code-estimate": {
    ko: "규정 기반 추정",
    en: "Code Estimate",
    variant: "secondary",
  },
  "user-input": { ko: "사용자 입력", en: "User Input", variant: "default" },
  "ifc-import": { ko: "설계 데이터", en: "IFC Import", variant: "outline" },
  "energy-cert": {
    ko: "에너지효율등급",
    en: "Energy Cert",
    variant: "outline",
  },
};

export function ConfigPanel({
  buildingPk,
  visible,
  onClose,
}: ConfigPanelProps) {
  const { t } = useT();
  const properties = useMaterialStore((s) => s.properties[buildingPk]);

  if (!visible) return null;

  const sourceBadge = (source: string | undefined) => {
    const label = sourceBadgeLabels[source ?? "code-estimate"] ??
      sourceBadgeLabels["code-estimate"];
    return (
      <Badge variant={label.variant} className="text-[10px]">
        {t(label.ko, label.en)}
      </Badge>
    );
  };

  return (
    <div className="absolute top-3 left-3 z-20 w-96 max-h-[520px] overflow-y-auto rounded-lg border bg-card/95 backdrop-blur shadow-xl">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            {t("설정", "Configuration")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {sourceBadge(properties?.source)}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="p-3">
        <Tabs defaultValue="building">
          <TabsList className="w-full">
            <TabsTrigger value="building" className="gap-1 text-xs">
              <Building2 className="h-3.5 w-3.5" />
              {t("건물", "Building")}
            </TabsTrigger>
            <TabsTrigger value="envelope" className="gap-1 text-xs">
              <Thermometer className="h-3.5 w-3.5" />
              {t("외피", "Envelope")}
            </TabsTrigger>
            <TabsTrigger value="systems" className="gap-1 text-xs">
              <Cog className="h-3.5 w-3.5" />
              {t("설비", "Systems")}
            </TabsTrigger>
            <TabsTrigger value="equipment" className="gap-1 text-xs">
              <Wrench className="h-3.5 w-3.5" />
              {t("장비", "Equipment")}
            </TabsTrigger>
            <TabsTrigger value="layers" className="gap-1 text-xs">
              <Layers className="h-3.5 w-3.5" />
              {t("레이어", "Layers")}
            </TabsTrigger>
            <TabsTrigger value="energy" className="gap-1 text-xs">
              <BarChart2 className="h-3.5 w-3.5" />
              {t("에너지", "Energy")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="building" className="mt-3">
            <BuildingTab buildingPk={buildingPk} />
          </TabsContent>

          <TabsContent value="envelope" className="mt-3">
            <EnvelopeTab buildingPk={buildingPk} />
          </TabsContent>

          <TabsContent value="systems" className="mt-3">
            <SystemsTab buildingPk={buildingPk} />
          </TabsContent>

          <TabsContent value="equipment" className="mt-3">
            <EquipmentTab buildingPk={buildingPk} />
          </TabsContent>

          <TabsContent value="layers" className="mt-3">
            <LayersTab buildingPk={buildingPk} />
          </TabsContent>

          <TabsContent value="energy" className="mt-3">
            <EnergyBreakdownChart buildingPk={buildingPk} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
