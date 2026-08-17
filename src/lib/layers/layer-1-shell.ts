// src/lib/layers/layer-1-shell.ts
// Layer 1: Shell — Base Architecture
// Semi-transparent glass-box structural skeleton: slabs, columns, core walls.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { computeCoreLayout } from "./core-layout";
import {
  createPlateShape,
  plateRings,
  pointInPlateInset,
  samplePlateGrid,
} from "./plate";
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

    const { floors, column, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const rings = plateRings(recipe);
    const plateShape = createPlateShape(rings);

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

    // --- Floor slabs via ExtrudeGeometry of the schematic plate ---
    const slabThickness = recipe.slab.thickness || 0.25;
    const slabGeo = new THREE.ExtrudeGeometry(plateShape, {
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

    // --- Columns on structural grid, only on the solid plate ---
    const colSpacing = column.spacing || 6;
    const colSize = column.size || 0.4;
    const colInset = column.inset || 1.0;
    const colPositions = samplePlateGrid(recipe, colSpacing, colInset).filter(
      (p) => pointInPlateInset(p.x, p.z, rings, colSize / 2 + 0.1),
    );

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

    // --- Core walls at the schematic / layout core, not the bbox centre ---
    const layout = computeCoreLayout(recipe);
    const coreCx =
      layout.elevator.shafts.reduce((s, sh) => s + sh.x, 0) /
      Math.max(1, layout.elevator.shafts.length);
    const coreCz = layout.elevator.bankZ;
    const coreW = Math.max(layout.elevator.maxX - layout.elevator.minX, 2.4);
    const coreD = layout.elevator.shaftDepth;
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

    const coreWalls: { w: number; h: number; d: number; x: number; z: number }[] = [
      { w: coreW, h: totalHeight, d: wallThick, x: coreCx, z: coreCz - coreD / 2 },
      { w: coreW, h: totalHeight, d: wallThick, x: coreCx, z: coreCz + coreD / 2 },
      { w: wallThick, h: totalHeight, d: coreD, x: coreCx - coreW / 2, z: coreCz },
      { w: wallThick, h: totalHeight, d: coreD, x: coreCx + coreW / 2, z: coreCz },
    ];

    for (const cw of coreWalls) {
      const geo = new THREE.BoxGeometry(cw.w, cw.h, cw.d);
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, coreMaterial);
      mesh.position.set(cw.x, cw.h / 2, cw.z);
      mesh.userData = { type: "shell-core-wall" };
      group.add(mesh);
    }

    // --- Outer shell of the schematic plate, not a bounding box ---
    const shellGeo = new THREE.ExtrudeGeometry(createPlateShape(rings), {
      depth: totalHeight,
      bevelEnabled: false,
    });
    shellGeo.rotateX(-Math.PI / 2);
    this.geometries.push(shellGeo);
    const shellMesh = new THREE.Mesh(shellGeo, shellMaterial);
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
