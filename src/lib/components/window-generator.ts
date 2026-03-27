// src/lib/components/window-generator.ts
// Procedural window geometry: aluminum frame + glass pane + mullion dividers.
// Pure Three.js, no React.

import * as THREE from "three";
import type { ComponentPreset } from "./component-types";

/**
 * Generate a window group from a preset.
 * - Frame: aluminum-gray MeshStandardMaterial
 * - Glass: MeshPhysicalMaterial with transmission for transparency
 * - Mullion dividers based on pane count from metadata
 */
export function generateWindow(preset: ComponentPreset): THREE.Group {
  const group = new THREE.Group();
  group.name = "component-window";

  const { width, height, depth } = preset;
  const frameThickness = 0.04;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xc0c0c0,
    roughness: 0.35,
    metalness: 0.5,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x88ccee,
    transmission: 0.9,
    roughness: 0.05,
    metalness: 0.0,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });

  // --- Frame outline (4 rails) ---
  // Top rail
  const topRail = new THREE.Mesh(
    new THREE.BoxGeometry(width, frameThickness, depth),
    frameMat
  );
  topRail.position.set(0, height - frameThickness / 2, 0);
  group.add(topRail);

  // Bottom rail (sill)
  const bottomRail = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.02, frameThickness, depth + 0.01),
    frameMat
  );
  bottomRail.position.set(0, frameThickness / 2, 0);
  group.add(bottomRail);

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

  // --- Glass pane ---
  const glassW = width - frameThickness * 2;
  const glassH = height - frameThickness * 2;

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(glassW, glassH),
    glassMat
  );
  glass.position.set(0, height / 2, 0);
  group.add(glass);

  // --- Mullion dividers ---
  const panes = (preset.metadata.panes as number) ?? 1;
  if (panes > 1) {
    const mullionWidth = 0.025;
    for (let i = 1; i < panes; i++) {
      const x = -glassW / 2 + (glassW / panes) * i;
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(mullionWidth, glassH, depth * 0.8),
        frameMat
      );
      mullion.position.set(x, height / 2, 0);
      group.add(mullion);
    }
  }

  // Origin at bottom-center of window
  group.userData = { presetId: preset.id, category: "window" };
  return group;
}
