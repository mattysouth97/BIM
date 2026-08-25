"use client";

import { useEffect, useMemo } from "react";

import { BuildingScene } from "@/components/viewer/building-scene";
import type { EnvelopeAnalysis } from "@/components/viewer/envelope-layer";
import type { CompiledDegreeDayInput } from "@/lib/energy-diagnostics/adapter";
import {
  canonicalModelToViewerBridge,
  recipeAtViewerOrigin,
} from "@/lib/energy-diagnostics/viewer-bridge";
import {
  computeEnvelopeShares,
  computeOrientationWwr,
} from "@/lib/layers/analysis/envelope-overlay";
import {
  buildEnergyZonesFromSpatialResults,
  type SpatialZoneEnergyResult,
} from "@/lib/layers/analysis/zone-overlay";
import { useBimModelStore } from "@/store/bim-model-store";
import { useLayerStore } from "@/store/layer-store";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useSelectionStore } from "@/store/selection-store";

import type { EnergyDiagnosisSceneContext } from "./types";
import { deriveDiagnosticSpatialTarget } from "./diagnostic-spatial-target";
import type {
  DiagnosticSpatialPrecision,
  DiagnosticSpatialTarget,
} from "@/components/viewer/diagnostic-selection-types";

function spatialSelectionMessage(
  target: DiagnosticSpatialTarget,
  locale: EnergyDiagnosisSceneContext["locale"],
): string {
  const count = target.patches.length;
  const messages: Record<
    DiagnosticSpatialPrecision,
    Record<EnergyDiagnosisSceneContext["locale"], string>
  > = {
    exact_surface: {
      en: `${count} source-linked surface${count === 1 ? "" : "s"} highlighted · camera focused`,
      ko: `도면 근거와 연결된 표면 ${count}개 강조 · 카메라 초점 이동`,
    },
    host_surface: {
      en: "Known host surface highlighted · exact opening position is not available",
      ko: "확인된 개구부 호스트 표면 강조 · 정확한 개구부 위치 정보는 없음",
    },
    category: {
      en: `${target.fallbackObjectIds.length} related envelope categor${target.fallbackObjectIds.length === 1 ? "y" : "ies"} highlighted · component geometry unavailable`,
      ko: `관련 외피 범주 ${target.fallbackObjectIds.length}개 강조 · 개별 구성요소 형상 정보는 없음`,
    },
    building: {
      en: "Building-wide finding · whole envelope highlighted and framed",
      ko: "건물 전체 소견 · 외피 전체 강조 및 화면 맞춤",
    },
  };
  return messages[target.precision][locale];
}

function asCompiledInput(
  context: EnergyDiagnosisSceneContext,
): CompiledDegreeDayInput | null {
  const run = context.activeRun;
  if (!run || run.engineInput.engineId !== "bimfit-degree-day") return null;
  return run.engineInput as CompiledDegreeDayInput;
}

/**
 * Binds the source-traceable model to BIMFIT's existing scene and stores.
 * The canonical model remains authoritative; these stores are a render bridge
 * and are re-hydrated whenever the reviewed model or active scenario changes.
 */
