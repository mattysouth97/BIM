// src/lib/components/stair-generator.ts
// Procedural stair geometry: treads, stringers, and handrails.
// Pure Three.js, no React.

import * as THREE from "three";
import type { ComponentPreset } from "./component-types";

/**
 * Generate a stair group from a preset.
 * - Standard/wide: straight stacked treads with stringers and handrails
 * - Spiral: treads arranged in a spiral around a central column
 */
export function generateStair(preset: ComponentPreset): THREE.Group {
  const group = new THREE.Group();
  group.name = "component-stair";

  const stairType = (preset.metadata.type as string) ?? "straight";

  if (stairType === "spiral") {
    createSpiralStair(group, preset);
  } else {
    createStraightStair(group, preset);
  }

  group.userData = { presetId: preset.id, category: "stair" };
  return group;
}

function createStraightStair(group: THREE.Group, preset: ComponentPreset): void {
  const { width, height } = preset;
  const riserHeight = (preset.metadata.riserHeight as number) ?? 0.17;
  const stepCount = Math.round(height / riserHeight);
  const treadDepth = 0.28; // Korean standard tread depth
  const treadThickness = 0.03;
  const totalRunLength = stepCount * treadDepth;

  const treadMat = new THREE.MeshStandardMaterial({
    color: 0xbcbcbc,
    roughness: 0.6,
    metalness: 0.1,
  });

  const stringerMat = new THREE.MeshStandardMaterial({
    color: 0x9e9e9e,
    roughness: 0.5,
    metalness: 0.2,
  });

  const handrailMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.3,
    metalness: 0.6,
  });

  // --- Treads ---
  for (let i = 0; i < stepCount; i++) {
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(width, treadThickness, treadDepth),
      treadMat
    );
    tread.position.set(
      0,
      (i + 1) * riserHeight - treadThickness / 2,
      i * treadDepth + treadDepth / 2
    );
    tread.castShadow = true;
    tread.receiveShadow = true;
    group.add(tread);
  }

  // --- Stringers (side beams) ---
  const stringerThickness = 0.04;
  const stringerHeight = height + 0.1;
  const angle = Math.atan2(height, totalRunLength);
  const stringerLength = Math.sqrt(height * height + totalRunLength * totalRunLength);

  for (const side of [-1, 1]) {
    const stringer = new THREE.Mesh(
      new THREE.BoxGeometry(stringerThickness, 0.15, stringerLength),
      stringerMat
    );
    stringer.position.set(
      side * (width / 2 + stringerThickness / 2),
      height / 2,
      totalRunLength / 2
    );
    stringer.rotation.x = -angle;
    stringer.position.y = height / 2;
    group.add(stringer);
  }

  // --- Handrails (cylinders along stringer top edges) ---
  const handrailRadius = 0.02;
  const handrailHeight = 0.9; // 900mm above tread

  for (const side of [-1, 1]) {
    // Vertical posts at bottom and top
    for (const t of [0, 1]) {
      const postX = side * (width / 2 + stringerThickness / 2);
      const postZ = t * totalRunLength;
      const postY = t * height;

      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(handrailRadius, handrailRadius, handrailHeight, 8),
        handrailMat
      );
      post.position.set(postX, postY + handrailHeight / 2, postZ);
      group.add(post);
    }

    // Handrail tube (horizontal, angled)
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(handrailRadius, handrailRadius, stringerLength, 8),
      handrailMat
    );
    rail.rotation.x = Math.PI / 2 - angle;
    rail.position.set(
      side * (width / 2 + stringerThickness / 2),
      height / 2 + handrailHeight,
      totalRunLength / 2
    );
    group.add(rail);
  }
}

function createSpiralStair(group: THREE.Group, preset: ComponentPreset): void {
  const { width, height } = preset;
  const riserHeight = (preset.metadata.riserHeight as number) ?? 0.2;
  const stepCount = Math.round(height / riserHeight);
  const radius = width / 2;
  const anglePerStep = (2 * Math.PI) / Math.max(stepCount, 12); // full rotation

  const treadMat = new THREE.MeshStandardMaterial({
    color: 0xbcbcbc,
    roughness: 0.6,
    metalness: 0.1,
  });

  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.3,
    metalness: 0.6,
  });

  // --- Central column ---
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, height + 0.1, 12),
    poleMat
  );
  pole.position.set(0, height / 2, 0);
  group.add(pole);

  // --- Spiral treads ---
  const treadWidth = radius - 0.08;
  const treadThickness = 0.03;
  const treadDepth = 0.35;

  for (let i = 0; i < stepCount; i++) {
    const angle = i * anglePerStep;
    const y = (i + 1) * riserHeight;
    const cx = Math.sin(angle) * (radius * 0.5);
    const cz = Math.cos(angle) * (radius * 0.5);

    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(treadWidth, treadThickness, treadDepth),
      treadMat
    );
    tread.position.set(cx, y, cz);
    tread.rotation.y = -angle;
    tread.castShadow = true;
    tread.receiveShadow = true;
    group.add(tread);
  }

  // --- Handrail (simplified: posts at every 3 steps) ---
  const handrailMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.3,
    metalness: 0.6,
  });
  const handrailHeight = 0.9;

  for (let i = 0; i < stepCount; i += 3) {
    const angle = i * anglePerStep;
    const y = (i + 1) * riserHeight;
    const px = Math.sin(angle) * radius;
    const pz = Math.cos(angle) * radius;

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8),
      handrailMat
    );
    post.position.set(px, y + handrailHeight / 2, pz);
    group.add(post);
  }
}
