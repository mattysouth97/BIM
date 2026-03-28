"use client";

import { useRef, useEffect, useCallback, useMemo, useState, forwardRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { usePlanStore, type WallSegment, type Opening } from "@/store/plan-store";
import { useAuthoringStore } from "@/store/authoring-store";
import { DOOR_PRESETS, WINDOW_PRESETS } from "@/lib/components/component-types";

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const WALL_COLOR_2D = 0x333333;
const WALL_COLOR_3D = 0xd4d4d4;

/** Shared CSG evaluator — reused across walls for efficiency */
const csgEvaluator = new Evaluator();

/** Look up a preset by id from door and window preset arrays */
function lookupPreset(presetId: string) {
  return (
    DOOR_PRESETS.find((p) => p.id === presetId) ??
    WINDOW_PRESETS.find((p) => p.id === presetId)
  );
}
const PREVIEW_COLOR = 0x3b82f6; // blue
const REJECT_COLOR = 0xef4444; // red — wall too short
const MIN_WALL_LENGTH = 0.5; // meters
const MAX_WALL_WARN = 50; // meters — warn but allow

/**
 * Interactive wall drawing tool.
 * Active only when viewMode === "plan" AND isAuthoring === true.
 *
 * First click sets start point, second click creates wall segment.
 * Escape or right-click cancels in-progress drawing.
 */
export function WallDrawer() {
  const viewMode = usePlanStore((s) => s.viewMode);
  const walls = usePlanStore((s) => s.walls);
  const openings = usePlanStore((s) => s.openings);
  const drawingWall = usePlanStore((s) => s.drawingWall);
  const addWall = usePlanStore((s) => s.addWall);
  const startDrawing = usePlanStore((s) => s.startDrawing);
  const cancelDrawing = usePlanStore((s) => s.cancelDrawing);
  const activeFloor = usePlanStore((s) => s.activeFloor);
  const drawingMode = usePlanStore((s) => s.drawingMode);
  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);

  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mousePos = useRef(new THREE.Vector2());
  const cursorWorldPos = useRef<[number, number]>([0, 0]);
  const previewLineRef = useRef<THREE.Line | null>(null);
  const [drawLength, setDrawLength] = useState<number>(0);
  const [tooltipPos, setTooltipPos] = useState<[number, number, number]>([0, 0, 0]);

  const isActive = viewMode === "plan" && isAuthoring && drawingMode === "wall";
  const isTooShort = drawingWall !== null && drawLength < MIN_WALL_LENGTH;
  const isTooLong = drawingWall !== null && drawLength > MAX_WALL_WARN;

  // Raycast to ground plane to get world XZ coordinates
  const getGroundPoint = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const rect = gl.domElement.getBoundingClientRect();
      mousePos.current.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.current.setFromCamera(mousePos.current, camera);
      const intersection = new THREE.Vector3();
      const hit = raycaster.current.ray.intersectPlane(GROUND_PLANE, intersection);
      if (!hit) return null;
      return [intersection.x, intersection.z];
    },
    [camera, gl]
  );

  // Click handler: first click starts, second click finishes
  useEffect(() => {
    if (!isActive) return;

    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0) return; // left click only
      const point = getGroundPoint(e.clientX, e.clientY);
      if (!point) return;

      if (!drawingWall) {
        startDrawing(point);
      } else {
        const dx = point[0] - drawingWall.start[0];
        const dz = point[1] - drawingWall.start[1];
        const length = Math.sqrt(dx * dx + dz * dz);

        // Reject walls shorter than minimum length
        if (length < MIN_WALL_LENGTH) {
          return; // Do nothing — tooltip already shows "too short"
        }

        const wall: WallSegment = {
          id: crypto.randomUUID(),
          start: drawingWall.start,
          end: point,
          thickness: 0.2,
          height: 3.0,
          floor: activeFloor,
        };
        addWall(wall);
        cancelDrawing();
        setDrawLength(0);
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [isActive, drawingWall, startDrawing, addWall, cancelDrawing, activeFloor, getGroundPoint, gl]);

  // Right-click and Escape to cancel
  useEffect(() => {
    if (!isActive) return;

    const handleContextMenu = (e: MouseEvent) => {
      if (drawingWall) {
        e.preventDefault();
        cancelDrawing();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawingWall) {
        cancelDrawing();
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      canvas.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActive, drawingWall, cancelDrawing, gl]);

  // Track mouse position for preview line
  useEffect(() => {
    if (!isActive || !drawingWall) return;

    const handleMouseMove = (e: MouseEvent) => {
      const point = getGroundPoint(e.clientX, e.clientY);
      if (point && drawingWall) {
        cursorWorldPos.current = point;
        const dx = point[0] - drawingWall.start[0];
        const dz = point[1] - drawingWall.start[1];
        const len = Math.sqrt(dx * dx + dz * dz);
        setDrawLength(len);
        // Midpoint for tooltip
        setTooltipPos([
          (drawingWall.start[0] + point[0]) / 2,
          0.3,
          (drawingWall.start[1] + point[1]) / 2,
        ]);
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener("mousemove", handleMouseMove);
    return () => canvas.removeEventListener("mousemove", handleMouseMove);
  }, [isActive, drawingWall, getGroundPoint, gl]);

  // Update preview line position each frame + color feedback
  useFrame(() => {
    if (!previewLineRef.current || !drawingWall) return;
    const geom = previewLineRef.current.geometry as THREE.BufferGeometry;
    const positions = geom.attributes.position;
    positions.setXYZ(0, drawingWall.start[0], 0.05, drawingWall.start[1]);
    positions.setXYZ(1, cursorWorldPos.current[0], 0.05, cursorWorldPos.current[1]);
    positions.needsUpdate = true;

    // Change line color when wall is too short
    const mat = previewLineRef.current.material as THREE.LineDashedMaterial;
    const targetColor = isTooShort ? REJECT_COLOR : PREVIEW_COLOR;
    mat.color.setHex(targetColor);
  });

  return (
    <group>
      {/* Preview line while drawing */}
      {isActive && drawingWall && <PreviewLine ref={previewLineRef} />}

      {/* Measurement tooltip while drawing */}
      {isActive && drawingWall && drawLength > 0.01 && (
        <Html position={tooltipPos} center style={{ pointerEvents: "none" }}>
          <div
            className={`rounded px-2 py-0.5 text-xs font-mono shadow-md whitespace-nowrap ${
              isTooShort
                ? "bg-red-500 text-white"
                : isTooLong
                  ? "bg-amber-500 text-white"
                  : "bg-zinc-800 text-white"
            }`}
          >
            {drawLength.toFixed(2)}m
            {isTooShort && " (too short)"}
            {isTooLong && " (very long)"}
          </div>
        </Html>
      )}

      {/* Render walls */}
      {walls.map((wall) =>
        viewMode === "plan" ? (
          <Wall2D key={wall.id} wall={wall} />
        ) : (
          <Wall3D
            key={wall.id}
            wall={wall}
            wallOpenings={openings.filter((o) => o.wallId === wall.id)}
          />
        )
      )}
    </group>
  );
}

/** Preview line primitive — avoids JSX <line> collision with SVG type */
const PreviewLine = forwardRef<THREE.Line>(function PreviewLine(_props, ref) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([0, 0.05, 0, 0, 0.05, 0]), 3)
    );
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: PREVIEW_COLOR,
        dashSize: 0.3,
        gapSize: 0.15,
      }),
    []
  );
  const line = useMemo(() => {
    const l = new THREE.Line(geom, mat);
    l.computeLineDistances();
    return l;
  }, [geom, mat]);

  // Forward ref
  useEffect(() => {
    if (!ref) return;
    if (typeof ref === "function") {
      ref(line);
    } else {
      (ref as React.MutableRefObject<THREE.Line | null>).current = line;
    }
  }, [ref, line]);

  return <primitive object={line} />;
});

