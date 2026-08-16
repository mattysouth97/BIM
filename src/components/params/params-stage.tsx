"use client";

// src/components/params/params-stage.tsx
// P2-24 — 정보 입력: the minimal manual inputs a CAD-first draft needs before
// the twin can render. Everything else (structure, floor height, use type)
// defaults from the era-based recipe and stays editable in the twin stage.

import { useMemo, useState } from "react";
import { ClipboardList, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { useWorkflowStore } from "@/store/workflow-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useCadDraftStore } from "@/store/cad-draft-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import {
  isCadDraftParamsValid,
  type CadDraftParams,
} from "@/lib/workflow/cad-draft";
import regionData from "@/data/region-codes.json";

const SIDO_LIST = regionData.sido as { code: string; name: string }[];
const SIGUNGU_MAP = regionData.sigungu as Record<
  string,
  { code: string; name: string }[]
>;

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ParamsStage() {
  const { t } = useT();
  const buildingPk = useActiveBuildingPk();

  const [floorsRaw, setFloorsRaw] = useState("");
  const [yearRaw, setYearRaw] = useState("");
  const [sido, setSido] = useState("");
  const [sigunguCd, setSigunguCd] = useState("");

  const sigunguOptions = useMemo(() => SIGUNGU_MAP[sido] ?? [], [sido]);

  const params: CadDraftParams = useMemo(
    () => ({
      floors: Number(floorsRaw),
      year: Number(yearRaw),
      sigunguCd,
    }),
    [floorsRaw, yearRaw, sigunguCd]
  );

  const valid = isCadDraftParamsValid(params) && !!buildingPk;

  const setDraftParams = useCadDraftStore((s) => s.setDraftParams);
  const setActiveBuilding = useActiveBuildingStore((s) => s.setActiveBuilding);
  const advance = useWorkflowStore((s) => s.advance);
  const retreat = useWorkflowStore((s) => s.retreat);

  const submit = () => {
    if (!valid) return;
    setDraftParams(buildingPk, params);
    // Region flows into the active-building store so every energy consumer
    // shares the same regional climate (same contract as ledger resolution).
    setActiveBuilding(buildingPk, sigunguCd);
    advance({ mode: "cad-first", cadParams: params });
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-start overflow-auto bg-background p-8">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {t("건물 정보 입력", "Enter Building Info")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "건축물대장 없이 진행하므로 최소 정보만 입력하세요. 층수·연도·지역이 3D 트윈의 형태와 에너지 기후 데이터를 결정하며, 세부 값은 트윈 단계에서 언제든 수정할 수 있습니다.",
              "No building ledger backs this draft, so only the minimum is asked. Floors, year, and region drive the twin's massing and climate data; every detail stays editable in the twin stage.",
            )}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("지상 층수", "Floors above ground")}
            <input
              type="number"
              min={1}
              step={1}
              className={inputClass}
              value={floorsRaw}
              onChange={(e) => setFloorsRaw(e.target.value)}
              data-testid="params-floors"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("준공(허가) 연도", "Completion (permit) year")}
            <input
              type="number"
              min={1800}
              max={2200}
              step={1}
              placeholder="1995"
              className={inputClass}
              value={yearRaw}
              onChange={(e) => setYearRaw(e.target.value)}
              data-testid="params-year"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("시도", "Province / City")}
            <select
              className={inputClass}
              value={sido}
              onChange={(e) => {
                setSido(e.target.value);
                setSigunguCd("");
              }}
              data-testid="params-sido"
            >
              <option value="">{t("선택", "Select")}</option>
              {SIDO_LIST.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("시군구 (기후 데이터 기준)", "District (climate data)")}
            <select
              className={inputClass}
              value={sigunguCd}
              onChange={(e) => setSigunguCd(e.target.value)}
              disabled={!sido}
              data-testid="params-sigungu"
            >
              <option value="">{t("선택", "Select")}</option>
              {sigunguOptions.map((sg) => (
                <option key={sg.code} value={sg.code}>
                  {sg.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => retreat({ mode: "cad-first" })}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("도면으로 돌아가기", "Back to upload")}
          </Button>
          <Button
            type="button"
            disabled={!valid}
            onClick={submit}
            data-testid="params-continue"
          >
            {t("트윈으로 계속", "Continue to Twin")}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
