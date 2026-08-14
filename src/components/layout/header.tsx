"use client";

import { useState, lazy, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Key, Globe } from "lucide-react";
import { useTheme } from "next-themes";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ApiKeyDialog = lazy(() =>
  import("@/components/settings/api-key-dialog").then((m) => ({ default: m.ApiKeyDialog }))
);

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useAppStore();
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const isHome = pathname === "/";

  // The workspace is a full-viewport instrument. The marketing header
  // steals the first look at the building — hide it on /building/*.
  if (pathname?.startsWith("/building/")) {
    return null;
  }

  const toggleLanguage = () => {
    setLanguage(language === "ko" ? "en" : "ko");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 border-b backdrop-blur supports-[backdrop-filter]:bg-background/60",
          isHome
            ? "lj-header"
            : "bg-background/95",
        )}
      >
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
          <Link href="/" className="flex items-baseline gap-2 no-underline">
            <span className="lj-wordmark">BIMFIT</span>
            <span className="lj-wordmark-sub hidden sm:inline">
              {language === "ko" ? "대장에서 트윈까지" : "Ledger to Twin"}
            </span>
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
