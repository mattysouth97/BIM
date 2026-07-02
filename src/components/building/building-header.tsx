"use client";

import type { BrTitleInfo } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface BuildingHeaderProps {
  title: BrTitleInfo | null;
  loading: boolean;
}

export function BuildingHeader({ title, loading }: BuildingHeaderProps) {
  if (loading && !title) {
    return null; // Parent shows skeleton
  }

  if (!title) {
    return (
      <div className="text-muted-foreground text-sm">
        건물 정보를 찾을 수 없습니다. (Building information not found.)
      </div>
    );
  }

  const displayName = title.bldNm || title.platPlcNm || "건물명 없음";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
        {title.mainPurpsCdNm && (
          <Badge variant="default" className="mt-1">
            {title.mainPurpsCdNm}
          </Badge>
        )}
        {title.regstrKindCdNm && (
          <Badge variant="secondary" className="mt-1">
            {title.regstrKindCdNm}
          </Badge>
        )}
      </div>

      <p className="text-muted-foreground">{title.platPlcNm}</p>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {title.strctCdNm && (
          <span>
            <span className="font-medium text-foreground">구조:</span>{" "}
            {title.strctCdNm}
            {title.etcStrct ? ` (${title.etcStrct})` : ""}
          </span>
        )}
        {title.roofCdNm && (
          <span>
            <span className="font-medium text-foreground">지붕:</span>{" "}
            {title.roofCdNm}
          </span>
        )}
        {title.etcPurps && (
          <span>
            <span className="font-medium text-foreground">기타용도:</span>{" "}
            {title.etcPurps}
          </span>
        )}
      </div>
    </div>
  );
}
