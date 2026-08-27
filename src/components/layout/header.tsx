"use client";

import { useState, lazy, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Sun, Moon, Key, Globe, Plus } from "lucide-react";
import { useTheme } from "next-themes";
import { useHydration } from "@/hooks/use-hydration";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";

const ApiKeyDialog = lazy(() =>
  import("@/components/settings/api-key-dialog").then((m) => ({ default: m.ApiKeyDialog }))
);

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const hydrated = useHydration();
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);

  // The workspace is a full-viewport instrument. The marketing header
  // steals the first look at the building — hide it on /building/*.
  if (pathname?.startsWith("/building/")) {
    return null;
  }

  const isLanding = pathname === "/";
  const isDark = hydrated && theme === "dark";

  const newDiagnosticLabel =
    language === "ko" ? "새 에너지 진단" : "New Energy Diagnostic";
  const languageLabel =
    language === "ko" ? "Switch to English" : "한국어로 전환";
  const themeLabel =
    language === "ko"
      ? isDark
        ? "라이트 모드"
        : "다크 모드"
      : isDark
        ? "Light mode"
        : "Dark mode";
  const apiKeyLabel =
    language === "ko" ? "API 키 설정" : "API key settings";

  const toggleLanguage = () => {
    setLanguage(language === "ko" ? "en" : "ko");
  };

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <>
      <header
        className={`sticky top-0 z-50 border-b bg-background/95 backdrop-blur ${isLanding ? "landing-app-header" : ""}`}
      >
        <div className="flex h-12 w-full items-center justify-between gap-2 px-3 sm:px-4">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 rounded-md no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={language === "ko" ? "BIMFIT 홈" : "BIMFIT home"}
          >
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
              <Box aria-hidden="true" className="size-3.5" />
            </span>
            <span className="text-sm font-bold tracking-[-0.02em]">BIMFIT</span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />
            <span className="hidden truncate text-[10px] font-medium text-muted-foreground sm:inline">
              {language === "ko" ? "건물 에너지 진단" : "Building Energy Diagnostic"}
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="outline" size="sm" className="h-8 px-2 shadow-xs sm:px-3">
              <Link
                href="/"
                data-testid="header-new-diagnostic"
                aria-label={newDiagnosticLabel}
                aria-current={pathname?.startsWith("/diagnostics") ? "page" : undefined}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{newDiagnosticLabel}</span>
                <span aria-hidden className="sm:hidden">
                  {language === "ko" ? "새 진단" : "New"}
                </span>
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={toggleLanguage}
              title={languageLabel}
              aria-label={languageLabel}
            >
              <Globe className="mr-1 h-4 w-4" />
              {language === "ko" ? "KO" : "EN"}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              // P1-07 (g): `relative` anchors the absolutely-positioned Moon
              // icon to this button (the shared button base has no `relative`).
              className="relative size-8"
              onClick={toggleTheme}
              title={themeLabel}
              aria-label={themeLabel}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setApiKeyDialogOpen(true)}
              title={apiKeyLabel}
              aria-label={apiKeyLabel}
            >
              <Key className="h-4 w-4" />
              <span className="sr-only">API Key settings</span>
            </Button>
          </div>
        </div>
      </header>

      {apiKeyDialogOpen && (
        <Suspense fallback={null}>
          <ApiKeyDialog
            open={apiKeyDialogOpen}
            onOpenChange={setApiKeyDialogOpen}
          />
        </Suspense>
      )}
    </>
  );
}
