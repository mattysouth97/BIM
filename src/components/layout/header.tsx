"use client";

import { useState, lazy, Suspense } from "react";
import Link from "next/link";
import { Building2, Sun, Moon, Key, Globe } from "lucide-react";
import { useTheme } from "next-themes";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";

const ApiKeyDialog = lazy(() =>
  import("@/components/settings/api-key-dialog").then((m) => ({ default: m.ApiKeyDialog }))
);

export function Header() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useAppStore();
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);

  const toggleLanguage = () => {
    setLanguage(language === "ko" ? "en" : "ko");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
          {/* P2-03: logo is a real next/link to home */}
          <Link href="/" className="flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="홈으로 / Home">
            <Building2 className="h-6 w-6 text-primary" />
            <div className="flex items-baseline gap-1.5">
              <h1 className="text-lg font-bold tracking-tight">건축물대장</h1>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Building Ledger
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              title={language === "ko" ? "Switch to English" : "한국어로 전환"}
            >
              <Globe className="mr-1 h-4 w-4" />
              {language === "ko" ? "KO" : "EN"}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              // P1-07 (g): `relative` anchors the absolutely-positioned Moon
              // icon to this button (the shared button base has no `relative`).
              className="relative"
              onClick={toggleTheme}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setApiKeyDialogOpen(true)}
              title="API Key Settings"
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
