"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { SnapResult } from "@/lib/plan/snap-engine";

// ---------------------------------------------------------------------------
// Color palette per snap type
// ---------------------------------------------------------------------------

const SNAP_COLORS: Record<string, number> = {
  vertex: 0x2196f3, // blue
  edge: 0x4caf50,   // green
  grid: 0x9e9e9e,   // grey
  none: 0x9e9e9e,
};

// ---------------------------------------------------------------------------
// SnapIndicator
// ---------------------------------------------------------------------------

/**
 * R3F component that renders snap visual feedback:
 * - A colored ring dot at the snap point
 * - Two dashed crosshair lines extending along X and Z axes
 *
 * Color coding:
 *   vertex  → blue  #2196f3
 *   edge    → green #4caf50
 *   grid    → grey  #9e9e9e
 */
export function SnapIndicator({
  snapResult,
}: {
  snapResult: SnapResult | null;
}) {
  // Ring geometry — inner radius 0, outer radius 0.08m
  const ringGeom = useMemo(
    () => new THREE.RingGeometry(0, 0.08, 24),
    []
  );

  // Crosshair geometry — two lines extending +/- 100m along X and Z axes
  const crosshairGeomX = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-100, 0, 0, 100, 0, 0]),
        3
      )
    );
    return g;
  }, []);

  const crosshairGeomZ = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([0, 0, -100, 0, 0, 100]),
        3
      )
    );
    return g;
  }, []);

  // Materials — one per snap type (vertex, edge, grid)
  const matVertex = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: SNAP_COLORS.vertex,
        dashSize: 0.2,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.4,
      }),
    []
  );
  const matEdge = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: SNAP_COLORS.edge,
        dashSize: 0.2,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.4,
      }),
    []
  );
  const matGrid = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: SNAP_COLORS.grid,
        dashSize: 0.2,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.4,
      }),
    []
  );

  // Line objects — built once; computeLineDistances required for dashed lines
  const lineXVertex = useMemo(() => {
    const l = new THREE.Line(crosshairGeomX, matVertex);
    l.computeLineDistances();
    return l;
  }, [crosshairGeomX, matVertex]);

  const lineZVertex = useMemo(() => {
    const l = new THREE.Line(crosshairGeomZ, matVertex);
    l.computeLineDistances();
    return l;
  }, [crosshairGeomZ, matVertex]);

  const lineXEdge = useMemo(() => {
    const l = new THREE.Line(crosshairGeomX, matEdge);
    l.computeLineDistances();
    return l;
  }, [crosshairGeomX, matEdge]);

  const lineZEdge = useMemo(() => {
    const l = new THREE.Line(crosshairGeomZ, matEdge);
    l.computeLineDistances();
    return l;
  }, [crosshairGeomZ, matEdge]);

  const lineXGrid = useMemo(() => {
    const l = new THREE.Line(crosshairGeomX, matGrid);
    l.computeLineDistances();
    return l;
  }, [crosshairGeomX, matGrid]);

  const lineZGrid = useMemo(() => {
    const l = new THREE.Line(crosshairGeomZ, matGrid);
    l.computeLineDistances();
    return l;
  }, [crosshairGeomZ, matGrid]);

  if (!snapResult || snapResult.type === "none") return null;

  const [x, z] = snapResult.point;
  const color = SNAP_COLORS[snapResult.type] ?? SNAP_COLORS.grid;

  // Choose the correct line pair based on snap type
  const lineX =
    snapResult.type === "vertex"
      ? lineXVertex
      : snapResult.type === "edge"
        ? lineXEdge
        : lineXGrid;

  const lineZ =
    snapResult.type === "vertex"
      ? lineZVertex
      : snapResult.type === "edge"
        ? lineZEdge
        : lineZGrid;

  return (
    <group position={[x, 0.05, z]}>
      {/* Colored ring dot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <primitive object={ringGeom} attach="geometry" />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>

      {/* Crosshair lines */}
      <primitive object={lineX} />
      <primitive object={lineZ} />
    </group>
  );
}
