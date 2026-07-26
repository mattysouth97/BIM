"use client";

// /dev/assets — asset QA harness (no API key required).
// Renders the procedural building + every MEP layer from a fixture recipe so
// the Blender GLB kit (public/models/equipment/*.glb) can be inspected in the
// real render pipeline: preload cache → layer generators → InstancedMesh.

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { ProceduralBuilding } from "@/lib/procedural/procedural-building";
import { CoolingLayer } from "@/lib/layers/layer-3-cooling";
import { HeatingLayer } from "@/lib/layers/layer-4-heating";
import { VentilationLayer } from "@/lib/layers/layer-5-ventilation";
import { DHWLayer } from "@/lib/layers/layer-6-dhw";
import { LightingLayer } from "@/lib/layers/layer-7-lighting";
import { MicrogridLayer } from "@/lib/layers/layer-14-microgrid";
import { BASLayer } from "@/lib/layers/layer-10-bas";
import { SafetyLayer } from "@/lib/layers/layer-13-safety";
import { TransportLayer } from "@/lib/layers/layer-12-transport";
import { TelecomLayer } from "@/lib/layers/layer-11-telecom";
import { MediaLayer } from "@/lib/layers/layer-8-media";
import { WasteLayer } from "@/lib/layers/layer-9-waste";
import { ElectricalRoutingLayer } from "@/lib/layers/electrical-routing";
import { useEquipmentAssets } from "@/hooks/use-equipment-assets";
import { SHOWCASE_EQUIPMENT_SCENARIO } from "@/lib/layers/equipment-scenario";

function fixtureRecipe(): BuildingRecipe {
  return {
    footprintWidth: 18,
    footprintDepth: 14,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.2, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.2, height: 3.2, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6.4, height: 3.2, isGroundFloor: false },
      { floorNo: 4, label: "4F", type: "above", y: 9.6, height: 3.2, isGroundFloor: false },
    ],
    totalHeight: 12.8,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "02000",
    column: { spacing: 6, size: 0.45, inset: 1.2 },
    slab: { thickness: 0.2, overhang: 0 },
    facade: {
      windowWidth: 1.4,
      windowHeight: 1.6,
      sillHeight: 0.9,
      windowSpacing: 2.0,
      windowRatio: 0.6,
      mullionDepth: 0.06,
      mullionWidth: 0.05,
      glassInset: 0.04,
      solidPanelChance: 0.15,
      parapetHeight: 0.9,
      cornerInset: 0.2,
    },
    roof: { type: "flat", flatThickness: 0.15, gableHeight: 0, hipInset: 0 },
    siteWidth: 30,
    siteDepth: 26,
    buildingName: "Asset QA Fixture",
    address: "Dev Harness",
    materials: {
      wall: { color: "#cccccc", roughness: 0.8, metalness: 0.1 },
      glass: { color: "#88aacc", roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaaaaa", roughness: 0.9, metalness: 0.0 },
      column: { color: "#bbbbbb", roughness: 0.8, metalness: 0.1 },
      roof: { color: "#999999", roughness: 0.9, metalness: 0.0 },
      groundFloor: { color: "#dddddd", roughness: 0.9, metalness: 0.0 },
    },
  };
}

function AssetShowcase({ assetsReady }: { assetsReady: boolean }) {
  const group = useMemo(() => {
    const recipe = fixtureRecipe();
    const root = new THREE.Group();

    const building = new ProceduralBuilding(recipe).generate();
    root.add(building);

    // Envelope retrofit twin: same recipe rendered with the window +
    // wall-insulation measures selected, so the `mullion-he` /
    // `facade-panel-insulated` variants are inspectable side by side with
    // the baseline envelope above. Offset clear of the MEP kit.
    const retrofitTwin = new ProceduralBuilding(recipe, {
      ...SHOWCASE_EQUIPMENT_SCENARIO,
      windowUpgrade: true,
      wallInsulation: true,
    }).generate();
    retrofitTwin.position.x = 30;
    root.add(retrofitTwin);

    root.add(new CoolingLayer().generate(recipe, 1.0, { showCoolingTower: true }));
    root.add(new HeatingLayer().generate(recipe));
    root.add(new VentilationLayer().generate(recipe));
    root.add(new DHWLayer().generate(recipe));
    root.add(new LightingLayer().generate(recipe, 1.0, {}));
    root.add(new MicrogridLayer().generate(recipe));
    root.add(new BASLayer().generate(recipe));
    root.add(new SafetyLayer().generate(recipe));
    root.add(new TransportLayer().generate(recipe));
    root.add(new TelecomLayer().generate(recipe));
    root.add(new MediaLayer().generate(recipe));
    root.add(new WasteLayer().generate(recipe));
    root.add(new ElectricalRoutingLayer().generate(recipe));
    return root;
    // assetsReady is intentionally a dependency: the generators read the GLB
    // cache synchronously, so the scene must rebuild when preload completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsReady]);

  return <primitive object={group} />;
}

export default function DevAssetsPage() {
  const assetsReady = useEquipmentAssets();

  return (
    <div className="h-dvh w-full relative">
      <div className="absolute top-2 left-2 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white">
        Asset QA — Blender GLB kit {assetsReady ? "LOADED" : "loading… (coarse fallback)"}
        {" · left: baseline envelope · right: window + wall-insulation retrofit"}
      </div>
      <Canvas shadows camera={{ position: [26, 18, 26], fov: 45 }}>
        <color attach="background" args={["#f5f5f5"]} />
        <hemisphereLight args={["#b1e1ff", "#b97a20", 0.6]} />
        <directionalLight
          position={[20, 30, 15]}
          intensity={2.0}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <AssetShowcase assetsReady={assetsReady} />
        <OrbitControls makeDefault />
        <gridHelper args={[100, 50, "#999", "#ddd"]} />
      </Canvas>
    </div>
  );
}
