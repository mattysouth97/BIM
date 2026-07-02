"use client";

import { Suspense, useMemo } from "react";
import { Grid } from "@react-three/drei";
import * as THREE from "three";
import type { BuildingEra } from "@/lib/material-types";
import { useTexturedMaterial } from "@/hooks/use-textured-material";

/** One building's footprint outline, expressed as XZ-plane vertices in world space */
export interface FootprintOutline {
  /** Campus-relative XZ vertices — same coordinate space as the Three.js scene */
  vertices: THREE.Vector2[];
  /** Optional world-space XZ offset for this outline (building position) */
  offsetX?: number;
  offsetZ?: number;
}

interface GroundPlaneProps {
  siteWidth: number;
  siteDepth: number;
  era?: BuildingEra;
  /** When provided, scales the ground plane to cover the full campus */
  campusExtents?: { width: number; depth: number };
  /** Building footprint outlines to draw as LineLoop geometry on the ground */
  footprintOutlines?: FootprintOutline[];
}

function FootprintLines({ outlines }: { outlines: FootprintOutline[] }) {
  const lines = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: "#888888", linewidth: 1 });
    return outlines
      .filter((outline) => outline.vertices.length >= 3)
      .map((outline, i) => {
        const points: THREE.Vector3[] = outline.vertices.map(
          (v) => new THREE.Vector3(
            v.x + (outline.offsetX ?? 0),
            0.03,
            v.y + (outline.offsetZ ?? 0)
          )
        );
        // Close the loop
        points.push(points[0].clone());
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const lineObj = new THREE.Line(geo, mat);
        return { lineObj, key: i };
      });
  }, [outlines]);

  return (
    <>
      {lines.map((item) => (
        <primitive key={item.key} object={item.lineObj} />
      ))}
    </>
  );
}

function TexturedGround({ siteWidth, siteDepth, era, campusExtents, footprintOutlines }: GroundPlaneProps) {
  // In campus mode, use the campus extents to size the ground; otherwise fall back to site dimensions
  const effectiveWidth = campusExtents?.width ?? siteWidth;
  const effectiveDepth = campusExtents?.depth ?? siteDepth;
  const size = Math.max(effectiveWidth, effectiveDepth, 50);
  const texMat = useTexturedMaterial("11", era, "ground");

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[size * 3, size * 3]} />
        <meshStandardMaterial
          map={texMat.map}
          normalMap={texMat.normalMap}
          normalScale={texMat.normalScale}
          roughnessMap={texMat.roughnessMap}
          color="#d0d0d0"
          roughness={0.95}
          metalness={0}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[effectiveWidth, effectiveDepth]} />
        <meshStandardMaterial color="#c8c8c8" roughness={0.8} metalness={0} transparent opacity={0.4} />
      </mesh>

      <Grid
        args={[size * 2, size * 2]}
        position={[0, 0.01, 0]}
        cellSize={5}
        cellColor="#cccccc"
        sectionSize={10}
        sectionColor="#aaaaaa"
        fadeDistance={size * 3}
        fadeStrength={1.5}
        infiniteGrid
      />

      {/* Building footprint outlines — only rendered in campus mode */}
      {footprintOutlines && footprintOutlines.length > 0 && (
        <FootprintLines outlines={footprintOutlines} />
      )}
    </group>
  );
}

export function GroundPlane(props: GroundPlaneProps) {
  return (
    <Suspense fallback={null}>
      <TexturedGround {...props} />
    </Suspense>
  );
}

