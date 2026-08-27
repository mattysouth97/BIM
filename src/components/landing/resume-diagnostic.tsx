"use client";

/**
 * "Pick up where you left off."
 *
 * This lived on the second entry screen that has been folded into the landing
 * page. It is real functionality — a saved diagnosis is otherwise only
 * reachable from inside a workspace you would have to start first — so it
 * moves here rather than disappearing with that screen.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  listEnergyDiagnosticsProjects,
  type StoredEnergyDiagnosticsProjectSummary,
} from "@/lib/energy-diagnostics/storage";

export function ResumeDiagnostic({
  locale,
}: Readonly<{ locale: "ko" | "en" }>) {
  const [recent, setRecent] =
    useState<StoredEnergyDiagnosticsProjectSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listEnergyDiagnosticsProjects()
      .then((projects) => {
        if (!cancelled) setRecent(projects[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecent(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!recent) return null;

  return (
    <Link
      href={`/diagnostics/new?method=resume&project=${encodeURIComponent(recent.projectId)}`}
      className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/80 px-3 py-2.5 text-sm backdrop-blur transition-colors hover:border-foreground/40"
      data-testid="resume-recent-diagnostic"
    >
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {locale === "ko" ? "최근 진단" : "Recent diagnostic"}
        </span>
        <span className="mt-0.5 block truncate font-medium">
          {recent.projectName}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold">
        {locale === "ko" ? "계속하기" : "Resume"}
      </span>
    </Link>
  );
}
