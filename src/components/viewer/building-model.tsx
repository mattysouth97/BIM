"use client";

import { useState } from "react";
import type { BuildingGeometry, FloorGeometry } from "@/lib/building-geometry";
import { SlabMesh } from "./slab-mesh";
import { ColumnGenerator } from "./column-generator";
import { RoofGenerator } from "./roof-generator";
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

  const aboveFloors = geometry.floors.filter(f => f.type === "above");
  const topFloor = aboveFloors.length > 0
    ? aboveFloors.reduce((max, f) => f.y + f.height > max.y + max.height ? f : max, aboveFloors[0])
    : null;
  const roofY = topFloor ? topFloor.y + topFloor.height : geometry.totalHeight;

  return (
    <group>
      <GroundPlane siteWidth={geometry.siteWidth} siteDepth={geometry.siteDepth} era={geometry.era} />

      <group>
        {geometry.floors.map((floor, index) => (
          <group key={`floor-group-${index}-${floor.floorNo}`}>
            <SlabMesh
              floor={floor}
              slabThickness={geometry.slabThickness}
              selected={selectedFloor === floor.floorNo}
              onSelect={handleSelect}
              onHover={setHoveredFloor}
              era={geometry.era}
              structureCode={floor.structureCode || geometry.strctCd}
            />

            <ColumnGenerator
              floor={floor}
              columnSpacing={geometry.columnSpacing}
              columnSize={geometry.columnSize}
              slabThickness={geometry.slabThickness}
              wallThickness={geometry.wallThickness}
              structureCode={floor.structureCode || geometry.strctCd}
              era={geometry.era}
            />
          </group>
        ))}
      </group>

      <RoofGenerator
        roofType={geometry.roofType}
        width={geometry.footprintWidth}
        depth={geometry.footprintDepth}
        y={roofY}
        strctCd={geometry.strctCd}
        era={geometry.era}
      />
    </group>
  );
}