/** 2D wall representation: thick line (actually a thin box at ground level) */
function Wall2D({ wall }: { wall: WallSegment }) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const cx = (wall.start[0] + wall.end[0]) / 2;
  const cz = (wall.start[1] + wall.end[1]) / 2;

  if (length < 0.01) return null;

  return (
    <mesh
      position={[cx, 0.02, cz]}
      rotation={[0, -angle, 0]}
    >
      <boxGeometry args={[length, 0.02, wall.thickness]} />
      <meshBasicMaterial color={WALL_COLOR_2D} />
    </mesh>
  );
}

/** 3D wall representation: extruded box, with CSG subtraction for openings */
function Wall3D({ wall, wallOpenings }: { wall: WallSegment; wallOpenings: Opening[] }) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const cx = (wall.start[0] + wall.end[0]) / 2;
  const cz = (wall.start[1] + wall.end[1]) / 2;
  const baseY = wall.floor * wall.height;

  if (length < 0.01) return null;

  // CSG mesh: computed when there are openings on this wall
  const csgMesh = useMemo(() => {
    if (wallOpenings.length === 0) return null;

    try {
      const wallMat = new THREE.MeshStandardMaterial({
        color: WALL_COLOR_3D,
        roughness: 0.7,
      });

      // Wall brush — positioned at world origin initially, then moved to match wall transform
      const wallGeom = new THREE.BoxGeometry(length, wall.height, wall.thickness);
      const wallBrush = new Brush(wallGeom, wallMat);
      wallBrush.position.set(cx, baseY + wall.height / 2, cz);
      wallBrush.rotation.set(0, -angle, 0);
      wallBrush.updateMatrixWorld();

      let currentBrush: Brush = wallBrush;

      for (const opening of wallOpenings) {
        const preset = lookupPreset(opening.presetId);
        if (!preset) continue;

        // Opening world position along wall centerline
        const owx = wall.start[0] + opening.t * (wall.end[0] - wall.start[0]);
        const owz = wall.start[1] + opening.t * (wall.end[1] - wall.start[1]);

        // Sill height: 0.1m for doors (floor level), 0.9m for windows
        const sillHeight = preset.category === "door" ? 0.0 : 0.9;
        const openingCenterY = baseY + sillHeight + preset.height / 2;

        // Opening box: slightly wider in thickness (+0.02) to avoid coplanar faces
        const openingGeom = new THREE.BoxGeometry(
          preset.width,
          preset.height,
          wall.thickness + 0.02
        );
        const openingBrush = new Brush(openingGeom);
        openingBrush.position.set(owx, openingCenterY, owz);
        openingBrush.rotation.set(0, -angle, 0);
        openingBrush.updateMatrixWorld();

        const result = csgEvaluator.evaluate(currentBrush, openingBrush, SUBTRACTION);
        currentBrush = result;
      }

      return currentBrush;
    } catch (err) {
      console.warn("[Wall3D] CSG failed, falling back to plain geometry", err);
      return null;
    }
  }, [wall, wallOpenings, cx, cz, baseY, length, angle]);

  // If CSG succeeded, render it via primitive
  if (wallOpenings.length > 0 && csgMesh) {
    return <primitive object={csgMesh} castShadow receiveShadow />;
  }

  // Fallback: plain box geometry (no openings, or CSG error)
  return (
    <mesh
      position={[cx, baseY + wall.height / 2, cz]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[length, wall.height, wall.thickness]} />
      <meshStandardMaterial color={WALL_COLOR_3D} roughness={0.7} />
    </mesh>
  );
}
