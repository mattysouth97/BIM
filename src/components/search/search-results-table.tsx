"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { encodeBuildingId, formatArea, formatDate, USE_CODES } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { ArrowUpDown, FileSearch } from "lucide-react";
import { scoreDataQuality } from "@/lib/data-quality/quality-scorer";
import type { QualityTier } from "@/lib/data-quality/quality-types";
import type { BrTitleInfo } from "@/lib/types";

interface SearchResultsTableProps {
  data: BrTitleInfo[];
  isLoading?: boolean;
}

const ROW_HEIGHT = 48;

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-6 py-4">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="p-2">
        <div className="flex gap-2 border-b px-2 py-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="flex gap-2 border-b px-2 py-3 last:border-0">
            {Array.from({ length: 8 }).map((_, col) => (
              <Skeleton key={col} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SearchResultsTable({ data, isLoading }: SearchResultsTableProps) {
  const router = useRouter();
  const language = useAppStore((s) => s.language);
  const isKo = language === "ko";
  const [sorting, setSorting] = useState<SortingState>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const columns = useMemo<ColumnDef<BrTitleInfo>[]>(
    () => [
      {
        accessorKey: "bldNm",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {isKo ? "건물명" : "Name"}
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.bldNm || (isKo ? "(미등록)" : "(Unnamed)")}
          </span>
        ),
      },
      {
        accessorKey: "platPlcNm",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {isKo ? "주소" : "Address"}
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="max-w-[200px] truncate block" title={row.original.platPlcNm}>
            {row.original.platPlcNm || "-"}
          </span>
        ),
      },
      {
        accessorKey: "mainPurpsCdNm",
        header: () => (isKo ? "용도" : "Use"),
        cell: ({ row }) => {
          const code = row.original.mainPurpsCd;
          const useInfo = USE_CODES[code];
          const label = row.original.mainPurpsCdNm || useInfo?.ko || "-";
          return (
            <Badge variant="secondary" className="text-xs font-normal">
              {label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "strctCdNm",
        header: () => (isKo ? "구조" : "Structure"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.strctCdNm || row.original.etcStrct || "-"}
          </span>
        ),
      },
      {
        id: "floors",
        header: () => (isKo ? "층수" : "Floors"),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.grndFlrCnt ?? 0}F / B{row.original.ugrndFlrCnt ?? 0}
          </span>
        ),
        sortingFn: (rowA, rowB) =>
          (rowA.original.grndFlrCnt ?? 0) - (rowB.original.grndFlrCnt ?? 0),
      },
      {
        accessorKey: "totArea",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {isKo ? "연면적" : "Area"}
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{formatArea(row.original.totArea)}</span>
        ),
      },
      {
        accessorKey: "useAprDay",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {isKo ? "승인일" : "Approved"}
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums text-sm text-muted-foreground">
            {formatDate(row.original.useAprDay)}
          </span>
        ),
      },
      {
        id: "dataQuality",
        header: () => (isKo ? "데이터 품질" : "Data Quality"),
        cell: ({ row }) => {
          const score = scoreDataQuality(row.original);
          const tier: QualityTier = score.tier;

          const badgeClass: Record<QualityTier, string> = {
            minimal: "bg-gray-100 text-gray-600 border-gray-200",
            partial: "bg-yellow-100 text-yellow-700 border-yellow-200",
            good: "bg-blue-100 text-blue-700 border-blue-200",
            excellent: "bg-green-100 text-green-700 border-green-200",
          };

          const tierLabel: Record<QualityTier, string> = {
            minimal: isKo ? "최소" : "Minimal",
            partial: isKo ? "부분" : "Partial",
            good: isKo ? "양호" : "Good",
            excellent: isKo ? "우수" : "Excellent",
          };

          const dims = score.dimensions;
          const allAvailable = [
            ...dims.geometry.available,
            ...dims.codes.available,
            ...dims.energy.available,
            ...dims.material.available,
          ];
          const allMissing = [
            ...dims.geometry.missing,
            ...dims.codes.missing,
            ...dims.energy.missing,
            ...dims.material.missing,
          ];

          const tooltipLines: string[] = [
            `${isKo ? "점수" : "Score"}: ${score.overall}%`,
          ];
          if (allAvailable.length > 0) {
            tooltipLines.push(
              `${isKo ? "있음" : "Available"}: ${allAvailable.join(", ")}`,
            );
          }
          if (allMissing.length > 0) {
            tooltipLines.push(
              `${isKo ? "없음" : "Missing"}: ${allMissing.join(", ")}`,
            );
          }

          return (
            <Badge
              variant="outline"
              className={`text-xs font-normal ${badgeClass[tier]}`}
              title={tooltipLines.join("\n")}
            >
              {tierLabel[tier]}
            </Badge>
          );
        },
      },
    ],
    [isKo],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (isLoading) return <TableSkeleton />;

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-16 text-center shadow-sm">
        <FileSearch className="h-12 w-12 text-muted-foreground/40" />
        <div>
          <p className="font-medium text-muted-foreground">
            {isKo ? "검색 결과가 없습니다" : "No results found"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {isKo
              ? "검색 조건을 변경하여 다시 시도해 주세요."
              : "Try adjusting your search criteria and search again."}
          </p>
        </div>
      </div>
    );
  }

  const handleRowClick = (row: BrTitleInfo) => {
    const id = encodeBuildingId(
      row.sigunguCd,
      row.bjdongCd,
      row.platGbCd,
      row.bun,
      row.ji,
    );
    router.push(`/building/${id}`);
  };

  // Use virtualization only when rows exceed threshold
  const useVirtual = rows.length > 30;

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div
        ref={scrollRef}
        className={useVirtual ? "max-h-[600px] overflow-auto" : ""}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {useVirtual ? (
              <>
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0, padding: 0 }}
                    />
                  </tr>
                )}
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer transition-colors hover:bg-muted/70"
                      onClick={() => handleRowClick(row.original)}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{
                        height:
                          virtualizer.getTotalSize() -
                          (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                        padding: 0,
                      }}
                    />
                  </tr>
                )}
              </>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer transition-colors hover:bg-muted/70"
                  onClick={() => handleRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
