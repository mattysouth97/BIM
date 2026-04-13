"use client";

import type { BrTitleInfo } from "@/lib/types";
import { formatArea, formatDate, formatPercent } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  Maximize2,
  Square,
  Map,
  Percent,
  BarChart3,
  ArrowUpFromLine,
  Calendar,
  FileCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface BuildingOverviewProps {
  title: BrTitleInfo | null;
  loading: boolean;
}

interface StatItem {
  icon: LucideIcon;
  label: string;
  labelEn: string;
  value: string;
}

export function BuildingOverview({ title, loading }: BuildingOverviewProps) {
  const stats: StatItem[] = title
    ? [
        {
          icon: Layers,
          label: "층수",
          labelEn: "Floors",
          value: `지상 ${title.grndFlrCnt}층 / 지하 ${title.ugrndFlrCnt}층`,
        },
        {
          icon: Maximize2,
          label: "연면적",
          labelEn: "Total Area",
          value: formatArea(title.totArea),
        },
        {
          icon: Square,
          label: "건축면적",
          labelEn: "Building Area",
          value: formatArea(title.archArea),
        },
        {
          icon: Map,
          label: "대지면적",
          labelEn: "Site Area",
          value: formatArea(title.platArea),
        },
        {
          icon: Percent,
          label: "건폐율",
          labelEn: "Coverage Ratio",
          value: formatPercent(title.bcRat),
        },
        {
          icon: BarChart3,
          label: "용적률",
          labelEn: "Floor Area Ratio",
          value: formatPercent(title.vlRat),
        },
        {
          icon: ArrowUpFromLine,
          label: "높이",
          labelEn: "Height",
          value: Number(title.heit) > 0 ? `${title.heit} m` : "-",
        },
        {
          icon: Calendar,
          label: "사용승인일",
          labelEn: "Approval Date",
          value: formatDate(title.useAprDay),
        },
        {
          icon: FileCheck,
          label: "허가일",
          labelEn: "Permit Date",
          value: formatDate(title.pmsDay),
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i} className="py-4">
            <CardContent className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-md" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!title) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.labelEn} className="py-4">
            <CardContent className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {stat.label}{" "}
                  <span className="text-[10px]">({stat.labelEn})</span>
                </p>
                <p className="text-sm font-semibold truncate">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