export function EnergyDiagnosisScene({
  context,
}: Readonly<{ context: EnergyDiagnosisSceneContext }>) {
  const bridge = useMemo(
    () => canonicalModelToViewerBridge(context.model),
    [context.model],
  );
  const compiled = useMemo(() => asCompiledInput(context), [context]);
  const displayRecipe = useMemo(
    () =>
      compiled
        ? recipeAtViewerOrigin(compiled.payload.recipe, bridge.displayOrigin)
        : bridge.recipe,
    [bridge.displayOrigin, bridge.recipe, compiled],
  );
  const diagnosticSpatialTarget = useMemo(
    () => deriveDiagnosticSpatialTarget(context.model, bridge, context.selected),
    [bridge, context.model, context.selected],
  );
  const zoneAnalysis = useMemo(() => {
    if (!context.spatialResults) return null;
    const results = context.spatialResults.zones.flatMap((result) => {
      if (
        result.unit !== "kWh/year" ||
        result.metric === "design_heat_loss"
      ) {
        return [];
      }
      return [
        {
          canonicalObjectId: result.canonicalObjectId,
          metric: result.metric,
          value: result.value,
          unit: result.unit,
          status: result.status,
          sourceFactIds: result.sourceFactIds,
          explanation: result.explanation,
        } satisfies SpatialZoneEnergyResult,
      ];
    });
    return buildEnergyZonesFromSpatialResults(bridge.snapshot, results);
  }, [bridge.snapshot, context.spatialResults]);
  const envelopeAnalysis = useMemo<EnvelopeAnalysis | null>(() => {
    const output = context.activeRun?.engineOutput;
    if (!compiled || !output) return null;
    const heatLossElements = output.heatLoss.elements;
    const shares = computeEnvelopeShares(heatLossElements);
    const wwr = compiled.payload.materials.envelope.windows.windowToWallRatio;
    const spatialResults = [
      ...(context.spatialResults?.envelope ?? []),
      ...(context.spatialResults?.openings ?? []),
    ];
    return {
      shares,
      orientationWwr: computeOrientationWwr(compiled.payload.recipe, wwr),
      totalHWPerK: heatLossElements.reduce(
        (sum, element) => sum + Math.max(0, element.hCoefficient),
        0,
      ),
      avgWwr: (wwr.N + wwr.S + wwr.E + wwr.W) / 4,
      resultSemantics: {
        metric: "heat_loss_coefficient",
        unit: "W/K",
        source: "selected_simulation_run",
        inputHash: compiled.inputHash,
        spatialResultCount: spatialResults.length,
        missingSpatialResultCount: spatialResults.filter(
          (result) => result.status === "missing",
        ).length,
      },
    };
  }, [compiled, context.activeRun, context.spatialResults]);
  const selectedCanonical = useSelectionStore((state) => state.selectedCanonical);

  useEffect(() => {
    const bimBefore = useBimModelStore.getState();
    const recipeBefore = useRecipeStore.getState();
    const materialBefore = useMaterialStore.getState();
    const layerBefore = useLayerStore.getState();
    const hadRecipe = Object.prototype.hasOwnProperty.call(
      recipeBefore.baseRecipes,
      bridge.buildingPk,
    );
    const priorRecipe = recipeBefore.baseRecipes[bridge.buildingPk];
    const hadMaterials = Object.prototype.hasOwnProperty.call(
      materialBefore.properties,
      bridge.buildingPk,
    );
    const priorMaterials = materialBefore.properties[bridge.buildingPk];
    const priorZoneVisible = layerBefore.analysisOverlays["overlay-zone"];
    const priorEnvelopeVisible =
      layerBefore.analysisOverlays["overlay-envelope"];

    useBimModelStore.getState().hydrateFromSnapshot({
      buildingPk: bridge.buildingPk,
      snapshot: bridge.snapshot,
    });
    useRecipeStore.getState().setBaseRecipe(
      bridge.buildingPk,
      displayRecipe,
    );
    if (compiled) {
      useMaterialStore
        .getState()
        .setProperties(bridge.buildingPk, compiled.payload.materials);
    } else {
      useMaterialStore.setState((state) => {
        const { [bridge.buildingPk]: _removed, ...properties } =
          state.properties;
        return { properties };
      });
    }
    useLayerStore
      .getState()
      .setAnalysisOverlayVisible("overlay-zone", compiled != null);
    useLayerStore
      .getState()
      .setAnalysisOverlayVisible("overlay-envelope", compiled != null);

    return () => {
      useBimModelStore.setState({
        snapshot: bimBefore.snapshot,
        activeLevelId: bimBefore.activeLevelId,
        selectedElementId: bimBefore.selectedElementId,
      });
      useRecipeStore.setState((state) => {
        const { [bridge.buildingPk]: _removed, ...rest } = state.baseRecipes;
        return {
          baseRecipes: hadRecipe && priorRecipe
            ? { ...rest, [bridge.buildingPk]: priorRecipe }
            : rest,
        };
      });
      useMaterialStore.setState((state) => {
        const { [bridge.buildingPk]: _removed, ...rest } = state.properties;
        return {
          properties: hadMaterials && priorMaterials
            ? { ...rest, [bridge.buildingPk]: priorMaterials }
            : rest,
        };
      });
      useLayerStore
        .getState()
        .setAnalysisOverlayVisible("overlay-zone", priorZoneVisible);
      useLayerStore
        .getState()
        .setAnalysisOverlayVisible("overlay-envelope", priorEnvelopeVisible);
    };
  }, [bridge, compiled, displayRecipe]);

  useEffect(() => {
    const priorSelection = useSelectionStore.getState().selectedCanonical;
    const selected = context.selected;
    if (!selected || selected.kind === "document") {
      useSelectionStore.getState().clearCanonicalSelection();
    } else {
      useSelectionStore.getState().selectCanonical({
        kind:
          selected.kind === "simulation_result"
            ? "simulation_series"
            : selected.kind,
        buildingPk: bridge.buildingPk,
        id: selected.id,
        documentId: selected.documentId,
        canonicalObjectIds: selected.canonicalObjectIds,
        threeObjectIds: selected.threeObjectIds,
        ...(selected.kind === "simulation_result"
          ? { runId: selected.runId }
          : {}),
      });
    }
    return () => {
      const current = useSelectionStore.getState().selectedCanonical;
      if (current?.buildingPk === bridge.buildingPk || current == null) {
        useSelectionStore.setState({ selectedCanonical: priorSelection });
      }
    };
  }, [bridge.buildingPk, context.selected]);

  useEffect(() => {
    const currentCanonical = useSelectionStore.getState().selectedCanonical;
    if (
      currentCanonical?.kind === "thermal_zone" &&
      currentCanonical.buildingPk === bridge.buildingPk &&
      (context.selected?.kind !== "thermal_zone" ||
        context.selected.id !== currentCanonical.id)
    ) {
      context.onSelectZone(currentCanonical.id);
    }
  }, [bridge.buildingPk, context, selectedCanonical]);

  return (
    <div
      className="relative isolate h-[clamp(28rem,62svh,52rem)] min-h-[28rem] w-full min-w-0 max-w-full overflow-hidden bg-muted/20 sm:h-[clamp(30rem,65svh,54rem)]"
      data-testid="energy-diagnosis-scene"
      data-selection-kind={context.selected?.kind ?? "none"}
      data-highlighted-object-count={
        diagnosticSpatialTarget
          ? diagnosticSpatialTarget.patches.length > 0
            ? diagnosticSpatialTarget.patches.length
            : diagnosticSpatialTarget.fallbackObjectIds.length
          : 0
      }
      data-focus-precision={diagnosticSpatialTarget?.precision ?? "none"}
    >
      <BuildingScene
        title={bridge.title}
        floors={[...bridge.floors]}
        recipeOverride={displayRecipe}
        buildingPk={bridge.buildingPk}
        snapshot={bridge.snapshot}
        diagnosticsMode
        envelopeAnalysisOverride={envelopeAnalysis}
        energyZoneAnalysisOverride={zoneAnalysis}
        diagnosticSpatialTarget={diagnosticSpatialTarget}
        onEnergyZoneSelect={(zoneId) => context.onSelectZone(zoneId)}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 max-w-[calc(100%-1.5rem)] rounded-md border bg-background/90 px-2.5 py-2 text-[9px] leading-relaxed text-muted-foreground shadow-sm backdrop-blur sm:right-auto sm:max-w-xs">
        {diagnosticSpatialTarget && (
          <span
            className="mb-1 block font-semibold text-cyan-700 dark:text-cyan-300"
            data-testid="diagnostic-spatial-selection-status"
            role="status"
            aria-live="polite"
          >
            {spatialSelectionMessage(diagnosticSpatialTarget, context.locale)}
          </span>
        )}
        {compiled
          ? context.locale === "ko"
            ? "3D 열구역 · 선택 실행의 연간 수요를 바닥면적 비율로 배분한 추정값 · kWh/yr"
            : "3D thermal zones · selected-run annual demand apportioned by floor area · kWh/yr"
          : context.locale === "ko"
            ? "검증된 시뮬레이션 실행 후 열구역 결과 레이어가 활성화됩니다."
            : "The thermal-zone result layer activates after a validated simulation run."}
        {bridge.warnings.length > 0 && (
          <span className="mt-1 block text-amber-700 dark:text-amber-300">
            {context.locale === "ko"
              ? `표시 근사 ${bridge.warnings.length}건 · 정규 모델과 엔진 입력은 변경되지 않음`
              : `${bridge.warnings.length} display approximations · canonical model and engine input unchanged`}
          </span>
        )}
      </div>
    </div>
  );
}
