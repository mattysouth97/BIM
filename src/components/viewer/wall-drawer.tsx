"use client";

import { useRef, useEffect, useCallback, useMemo, forwardRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { usePlanStore, type WallSegment } from "@/store/plan-store";
import { useAuthoringStore } from "@/store/authoring-store";

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const WALL_COLOR_2D = 0x333333;
const WALL_COLOR_3D = 0xd4d4d4;
const PREVIEW_COLOR = 0x3b82f6; // blue

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
  const drawingWall = usePlanStore((s) => s.drawingWall);
  const addWall = usePlanStore((s) => s.addWall);
  const startDrawing = usePlanStore((s) => s.startDrawing);
  const cancelDrawing = usePlanStore((s) => s.cancelDrawing);
  const activeFloor = usePlanStore((s) => s.activeFloor);
  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);

  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mousePos = useRef(new THREE.Vector2());
  const cursorWorldPos = useRef<[number, number]>([0, 0]);
  const previewLineRef = useRef<THREE.Line | null>(null);

  const isActive = viewMode === "plan" && isAuthoring;

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
      if (point) {
        cursorWorldPos.current = point;
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener("mousemove", handleMouseMove);
    return () => canvas.removeEventListener("mousemove", handleMouseMove);
  }, [isActive, drawingWall, getGroundPoint, gl]);

  // Update preview line position each frame
  useFrame(() => {
    if (!previewLineRef.current || !drawingWall) return;
    const geom = previewLineRef.current.geometry as THREE.BufferGeometry;
    const positions = geom.attributes.position;
    positions.setXYZ(0, drawingWall.start[0], 0.05, drawingWall.start[1]);
    positions.setXYZ(1, cursorWorldPos.current[0], 0.05, cursorWorldPos.current[1]);
    positions.needsUpdate = true;
  });

  return (
    <group>
      {/* Preview line while drawing */}
      {isActive && drawingWall && <PreviewLine ref={previewLineRef} />}

      {/* Render walls */}
      {walls.map((wall) =>
        viewMode === "plan" ? (
          <Wall2D key={wall.id} wall={wall} />
        ) : (
          <Wall3D key={wall.id} wall={wall} />
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

/** 3D wall representation: extruded box */
function Wall3D({ wall }: { wall: WallSegment }) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const cx = (wall.start[0] + wall.end[0]) / 2;
  const cz = (wall.start[1] + wall.end[1]) / 2;
  const baseY = wall.floor * wall.height;

  if (length < 0.01) return null;

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
