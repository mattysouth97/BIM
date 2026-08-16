"use client";

import { useCallback, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useMaterialStore } from "@/store/material-store";
import { useTwinProvenanceStore } from "@/store/twin-provenance-store";
import {
  parseEquipmentSchedule,
  scheduleToMaterialPatches,
} from "@/lib/energy/equipment-schedule";
import { Button } from "@/components/ui/button";

interface EquipmentScheduleIngestProps {
  buildingPk: string;
}

export function EquipmentScheduleIngest({ buildingPk }: EquipmentScheduleIngestProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const overrideProperty = useMaterialStore((s) => s.overrideProperty);
  const patch = useTwinProvenanceStore((s) => s.patch);
  const hasSchedule = useTwinProvenanceStore(
    (s) => !!s.byPk[buildingPk]?.hasEquipmentSchedule,
  );
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const apply = useCallback(() => {
    const parsed = parseEquipmentSchedule(text);
    if (parsed.rows.length === 0) {
      setMessage(
        isKo
          ? `행을 읽지 못했습니다. ${parsed.warnings.join(" · ")}`
          : `No rows parsed. ${parsed.warnings.join(" · ")}`,
      );
      return;
    }
    const { paths } = scheduleToMaterialPatches(parsed.rows);
    for (const p of paths) {
      overrideProperty(buildingPk, p.path, p.value);
    }
    patch(buildingPk, { hasEquipmentSchedule: true });
    setMessage(
      isKo
        ? `${parsed.rows.length}행을 반영했습니다. 등급이 다시 계산됩니다.`
        : `Applied ${parsed.rows.length} row(s). Grade will recompute.`,
    );
  }, [text, buildingPk, overrideProperty, patch, isKo]);

  return (
    <div className="space-y-1.5 px-3 py-2" data-testid="equipment-schedule-ingest">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {isKo ? "설비 일정" : "Equipment schedule"}
      </p>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {isKo
          ? "CSV: 종류,용량,연도,연료,효율 — 예: 난방,200,2014,가스,0.92"
          : "CSV: type,capacity,year,fuel,efficiency — e.g. heating,200,2014,gas,0.92"}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full rounded-md border bg-background px-2 py-1 text-[11px] font-mono"
        placeholder={isKo ? "종류,용량,연도,연료,효율" : "type,capacity,year,fuel,efficiency"}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-7 text-[11px]"
          onClick={apply}
          disabled={!text.trim()}
        >
          {isKo ? "반영" : "Apply"}
        </Button>
        {hasSchedule && (
          <span className="text-[10px] text-cyan-700">{isKo ? "일정 있음" : "Schedule on"}</span>
        )}
      </div>
      {message && <p className="text-[10px] text-muted-foreground">{message}</p>}
    </div>
  );
}
