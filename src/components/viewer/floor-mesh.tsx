"use client";

import { useState, useRef, useMemo } from "react";
import * as THREE from "three";
import { Edges } from "@react-three/drei";
import type { Mesh } from "three";
import type { FloorGeometry } from "@/lib/building-geometry";
import { getPBRMaterial, getGroundFloorMaterial } from "@/lib/pbr-materials";

interface FloorMeshProps {
  floor: FloorGeometry;
  selected: boolean;
  onSelect: (floorNo: number) => void;
  onHover: (floorNo: number | null) => void;
  opacity?: number;
  /** GeoJSON-style rings: first ring is outer boundary, subsequent are holes. */
  footprintPolygon?: [number, number][][];
}

export function FloorMesh({
  floor, selected, onSelect, onHover, opacity = 0.85, footprintPolygon,
}: FloorMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const gap = 0.15;
  const floorH = floor.height - gap;
  const y = floor.y + floor.height / 2;

  // PBR material from structure/use type
  const pbrConfig = floor.isGroundFloor
    ? getGroundFloorMaterial(floor.useCode)
    : getPBRMaterial(floor.structureCode, floor.useCode);

  // Use ExtrudeGeometry when real footprint polygon is available
  const geometry = useMemo(() => {
    // footprintPolygon is [outerRing, ...holes] — extract outer ring for THREE.Shape
    const outerRing = footprintPolygon?.[0];
    if (outerRing && outerRing.length >= 3) {
      const shape = new THREE.Shape();
      shape.moveTo(outerRing[0][0], outerRing[0][1]);
      for (let i = 1; i < outerRing.length; i++) {
        shape.lineTo(outerRing[i][0], outerRing[i][1]);
      }
      shape.closePath();

      const extrudeSettings = {
        depth: floorH,
        bevelEnabled: false,
      };
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // Rotate so extrusion goes up (Y axis) instead of Z
      geo.rotateX(-Math.PI / 2);
      return geo;
    }
    // Fallback: box geometry
    return new THREE.BoxGeometry(floor.width, floorH, floor.depth);
  }, [footprintPolygon, floor.width, floor.depth, floorH]);

  const baseColor = selected ? "#FFD700" : hovered ? "#87CEEB" : pbrConfig.color;
  const [roughnessVariation] = useState(() => Math.random() * 0.05 - 0.025);

  return (
    <mesh
      ref={meshRef}
      position={[0, y, 0]}
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={(e) => { e.stopPropagation(); onSelect(floor.floorNo); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(floor.floorNo); }}
      onPointerOut={() => { setHovered(false); onHover(null); }}
    >
      <meshPhysicalMaterial
        color={baseColor}
        transparent
        opacity={selected ? 1 : hovered ? 0.95 : opacity}
        roughness={pbrConfig.roughness + roughnessVariation}
        metalness={pbrConfig.metalness}
        clearcoat={pbrConfig.metalness > 0.3 ? 0.3 : 0}
        clearcoatRoughness={0.4}
        envMapIntensity={1.2}
      />
      <Edges threshold={15} color={selected ? "#B8860B" : "#444444"} lineWidth={selected ? 2 : 0.5} />
    </mesh>
  );
}
