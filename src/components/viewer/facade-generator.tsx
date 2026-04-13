"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";
import { getPBRMaterial, getGroundFloorMaterial } from "@/lib/pbr-materials";
import { generateWindowTexture } from "./window-texture";

interface FacadeGeneratorProps {
  floor: FloorGeometry;
  era: BuildingEra;
  strctCd: string;
  mainPurpsCd: string;
  windowRatio: number;
  isGroundFloor: boolean;
}

export function FacadeGenerator({
  floor, era, strctCd, mainPurpsCd, windowRatio, isGroundFloor,
}: FacadeGeneratorProps) {
  const gap = 0.15;
  const y = floor.y + floor.height / 2;
  const floorH = floor.height - gap;

  const pbrConfig = isGroundFloor
    ? getGroundFloorMaterial(mainPurpsCd)
    : getPBRMaterial(strctCd, mainPurpsCd, era);

  // Generate window textures for front and side
  const frontTexture = useMemo(() => generateWindowTexture({
    width: floor.width,
    height: floorH,
    windowRatio,
    era,
    isGroundFloor,
    useCode: mainPurpsCd,
  }), [floor.width, floorH, windowRatio, era, isGroundFloor, mainPurpsCd]);

  const sideTexture = useMemo(() => generateWindowTexture({
    width: floor.depth,
    height: floorH,
    windowRatio: windowRatio * 0.7, // sides have fewer windows
    era,
    isGroundFloor: false,
    useCode: mainPurpsCd,
  }), [floor.depth, floorH, windowRatio, era, mainPurpsCd]);

  // Facade is 4 planes (front, back, left, right) slightly offset from the floor box
  const offset = 0.02; // slight offset to prevent z-fighting with floor mesh

  return (
    <group position={[0, y, 0]}>
      {/* Front face (+Z) */}
      <mesh position={[0, 0, floor.depth / 2 + offset]} castShadow receiveShadow>
        <planeGeometry args={[floor.width, floorH]} />
        <meshStandardMaterial
          color={pbrConfig.color}
          roughness={pbrConfig.roughness}
          metalness={pbrConfig.metalness}
          map={frontTexture}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Back face (-Z) */}
      <mesh position={[0, 0, -floor.depth / 2 - offset]} rotation={[0, Math.PI, 0]} castShadow receiveShadow>
        <planeGeometry args={[floor.width, floorH]} />
        <meshStandardMaterial
          color={pbrConfig.color}
          roughness={pbrConfig.roughness}
          metalness={pbrConfig.metalness}
          map={frontTexture}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Right face (+X) */}
      <mesh position={[floor.width / 2 + offset, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
        <planeGeometry args={[floor.depth, floorH]} />
        <meshStandardMaterial
          color={pbrConfig.color}
          roughness={pbrConfig.roughness}
          metalness={pbrConfig.metalness}
          map={sideTexture}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Left face (-X) */}
      <mesh position={[-floor.width / 2 - offset, 0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
        <planeGeometry args={[floor.depth, floorH]} />
        <meshStandardMaterial
          color={pbrConfig.color}
          roughness={pbrConfig.roughness}
          metalness={pbrConfig.metalness}
          map={sideTexture}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
