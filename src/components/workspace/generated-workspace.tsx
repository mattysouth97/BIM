"use client";

// src/components/workspace/generated-workspace.tsx
//
// The workspace for a design that came out of the generative engine.
//
// A generated building is a first-class citizen of /building/[id]: same
// toolbar, same WorkspaceShell, same 3D viewport, same docks. What it does NOT
// have is a 건축물대장 row — so unlike LedgerWorkspace this component mounts no
// ledger hook and no VWorld footprint hook, and no /api/bldrgst request is ever
// issued on this branch. The design is rebuilt from its stored spec instead,
// deterministically (`getOrBuildDesign`).
//
// The scene still takes a `BrTitleInfo`, because that is its contract for every
// building. It is given the synthetic title the energy stack already uses
// (`syntheticTitleForGeneratedDesign`), whose seven meaningful fields are
// derived from the SOLVED design and whose remaining fields carry the ledger's
// own "unavailable" markers — "" and 0 — rather than invented plausible ones.
// Its `mgmBldrgstPk` is empty on purpose: no ledger record exists, so the
// consumption and official-grade lookups find nothing and say so. The design's
// own pk (its generationId) reaches the panels through the active-building /
// material / recipe stores, seeded by `publishGeneratedDesign` before the scene
// mounts — the same publication the studio session performs.

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { BuildingToolbar } from "@/components/building/building-toolbar";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import {
  DesignStorageError,
  getOrBuildDesign,
  listDesigns,
  type DesignIndexEntry,
  type LoadedDesign,
} from "@/lib/generative/design-storage";
import { publishGeneratedDesign } from "@/lib/generative/energy/publish-design";
import { syntheticTitleForGeneratedDesign } from "@/lib/generative/energy/seed-from-design";
import { useT } from "@/lib/i18n";
import type { BrTitleInfo } from "@/lib/types";
import { useWorkflowStore } from "@/store/workflow-store";

const BuildingScene = lazy(() =>
  import("@/components/viewer/building-scene").then((m) => ({
    default: m.BuildingScene,
  })),
);

function ViewerSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/30">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Four honest states. "missing" is separate from "failed" because they call for
 * different actions: a design that was never saved in THIS browser is a
 * navigation mistake (here are the ones that were), while a storage failure is
 * a fault the user can neither see nor fix by picking a different design.
 */
type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; design: LoadedDesign; title: BrTitleInfo }
  | { kind: "missing"; saved: DesignIndexEntry[]; listError: string | null }
  | { kind: "failed"; message: string };

/** Rows the export menu writes out — the solved storeys, not a ledger table. */
function exportRows(design: LoadedDesign): Record<string, unknown>[] {
  const usageByFloorNo = new Map(
    design.spec.levels.map((level) => [level.floorNo, level.usage]),
  );
  return design.snapshot.levels.map((level) => ({
    floorNo: level.floorNo,
    name: level.name,
    elevationM: level.elevation,
    heightM: level.height,
    usage: usageByFloorNo.get(level.floorNo) ?? "-",
  }));
}

