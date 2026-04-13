# 3D Parametric Building Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive 3D parametric building viewer that generates mass models from Korean building ledger data, designed as the spatial foundation for a future energy management system.

**Architecture:** React Three Fiber renders a Three.js scene inside a new "3D View" tab on the building detail page. A `BuildingModelGenerator` utility converts building ledger data (height, floor count, floor areas, structure/use types) into a scene graph of floor slabs, walls, and roof. The scene supports orbit controls, floor selection, and a data overlay system that will later attach energy/sensor data to building zones.

**Tech Stack:** three@^0.183, @react-three/fiber@^9, @react-three/drei@^10, leva (debug controls)

---

## File Structure

```
src/
├── components/
│   └── viewer/
│       ├── building-scene.tsx      # Main R3F Canvas + scene setup (lights, camera, controls)
│       ├── building-model.tsx      # Renders the parametric building from data
│       ├── floor-mesh.tsx          # Single floor slab mesh with selection + hover
│       ├── ground-plane.tsx        # Site area ground plane with grid
│       ├── scene-controls.tsx      # Camera controls, view presets (front/side/top)
│       └── viewer-overlay.tsx      # HTML overlay: floor info panel, legend, controls
├── lib/
│   └── building-geometry.ts        # Pure functions: data → geometry parameters
└── app/
    └── building/[id]/page.tsx      # Modified: pass data to new 3D tab
```

**Modified files:**
- `src/components/building/building-tabs.tsx` — add "3D View" tab
- `src/app/building/[id]/page.tsx` — pass title + floors data to tabs

---

### Task 1: Install 3D dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Three.js ecosystem**

```bash
pnpm add three @react-three/fiber @react-three/drei
pnpm add -D @types/three
```

- [ ] **Step 2: Verify installation**

Run: `pnpm ls three @react-three/fiber @react-three/drei`
Expected: All three packages listed with versions

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add three.js and react-three-fiber for 3D viewer"
```

---

### Task 2: Building geometry utility

This is the core logic — pure functions that convert building ledger data into geometry parameters. No React, no Three.js — just math. This makes it testable and reusable when we later generate IFC or run energy simulations.

**Files:**
- Create: `src/lib/building-geometry.ts`

- [ ] **Step 1: Create the geometry utility**

```typescript
// src/lib/building-geometry.ts

import type { BrTitleInfo, BrFloorInfo } from "./types";

/**
 * Parameters for rendering a single floor in 3D.
 * Designed to later attach energy zone data (temperature, consumption, etc.)
 */
export interface FloorGeometry {
  floorNo: number;
  label: string;
  type: "above" | "below";
  y: number;           // vertical position (meters from ground)
  height: number;      // floor-to-floor height (meters)
  width: number;       // x-axis dimension (meters)
  depth: number;       // z-axis dimension (meters)
  area: number;        // actual area from API (m²)
  use: string;         // use type name
  structure: string;   // structure type name
  color: string;       // color based on use type
}

export interface BuildingGeometry {
  floors: FloorGeometry[];
  totalHeight: number;
  footprintWidth: number;
  footprintDepth: number;
  siteWidth: number;
  siteDepth: number;
  roofType: "flat" | "gable" | "other";
  buildingName: string;
  address: string;
}

/** Map building use codes to colors for 3D rendering */
const USE_COLOR_MAP: Record<string, string> = {
  "01000": "#8B4513",  // Single house - brown
  "02000": "#4169E1",  // Apartment - royal blue
  "03000": "#FF8C00",  // Neighborhood I - orange
  "04000": "#FFA500",  // Neighborhood II - light orange
  "05000": "#9370DB",  // Assembly - purple
  "09000": "#FF6347",  // Medical - tomato
  "10000": "#20B2AA",  // Education - teal
  "14000": "#4682B4",  // Office - steel blue
  "17000": "#A0522D",  // Factory - sienna
  "18000": "#708090",  // Warehouse - slate gray
  "20000": "#696969",  // Automotive - dim gray
};

