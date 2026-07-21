"use client";

import type { BrTitleInfo, BrRecapTitleInfo, BrFloorInfo } from "@/lib/types";
import { formatArea, formatDate, formatPercent } from "@/lib/constants";
import { copyBimJson } from "@/lib/export";
import { useT } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, FileJson, Building2 } from "lucide-react";
import { toast } from "sonner";

interface BimSummaryCardProps {
  title: BrTitleInfo | null;
  recap: BrRecapTitleInfo | null;
  floors: BrFloorInfo[];
  loading: boolean;
}

function buildBimJson(
  title: BrTitleInfo | null,
  recap: BrRecapTitleInfo | null,
  floors: BrFloorInfo[]
) {
  if (!title) return null;

  return {
    ifcEntity: "IfcBuilding",
    name: title.bldNm || "Unnamed",
    address: title.platPlcNm || "",
    site: {
      siteArea_m2: Number(title.platArea) || 0,
      buildingArea_m2: Number(title.archArea) || 0,
      coverageRatio_pct: Number(title.bcRat) || 0,
      floorAreaRatio_pct: Number(title.vlRat) || 0,
    },
    envelope: {
      use: title.mainPurpsCdNm || "",
      useCode: title.mainPurpsCd || "",
      structure: title.strctCdNm || "",
      structureCode: title.strctCd || "",
      roofType: title.roofCdNm || "",
      height_m: Number(title.heit) || 0,
      totalArea_m2: Number(title.totArea) || 0,
      floorsAboveGround: Number(title.grndFlrCnt) || 0,
      floorsBelowGround: Number(title.ugrndFlrCnt) || 0,
    },
    dates: {
      permit: title.pmsDay || "",
      constructionStart: title.stcnsDay || "",
      approvalOfUse: title.useAprDay || "",
    },
    households: recap ? Number(recap.hhldCnt) || 0 : undefined,
    families: recap ? Number(recap.fmlyCnt) || 0 : undefined,
    buildings: recap ? Number(recap.dongCnt) || 0 : undefined,
    floorSchedule: floors.map((f) => ({
      ifcEntity: "IfcBuildingStorey",
      floorNo: Number(f.flrNo),
      name: f.flrNoNm || `F${f.flrNo}`,
      type: f.flrGbCdNm || "",
      use: f.mainPurpsCdNm || "",
      area_m2: Number(f.area) || 0,
      structure: f.strctCdNm || "",
    })),
    meta: {
      source: "data.go.kr BldRgstService_v2",
      pk: title.mgmBldrgstPk,
      exportedAt: new Date().toISOString(),
    },
  };
}

export function BimSummaryCard({
  title,
  recap,
  floors,
  loading,
}: BimSummaryCardProps) {
  const { t } = useT();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <p>{t("데이터 로딩 중...", "Loading data...")}</p>
      </div>
    );
  }

  if (!title) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <p>{t("건물 데이터가 없습니다.", "No building data available.")}</p>
      </div>
    );
  }

  const bimData = buildBimJson(title, recap, floors);

  const handleCopy = async () => {
    const ok = await copyBimJson(bimData);
    if (ok) {
      toast.success(t("BIM JSON 복사 완료", "BIM JSON copied to clipboard"));
    } else {
      toast.error(t("복사 실패", "Failed to copy"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {t("BIM 요약 데이터", "BIM Summary Data")}
          </h3>
          <Badge variant="outline">IFC-Ready</Badge>
        </div>
        <Button onClick={handleCopy} variant="outline" size="sm" className="gap-2">
          <Copy className="size-4" />
          {t("JSON 복사", "Copy JSON")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Building Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("건물 정보", "Building Info")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("건물명", "Name")} value={title.bldNm || "-"} />
            <Row label={t("주소", "Address")} value={title.platPlcNm || "-"} />
            <Row label={t("용도", "Use")} value={title.mainPurpsCdNm || "-"} />
            <Row label={t("구조", "Structure")} value={title.strctCdNm || "-"} />
            <Row label={t("지붕", "Roof")} value={title.roofCdNm || "-"} />
          </CardContent>
        </Card>

        {/* Envelope */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("규모 정보", "Envelope")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label={t("지상/지하", "Floors")}
              value={`${title.grndFlrCnt}F / B${title.ugrndFlrCnt}`}
            />
            <Row label={t("높이", "Height")} value={Number(title.heit) > 0 ? `${title.heit}m` : "-"} />
            <Row label={t("연면적", "Total Area")} value={formatArea(title.totArea)} />
            <Row label={t("건축면적", "Building Area")} value={formatArea(title.archArea)} />
            <Row label={t("대지면적", "Site Area")} value={formatArea(title.platArea)} />
            <Row label={t("건폐율", "Coverage")} value={formatPercent(title.bcRat)} />
            <Row label={t("용적률", "FAR")} value={formatPercent(title.vlRat)} />
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("주요 일자", "Key Dates")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("허가일", "Permit")} value={formatDate(title.pmsDay)} />
            <Row label={t("착공일", "Construction")} value={formatDate(title.stcnsDay)} />
            <Row label={t("사용승인일", "Approval")} value={formatDate(title.useAprDay)} />
          </CardContent>
        </Card>

        {/* Floor Schedule Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("층별 요약", "Floor Schedule")}{" "}
              <span className="text-xs font-normal">
                ({floors.length} {t("개 층", "floors")})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {floors.length === 0 ? (
              <p className="text-muted-foreground">
                {t("층별 데이터 없음", "No floor data")}
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {floors.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded px-2 py-1 text-xs even:bg-muted/50"
                  >
                    <span className="font-medium">{f.flrNoNm || `${f.flrNo}F`}</span>
                    <span className="text-muted-foreground">
                      {f.mainPurpsCdNm || "-"}
                    </span>
                    <span>{formatArea(f.area)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Raw JSON Preview */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <FileJson className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            {t("IFC 생성용 JSON", "JSON for IFC Generation")}
          </span>
        </div>
        <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/50 p-4 text-xs leading-relaxed">
          {JSON.stringify(bimData, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
