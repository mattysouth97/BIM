"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { create } from "zustand";
import { usePlanStore } from "@/store/plan-store";
import { useAuthoringStore } from "@/store/authoring-store";
import { projectOntoWall } from "@/lib/plan/room-detector";
import { type SnapConfig } from "@/lib/plan/snap-engine";
import {
  DOOR_PRESETS,
  WINDOW_PRESETS,
  type ComponentPreset,
} from "@/lib/components/component-types";

// ---------------------------------------------------------------------------
// Preset selection store — module-level so overlay can import it
// ---------------------------------------------------------------------------

interface OpeningPresetState {
  presetId: string;
  setPresetId: (id: string) => void;
}

export const useOpeningPreset = create<OpeningPresetState>()((set) => ({
  presetId: "door-900",
  setPresetId: (id) => set({ presetId: id }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const SNAP_THRESHOLD = 1.0; // meters

function findPreset(presetId: string): ComponentPreset | undefined {
  return (
    DOOR_PRESETS.find((p) => p.id === presetId) ??
    WINDOW_PRESETS.find((p) => p.id === presetId)
  );
}

// ---------------------------------------------------------------------------
// Snap info type
// ---------------------------------------------------------------------------

interface SnapInfo {
  wallId: string;
  t: number;
  wx: number;
  wz: number;
  angle: number;
  presetWidth: number;
}

// ---------------------------------------------------------------------------
// SnapPreview — thin colored box showing where the opening will be placed
// ---------------------------------------------------------------------------

function SnapPreview({ snap }: { snap: SnapInfo }) {
  const obj = useMemo(() => {
    const geom = new THREE.BoxGeometry(snap.presetWidth, 0.04, 0.25);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.5,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(snap.wx, 0.03, snap.wz);
    mesh.rotation.set(0, -snap.angle, 0);
    return mesh;
  }, [snap.wx, snap.wz, snap.angle, snap.presetWidth]);

  return <primitive object={obj} />;
}

// ---------------------------------------------------------------------------
// DoorSymbol — arc sweep plan symbol
// ---------------------------------------------------------------------------

function DoorSymbol({
  wx,
  wz,
  angle,
  preset,
}: {
  wx: number;
  wz: number;
  angle: number;
  preset: ComponentPreset;
}) {
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.position.set(wx, 0.03, wz);
    g.rotation.set(0, -angle, 0);

    const brownMat = new THREE.LineBasicMaterial({ color: 0x8b4513 });

    // Arc sweep: EllipseCurve from 0 to PI/2 with radius = door width
    // EllipseCurve operates in XY plane; we map Y -> Z for the XZ ground plane
    const curve = new THREE.EllipseCurve(
      0,
      0, // center
      preset.width,
      preset.width, // xRadius, yRadius
      0,
      Math.PI / 2, // start, end angle
      false,
      0
    );
    const points2d = curve.getPoints(16);
    const arcPoints: THREE.Vector3[] = points2d.map(
      (p) => new THREE.Vector3(p.x, 0, p.y)
    );
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const arcLine = new THREE.Line(arcGeom, brownMat);
    g.add(arcLine);

    // Door panel line (hinge at origin, open edge at preset.width along X)
    const doorPanelGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(preset.width, 0, 0),
    ]);
    const doorLine = new THREE.Line(doorPanelGeom, new THREE.LineBasicMaterial({ color: 0x8b4513 }));
    g.add(doorLine);

    // Hinge line from origin along Z (the wall direction from the hinge point)
    const hingeGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, preset.width),
    ]);
    const hingeLine = new THREE.Line(hingeGeom, new THREE.LineBasicMaterial({ color: 0x8b4513 }));
    g.add(hingeLine);

    return g;
  }, [wx, wz, angle, preset]);

  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------
// WindowSymbol — two parallel lines
// ---------------------------------------------------------------------------

function WindowSymbol({
  wx,
  wz,
  angle,
  preset,
  wallThickness,
}: {
  wx: number;
  wz: number;
  angle: number;
  preset: ComponentPreset;
  wallThickness: number;
}) {
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.position.set(wx, 0.03, wz);
    g.rotation.set(0, -angle, 0);

    const offset = wallThickness * 0.3;
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x42a5f5 });

    // Two thin boxes offset along the perpendicular (Z) direction in local space
    for (const sign of [-1, 1]) {
      const geom = new THREE.BoxGeometry(preset.width, 0.015, 0.025);
      const mesh = new THREE.Mesh(geom, blueMat);
      mesh.position.set(0, 0, sign * offset);
      g.add(mesh);
    }

    return g;
  }, [wx, wz, angle, preset, wallThickness]);

  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------
// OpeningDrawer — main R3F component
// ---------------------------------------------------------------------------