export function GeneratedWorkspace({ generationId }: { generationId: string }) {
  const { t } = useT();
  // Tagged with the id it describes: a settled load belongs to ONE design, so
  // navigating to another is "loading" by derivation rather than by a
  // synchronous reset inside the effect (which would cascade a render).
  const [settled, setSettled] = useState<{ id: string; state: LoadState } | null>(null);
  const state: LoadState =
    settled && settled.id === generationId ? settled.state : { kind: "loading" };

  // Which pk this workspace last published, so switching designs prunes the
  // previous one exactly as the studio session does.
  const publishedPk = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const setState = (next: LoadState) => setSettled({ id: generationId, state: next });

    (async () => {
      try {
        const design = await getOrBuildDesign(generationId);
        if (cancelled) return;

        if (!design) {
          let saved: DesignIndexEntry[] = [];
          let listError: string | null = null;
          try {
            saved = await listDesigns();
          } catch (error) {
            listError =
              error instanceof Error ? error.message : String(error);
          }
          if (!cancelled) setState({ kind: "missing", saved, listError });
          return;
        }

        // Seed the pk-keyed stores BEFORE the scene and docks mount, so no
        // panel ever renders against the previous building's records.
        const seed = publishGeneratedDesign(design, publishedPk.current);
        publishedPk.current = seed.pk;

        setState({
          kind: "ready",
          design,
          title: syntheticTitleForGeneratedDesign(
            design.spec,
            design.metrics,
            seed.sigunguCd,
          ),
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          kind: "failed",
          message:
            error instanceof DesignStorageError
              ? `${error.message} (${error.code})`
              : error instanceof Error
                ? error.message
                : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [generationId]);

  // A generated design has no search, no CAD upload and no manual-parameter
  // stage — those stages exist for buildings that come from somewhere else.
  // Deep links and stale persisted stages normalize to the twin.
  const stage = useWorkflowStore((s) => s.stage);
  useEffect(() => {
    if (stage !== "twin" && stage !== "report") {
      useWorkflowStore.getState().setStage("twin");
    }
  }, [stage]);

  const design = state.kind === "ready" ? state.design : null;
  const rows = useMemo(() => (design ? exportRows(design) : []), [design]);

  if (state.kind === "loading") {
    return (
      <div className="flex h-dvh flex-col">
        <BuildingToolbar title={null} exportData={[]} exportFilename="design" loading />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {t("설계를 다시 계산하는 중…", "Rebuilding the design…")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <NoticeScreen
        heading={t("설계를 열 수 없습니다.", "This design could not be opened.")}
        body={state.message}
      />
    );
  }

  if (state.kind === "missing") {
    return (
      <NoticeScreen
        heading={t(
          `${generationId} 설계가 이 브라우저에 저장되어 있지 않습니다.`,
          `No design ${generationId} is saved in this browser.`,
        )}
        body={
          state.listError
            ? t(
                `저장된 설계 목록을 읽지 못했습니다: ${state.listError}`,
                `The saved-design list could not be read: ${state.listError}`,
              )
            : t(
                // Storage is per-browser, per-origin. Saying so is the only way
                // a link that works on one machine and not another makes sense.
                "생성된 설계는 이 브라우저에만 저장됩니다. 다른 기기나 브라우저에서 만든 설계는 여기에 없습니다.",
                "Generated designs are saved in this browser only — a design created on another device or browser will not be here.",
              )
        }
      >
        {state.saved.length > 0 ? (
          <div className="mt-4 w-full max-w-md text-left">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("이 브라우저에 저장된 설계", "Saved in this browser")}
            </p>
            <ul className="divide-y rounded-md border">
              {state.saved.map((entry) => (
                <li key={entry.generationId}>
                  <Link
                    href={`/building/${entry.generationId}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span className="truncate">
                      {entry.name ?? entry.generationId}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {entry.generationId}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link
          href="/studio"
          className="mt-4 text-sm text-primary underline underline-offset-4"
        >
          {t("스튜디오에서 새 설계 만들기", "Create a design in the studio")}
        </Link>
      </NoticeScreen>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <BuildingToolbar
        title={state.title}
        exportData={rows}
        exportFilename={`${state.design.generationId}_levels`}
        loading={false}
      />

      <WorkspaceShell>
        <Suspense fallback={<ViewerSkeleton />}>
          <BuildingScene
            title={state.title}
            floors={[]}
            isCompositeLoading={false}
          />
        </Suspense>
      </WorkspaceShell>
    </div>
  );
}

function NoticeScreen({
  heading,
  body,
  children,
}: {
  heading: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <BuildingToolbar
        title={null}
        exportData={[]}
        exportFilename="design"
        loading={false}
      />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-sm font-semibold">{heading}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
        {children}
      </div>
    </div>
  );
}
