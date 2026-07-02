"use client";

import { useMemo, Suspense } from "react";
import * as THREE from "three";
import { ROOF_MATERIALS } from "@/lib/pbr-materials";
import type { BuildingEra } from "@/lib/material-types";
import { useTexturedMaterial } from "@/hooks/use-textured-material";

interface RoofGeneratorProps {
  roofType: "flat" | "gable" | "hip" | "sawtooth" | "other";
  width: number;
  depth: number;
  y: number;
  height?: number;
  strctCd?: string;
  era?: BuildingEra;
  /** Number of sawtooth ridges (factory roofs) */
  sawtoothCount?: number;
}

function TexturedRoof({ roofType, width, depth, y, height = 3, strctCd, era, sawtoothCount = 4 }: RoofGeneratorProps) {
  const roofMatKey = roofType === "sawtooth" ? "gable" : roofType;
  const roofTint = ROOF_MATERIALS[roofMatKey] || ROOF_MATERIALS.flat;
  const texMat = useTexturedMaterial(strctCd || "11", era, "roof", undefined, roofType === "sawtooth" ? "gable" : roofType);

  const geometry = useMemo(() => {
    if (roofType === "gable") {
      const shape = new THREE.Shape();
      const hw = width / 2;
      shape.moveTo(-hw, 0);
      shape.lineTo(hw, 0);
      shape.lineTo(0, height);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geo.center();
      return geo;
    }
    if (roofType === "hip" || roofType === "other") {
      const hipInset = 0.35;
      const topW = width * hipInset, topD = depth * hipInset;
      const geo = new THREE.BufferGeometry();
      const hw = width / 2, hd = depth / 2;
      const thw = topW / 2, thd = topD / 2;
      const h = height;
      const vertices = new Float32Array([
        -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
        -thw, h, -thd, thw, h, -thd, thw, h, thd, -thw, h, thd,
      ]);
      const indices = [
        0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4,
        1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7,
      ];
      geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }
    if (roofType === "sawtooth") {
      // Repeating triangular cross-section for factory clerestory roofs
      const ridgeCount = Math.max(1, sawtoothCount);
      const ridgeWidth = width / ridgeCount;
      const hw = width / 2;
      const hd = depth / 2;
      const verts: number[] = [];
      const idxs: number[] = [];
      for (let i = 0; i < ridgeCount; i++) {
        const x0 = -hw + i * ridgeWidth;
        const x1 = -hw + (i + 1) * ridgeWidth;
        const bi = i * 6;
        verts.push(
          x0, 0, -hd, x1, 0, -hd, x1, height, -hd,
          x0, 0, hd, x1, 0, hd, x1, height, hd,
        );
        idxs.push(
          bi, bi + 1, bi + 4, bi, bi + 4, bi + 3,
          bi, bi + 2, bi + 1, bi, bi + 5, bi + 2, bi, bi + 3, bi + 5,
          bi + 1, bi + 2, bi + 5, bi + 1, bi + 5, bi + 4,
          bi, bi + 1, bi + 2, bi + 3, bi + 5, bi + 4,
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
      geo.setIndex(idxs);
      geo.computeVertexNormals();
      return geo;
    }
    return new THREE.BoxGeometry(width, 0.3, depth);
  }, [roofType, width, depth, height, sawtoothCount]);

  return (
    <mesh
      position={[0, roofType === "flat" ? y + 0.15 : y, 0]}
      geometry={geometry}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        map={texMat.map}
        normalMap={texMat.normalMap}
        normalScale={texMat.normalScale}
        roughnessMap={texMat.roughnessMap}
        color={roofTint.color}
        roughness={roofTint.roughness}
        metalness={roofTint.metalness}
      />
    </mesh>
  );
}

export function RoofGenerator(props: RoofGeneratorProps) {
  return (
    <Suspense fallback={null}>
      <TexturedRoof {...props} />
    </Suspense>
  );
}
