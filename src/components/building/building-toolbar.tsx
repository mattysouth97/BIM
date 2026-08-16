"use client";

import Link from "next/link";
import type { BrTitleInfo } from "@/lib/types";
import { DEMO_BUILDING_PK, DRAWING_BUILDING_PK } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { useT } from "@/lib/i18n";
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
  const { t, lang } = useT();
  const setLanguage = useAppStore((s) => s.setLanguage);
  const sidePanelOpen = useAppStore((s) => s.sidePanelOpen);
  const toggleSidePanel = useAppStore((s) => s.toggleSidePanel);

  const isKo = lang === "ko";
  const isDemo = title?.mgmBldrgstPk === DEMO_BUILDING_PK;
  const isDrawing = title?.mgmBldrgstPk === DRAWING_BUILDING_PK;
  const displayName = title
    ? title.bldNm || title.platPlcNm || "건물명 없음"
    : null;

  return (
    <div className="flex items-center justify-between h-12 px-3 border-b bg-background/95 backdrop-blur shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">
            {t("검색", "Back")}
          </span>
        </Link>

        <div className="h-4 w-px bg-border shrink-0" />

        {loading && !title ? (
          <Skeleton className="h-5 w-32" />
        ) : displayName ? (
          <span
            className="text-sm font-semibold truncate min-w-0 flex-1"
            title={displayName}
          >
            {displayName}
          </span>
        ) : null}

        {isDemo && (
          <Badge
            variant="outline"
            className="text-[10px] shrink-0 border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            {isKo ? "데모 데이터" : "Demo data"}
          </Badge>
        )}
        {isDrawing && (
          <Badge
            variant="outline"
            className="text-[10px] shrink-0 border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300"
          >
            {isKo ? "도면" : "Drawing"}
          </Badge>
        )}

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
          onClick={() => setLanguage(lang === "ko" ? "en" : "ko")}
          title={t("Switch to English", "한국어로 전환")}
        >
          <Globe className="size-4" />
        </Button>

        {hydrated && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleSidePanel}
            title={sidePanelOpen ? t("패널 닫기", "Close panel") : t("패널 열기", "Open panel")}
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
