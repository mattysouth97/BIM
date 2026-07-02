"use client";

import { useMemo, useState } from "react";
import type { BrFloorInfo } from "@/lib/types";
import { formatArea } from "@/lib/constants";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";
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
import { ArrowUpDown } from "lucide-react";

interface FloorBreakdownProps {
  floors: BrFloorInfo[];
  loading: boolean;
}

export function FloorBreakdown({ floors, loading }: FloorBreakdownProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "flrNo", desc: false },
  ]);

  const columns = useMemo<ColumnDef<BrFloorInfo>[]>(
    () => [
      {
        accessorKey: "flrNo",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            층번호 (Floor No)
            <ArrowUpDown className="size-3" />
          </button>
        ),
        cell: ({ row }) => row.original.flrNo,
      },
      {
        accessorKey: "flrNoNm",
        header: "층명 (Floor Name)",
        cell: ({ row }) => row.original.flrNoNm || "-",
      },
      {
        accessorKey: "flrGbCdNm",
        header: "층구분 (Floor Type)",
        cell: ({ row }) => row.original.flrGbCdNm || "-",
      },
      {
        accessorKey: "mainPurpsCdNm",
        header: "용도 (Use)",
        cell: ({ row }) =>
          row.original.mainPurpsCdNm || row.original.etcPurps || "-",
      },
      {
        accessorKey: "area",
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            면적 (Area m²)
            <ArrowUpDown className="size-3" />
          </button>
        ),
        cell: ({ row }) => formatArea(row.original.area),
      },
      {
        accessorKey: "strctCdNm",
        header: "구조 (Structure)",
        cell: ({ row }) => row.original.strctCdNm || "-",
      },
    ],
    [],
  );

  const totalArea = useMemo(
    () => floors.reduce((sum, f) => sum + (f.area || 0), 0),
    [floors],
  );

  const table = useReactTable({
    data: floors,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (floors.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        층별 데이터가 없습니다. (No floor data available.)
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
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
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4} className="font-semibold text-right">
            합계 (Total)
          </TableCell>
          <TableCell className="font-semibold">
            {formatArea(totalArea)}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
