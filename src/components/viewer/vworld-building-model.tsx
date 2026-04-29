"use client";

// src/components/viewer/vworld-building-model.tsx
// Real-geometry R3F renderer that consumes VWorld LT_C_SPBD per-building
// polygons and extrudes each building by its inferred height. This is the
// highest-detail real-footprint path — it complements (does not replace) the
// procedural pipeline that ships in procedural-building.ts.

import { useMemo } from "react";
import * as THREE from "three";
import type { VWorldBuilding3D } from "@/hooks/use-vworld-buildings-3d";
import { createSceneProjection } from "@/lib/gis/gis-transform";

interface VWorldBuildingModelProps {
  /** Buildings returned by the /api/vworld/buildings-3d route. */
  buildings: VWorldBuilding3D[];
  /** WGS-84 centroid used as the scene origin for projection. */
  origin: { lng: number; lat: number };
  /** ID of the "focus" building — rendered with the signal colour. */
  focusId?: string;
  /** Fallback height when VWorld has no floor count / height attribute. */
  fallbackHeightM?: number;
  /** Whether to cast shadows. */
  castShadow?: boolean;
}

const FOCUS_COLOR = new THREE.Color("#8de6f3"); // phosphor cyan — signal
const CONTEXT_COLOR = new THREE.Color("#d6d9dd"); // off-white for surrounding context
const GROUND_COLOR = new THREE.Color("#e8ead0");

/**
 * Tessellate one polygon (outer + holes) into a flat Shape, extrude to height.
 */
function buildShape(
  projected: [number, number][][],
): THREE.Shape | null {
  if (projected.length === 0 || projected[0].length < 3) return null;

  const shape = new THREE.Shape();
  const [firstX, firstZ] = projected[0][0];
  shape.moveTo(firstX, firstZ);
  for (let i = 1; i < projected[0].length; i++) {
    const [x, z] = projected[0][i];
    shape.lineTo(x, z);
  }
  shape.closePath();

  for (let r = 1; r < projected.length; r++) {
    const holeRing = projected[r];
    if (holeRing.length < 3) continue;
    const hole = new THREE.Path();
    hole.moveTo(holeRing[0][0], holeRing[0][1]);
    for (let i = 1; i < holeRing.length; i++) {
      hole.lineTo(holeRing[i][0], holeRing[i][1]);
    }
    hole.closePath();
    shape.holes.push(hole);
  }

  return shape;
}

export function VWorldBuildingModel({
  buildings,
  origin,
  focusId,
  fallbackHeightM = 9.9, // 3 storeys at 3.3m
  castShadow = true,
}: VWorldBuildingModelProps) {
  const projection = useMemo(
    () => createSceneProjection(origin.lng, origin.lat),
    [origin.lng, origin.lat]
  );

  const meshes = useMemo(() => {
    return buildings
      .map((b) => {
        const projected: [number, number][][] = b.polygon.map((ring) =>
          ring.map(([lng, lat]) => projection.project(lng, lat) as [number, number])
        );
        const shape = buildShape(projected);
        if (!shape) return null;

        const height = b.heightM > 0 ? b.heightM : fallbackHeightM;

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: false,
          curveSegments: 1,
          steps: 1,
        });
        // Extrude is along +Z by default; rotate so height is +Y.
        geometry.rotateX(-Math.PI / 2);
        geometry.computeVertexNormals();

        return {
          id: b.id,
          name: b.name,
          geometry,
          height,
          floorsAbove: b.floorsAbove,
          isFocus: focusId ? b.id === focusId : false,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }, [buildings, projection, fallbackHeightM, focusId]);

  // Determine ground extents so we can drop a subtle ground plane that
  // matches the queried radius.
  const groundSize = useMemo(() => {
    let maxExtent = 50;
    for (const m of meshes) {
      const box = new THREE.Box3().setFromBufferAttribute(
        m.geometry.getAttribute("position") as THREE.BufferAttribute
      );
      maxExtent = Math.max(
        maxExtent,
        Math.abs(box.min.x),
        Math.abs(box.max.x),
        Math.abs(box.min.z),
        Math.abs(box.max.z)
      );
    }
    return maxExtent * 1.6;
  }, [meshes]);

  return (
    <group>
      {/* Ground plane covering the VWorld query radius */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.02, 0]}>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial
          color={GROUND_COLOR}
          roughness={0.95}
          metalness={0.0}
        />
      </mesh>

      {/* Extruded buildings */}
      {meshes.map((m) => (
        <mesh
          key={m.id}
          geometry={m.geometry}
          castShadow={castShadow}
          receiveShadow
        >
          <meshStandardMaterial
            color={m.isFocus ? FOCUS_COLOR : CONTEXT_COLOR}
            roughness={m.isFocus ? 0.42 : 0.78}
            metalness={m.isFocus ? 0.08 : 0.02}
            emissive={m.isFocus ? FOCUS_COLOR : "#000000"}
            emissiveIntensity={m.isFocus ? 0.08 : 0}
          />
        </mesh>
      ))}

      {/* Roof outline highlight for focus building — pure aesthetic precision */}
      {meshes
        .filter((m) => m.isFocus)
        .map((m) => {
          const edges = new THREE.EdgesGeometry(m.geometry, 20);
          return (
            <lineSegments key={`${m.id}-edges`} geometry={edges}>
              <lineBasicMaterial color="#1a2326" transparent opacity={0.65} />
            </lineSegments>
          );
        })}
    </group>
  );
}
