"use client";

import { useMemo, Suspense } from "react";
import type { FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";
import { Edges } from "@react-three/drei";
import { useTexturedMaterial } from "@/hooks/use-textured-material";

interface ColumnGeneratorProps {
  floor: FloorGeometry;
  columnSpacing: number;
  columnSize: number;
  slabThickness: number;
  wallThickness: number;
  structureCode: string;
  era?: BuildingEra;
}

interface ColumnDesc {
  x: number;
  z: number;
}

function generateColumnGrid(
  width: number,
  depth: number,
  spacing: number,
  columnSize: number,
  wallThickness: number,
): ColumnDesc[] {
  const columns: ColumnDesc[] = [];
  const margin = wallThickness + columnSize / 2 + 0.05;
  const innerW = width - margin * 2;
  const innerD = depth - margin * 2;

  if (innerW < spacing || innerD < spacing) return columns;

  const colsX = Math.max(2, Math.round(innerW / spacing) + 1);
  const colsZ = Math.max(2, Math.round(innerD / spacing) + 1);
  const spacingX = colsX > 1 ? innerW / (colsX - 1) : 0;
  const spacingZ = colsZ > 1 ? innerD / (colsZ - 1) : 0;

  for (let ix = 0; ix < colsX; ix++) {
    for (let iz = 0; iz < colsZ; iz++) {
      columns.push({
        x: colsX > 1 ? -innerW / 2 + ix * spacingX : 0,
        z: colsZ > 1 ? -innerD / 2 + iz * spacingZ : 0,
      });
    }
  }
  return columns;
}

function TexturedColumns({ floor, columnSpacing, columnSize, slabThickness, wallThickness, structureCode, era }: ColumnGeneratorProps) {
  const columns = useMemo(
    () => generateColumnGrid(floor.width, floor.depth, columnSpacing, columnSize, wallThickness),
    [floor.width, floor.depth, columnSpacing, columnSize, wallThickness]
  );

  const columnHeight = floor.height - slabThickness;
  const texMat = useTexturedMaterial(structureCode, era, "column");

  if (columnHeight <= 0 || columns.length === 0) return null;

  const y = floor.y + slabThickness + columnHeight / 2;

  return (
    <group>
      {columns.map((col, i) => (
        <mesh key={`col-${i}`} position={[col.x, y, col.z]} castShadow receiveShadow>
          <boxGeometry args={[columnSize, columnHeight, columnSize]} />
          <meshStandardMaterial
            map={texMat.map}
            normalMap={texMat.normalMap}
            normalScale={texMat.normalScale}
            roughnessMap={texMat.roughnessMap}
            color={texMat.color}
            roughness={texMat.roughness}
            metalness={texMat.metalness}
          />
          <Edges threshold={15} color="#444444" lineWidth={0.3} />
        </mesh>
      ))}
    </group>
  );
}

export function ColumnGenerator(props: ColumnGeneratorProps) {
  return (
    <Suspense fallback={null}>
      <TexturedColumns {...props} />
    </Suspense>
  );
}
