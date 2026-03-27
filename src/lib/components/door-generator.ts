// src/lib/components/door-generator.ts
// Procedural door geometry: wood frame + panel + handle cylinder.
// Pure Three.js, no React.

import * as THREE from "three";
import type { ComponentPreset } from "./component-types";

/**
 * Generate a door group from a preset.
 * - Frame: wood-brown outline (MeshStandardMaterial)
 * - Panel: slightly inset from frame
 * - Handle: small CylinderGeometry on one side
 */
export function generateDoor(preset: ComponentPreset): THREE.Group {
  const group = new THREE.Group();
  group.name = "component-door";

  const { width, height, depth } = preset;
  const frameThickness = 0.05;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x8b4513,
    roughness: 0.7,
    metalness: 0.05,
  });

  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xa0522d,
    roughness: 0.65,
    metalness: 0.02,
  });

  const handleMat = new THREE.MeshStandardMaterial({
    color: 0xc0c0c0,
    roughness: 0.3,
    metalness: 0.7,
  });

  // --- Frame pieces (top, left, right) ---
  // Top rail
  const topRail = new THREE.Mesh(
    new THREE.BoxGeometry(width, frameThickness, depth),
    frameMat
  );
  topRail.position.set(0, height - frameThickness / 2, 0);
  group.add(topRail);

  // Left stile
  const leftStile = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height, depth),
    frameMat
  );
  leftStile.position.set(-width / 2 + frameThickness / 2, height / 2, 0);
  group.add(leftStile);

  // Right stile
  const rightStile = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height, depth),
    frameMat
  );
  rightStile.position.set(width / 2 - frameThickness / 2, height / 2, 0);
  group.add(rightStile);

  // --- Door panel (inset from frame) ---
  const panelW = width - frameThickness * 2;
  const panelH = height - frameThickness;
  const panelD = depth * 0.6;

  const isDouble = (preset.metadata.type as string) === "double";
  if (isDouble) {
    // Two leaves
    const leafW = panelW / 2 - 0.005;
    const leftLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(leafW, panelH, panelD),
      panelMat
    );
    leftLeaf.position.set(-panelW / 4, panelH / 2, 0);
    group.add(leftLeaf);

    const rightLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(leafW, panelH, panelD),
      panelMat
    );
    rightLeaf.position.set(panelW / 4, panelH / 2, 0);
    group.add(rightLeaf);

    // Two handles
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8),
        handleMat
      );
      handle.rotation.x = Math.PI / 2;
      handle.position.set(side * 0.03, height * 0.45, panelD / 2 + 0.02);
      group.add(handle);
    }
  } else {
    // Single leaf
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(panelW, panelH, panelD),
      panelMat
    );
    panel.position.set(0, panelH / 2, 0);
    group.add(panel);

    // Handle on right side
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8),
      handleMat
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.set(panelW / 2 - 0.06, height * 0.45, panelD / 2 + 0.02);
    group.add(handle);
  }

  // Origin at bottom-center of door
  group.userData = { presetId: preset.id, category: "door" };
  return group;
}
