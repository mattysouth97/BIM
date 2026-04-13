"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileJson, Copy } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv, exportToJson, copyBimJson } from "@/lib/export";

interface ExportDropdownProps {
  data: Record<string, unknown>[];
  filename: string;
}

export function ExportDropdown({ data, filename }: ExportDropdownProps) {
  const handleCsvExport = () => {
    try {
      exportToCsv(data, filename);
      toast.success("CSV 파일이 다운로드되었습니다. (CSV exported)");
    } catch {
      toast.error("CSV 내보내기에 실패했습니다. (CSV export failed)");
    }
  };

  const handleJsonExport = () => {
    try {
      exportToJson(data, filename);
      toast.success("JSON 파일이 다운로드되었습니다. (JSON exported)");
    } catch {
      toast.error("JSON 내보내기에 실패했습니다. (JSON export failed)");
    }
  };

  const handleCopyBimJson = async () => {
    const success = await copyBimJson(data);
    if (success) {
      toast.success(
        "BIM JSON이 클립보드에 복사되었습니다. (BIM JSON copied to clipboard)",
      );
    } else {
      toast.error(
        "클립보드 복사에 실패했습니다. (Failed to copy to clipboard)",
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="size-4" />
          내보내기 (Export)
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCsvExport}>
          <FileSpreadsheet className="size-4" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleJsonExport}>
          <FileJson className="size-4" />
          Export JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyBimJson}>
          <Copy className="size-4" />
          Copy BIM JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
