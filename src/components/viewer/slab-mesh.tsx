"use client";

import { useState, useRef, Suspense } from "react";
import { Edges } from "@react-three/drei";
import type { Mesh } from "three";
import type { FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";
import { useTexturedMaterial } from "@/hooks/use-textured-material";

interface SlabMeshProps {
  floor: FloorGeometry;
  slabThickness: number;
  selected: boolean;
  onSelect: (floorNo: number) => void;
  onHover: (floorNo: number | null) => void;
  era?: BuildingEra;
  structureCode?: string;
}

function TexturedSlab({ floor, slabThickness, selected, onSelect, onHover, era, structureCode }: SlabMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const y = floor.y + slabThickness / 2;

  const texMat = useTexturedMaterial(structureCode || "11", era, "slab");

  const baseColor = selected ? "#FFD700" : hovered ? "#A8D8EA" : texMat.color;
  const edgeColor = selected ? "#B8860B" : "#555555";

  return (
    <mesh
      ref={meshRef}
      position={[0, y, 0]}
      castShadow
      receiveShadow
      onClick={(e) => { e.stopPropagation(); onSelect(floor.floorNo); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(floor.floorNo); }}
      onPointerOut={() => { setHovered(false); onHover(null); }}
    >
      <boxGeometry args={[floor.width, slabThickness, floor.depth]} />
      <meshStandardMaterial
        map={selected || hovered ? undefined : texMat.map}
        normalMap={texMat.normalMap}
        normalScale={texMat.normalScale}
        roughnessMap={selected || hovered ? undefined : texMat.roughnessMap}
        color={baseColor}
        roughness={texMat.roughness}
        metalness={0.02}
      />
      <Edges threshold={15} color={edgeColor} lineWidth={selected ? 2 : 0.5} />
    </mesh>
  );
}

export function SlabMesh(props: SlabMeshProps) {
  return (
    <Suspense fallback={null}>
      <TexturedSlab {...props} />
    </Suspense>
  );
}
