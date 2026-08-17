"use client";

// src/components/generative/generative-studio.tsx
//
// The generative workspace: intent in, building out, model dominant.
//
// The 3D view is the primary interface (brief §61, §117). Everything else is
// arranged around it — semantic navigation and locks on the left, the model in
// the middle, evidence on the right, and one command surface along the bottom.
// There is no chat transcript anywhere: the building is the conversation.
//
// This component owns the async work — generate, modify, repair, explain,
// options — because they share one cancellation token and one busy state. What
// they produce goes into the session store, which owns the history tree. A
// proposed change is PREVIEWED in the viewport and only enters history when the
// user accepts it (§55).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

import { ProceduralBuildingModel } from "@/components/viewer/procedural-building-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  GenerationError,
  MAX_REPAIR_ATTEMPTS,
  evaluateBuilding,
  generateBuilding,
  modifyBuilding,
  repairBuilding,
  type BlueprintGenerationResult,
  type EvaluationResult,
  type GenerationResult,
  type ModificationScope,
  type StageEvent,
} from "@/lib/generative/client";
import { parseCommand } from "@/lib/generative/session/commands";
import { SYSTEM_LABEL, parseLock } from "@/lib/generative/session/locks";
import { buildNavigationTree, isolationFloors } from "@/lib/generative/session/navigation";
import { sliceRecipeToFloors } from "@/lib/generative/session/recipe-view";
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  currentNode,
  flatten,
} from "@/lib/generative/session/history";
import { STATUS_LABEL } from "@/lib/generative/spec/status";
import { useBlueprintStore } from "@/store/blueprint-store";
import { useGenerativeSession, type DesignOption } from "@/store/generative-session-store";

import { PlanOverlay } from "./schematic/plan-overlay";
import { SchematicEditor } from "./schematic/schematic-editor";
import { CommandBar } from "./command-bar";
import { DiffPreview, RejectionNotice } from "./diff-preview";
import { GeneratePanel } from "./generate-panel";
import { HistoryPanel } from "./history-panel";
import { IssuesPanel } from "./issues-panel";
import { NavigationPanel } from "./navigation-panel";
import { OptionsPanel } from "./options-panel";
import { ReviewPanel } from "./review-panel";
import { SummaryPanel } from "./summary-panel";

type BusyKind = "modify" | "repair" | "explain" | "options";
type Notice = { tone: "info" | "error"; text: string };

/** How a session is started: from a sentence, or from a drawn schematic. */
type StartMode = "describe" | "draw";
/** What occupies the main area once a design exists. */
type Viewport = "model" | "plan" | "schematic";

const OPTION_LABELS = ["Option A", "Option B", "Option C", "Option D"];
/** Prime stride: adjacent option seeds must not land in the same neighbourhood. */
const SEED_STRIDE = 7_919;
const SEED_MAX = 2_147_483_647;

/**
 * Module-scope so the reference never changes. R3F treats the `camera` prop as
 * live state — rebuilding the object on every render (a notice, a busy flag)
 * would snap the camera back and fight OrbitControls. `CameraRig` does the real
 * framing on the first frame and whenever the building's size changes.
 */
const CAMERA_DEFAULTS = {
  position: [60, 40, 60] as [number, number, number],
  fov: 45,
  near: 0.5,
  far: 20_000,
};

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reframes only when the building's size genuinely changed, or when the user
 * asks. Refitting on every edit would yank the view away from whatever the
 * architect was looking at; never refitting would leave a building that grew
 * six storeys halfway out of frame.
 */
