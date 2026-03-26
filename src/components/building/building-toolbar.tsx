"use client";

import Link from "next/link";
import type { BrTitleInfo } from "@/lib/types";
import { useAppStore } from "@/store/app-store";
import { useHydration } from "@/hooks/use-hydration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportDropdown } from "@/components/export/export-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  PanelRightOpen,
  PanelRightClose,
  Globe,
} from "lucide-react";

interface BuildingToolbarProps {
  title: BrTitleInfo | null;
  exportData: Record<string, unknown>[];
  exportFilename: string;
  loading: boolean;
}

export function BuildingToolbar({
  title,
  exportData,
  exportFilename,
  loading,
}: BuildingToolbarProps) {
  const hydrated = useHydration();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const sidePanelOpen = useAppStore((s) => s.sidePanelOpen);
  const toggleSidePanel = useAppStore((s) => s.toggleSidePanel);

  const isKo = language === "ko";
  const displayName = title
    ? title.bldNm || title.platPlcNm || "건물명 없음"
    : null;

  return (
    <div className="flex items-center justify-between h-12 px-3 border-b bg-background/95 backdrop-blur shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">
            {isKo ? "검색" : "Back"}
          </span>
        </Link>

        <div className="h-4 w-px bg-border shrink-0" />

        {loading && !title ? (
          <Skeleton className="h-5 w-32" />
        ) : displayName ? (
          <span className="text-sm font-semibold truncate max-w-[200px] lg:max-w-[400px]">
            {displayName}
          </span>
        ) : null}

        {title?.mainPurpsCdNm && (
          <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">
            {title.mainPurpsCdNm}
          </Badge>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ExportDropdown data={exportData} filename={exportFilename} />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setLanguage(isKo ? "en" : "ko")}
          title={isKo ? "Switch to English" : "한국어로 전환"}
        >
          <Globe className="size-4" />
        </Button>

        {hydrated && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleSidePanel}
            title={
              sidePanelOpen
                ? isKo
                  ? "패널 닫기"
                  : "Close panel"
                : isKo
                  ? "패널 열기"
                  : "Open panel"
            }
          >
            {sidePanelOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
