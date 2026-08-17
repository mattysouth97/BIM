"use client";

// src/components/lean/lean-studio.tsx
//
// The lean product: one screen, one loop.
//
//   describe / draw / import  →  polygon-true BIM  →  see it  →  energy verdict
//   →  say what to change  →  save.
//
// Everything here is COMPOSED. The session store, the generation client, the
// schematic editor, the import dialog, the plan overlay, the interior layer,
// the energy panel, the issues panel, the command bar and design storage are
// all the existing, tested modules — this file wires them into the shortest
// path through them and mounts nothing else. There is no history tree, no
// options rail, no navigation panel, no review tab, no layer toggles: each of
// those is a real feature of /studio and each of them is a reason someone
// stops before reaching the verdict.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CommandBar } from "@/components/generative/command-bar";
import { EnergyPanel } from "@/components/generative/energy-panel";
import { IssuesPanel } from "@/components/generative/issues-panel";
import { ImportCadDialog } from "@/components/generative/schematic/import-cad-dialog";
import { PlanOverlay } from "@/components/generative/schematic/plan-overlay";
import { SchematicEditor } from "@/components/generative/schematic/schematic-editor";
import {
  GenerationError,
  MAX_REPAIR_ATTEMPTS,
  modifyBuilding,
  repairBuilding,
  type BlueprintGenerationResult,
  type GenerationResult,
  type ModificationScope,
  type StageEvent,
} from "@/lib/generative/client";
import type { LoadedDesign } from "@/lib/generative/design-storage";
import { parseCommand } from "@/lib/generative/session/commands";
import { currentNode } from "@/lib/generative/session/history";
import { STATUS_LABEL } from "@/lib/generative/spec/status";
import { fidelityForDesign, useBlueprintStore } from "@/store/blueprint-store";
import { useGenerativeSession } from "@/store/generative-session-store";

import { LeanPrompt } from "./lean-prompt";
import { LeanSaveMenu } from "./lean-save-menu";
import { LeanModelView } from "./lean-viewport";

/** How this session is started. `null` once a design owns the screen. */
type InputMode = "describe" | "draw" | "import";
type View = "3d" | "2d";
type Notice = { tone: "info" | "error"; text: string };

const WHOLE_BUILDING: ModificationScope = { kind: "building", label: "Whole building" };

const INPUTS: Array<[Exclude<InputMode, "import">, string, string]> = [
  ["describe", "설명으로", "Describe"],
  ["draw", "그리기", "Draw"],
];

/**
 * A design rebuilt from storage was produced by no provider — it is a
 * deterministic replay of a spec. Saying so is more honest than copying the
 * provider summary of whatever generated it originally, which storage
 * deliberately does not keep.
 */
function resultFromLoaded(loaded: LoadedDesign): GenerationResult {
  return {
    success: true,
    spec: loaded.spec,
    recipe: loaded.recipe,
    snapshot: loaded.snapshot,
    metrics: loaded.metrics,
    validation: loaded.validation,
    status: loaded.status,
    approximations: loaded.approximations,
    generationId: loaded.generationId,
    revision: loaded.revision,
    seed: loaded.seed,
    provider: {
      name: "restored",
      model: "deterministic-rebuild",
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      retries: 0,
    },
  };
}