export function OpeningDrawer() {
  const viewMode = usePlanStore((s) => s.viewMode);
  const drawingMode = usePlanStore((s) => s.drawingMode);
  const walls = usePlanStore((s) => s.walls);
  const openings = usePlanStore((s) => s.openings);
  const addOpening = usePlanStore((s) => s.addOpening);
  const activeFloor = usePlanStore((s) => s.activeFloor);
  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);

  const presetId = useOpeningPreset((s) => s.presetId);

  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mousePos = useRef(new THREE.Vector2());
  // Ref for the latest snap to use in click handler (avoids stale closure)
  const latestSnapRef = useRef<SnapInfo | null>(null);

  const [snapState, setSnapState] = useState<SnapInfo | null>(null);

  const isActive = viewMode === "plan" && isAuthoring && drawingMode === "opening";

  const getGroundPoint = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const rect = gl.domElement.getBoundingClientRect();
      mousePos.current.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.current.setFromCamera(mousePos.current, camera);
      const intersection = new THREE.Vector3();
      const hit = raycaster.current.ray.intersectPlane(
        GROUND_PLANE,
        intersection
      );
      if (!hit) return null;
      return [intersection.x, intersection.z];
    },
    [camera, gl]
  );

  // Compute snap on mouse move
  useEffect(() => {
    if (!isActive) {
      latestSnapRef.current = null;
      setSnapState(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const point = getGroundPoint(e.clientX, e.clientY);
      if (!point) {
        latestSnapRef.current = null;
        setSnapState(null);
        return;
      }

      const floorWalls = walls.filter((w) => w.floor === activeFloor);
      const preset = findPreset(presetId);
      const presetWidth = preset?.width ?? 0.9;

      // Build snap config for opening placement
      // Openings use wall-proximity snap (projectOntoWall) as primary mechanism,
      // so vertex/edge snapping from the general engine is disabled.
      // Only grid snap is used — applied to the parametric t value along the wall.
      const storeState = usePlanStore.getState();
      const openingSnapConfig: SnapConfig = {
        enabled: storeState.snapEnabled,
        gridSnap: storeState.gridSnapEnabled,
        vertexSnap: false,
        edgeSnap: false,
        gridSize: storeState.gridSize,
        proximityTolerance: storeState.proximityTolerance,
      };

      let bestSnap: SnapInfo | null = null;
      let bestDist = SNAP_THRESHOLD;

      for (const wall of floorWalls) {
        const proj = projectOntoWall(
          point[0],
          point[1],
          wall.start[0],
          wall.start[1],
          wall.end[0],
          wall.end[1]
        );

        if (proj.dist < bestDist) {
          bestDist = proj.dist;
          const angle = Math.atan2(
            wall.end[1] - wall.start[1],
            wall.end[0] - wall.start[0]
          );

          // Snap the parametric t to grid increments along the wall length
          const dx = wall.end[0] - wall.start[0];
          const dz = wall.end[1] - wall.start[1];
          const wallLength = Math.sqrt(dx * dx + dz * dz);
          let snappedT = proj.t;
          if (
            openingSnapConfig.enabled &&
            openingSnapConfig.gridSnap &&
            wallLength > 0
          ) {
            const tStep = openingSnapConfig.gridSize / wallLength;
            snappedT = Math.round(proj.t / tStep) * tStep;
            // Clamp to [0, 1]
            snappedT = Math.max(0, Math.min(1, snappedT));
          }

          // Compute world position for the snapped t value
          const swx = wall.start[0] + snappedT * dx;
          const swz = wall.start[1] + snappedT * dz;

          bestSnap = {
            wallId: wall.id,
            t: snappedT,
            wx: swx,
            wz: swz,
            angle,
            presetWidth,
          };
        }
      }

      latestSnapRef.current = bestSnap;
      setSnapState(bestSnap);
    };

    const canvas = gl.domElement;
    canvas.addEventListener("mousemove", handleMouseMove);
    return () => canvas.removeEventListener("mousemove", handleMouseMove);
  }, [isActive, walls, activeFloor, presetId, getGroundPoint, gl]);

  // Place opening on click
  useEffect(() => {
    if (!isActive) return;

    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const snap = latestSnapRef.current;
      if (!snap) return;

      const preset = findPreset(presetId);
      if (!preset) return;

      // Find the wall to validate length
      const wall = walls.find((w) => w.id === snap.wallId);
      if (!wall) return;

      const dx = wall.end[0] - wall.start[0];
      const dz = wall.end[1] - wall.start[1];
      const wallLength = Math.sqrt(dx * dx + dz * dz);

      if (preset.width > wallLength) {
        console.warn(
          `[OpeningDrawer] Preset "${preset.id}" (width ${preset.width}m) is wider than wall (${wallLength.toFixed(2)}m). Placement rejected.`
        );
        return;
      }

      addOpening({
        id: crypto.randomUUID(),
        wallId: snap.wallId,
        t: snap.t,
        presetId,
        floor: activeFloor,
      });
    };

    const canvas = gl.domElement;
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [isActive, walls, addOpening, activeFloor, presetId, gl]);

  // Only render symbols in plan view
  if (viewMode !== "plan") return null;

  const floorOpenings = openings.filter((o) => o.floor === activeFloor);

  return (
    <group>
      {/* Snap preview */}
      {isActive && snapState && <SnapPreview snap={snapState} />}

      {/* Placed openings — architectural symbols */}
      {floorOpenings.map((opening) => {
        const wall = walls.find((w) => w.id === opening.wallId);
        if (!wall) return null;

        const wx =
          wall.start[0] + opening.t * (wall.end[0] - wall.start[0]);
        const wz =
          wall.start[1] + opening.t * (wall.end[1] - wall.start[1]);
        const angle = Math.atan2(
          wall.end[1] - wall.start[1],
          wall.end[0] - wall.start[0]
        );

        const preset = findPreset(opening.presetId);
        if (!preset) return null;

        if (preset.category === "door") {
          return (
            <DoorSymbol
              key={opening.id}
              wx={wx}
              wz={wz}
              angle={angle}
              preset={preset}
            />
          );
        } else {
          return (
            <WindowSymbol
              key={opening.id}
              wx={wx}
              wz={wz}
              angle={angle}
              preset={preset}
              wallThickness={wall.thickness}
            />
          );
        }
      })}
    </group>
  );
}
