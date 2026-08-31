"use client";

// /dev/mep — MEP visual-QA harness (§26/§32). Renders ONLY the graph-driven
// MEP layers for the six QA buildings, with slab ghosts for context, the
// connectivity-graph debug overlay, provenance/clash color modes, and live
// engineering metrics from the validator. Not linked from the product; a
// development inspection surface like /dev/assets and /dev/symbols.

import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { BuildingRecipe } from "@/lib/procedural/types";
import {
  buildMepContext,
  planMepSystems,
  clearMepPlanCache,
  validateMepModel,
  type MepModel,
  type MepValidationReport,
} from "@/lib/mep";
import {
  caseApartment,
  caseLShape,
  caseLShapeRooms,
  casePlantHeavy,
  caseRetail,
  caseSmallOffice,
  caseTowerOffice,
} from "@/lib/mep/qa-cases";
import { renderMepEquipment, renderMepGraphDebug, renderMepSystems } from "@/lib/layers/mep-render";
import { useEquipmentAssets } from "@/hooks/use-equipment-assets";

const CASES: { id: string; label: string; recipe: () => BuildingRecipe; cadRooms?: [number, number][][] }[] = [
  { id: "A", label: "A 소형 사무소", recipe: caseSmallOffice },
  { id: "B", label: "B 12층 오피스(VRF)", recipe: caseTowerOffice },
  { id: "C", label: "C 15층 아파트", recipe: caseApartment },
  { id: "D", label: "D 판매시설", recipe: caseRetail },
  { id: "E", label: "E 중앙플랜트(1990s)", recipe: casePlantHeavy },
  { id: "F", label: "F L자 CAD 평면", recipe: caseLShape, cadRooms: caseLShapeRooms().map((r) => r.polygon) },
];

const DISCIPLINE_STYLES = [
  { systems: ["sa", "ra", "oa", "ex"], color: 0x06b6d4, runTag: "vent-duct-run", terminalTag: "vent-diffuser" },
  { systems: ["chws", "chwr", "cw", "ref"], color: 0x38bdf8, runTag: "cooling-branch" },
  { systems: ["hws", "hwr"], color: 0xfb923c, runTag: "heating-riser" },
  { systems: ["dcw", "dhws", "dhwr"], color: 0xf97316, runTag: "dhw-branch" },
  { systems: ["san", "vent"], color: 0x84a98c, runTag: "dhw-drain" },
  { systems: ["fp"], color: 0xef4444, runTag: "safety-sprinkler-pipe" },
  { systems: ["tray", "pw"], color: 0xf59e0b, runTag: "electrical-conduit" },
];

type ColorMode = "system" | "provenance" | "clash";

function MepScene({
  recipe,
  cadRooms,
  colorMode,
  showGraph,
  onReport,
}: {
  recipe: BuildingRecipe;
  cadRooms?: [number, number][][];
  colorMode: ColorMode;
  showGraph: boolean;
  onReport: (model: MepModel, report: MepValidationReport) => void;
}) {
  const assetsReady = useEquipmentAssets();
  const group = useMemo(() => {
    clearMepPlanCache();
    const options = cadRooms ? { cadRooms: cadRooms.map((polygon) => ({ polygon })) } : {};
    const model = planMepSystems(recipe, options);
    const ctx = buildMepContext(recipe, options);
    const report = validateMepModel(model, ctx);
    const clashIds = new Set<string>();
    for (const clash of report.clashes) {
      if (clash.kind !== "hard") continue;
      if (clash.aType === "segment") clashIds.add(clash.aId);
      if (clash.bType === "segment") clashIds.add(clash.bId);
    }
    const root = new THREE.Group();
    for (const style of DISCIPLINE_STYLES) {
      renderMepSystems(model, root, {
        systems: style.systems,
        style: { color: style.color, runTag: style.runTag, terminalTag: style.terminalTag },
        colorMode,
        clashSegmentIds: clashIds,
      });
      renderMepEquipment(model, root, { systems: style.systems });
    }
    if (showGraph) renderMepGraphDebug(model, root);

    // Slab ghosts for spatial reference.
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3d1,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    for (const floor of recipe.floors) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(recipe.footprintWidth, 0.12, recipe.footprintDepth),
        slabMat,
      );
      slab.position.y = floor.y;
      root.add(slab);
    }
    onReport(model, report);
    return root;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe, cadRooms, colorMode, showGraph, assetsReady]);

  useEffect(() => {
    return () => {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
    };
  }, [group]);

  return <primitive object={group} />;
}

export default function MepQaPage() {
  const [caseId, setCaseId] = useState("A");
  const [colorMode, setColorMode] = useState<ColorMode>("system");
  const [showGraph, setShowGraph] = useState(false);
  const [stats, setStats] = useState<string>("");
  const active = CASES.find((c) => c.id === caseId) ?? CASES[0];
  const recipe = useMemo(() => active.recipe(), [active]);
  const camDist = Math.max(recipe.footprintWidth, recipe.totalHeight) * 1.4;

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-900 text-neutral-100">
      <div className="flex items-center gap-2 p-2 text-xs bg-neutral-950/80 flex-wrap">
        <span className="font-semibold">MEP QA</span>
        {CASES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCaseId(c.id)}
            className={`px-2 py-1 rounded ${c.id === caseId ? "bg-cyan-600" : "bg-neutral-800"}`}
            data-case={c.id}
          >
            {c.label}
          </button>
        ))}
        <span className="mx-2 opacity-40">|</span>
        {(["system", "provenance", "clash"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setColorMode(m)}
            className={`px-2 py-1 rounded ${m === colorMode ? "bg-emerald-600" : "bg-neutral-800"}`}
            data-mode={m}
          >
            {m}
          </button>
        ))}
        <button
          onClick={() => setShowGraph((v) => !v)}
          className={`px-2 py-1 rounded ${showGraph ? "bg-sky-600" : "bg-neutral-800"}`}
          data-toggle="graph"
        >
          graph
        </button>
        <span className="ml-auto font-mono text-[10px] whitespace-pre" data-testid="mep-qa-stats">
          {stats}
        </span>
      </div>
      <div className="flex-1">
        <Canvas camera={{ position: [camDist, camDist * 0.75, camDist], fov: 40 }} shadows={false}>
          <color attach="background" args={["#171717"]} />
          <hemisphereLight args={["#b1e1ff", "#444444", 0.7]} />
          <directionalLight position={[30, 60, 20]} intensity={1.6} />
          <Suspense fallback={null}>
            <MepScene
              key={`${caseId}-${colorMode}-${showGraph}`}
              recipe={recipe}
              cadRooms={active.cadRooms}
              colorMode={colorMode}
              showGraph={showGraph}
              onReport={(model, report) =>
                setStats(
                  `${model.archetype} · seg ${model.stats.segmentCount} · fit ${model.stats.fittingCount} · term ${model.stats.terminalCount} · len ${Math.round(model.stats.totalLengthM)}m\n` +
                    `hard ${report.hardClashCount} · clear ${report.clearanceClashCount} · score ${report.score.autoTotal}/90 · bends/path ${report.avgBendsPerBranchPath}`,
                )
              }
            />
          </Suspense>
          <OrbitControls makeDefault target={[0, recipe.totalHeight / 2, 0]} />
          <gridHelper args={[80, 40, "#333", "#262626"]} />
        </Canvas>
      </div>
    </div>
  );
}
