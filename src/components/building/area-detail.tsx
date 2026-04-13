"use client";

import { useMemo } from "react";
import type { BrAreaInfo } from "@/lib/types";
import { formatArea } from "@/lib/constants";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface AreaDetailProps {
  areas: BrAreaInfo[];
  loading: boolean;
}

export function AreaDetail({ areas, loading }: AreaDetailProps) {
  const totalArea = useMemo(
    () => areas.reduce((sum, a) => sum + (a.area || 0), 0),
    [areas],
  );

  const exclusiveTotal = useMemo(
    () =>
      areas
        .filter((a) => a.exposPubuseGbCd === "1")
        .reduce((sum, a) => sum + (a.area || 0), 0),
    [areas],
  );

  const commonTotal = useMemo(
    () =>
      areas
        .filter((a) => a.exposPubuseGbCd === "2")
        .reduce((sum, a) => sum + (a.area || 0), 0),
    [areas],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (areas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        면적 데이터가 없습니다. (No area data available.)
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>구분 (Area Type)</TableHead>
            <TableHead>층 (Floor)</TableHead>
            <TableHead>용도 (Use)</TableHead>
            <TableHead>면적 (Area m²)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {areas.map((area, idx) => (
            <TableRow key={`${area.mgmBldrgstPk}-${area.flrNo}-${area.exposPubuseGbCd}-${idx}`}>
              <TableCell>
                <span
                  className={
                    area.exposPubuseGbCd === "1"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-green-600 dark:text-green-400"
                  }
                >
                  {area.exposPubuseGbCdNm || (area.exposPubuseGbCd === "1" ? "전유" : "공용")}
                </span>
              </TableCell>
              <TableCell>{area.flrNoNm || area.flrNo || "-"}</TableCell>
              <TableCell>{area.mainPurpsCdNm || "-"}</TableCell>
              <TableCell>{formatArea(area.area)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">
              전유 (Exclusive)
            </TableCell>
            <TableCell colSpan={2} />
            <TableCell className="font-semibold">
              {formatArea(exclusiveTotal)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-semibold">
              공용 (Common)
            </TableCell>
            <TableCell colSpan={2} />
            <TableCell className="font-semibold">
              {formatArea(commonTotal)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-semibold">
              합계 (Total)
            </TableCell>
            <TableCell colSpan={2} />
            <TableCell className="font-semibold">
              {formatArea(totalArea)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