function CameraRig({
  span,
  height,
  fitToken,
}: {
  span: number;
  height: number;
  fitToken: number;
}) {
  const camera = useThree((state) => state.camera);
  // drei registers the default controls in an effect, so this is null on the
  // first commit and populated on the next — the rig handles both.
  const controls = useThree((state) => state.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const last = useRef({ span: 0, token: -1 });

  useEffect(() => {
    const previous = last.current;
    const resized =
      previous.span === 0 ||
      Math.abs(span - previous.span) / Math.max(previous.span, 1e-6) > 0.15;
    if (!resized && previous.token === fitToken) return;

    camera.position.set(span * 1.4, height * 1.1 + span * 0.5, span * 1.4);
    if (camera instanceof THREE.PerspectiveCamera) {
      // Mutating the three.js camera is how R3F works — same convention as
      // `SceneSetup` in building-scene.tsx.
      // eslint-disable-next-line react-hooks/immutability
      camera.far = Math.max(2_000, span * 20);
      camera.updateProjectionMatrix();
    }

    if (controls) {
      controls.target.set(0, height / 2, 0);
      controls.update();
      // Only record the fit once the orbit target was actually set; otherwise
      // the pass that runs before controls exist would count as done and the
      // view would stay pointed at the origin.
      last.current = { span, token: fitToken };
    } else {
      camera.lookAt(0, height / 2, 0);
    }
  }, [span, height, fitToken, camera, controls]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */

export function GenerativeStudio() {
  const history = useGenerativeSession((s) => s.history);
  const locks = useGenerativeSession((s) => s.locks);
  const designRules = useGenerativeSession((s) => s.designRules);
  const selection = useGenerativeSession((s) => s.selection);
  const isolate = useGenerativeSession((s) => s.isolate);
  const pending = useGenerativeSession((s) => s.pending);
  const lastRejection = useGenerativeSession((s) => s.lastRejection);
  const options = useGenerativeSession((s) => s.options);
  const optionPrompt = useGenerativeSession((s) => s.optionPrompt);
  const sourcePrompt = useGenerativeSession((s) => s.sourcePrompt);
  const buildingPk = useGenerativeSession((s) => s.buildingPk);

  const node = currentNode(history);
  const design = node?.payload ?? null;
  const nodeId = history.currentId;

  const [busy, setBusy] = useState<BusyKind | null>(null);
  const [stage, setStage] = useState<StageEvent | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tab, setTab] = useState("summary");
  const [fitToken, setFitToken] = useState(0);
  const [review, setReview] = useState<{ nodeId: string; result: EvaluationResult } | null>(
    null,
  );
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [repairAttempts, setRepairAttempts] = useState<Record<string, number>>({});
  const [startMode, setStartMode] = useState<StartMode>("describe");
  const [viewport, setViewport] = useState<Viewport>("model");
  const abortRef = useRef<AbortController | null>(null);

  /** The schematic behind the current design, when it came from one. */
  const lastGeneratedBlueprint = useBlueprintStore((s) => s.lastGenerated);
  const blueprintOfDesign =
    design && lastGeneratedBlueprint?.generationId === design.generationId
      ? lastGeneratedBlueprint.blueprint
      : null;

  /**
   * A schematic generation is adopted exactly as a prompt generation is — one
   * history root, one session. The prose intent (if any) becomes the session
   * brief; without one, the session honestly has no brief to vary into options.
   */
  const adoptBlueprintResult = useCallback(
    (result: BlueprintGenerationResult, intent: string) => {
      useGenerativeSession.getState().startFrom(result, intent);
      setViewport("plan");
    },
    [],
  );

  /* --- viewport source: the candidate while one is pending (§55) --- */
  const viewRecipe = pending ? pending.edit.recipe : (design?.recipe ?? null);
  const isolatedFloors = isolate ? isolationFloors(selection?.scope ?? null) : null;
  const displayRecipe = useMemo(
    () => (viewRecipe ? sliceRecipeToFloors(viewRecipe, isolatedFloors) : null),
    [viewRecipe, isolatedFloors],
  );

  const navTree = useMemo(
    () => (design ? buildNavigationTree(design.snapshot) : null),
    [design],
  );

  const rows = useMemo(() => flatten(history), [history]);
  const canUndo = historyCanUndo(history);
  const canRedo = historyCanRedo(history);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Abandoning a design mid-request would leave the response applying to a
  // building that is no longer on screen.
  useEffect(() => () => abortRef.current?.abort(), []);

  const describeError = useCallback((caught: unknown): Notice => {
    if (caught instanceof GenerationError) {
      return {
        tone: "error",
        text:
          caught.code === "NO_CREDENTIALS"
            ? "No reasoning provider is configured. Set ANTHROPIC_API_KEY on the server, or BIM_REASONING_PROVIDER=heuristic to work offline."
            : `${caught.message} (${caught.code})`,
      };
    }
    if ((caught as Error)?.name === "AbortError") {
      return { tone: "info", text: "Cancelled." };
    }
    return { tone: "error", text: "Something went wrong." };
  }, []);

  /* --- operations --- */

  /**
   * A pending change owns the viewport, and `proposeEdit` replaces whatever is
   * pending. Without this guard a second instruction silently discards a diff
   * the user never reviewed — which the banner already promises will not happen.
   */
  const blockedByPending = useCallback((): boolean => {
    if (!pending) return false;
    setNotice({
      tone: "info",
      text: "Apply or discard the proposed change first — the viewport is showing it, and a new edit would replace it unreviewed.",
    });
    return true;
  }, [pending]);

  const runModify = useCallback(
    async (instruction: string) => {
      if (!design || busy || blockedByPending()) return;
      const scope: ModificationScope = selection?.scope ?? {
        kind: "building",
        label: "Whole building",
      };

      setBusy("modify");
      setStage(null);
      setNotice(null);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await modifyBuilding({
          spec: design.spec,
          instruction,
          scope,
          buildingPk,
          revision: design.revision,
          locks,
          designRules,
          onStage: setStage,
          signal: controller.signal,
        });

        const store = useGenerativeSession.getState();
        if (result.kind === "applied") {
          store.proposeEdit(result, "modify");
        } else if (result.kind === "rejected") {
          store.rejectEdit(result);
        } else {
          setNotice({ tone: "info", text: result.message });
        }
      } catch (caught) {
        setNotice(describeError(caught));
      } finally {
        setBusy(null);
        setStage(null);
        abortRef.current = null;
      }
    },
    [design, busy, blockedByPending, selection, buildingPk, locks, designRules, describeError],
  );

  const runRepair = useCallback(
    async (codes: string[]) => {
      if (!design || !nodeId || busy || blockedByPending()) return;

      const spent = repairAttempts[nodeId] ?? 0;
      if (spent >= MAX_REPAIR_ATTEMPTS) {
        setNotice({
          tone: "info",
          text: `This design has used all ${MAX_REPAIR_ATTEMPTS} repair attempts. The remaining issues are shown as they are.`,
        });
        return;
      }

      setBusy("repair");
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
        if (result.kind === "applied") {
          store.proposeEdit(result, "repair");
          setTab("summary");
        } else if (result.kind === "rejected") {
          store.rejectEdit(result);
        } else {
          setNotice({ tone: "info", text: result.message });
        }
      } catch (caught) {
        setNotice(describeError(caught));
      } finally {
        setBusy(null);
        setStage(null);
        abortRef.current = null;
      }
    },
    [design, nodeId, busy, blockedByPending, repairAttempts, buildingPk, locks, describeError],
  );

  const runExplain = useCallback(async () => {
    if (!design || !nodeId || busy) return;

    setBusy("explain");
    setStage(null);
    setReviewError(null);
    setTab("explain");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await evaluateBuilding({
        spec: design.spec,
        buildingPk,
        revision: design.revision,
        locks,
        signal: controller.signal,
      });
      setReview({ nodeId, result });
    } catch (caught) {
      const described = describeError(caught);
      setReviewError(described.text);
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }, [design, nodeId, busy, buildingPk, locks, describeError]);

  const runOptions = useCallback(
    async (count: number) => {
      if (!design || busy) return;
      if (!sourcePrompt) {
        setNotice({
          tone: "error",
          text: "Design options are generated from the original brief, which this session does not have.",
        });
        return;
      }

      const store = useGenerativeSession.getState();
      const drafts: DesignOption[] = Array.from({ length: count }, (_, index) => ({
        id: `opt-${Date.now()}-${index}`,
        label: OPTION_LABELS[index] ?? `Option ${index + 1}`,
        seed: (design.seed + (index + 1) * SEED_STRIDE) % SEED_MAX,
        state: "running",
      }));

      store.beginOptions(sourcePrompt, drafts);
      setBusy("options");
      setStage(null);
      setNotice({
        tone: "info",
        text: `Generating ${count} alternatives from the original brief. Each one is a full generation.`,
      });
      setTab("options");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await Promise.all(
          drafts.map(async (draft) => {
            try {
              const result: GenerationResult = await generateBuilding({
                prompt: sourcePrompt,
                seed: draft.seed,
                buildingPk,
                designRules,
                locks,
                signal: controller.signal,
              });
              useGenerativeSession
                .getState()
                .settleOption(draft.id, { state: "ready", result });
            } catch (caught) {
              // One option failing must not take the comparison down with it.
              useGenerativeSession.getState().settleOption(draft.id, {
                state: "failed",
                error: describeError(caught).text,
              });
            }
          }),
        );
      } finally {
        setBusy(null);
        setStage(null);
        abortRef.current = null;
      }
    },
    [design, busy, sourcePrompt, buildingPk, designRules, locks, describeError],
  );

  /* --- command dispatch --- */

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
        case "explain":
          void runExplain();
          return;
        case "options":
          void runOptions(command.count);
          return;
        case "lock":
          if (!store.locks.includes(command.token)) store.toggleLock(command.token);
          setNotice({
            tone: "info",
            text: `${command.label} is locked. Edits to it will be rejected until you release it.`,
          });
          return;
        case "unlock":
          if (store.locks.includes(command.token)) store.toggleLock(command.token);
          setNotice({ tone: "info", text: `${command.label} released.` });
          return;
        case "clear-locks":
          store.clearLocks();
          setNotice({ tone: "info", text: "All locks released." });
          return;
        case "rule":
          store.addDesignRule(command.text);
          setNotice({
            tone: "info",
            text: "Rule added. Every generation and edit from here on honours it.",
          });
          setTab("summary");
          return;
        case "undo":
          if (canUndo) store.undo();
          else setNotice({ tone: "info", text: "Nothing to undo." });
          return;
        case "redo":
          if (canRedo) store.redo();
          else setNotice({ tone: "info", text: "Nothing to redo." });
          return;
        case "error":
          setNotice({ tone: "error", text: command.message });
          return;
      }
    },
    [runModify, runRepair, runExplain, runOptions, canUndo, canRedo],
  );

  /* --- empty state --- */

  if (!design || !displayRecipe || !navTree) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-center gap-1 border-b px-3 py-2">
          {(
            [
              ["describe", "Describe a building"],
              ["draw", "Draw schematic"],
            ] as Array<[StartMode, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={startMode === value}
              onClick={() => setStartMode(value)}
              className={cn(
                "rounded border px-3 py-1 text-xs transition-colors",
                startMode === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 items-stretch justify-center">
          {startMode === "describe" ? (
            <div className="flex w-full items-center justify-center">
              <GeneratePanel
                designRules={designRules}
                onGenerated={(result, prompt) =>
                  useGenerativeSession.getState().startFrom(result, prompt)
                }
              />
            </div>
          ) : (
            <SchematicEditor
              buildingPk={buildingPk}
              locks={locks}
              onGenerated={adoptBlueprintResult}
            />
          )}
        </div>
      </div>
    );
  }

  const span = Math.max(displayRecipe.footprintWidth, displayRecipe.footprintDepth);
  const store = useGenerativeSession.getState();
  const attemptsSpent = nodeId ? (repairAttempts[nodeId] ?? 0) : 0;

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <h1 className="truncate text-sm font-medium">{design.spec.project.name}</h1>
        <Badge variant="outline" className="shrink-0 font-mono text-[10px] uppercase">
          {STATUS_LABEL[design.status.level]}
        </Badge>
        {pending && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            previewing proposed change
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => store.undo()}
            disabled={!canUndo}
            title="Undo — step back through the design history"
          >
            ←
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => store.redo()}
            disabled={!canRedo}
            title="Redo"
          >
            →
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setFitToken((t) => t + 1)}>
            Fit
          </Button>
          <Button size="xs" variant="outline" onClick={() => store.reset()}>
            New building
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[260px] shrink-0 border-r lg:block">
          <NavigationPanel
            tree={navTree}
            selectedId={selection?.navId ?? null}
            onSelect={(navNode) => store.select(navNode.id, navNode.scope)}
            locks={locks}
            onToggleLock={(token) => store.toggleLock(token)}
            onClearLocks={() => store.clearLocks()}
            isolate={isolate}
            onIsolateChange={(value) => store.setIsolate(value)}
            canIsolate={Boolean(isolationFloors(selection?.scope ?? null))}
          />
        </aside>

        <main className="relative min-w-0 flex-1">
          {/* One building, three ways of looking at it. The plan is where the
              solved rooms are visible at all; the schematic is where the
              drawing that produced them can be revised and regenerated. */}
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-1 rounded-md border bg-background/90 p-0.5 shadow-sm">
            {(
              [
                ["model", "3D"],
                ["plan", "Plan"],
                ["schematic", "Schematic"],
              ] as Array<[Viewport, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={viewport === value}
                onClick={() => setViewport(value)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  viewport === value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {viewport === "model" && (
            <Canvas shadows dpr={[1, 2]} camera={CAMERA_DEFAULTS}>
              <color attach="background" args={["#f5f5f5"]} />
              <hemisphereLight args={["#b1e1ff", "#b97a20", 0.6]} />
              <directionalLight
                castShadow
                position={[span, span * 1.5, span * 0.75]}
                intensity={2}
              />
              <Suspense fallback={null}>
                {/* No ledger geometry exists for a generated building — the recipe
                    alone drives the renderer. */}
                <ProceduralBuildingModel recipeOverride={displayRecipe} />
                <Environment preset="city" background={false} />
              </Suspense>
              <OrbitControls
                makeDefault
                target={[0, displayRecipe.totalHeight / 2, 0]}
                maxPolarAngle={Math.PI / 2.05}
              />
              <CameraRig
                span={span}
                height={displayRecipe.totalHeight}
                fitToken={fitToken}
              />
            </Canvas>
          )}

          {viewport === "plan" && (
            <PlanOverlay
              // The pending candidate owns the viewport, exactly as it does in 3D.
              spec={pending ? pending.edit.spec : design.spec}
              snapshot={pending ? pending.edit.snapshot : design.snapshot}
              blueprint={blueprintOfDesign}
            />
          )}

          {viewport === "schematic" && (
            <SchematicEditor
              buildingPk={buildingPk}
              locks={locks}
              onGenerated={adoptBlueprintResult}
            />
          )}

          {isolatedFloors && viewport === "model" && (
            <div className="pointer-events-none absolute left-4 top-4">
              <Badge variant="secondary" className="text-[11px]">
                Isolated: {selection?.scope.label}
              </Badge>
            </div>
          )}

          <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-2">
            {pending && design && (
              <DiffPreview
                pending={pending}
                before={
                  history.nodes[pending.baseNodeId]?.payload ?? design
                }
                onAccept={() => store.acceptPending()}
                onDiscard={() => store.discardPending()}
              />
            )}
            {!pending && lastRejection && (
              <RejectionNotice
                rejected={lastRejection}
                onDismiss={() => store.clearRejection()}
              />
            )}
          </div>
        </main>

        <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden border-l">
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <TabsList className="w-full justify-start rounded-none border-b px-2">
              <TabsTrigger value="summary" className="text-xs">
                Summary
              </TabsTrigger>
              <TabsTrigger value="issues" className="text-xs">
                Issues
                {design.validation.counts.critical > 0 && (
                  <span className="ml-1 text-destructive">
                    {design.validation.counts.critical}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="explain" className="text-xs">
                Explain
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs">
                History
                <span className="ml-1 text-muted-foreground">{rows.length}</span>
              </TabsTrigger>
              <TabsTrigger value="options" className="text-xs">
                Options
                {options.length > 0 && (
                  <span className="ml-1 text-muted-foreground">{options.length}</span>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <TabsContent value="summary" className="m-0">
                <SummaryPanel
                  design={design}
                  designRules={designRules}
                  onAddRule={(rule) => store.addDesignRule(rule)}
                  onRemoveRule={(rule) => store.removeDesignRule(rule)}
                />
              </TabsContent>

              <TabsContent value="issues" className="m-0">
                <IssuesPanel
                  validation={design.validation}
                  onRepair={(codes) => void runRepair(codes)}
                  busy={busy !== null}
                  attempt={attemptsSpent}
                  maxAttempts={MAX_REPAIR_ATTEMPTS}
                />
              </TabsContent>

              <TabsContent value="explain" className="m-0">
                <ReviewPanel
                  review={review?.result ?? null}
                  busy={busy === "explain"}
                  error={reviewError}
                  onRun={() => void runExplain()}
                  stale={Boolean(review && review.nodeId !== nodeId)}
                />
              </TabsContent>

              <TabsContent value="history" className="m-0">
                <HistoryPanel
                  rows={rows}
                  currentId={nodeId}
                  onGoTo={(id) => store.goTo(id)}
                  onUndo={() => store.undo()}
                  onRedo={() => store.redo()}
                  canUndo={canUndo}
                  canRedo={canRedo}
                />
              </TabsContent>

              <TabsContent value="options" className="m-0">
                {options.length === 0 ? (
                  <div className="flex flex-col gap-3 p-3">
                    <p className="text-xs text-muted-foreground">
                      Generate alternatives from the original brief and compare them
                      side by side. Each option is a full generation with a different
                      seed.
                    </p>
                    <div className="flex gap-2">
                      {[2, 3, 4].map((count) => (
                        <Button
                          key={count}
                          size="sm"
                          variant="outline"
                          disabled={busy !== null || !sourcePrompt}
                          onClick={() => void runOptions(count)}
                        >
                          {count} options
                        </Button>
                      ))}
                    </div>
                    {!sourcePrompt && (
                      <p className="text-[11px] text-muted-foreground">
                        Unavailable: this session has no original brief to vary.
                      </p>
                    )}
                  </div>
                ) : (
                  <OptionsPanel
                    options={options}
                    prompt={optionPrompt}
                    onAdopt={(id) => {
                      store.adoptOption(id);
                      setTab("summary");
                    }}
                    onDismiss={() => store.clearOptions()}
                  />
                )}
              </TabsContent>
            </div>
          </Tabs>

          {locks.length > 0 && (
            <div className="border-t px-3 py-1.5">
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                locked:{" "}
                {locks
                  .map((token) => {
                    const lock = parseLock(token);
                    return lock?.kind === "system"
                      ? SYSTEM_LABEL[lock.system]
                      : lock?.kind === "level"
                        ? `L${lock.floorNo}`
                        : token;
                  })
                  .join(", ")}
              </p>
            </div>
          )}
        </aside>
      </div>

      <CommandBar
        onSubmit={runCommand}
        onCancel={cancel}
        busy={busy !== null}
        stage={stage}
        scope={selection?.scope ?? null}
        onClearScope={() => store.clearSelection()}
        lockCount={locks.length}
        ruleCount={designRules.length}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
      />

      {pending && (
        <div
          className={cn(
            "border-t bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-700",
          )}
        >
          The viewport is showing a proposed change. Apply or discard it before making
          another edit.
        </div>
      )}
    </div>
  );
}