const DEFAULT_COLOR = "#B0C4DE"; // light steel blue

/**
 * Estimate footprint dimensions from area.
 * Assumes a roughly rectangular footprint with a 1.5:1 aspect ratio.
 * Real geometry requires cadastral data we don't have.
 */
function estimateFootprint(area: number): { width: number; depth: number } {
  if (!area || area <= 0) return { width: 10, depth: 10 };
  // aspect ratio 1.5:1 → width = sqrt(area * 1.5), depth = sqrt(area / 1.5)
  const width = Math.sqrt(area * 1.5);
  const depth = Math.sqrt(area / 1.5);
  return { width: Math.round(width * 10) / 10, depth: Math.round(depth * 10) / 10 };
}

/**
 * Convert building ledger data into renderable geometry parameters.
 */
export function generateBuildingGeometry(
  title: BrTitleInfo,
  floors: BrFloorInfo[]
): BuildingGeometry {
  const totalFloors = (Number(title.grndFlrCnt) || 1) + (Number(title.ugrndFlrCnt) || 0);
  const totalHeight = Number(title.heit) || totalFloors * 3.2; // default 3.2m per floor
  const floorHeight = totalHeight / (Number(title.grndFlrCnt) || 1);
  const basementFloorHeight = 3.0; // assumed basement floor height

  const buildingFootprint = estimateFootprint(Number(title.archArea) || 100);
  const siteFootprint = estimateFootprint(Number(title.platArea) || Number(title.archArea) * 2);

  const roofCode = title.roofCd || title.roofCdNm || "";
  const roofType: "flat" | "gable" | "other" =
    roofCode.includes("평") || roofCode === "1" ? "flat" :
    roofCode.includes("박공") || roofCode === "2" ? "gable" : "flat";

  // Build floor list: prefer API floor data, fall back to generated
  const floorGeometries: FloorGeometry[] = [];

  if (floors.length > 0) {
    // Use actual floor data from API
    for (const f of floors) {
      const flrNo = Number(f.flrNo);
      const isBelow = (f.flrGbCdNm || "").includes("지하") || flrNo < 0;
      const absFloor = Math.abs(flrNo);

      const floorFp = estimateFootprint(Number(f.area) || Number(title.archArea) || 100);

      floorGeometries.push({
        floorNo: flrNo,
        label: f.flrNoNm || `${isBelow ? "B" : ""}${absFloor}F`,
        type: isBelow ? "below" : "above",
        y: isBelow
          ? -(absFloor * basementFloorHeight)
          : (flrNo - 1) * floorHeight,
        height: isBelow ? basementFloorHeight : floorHeight,
        width: floorFp.width,
        depth: floorFp.depth,
        area: Number(f.area) || 0,
        use: f.mainPurpsCdNm || f.etcPurps || "",
        structure: f.strctCdNm || "",
        color: USE_COLOR_MAP[f.mainPurpsCd] || USE_COLOR_MAP[title.mainPurpsCd] || DEFAULT_COLOR,
      });
    }
  } else {
    // Generate floors from title data
    const aboveCount = Number(title.grndFlrCnt) || 1;
    const belowCount = Number(title.ugrndFlrCnt) || 0;

    for (let i = belowCount; i >= 1; i--) {
      floorGeometries.push({
        floorNo: -i,
        label: `B${i}F`,
        type: "below",
        y: -(i * basementFloorHeight),
        height: basementFloorHeight,
        width: buildingFootprint.width,
        depth: buildingFootprint.depth,
        area: Number(title.archArea) || 0,
        use: title.mainPurpsCdNm || "",
        structure: title.strctCdNm || "",
        color: "#666666",
      });
    }

    for (let i = 1; i <= aboveCount; i++) {
      floorGeometries.push({
        floorNo: i,
        label: `${i}F`,
        type: "above",
        y: (i - 1) * floorHeight,
        height: floorHeight,
        width: buildingFootprint.width,
        depth: buildingFootprint.depth,
        area: Number(title.archArea) || 0,
        use: title.mainPurpsCdNm || "",
        structure: title.strctCdNm || "",
        color: USE_COLOR_MAP[title.mainPurpsCd] || DEFAULT_COLOR,
      });
    }
  }

  // Sort: basement floors first (most negative), then above ground
  floorGeometries.sort((a, b) => a.floorNo - b.floorNo);

  return {
    floors: floorGeometries,
    totalHeight,
    footprintWidth: buildingFootprint.width,
    footprintDepth: buildingFootprint.depth,
    siteWidth: siteFootprint.width,
    siteDepth: siteFootprint.depth,
    roofType,
    buildingName: title.bldNm || "",
    address: title.platPlcNm || "",
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/building-geometry.ts
git commit -m "feat: add building geometry generator for 3D viewer"
```

---

### Task 3: Floor mesh component

Individual floor rendered as a box geometry with hover/selection states. Each floor is a selectable zone — critical for later attaching energy data per-zone.

**Files:**
- Create: `src/components/viewer/floor-mesh.tsx`

- [ ] **Step 1: Create the floor mesh**

```tsx
// src/components/viewer/floor-mesh.tsx
"use client";

import { useState, useRef } from "react";
import { Edges } from "@react-three/drei";
import type { Mesh } from "three";
import type { FloorGeometry } from "@/lib/building-geometry";

interface FloorMeshProps {
  floor: FloorGeometry;
  selected: boolean;
  onSelect: (floorNo: number) => void;
  onHover: (floorNo: number | null) => void;
  opacity?: number;
}

export function FloorMesh({ floor, selected, onSelect, onHover, opacity = 0.85 }: FloorMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const gap = 0.15; // gap between floors for visual clarity
  const y = floor.y + floor.height / 2;

  return (
    <mesh
      ref={meshRef}
      position={[0, y, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(floor.floorNo); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(floor.floorNo); }}
      onPointerOut={() => { setHovered(false); onHover(null); }}
    >
      <boxGeometry args={[floor.width, floor.height - gap, floor.depth]} />
      <meshStandardMaterial
        color={selected ? "#FFD700" : hovered ? "#87CEEB" : floor.color}
        transparent
        opacity={selected ? 1 : hovered ? 0.95 : opacity}
        roughness={0.6}
        metalness={0.1}
      />
      <Edges threshold={15} color={selected ? "#B8860B" : "#333333"} lineWidth={selected ? 2 : 0.5} />
    </mesh>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/floor-mesh.tsx
git commit -m "feat: add selectable floor mesh component for 3D viewer"
```

---

### Task 4: Ground plane component

Shows the site boundary as a grid plane beneath the building.

**Files:**
- Create: `src/components/viewer/ground-plane.tsx`

- [ ] **Step 1: Create the ground plane**

```tsx
// src/components/viewer/ground-plane.tsx
"use client";

import { Grid } from "@react-three/drei";

interface GroundPlaneProps {
  siteWidth: number;
  siteDepth: number;
}

export function GroundPlane({ siteWidth, siteDepth }: GroundPlaneProps) {
  const size = Math.max(siteWidth, siteDepth, 50);

  return (
    <group>
      {/* Site boundary */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[siteWidth, siteDepth]} />
        <meshStandardMaterial color="#4a7c59" transparent opacity={0.3} />
      </mesh>
      {/* Grid */}
      <Grid
        args={[size * 2, size * 2]}
        position={[0, -0.1, 0]}
        cellSize={5}
        cellColor="#999999"
        sectionSize={10}
        sectionColor="#666666"
        fadeDistance={size * 3}
        fadeStrength={1}
      />
    </group>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/ground-plane.tsx
git commit -m "feat: add ground plane with site boundary for 3D viewer"
```

---

### Task 5: Building model component

Assembles all floor meshes into a complete building. Manages floor selection state.

**Files:**
- Create: `src/components/viewer/building-model.tsx`

- [ ] **Step 1: Create the building model**

```tsx
// src/components/viewer/building-model.tsx
"use client";

import { useState } from "react";
import type { BuildingGeometry, FloorGeometry } from "@/lib/building-geometry";
import { FloorMesh } from "./floor-mesh";
import { GroundPlane } from "./ground-plane";

interface BuildingModelProps {
  geometry: BuildingGeometry;
  onFloorSelect?: (floor: FloorGeometry | null) => void;
}

export function BuildingModel({ geometry, onFloorSelect }: BuildingModelProps) {
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [, setHoveredFloor] = useState<number | null>(null);

  const handleSelect = (floorNo: number) => {
    const newSelection = selectedFloor === floorNo ? null : floorNo;
    setSelectedFloor(newSelection);
    if (onFloorSelect) {
      const floor = newSelection !== null
        ? geometry.floors.find(f => f.floorNo === newSelection) ?? null
        : null;
      onFloorSelect(floor);
    }
  };

  return (
    <group>
      {/* Ground / site */}
      <GroundPlane siteWidth={geometry.siteWidth} siteDepth={geometry.siteDepth} />

      {/* Building floors */}
      <group>
        {geometry.floors.map((floor) => (
          <FloorMesh
            key={floor.floorNo}
            floor={floor}
            selected={selectedFloor === floor.floorNo}
            onSelect={handleSelect}
            onHover={setHoveredFloor}
          />
        ))}
      </group>
    </group>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/building-model.tsx
git commit -m "feat: add building model component assembling floor meshes"
```

---

### Task 6: Scene controls (camera presets)

Orbit controls + view preset buttons (front, side, top, isometric).

**Files:**
- Create: `src/components/viewer/scene-controls.tsx`

- [ ] **Step 1: Create scene controls**

```tsx
// src/components/viewer/scene-controls.tsx
"use client";

import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

export interface SceneControlsRef {
  setView: (view: "front" | "side" | "top" | "iso") => void;
}

interface SceneControlsProps {
  targetHeight: number;
  distance: number;
}

export const SceneControls = forwardRef<SceneControlsRef, SceneControlsProps>(
  function SceneControls({ targetHeight, distance }, ref) {
    const controlsRef = useRef<OrbitControlsImpl>(null);
    const { camera } = useThree();

    const setView = useCallback(
      (view: "front" | "side" | "top" | "iso") => {
        const target = new THREE.Vector3(0, targetHeight / 2, 0);
        const d = distance;

        const positions: Record<string, THREE.Vector3> = {
          front: new THREE.Vector3(0, targetHeight / 2, d),
          side: new THREE.Vector3(d, targetHeight / 2, 0),
          top: new THREE.Vector3(0, d * 1.5, 0.01),
          iso: new THREE.Vector3(d * 0.7, targetHeight / 2 + d * 0.5, d * 0.7),
        };

        camera.position.copy(positions[view]);
        camera.lookAt(target);
        if (controlsRef.current) {
          controlsRef.current.target.copy(target);
          controlsRef.current.update();
        }
      },
      [camera, targetHeight, distance]
    );

    useImperativeHandle(ref, () => ({ setView }), [setView]);

    return (
      <OrbitControls
        ref={controlsRef}
        target={[0, targetHeight / 2, 0]}
        maxPolarAngle={Math.PI * 0.85}
        minDistance={5}
        maxDistance={distance * 4}
        enableDamping
        dampingFactor={0.1}
      />
    );
  }
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/scene-controls.tsx
git commit -m "feat: add orbit controls with view presets for 3D viewer"
```

---

### Task 7: Viewer overlay (HTML UI on top of canvas)

Floor info panel and view buttons rendered as HTML overlaying the canvas.

**Files:**
- Create: `src/components/viewer/viewer-overlay.tsx`

- [ ] **Step 1: Create overlay UI**

```tsx
// src/components/viewer/viewer-overlay.tsx
"use client";

import type { FloorGeometry } from "@/lib/building-geometry";
import { formatArea } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, ArrowUp, ArrowRight, ArrowDown, Maximize2 } from "lucide-react";

interface ViewerOverlayProps {
  selectedFloor: FloorGeometry | null;
  buildingName: string;
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
}

export function ViewerOverlay({ selectedFloor, buildingName, onViewChange }: ViewerOverlayProps) {
  const isKo = useAppStore((s) => s.language) === "ko";

  return (
    <>
      {/* View controls — top right */}
      <div className="absolute top-3 right-3 flex gap-1.5 z-10">
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("front")} title="Front">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("side")} title="Side">
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("top")} title="Top">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("iso")} title="Isometric">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("iso")} title="Reset">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Building name — top left */}
      <div className="absolute top-3 left-3 z-10">
        <Badge variant="secondary" className="text-xs">
          {buildingName || (isKo ? "건물 모델" : "Building Model")}
        </Badge>
      </div>

      {/* Selected floor info — bottom left */}
      {selectedFloor && (
        <div className="absolute bottom-3 left-3 z-10 rounded-lg border bg-card/95 backdrop-blur p-3 shadow-lg max-w-xs">
          <p className="text-sm font-semibold">
            {selectedFloor.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({selectedFloor.type === "below" ? (isKo ? "지하" : "Underground") : (isKo ? "지상" : "Above ground")})
            </span>
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>{isKo ? "면적" : "Area"}</span>
            <span className="font-medium text-foreground">{formatArea(selectedFloor.area)}</span>
            <span>{isKo ? "용도" : "Use"}</span>
            <span className="font-medium text-foreground">{selectedFloor.use || "-"}</span>
            <span>{isKo ? "구조" : "Structure"}</span>
            <span className="font-medium text-foreground">{selectedFloor.structure || "-"}</span>
          </div>
        </div>
      )}

      {/* Instructions — bottom right */}
      <div className="absolute bottom-3 right-3 z-10 text-[10px] text-muted-foreground/60">
        {isKo ? "클릭: 층 선택 · 드래그: 회전 · 스크롤: 줌" : "Click: select floor · Drag: rotate · Scroll: zoom"}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/viewer-overlay.tsx
git commit -m "feat: add HTML overlay UI for 3D viewer (floor info, view buttons)"
```

---

### Task 8: Main building scene (Canvas + everything together)

The top-level component that sets up the R3F Canvas, lights, and assembles all viewer pieces.

**Files:**
- Create: `src/components/viewer/building-scene.tsx`

- [ ] **Step 1: Create the scene component**

```tsx
// src/components/viewer/building-scene.tsx
"use client";

import { useState, useRef, useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import type { BrTitleInfo, BrFloorInfo } from "@/lib/types";
import { generateBuildingGeometry, type FloorGeometry } from "@/lib/building-geometry";
import { BuildingModel } from "./building-model";
import { SceneControls, type SceneControlsRef } from "./scene-controls";
import { ViewerOverlay } from "./viewer-overlay";

interface BuildingSceneProps {
  title: BrTitleInfo;
  floors: BrFloorInfo[];
}

export function BuildingScene({ title, floors }: BuildingSceneProps) {
  const [selectedFloor, setSelectedFloor] = useState<FloorGeometry | null>(null);
  const controlsRef = useRef<SceneControlsRef>(null);

  const geometry = useMemo(
    () => generateBuildingGeometry(title, floors),
    [title, floors]
  );

  const cameraDistance = Math.max(geometry.totalHeight, geometry.footprintWidth, geometry.footprintDepth) * 1.8;

  const handleViewChange = (view: "front" | "side" | "top" | "iso") => {
    controlsRef.current?.setView(view);
  };

  return (
    <div className="relative h-[500px] w-full rounded-lg border bg-gradient-to-b from-sky-100 to-sky-50 dark:from-slate-900 dark:to-slate-800 overflow-hidden">
      <Canvas
        camera={{
          position: [cameraDistance * 0.7, geometry.totalHeight * 0.6 + cameraDistance * 0.3, cameraDistance * 0.7],
          fov: 45,
          near: 0.1,
          far: cameraDistance * 10,
        }}
        shadows
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight position={[50, 80, 50]} intensity={0.8} castShadow />
          <directionalLight position={[-30, 40, -30]} intensity={0.3} />
          <Environment preset="city" background={false} />

          {/* Building */}
          <BuildingModel geometry={geometry} onFloorSelect={setSelectedFloor} />

          {/* Controls */}
          <SceneControls
            ref={controlsRef}
            targetHeight={geometry.totalHeight}
            distance={cameraDistance}
          />
        </Suspense>
      </Canvas>

      {/* HTML Overlay */}
      <ViewerOverlay
        selectedFloor={selectedFloor}
        buildingName={geometry.buildingName}
        onViewChange={handleViewChange}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/building-scene.tsx
git commit -m "feat: add main building scene with Canvas, lights, and assembly"
```

---

### Task 9: Wire 3D viewer into building detail page

Add a "3D View" tab to the existing building tabs component.

**Files:**
- Modify: `src/components/building/building-tabs.tsx`
- Modify: `src/app/building/[id]/page.tsx` (already passes title/floors)

- [ ] **Step 1: Update building-tabs to add 3D tab**

Read `src/components/building/building-tabs.tsx` first.

Replace the file with:

```tsx
// src/components/building/building-tabs.tsx
"use client";

import { lazy, Suspense } from "react";
import type { BrTitleInfo, BrRecapTitleInfo, BrFloorInfo, BrAreaInfo } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FloorBreakdown } from "./floor-breakdown";
import { AreaDetail } from "./area-detail";
import { BimSummaryCard } from "@/components/bim/bim-summary-card";

const BuildingScene = lazy(() =>
  import("@/components/viewer/building-scene").then((m) => ({ default: m.BuildingScene }))
);

interface BuildingTabsProps {
  title: BrTitleInfo | null;
  recap: BrRecapTitleInfo | null;
  floors: BrFloorInfo[];
  areas: BrAreaInfo[];
  loading: boolean;
}

function ViewerSkeleton() {
  return (
    <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted/30">
      <Skeleton className="h-8 w-40" />
    </div>
  );
}

export function BuildingTabs({ title, recap, floors, areas, loading }: BuildingTabsProps) {
  return (
    <Tabs defaultValue="3d">
      <TabsList>
        <TabsTrigger value="3d">3D View</TabsTrigger>
        <TabsTrigger value="floors">층별개요 (Floors)</TabsTrigger>
        <TabsTrigger value="areas">면적상세 (Areas)</TabsTrigger>
        <TabsTrigger value="bim">BIM Summary</TabsTrigger>
      </TabsList>

      <TabsContent value="3d" className="mt-4">
        {title ? (
          <Suspense fallback={<ViewerSkeleton />}>
            <BuildingScene title={title} floors={floors} />
          </Suspense>
        ) : (
          <ViewerSkeleton />
        )}
      </TabsContent>

      <TabsContent value="floors" className="mt-4">
        <Card>
          <CardContent>
            <FloorBreakdown floors={floors} loading={loading} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="areas" className="mt-4">
        <Card>
          <CardContent>
            <AreaDetail areas={areas} loading={loading} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="bim" className="mt-4">
        <Card>
          <CardContent>
            <BimSummaryCard
              title={title}
              recap={recap}
              floors={floors}
              loading={loading}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds, `/building/[id]` route renders

- [ ] **Step 3: Commit**

```bash
git add src/components/building/building-tabs.tsx
git commit -m "feat: add 3D View tab with lazy-loaded building scene"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Test the 3D viewer**

1. Open `http://localhost:3000`
2. Search for a building (서울특별시 → 강남구 → 논현동)
3. Click a building row to open detail page
4. The "3D View" tab should be the default tab
5. Verify: 3D building model renders with color-coded floors
6. Verify: Click a floor → info panel appears at bottom-left
7. Verify: Drag to orbit, scroll to zoom
8. Verify: View preset buttons work (front/side/top/iso)
9. Verify: Dark mode works (toggle in header)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete 3D parametric building viewer with floor selection"
```
