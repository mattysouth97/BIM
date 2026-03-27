// src/lib/components/mep-fixture-generator.ts
// Procedural MEP fixture geometry — switches on preset.id for visual style.
// Pure Three.js, no React.

import * as THREE from "three";
import type { ComponentPreset } from "./component-types";

/**
 * Generate an MEP fixture group from a preset.
 * Visual language matches the corresponding layer generators:
 * - sprinkler: cylinder head + red sphere bulb (layer 13 safety)
 * - bas-sensor: icosahedron green glow (layer 10 BAS)
 * - light-fixture: flat box with emissive white (layer 7 lighting)
 * - hvac-vent: box with grille lines (layer 5 ventilation)
 * - fire-alarm: small red box with emissive (layer 13 safety)
 */
export function generateMEPFixture(preset: ComponentPreset): THREE.Group {
  const group = new THREE.Group();
  group.name = `component-mep-${preset.id}`;

  switch (preset.id) {
    case "sprinkler":
      createSprinkler(group);
      break;
    case "bas-sensor":
      createBASSensor(group);
      break;
    case "light-fixture":
      createLightFixture(group, preset);
      break;
    case "hvac-vent":
      createHVACVent(group, preset);
      break;
    case "fire-alarm":
      createFireAlarm(group, preset);
      break;
    default:
      // Fallback: generic box
      createGenericFixture(group, preset);
  }

  group.userData = { presetId: preset.id, category: "mep", layerId: preset.layerId };
  return group;
}

function createSprinkler(group: THREE.Group): void {
  // Pipe stem
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.6 })
  );
  stem.position.set(0, -0.03, 0);
  group.add(stem);

  // Deflector plate (flat cylinder)
  const deflector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.005, 12),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.7 })
  );
  deflector.position.set(0, -0.065, 0);
  group.add(deflector);

  // Glass bulb (red)
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0xef4444,
      emissiveIntensity: 0.3,
    })
  );
  bulb.position.set(0, -0.05, 0);
  group.add(bulb);
}

function createBASSensor(group: THREE.Group): void {
  // Icosahedron matching layer-10-bas green glow
  const sensor = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.05, 1),
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0x22c55e,
      emissiveIntensity: 0.5,
    })
  );
  group.add(sensor);
}

function createLightFixture(group: THREE.Group, preset: ComponentPreset): void {
  // Flat box matching layer-7-lighting fixture style
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(preset.width, preset.height, preset.depth),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.3,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.8,
    })
  );
  group.add(body);

  // Diffuser lens (bottom face)
  const lens = new THREE.Mesh(
    new THREE.PlaneGeometry(preset.width - 0.04, preset.depth - 0.02),
    new THREE.MeshStandardMaterial({
      color: 0xfefce8,
      roughness: 0.1,
      emissive: 0xfbbf24,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );
  lens.rotation.x = -Math.PI / 2;
  lens.position.set(0, -preset.height / 2 - 0.001, 0);
  group.add(lens);
}

function createHVACVent(group: THREE.Group, preset: ComponentPreset): void {
  // Outer frame
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(preset.width, preset.height, preset.depth),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4, metalness: 0.3 })
  );
  group.add(frame);

  // Grille lines (horizontal louvers)
  const louverCount = 5;
  const louverH = preset.depth * 0.7 / louverCount;
  const louverMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.3, metalness: 0.4 });

  for (let i = 0; i < louverCount; i++) {
    const z = -preset.depth * 0.35 + (i + 0.5) * (preset.depth * 0.7 / louverCount);
    const louver = new THREE.Mesh(
      new THREE.BoxGeometry(preset.width * 0.85, 0.003, louverH * 0.4),
      louverMat
    );
    louver.position.set(0, -preset.height / 2 - 0.001, z);
    louver.rotation.x = Math.PI * 0.15; // slight angle
    group.add(louver);
  }
}

function createFireAlarm(group: THREE.Group, preset: ComponentPreset): void {
  // Wall-mount box
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(preset.width, preset.height, preset.depth),
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.4,
      metalness: 0.1,
      emissive: 0xef4444,
      emissiveIntensity: 0.6,
    })
  );
  group.add(body);

  // Indicator light (small sphere)
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 1.0,
    })
  );
  led.position.set(0, preset.height * 0.3, preset.depth / 2 + 0.005);
  group.add(led);
}

function createGenericFixture(group: THREE.Group, preset: ComponentPreset): void {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(preset.width, preset.height, preset.depth),
    new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.5, metalness: 0.3 })
  );
  group.add(body);
}
