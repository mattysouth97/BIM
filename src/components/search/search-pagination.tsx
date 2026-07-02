"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface SearchPaginationProps {
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  onPageChange: (page: number) => void;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function SearchPagination({
  totalCount,
  pageNo,
  numOfRows,
  onPageChange,
}: SearchPaginationProps) {
  const language = useAppStore((s) => s.language);
  const isKo = language === "ko";

  const totalPages = Math.max(1, Math.ceil(totalCount / numOfRows));
  const start = (pageNo - 1) * numOfRows + 1;
  const end = Math.min(pageNo * numOfRows, totalCount);

  if (totalCount === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card px-6 py-3 shadow-sm">
      {/* Result count */}
      <p className="text-sm text-muted-foreground">
        {isKo
          ? `총 ${totalCount.toLocaleString()}건 중 ${start.toLocaleString()}-${end.toLocaleString()}건`
          : `Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${totalCount.toLocaleString()} results`}
      </p>

      {/* Page controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pageNo <= 1}
          onClick={() => onPageChange(pageNo - 1)}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          {isKo ? "이전" : "Prev"}
        </Button>

        <span className="min-w-[4rem] text-center text-sm font-medium tabular-nums">
          {pageNo} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={pageNo >= totalPages}
          onClick={() => onPageChange(pageNo + 1)}
          className="gap-1"
        >
          {isKo ? "다음" : "Next"}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