export function LeanStudio() {
  const history = useGenerativeSession((s) => s.history);
  const pending = useGenerativeSession((s) => s.pending);
  const designRules = useGenerativeSession((s) => s.designRules);
  const locks = useGenerativeSession((s) => s.locks);
  const buildingPk = useGenerativeSession((s) => s.buildingPk);

  const node = currentNode(history);
  const design = node?.payload ?? null;
  const nodeId = history.currentId;
  const previousDesign =
    node?.parentId != null ? (history.nodes[node.parentId]?.payload ?? null) : null;

  // A session that already holds a design opens ON it. Landing on the prompt
  // box with a finished building one click away would read as work lost.
  const [inputMode, setInputMode] = useState<InputMode | null>(() =>
    useGenerativeSession.getState().current() ? null : "describe",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useState<View>("3d");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<StageEvent | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fidelityFocus, setFidelityFocus] = useState(0);
  const [repairAttempts, setRepairAttempts] = useState<Record<string, number>>({});
  const abortRef = useRef<AbortController | null>(null);

  // A request whose answer would apply to a building that left the screen must
  // not land.
  useEffect(() => () => abortRef.current?.abort(), []);

  /** The schematic behind this design, and the fidelity measured for it. */
  const lastGenerated = useBlueprintStore((s) => s.lastGenerated);
  const blueprintOfDesign =
    design && lastGenerated?.generationId === design.generationId
      ? lastGenerated.blueprint
      : null;
  const fidelityOfDesign = fidelityForDesign(lastGenerated, design?.generationId ?? null);

  const adopt = useCallback((result: GenerationResult, prompt: string) => {
    useGenerativeSession.getState().startFrom(result, prompt);
    setInputMode(null);
    setNotice(null);
  }, []);

  const adoptBlueprint = useCallback(
    (result: BlueprintGenerationResult, intent: string) => adopt(result, intent),
    [adopt],
  );

  const openInput = useCallback((mode: InputMode) => {
    // The import dialog has no canvas of its own: it adopts a blueprint into the
    // schematic, which is where it then gets generated from.
    setInputMode(mode === "import" ? "draw" : mode);
    setImportOpen(mode === "import");
    setNotice(null);
  }, []);

  const describeError = useCallback((caught: unknown): Notice => {
    if (caught instanceof GenerationError) {
      return {
        tone: "error",
        text:
          caught.code === "NO_CREDENTIALS"
            ? "추론 제공자가 설정되어 있지 않습니다. 서버에 ANTHROPIC_API_KEY를 설정하거나 BIM_REASONING_PROVIDER=heuristic으로 오프라인 실행하세요."
            : `${caught.message} (${caught.code})`,
      };
    }
    if ((caught as Error)?.name === "AbortError") return { tone: "info", text: "취소했습니다." };
    return { tone: "error", text: "문제가 발생했습니다." };
  }, []);

  /** A pending candidate owns the viewport; a second edit would replace it unreviewed. */
  const blockedByPending = useCallback((): boolean => {
    if (!pending) return false;
    setNotice({
      tone: "info",
      text: "제안된 변경을 먼저 적용하거나 취소하세요 — 지금 화면은 그 후보를 보여주고 있습니다.",
    });
    return true;
  }, [pending]);

  const runModify = useCallback(
    async (instruction: string) => {
      if (!design || busy || blockedByPending()) return;
      setBusy(true);
      setStage(null);
      setNotice(null);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await modifyBuilding({
          spec: design.spec,
          instruction,
          scope: WHOLE_BUILDING,
          buildingPk,
          revision: design.revision,
          locks,
          designRules,
          onStage: setStage,
          signal: controller.signal,
        });
        const store = useGenerativeSession.getState();
        if (result.kind === "applied") store.proposeEdit(result, "modify");
        else if (result.kind === "rejected") store.rejectEdit(result);
        else setNotice({ tone: "info", text: result.message });
      } catch (caught) {
        setNotice(describeError(caught));
      } finally {
        setBusy(false);
        setStage(null);
        abortRef.current = null;
      }
    },
    [design, busy, blockedByPending, buildingPk, locks, designRules, describeError],
  );

  const runRepair = useCallback(
    async (codes: string[]) => {
      if (!design || !nodeId || busy || blockedByPending()) return;
      const spent = repairAttempts[nodeId] ?? 0;
      if (spent >= MAX_REPAIR_ATTEMPTS) {
        setNotice({
          tone: "info",
          text: `이 설계는 수정 시도 ${MAX_REPAIR_ATTEMPTS}회를 모두 사용했습니다. 남은 문제는 그대로 표시됩니다.`,
        });
        return;
      }

      setBusy(true);
      setStage(null);
      setNotice(null);
      setRepairAttempts((current) => ({ ...current, [nodeId]: spent + 1 }));
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await repairBuilding({
          spec: design.spec,
          attempt: spent + 1,
          codes,
          buildingPk,
          revision: design.revision,
          locks,
          onStage: setStage,
          signal: controller.signal,
        });
        const store = useGenerativeSession.getState();
        if (result.kind === "applied") store.proposeEdit(result, "repair");
        else if (result.kind === "rejected") store.rejectEdit(result);
        else setNotice({ tone: "info", text: result.message });
      } catch (caught) {
        setNotice(describeError(caught));
      } finally {
        setBusy(false);
        setStage(null);
        abortRef.current = null;
      }
    },
    [design, nodeId, busy, blockedByPending, repairAttempts, buildingPk, locks, describeError],
  );

  const runCommand = useCallback(
    (raw: string) => {
      const command = parseCommand(raw);
      if (!command) return;
      const store = useGenerativeSession.getState();

      switch (command.kind) {
        case "modify":
          void runModify(command.instruction);
          return;
        case "repair":
          void runRepair(command.codes);
          return;
        case "undo":
          if (store.canUndo()) store.undo();
          else setNotice({ tone: "info", text: "되돌릴 작업이 없습니다." });
          return;
        case "redo":
          if (store.canRedo()) store.redo();
          else setNotice({ tone: "info", text: "다시 실행할 작업이 없습니다." });
          return;
        case "error":
          setNotice({ tone: "error", text: command.message });
          return;
        default:
          // Locks, rules, options and explain are real features — of /studio.
          // Claiming them here and doing nothing would be worse than saying so.
          setNotice({
            tone: "info",
            text: "이 명령은 /studio에서 사용할 수 있습니다. 여기서는 일반 문장으로 수정하세요.",
          });
      }
    },
    [runModify, runRepair],
  );

  const store = useGenerativeSession.getState();
  const canUndo = store.canUndo();
  const canRedo = store.canRedo();
  const attemptsSpent = nodeId ? (repairAttempts[nodeId] ?? 0) : 0;

  /* --- the viewport source: the candidate while one is pending (§55) --- */
  const viewDesign = useMemo(() => {
    if (pending) {
      return { recipe: pending.edit.recipe, snapshot: pending.edit.snapshot, spec: pending.edit.spec };
    }
    return design ? { recipe: design.recipe, snapshot: design.snapshot, spec: design.spec } : null;
  }, [pending, design]);

  const showInput = !design || inputMode !== null;

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <span className="shrink-0 text-sm font-semibold tracking-tight">BIMFIT Lean</span>
        {design && (
          <>
            <span className="truncate text-xs text-muted-foreground">
              {design.spec.project.name}
            </span>
            <Badge variant="outline" className="shrink-0 font-mono text-[10px] uppercase">
              {STATUS_LABEL[design.status.level]}
            </Badge>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {INPUTS.map(([mode, ko, en]) => (
            <Button
              key={mode}
              size="xs"
              variant={inputMode === mode ? "secondary" : "ghost"}
              aria-pressed={inputMode === mode}
              onClick={() => openInput(mode)}
              title={en}
            >
              {ko}
            </Button>
          ))}
          <Button size="xs" variant="ghost" onClick={() => openInput("import")} title="Import">
            파일 가져오기
          </Button>

          {design && inputMode !== null && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => setInputMode(null)}
              title="Back to the generated building"
            >
              결과 보기
            </Button>
          )}

          <span className="mx-1 h-4 w-px bg-border" aria-hidden />

          <Button
            size="xs"
            variant="ghost"
            onClick={() => store.undo()}
            disabled={!canUndo}
            aria-label="되돌리기"
            title="Undo"
          >
            ←
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => store.redo()}
            disabled={!canRedo}
            aria-label="다시 실행"
            title="Redo"
          >
            →
          </Button>

          <LeanSaveMenu
            design={design}
            blockedReason={
              pending
                ? "제안된 변경을 먼저 적용하거나 취소하세요 — 저장은 화면의 후보가 아니라 이력의 설계를 씁니다."
                : null
            }
            onLoad={(loaded) => adopt(resultFromLoaded(loaded), loaded.spec.project.name)}
          />
        </div>
      </header>

      {showInput ? (
        <div className="flex min-h-0 flex-1 items-stretch justify-center">
          {inputMode === "draw" ? (
            <SchematicEditor
              buildingPk={buildingPk}
              locks={locks}
              onGenerated={adoptBlueprint}
              designGenerationId={design?.generationId ?? null}
              fidelityFocusToken={fidelityFocus}
            />
          ) : (
            <div className="flex w-full items-center justify-center">
              <LeanPrompt designRules={designRules} onGenerated={adopt} />
            </div>
          )}
          <ImportCadDialog open={importOpen} onOpenChange={setImportOpen} />
        </div>
      ) : (
        design &&
        viewDesign && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <main className="relative min-w-0 flex-[7]">
                <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-1 rounded-md border bg-background/90 p-0.5 shadow-sm">
                  {(
                    [
                      ["3d", "3D"],
                      ["2d", "평면"],
                    ] as Array<[View, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={view === value}
                      onClick={() => setView(value)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] transition-colors",
                        view === value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {view === "3d" ? (
                  <LeanModelView recipe={viewDesign.recipe} snapshot={viewDesign.snapshot} />
                ) : (
                  <PlanOverlay
                    spec={viewDesign.spec}
                    snapshot={viewDesign.snapshot}
                    blueprint={blueprintOfDesign}
                    // A pending candidate is a DIFFERENT building from the one
                    // that was measured, so the badge goes rather than lie.
                    fidelity={pending ? null : fidelityOfDesign}
                    onFocusFidelity={() => {
                      setInputMode("draw");
                      setFidelityFocus((token) => token + 1);
                    }}
                  />
                )}
              </main>

              <aside className="flex w-[30%] min-w-[300px] shrink-0 flex-col overflow-y-auto border-l">
                <EnergyPanel design={design} previous={previousDesign} />
                <div className="border-t">
                  <IssuesPanel
                    validation={design.validation}
                    onRepair={(codes) => void runRepair(codes)}
                    busy={busy}
                    attempt={attemptsSpent}
                    maxAttempts={MAX_REPAIR_ATTEMPTS}
                  />
                </div>
              </aside>
            </div>

            {pending && (
              <div className="flex items-center gap-2 border-t bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800">
                <span className="min-w-0 flex-1 truncate">
                  제안된 변경을 보고 있습니다 — {pending.edit.patch.summary}
                </span>
                <Button size="xs" onClick={() => store.acceptPending()}>
                  적용
                </Button>
                <Button size="xs" variant="outline" onClick={() => store.discardPending()}>
                  취소
                </Button>
              </div>
            )}

            <CommandBar
              onSubmit={runCommand}
              onCancel={() => {
                abortRef.current?.abort();
                abortRef.current = null;
              }}
              busy={busy}
              stage={stage}
              scope={null}
              onClearScope={() => {}}
              lockCount={locks.length}
              ruleCount={designRules.length}
              notice={notice}
              onDismissNotice={() => setNotice(null)}
            />
          </div>
        )
      )}
    </div>
  );
}
