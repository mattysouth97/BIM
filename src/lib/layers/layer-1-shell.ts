// src/lib/layers/layer-1-shell.ts
// Layer 1: Shell — Base Architecture
// Semi-transparent glass-box structural skeleton: slabs, columns, core walls.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/**
 * ShellLayer renders the building's structural skeleton as a translucent
 * glass-box: extruded floor slabs, instanced columns on a grid, and
 * central core walls. Provides spatial reference for all other layers.
 */
export class ShellLayer implements LayerGenerator {
  private group: THREE.Group | null = null;
  private disposables: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-1-shell";

    const { floors, footprintWidth, footprintDepth, column, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    // --- Glass-box shell material ---
    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc0d8ef,
      transparent: true,
      transmission: 0.8,
      opacity: 0.2,
      roughness: 0.1,
      metalness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.disposables.push(shellMaterial);

    // --- Floor slabs via ExtrudeGeometry ---
    const slabThickness = recipe.slab.thickness || 0.25;
    const slabShape = new THREE.Shape();
    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;
    slabShape.moveTo(-hw, -hd);
    slabShape.lineTo(hw, -hd);
    slabShape.lineTo(hw, hd);
    slabShape.lineTo(-hw, hd);
    slabShape.closePath();

    const slabGeo = new THREE.ExtrudeGeometry(slabShape, {
      depth: slabThickness,
      bevelEnabled: false,
    });
    // Rotate so extrusion goes along Y instead of Z
    slabGeo.rotateX(-Math.PI / 2);
    this.geometries.push(slabGeo);

    const slabMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9e9e9e,
      transparent: true,
      opacity: 0.35,
      roughness: 0.4,
      metalness: 0.1,
      depthWrite: false,
    });
    this.disposables.push(slabMaterial);

    for (const floor of floors) {
      const slab = new THREE.Mesh(slabGeo, slabMaterial);
      slab.position.set(0, floor.y, 0);
      slab.userData = { type: "shell-slab", floorNo: floor.floorNo };
      group.add(slab);
    }

    // --- Columns on structural grid (InstancedMesh) ---
    const colSpacing = column.spacing || 6;
    const colSize = column.size || 0.4;
    const colInset = column.inset || 1.0;

    // Calculate column grid positions
    const colPositions: { x: number; z: number }[] = [];
    const startX = -hw + colInset;
    const endX = hw - colInset;
    const startZ = -hd + colInset;
    const endZ = hd - colInset;

    for (let x = startX; x <= endX + 0.01; x += colSpacing) {
      for (let z = startZ; z <= endZ + 0.01; z += colSpacing) {
        colPositions.push({ x, z });
      }
    }

    if (colPositions.length > 0) {
      const colHeight = totalHeight;
      const colGeo = new THREE.BoxGeometry(colSize, colHeight, colSize);
      this.geometries.push(colGeo);

      const colMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xb0b0b0,
        transparent: true,
        opacity: 0.3,
        roughness: 0.3,
        metalness: 0.1,
        depthWrite: false,
      });
      this.disposables.push(colMaterial);

      const colIM = new THREE.InstancedMesh(colGeo, colMaterial, colPositions.length);
      colIM.userData = { type: "shell-column" };
      const mat4 = new THREE.Matrix4();

      for (let i = 0; i < colPositions.length; i++) {
        mat4.makeTranslation(colPositions[i].x, colHeight / 2, colPositions[i].z);
        colIM.setMatrixAt(i, mat4);
      }
      colIM.instanceMatrix.needsUpdate = true;
      group.add(colIM);
    }

    // --- Core walls at building center ---
    const coreW = footprintWidth * 0.15;
    const coreD = footprintDepth * 0.15;
    const wallThick = recipe.wallThickness || 0.2;

    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa0a0a0,
      transparent: true,
      opacity: 0.25,
      roughness: 0.5,
      metalness: 0.05,
      depthWrite: false,
    });
    this.disposables.push(coreMaterial);

    // 4 core walls forming a rectangle at center
    const coreWalls: { w: number; h: number; d: number; x: number; z: number }[] = [
      { w: coreW, h: totalHeight, d: wallThick, x: 0, z: -coreD / 2 }, // north
      { w: coreW, h: totalHeight, d: wallThick, x: 0, z: coreD / 2 },  // south
      { w: wallThick, h: totalHeight, d: coreD, x: -coreW / 2, z: 0 }, // west
      { w: wallThick, h: totalHeight, d: coreD, x: coreW / 2, z: 0 },  // east
    ];

    for (const cw of coreWalls) {
      const geo = new THREE.BoxGeometry(cw.w, cw.h, cw.d);
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, coreMaterial);
      mesh.position.set(cw.x, cw.h / 2, cw.z);
      mesh.userData = { type: "shell-core-wall" };
      group.add(mesh);
    }

    // --- Outer shell wireframe for reference ---
    const shellGeo = new THREE.BoxGeometry(footprintWidth, totalHeight, footprintDepth);
    this.geometries.push(shellGeo);
    const shellMesh = new THREE.Mesh(shellGeo, shellMaterial);
    shellMesh.position.set(0, totalHeight / 2, 0);
    shellMesh.userData = { type: "shell-envelope" };
    group.add(shellMesh);

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          mat.dispose();
        }
      }
    });
    this.disposables = [];
    this.geometries = [];
    this.group = null;
  }
}
