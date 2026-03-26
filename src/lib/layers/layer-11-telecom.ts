// src/lib/layers/layer-11-telecom.ts
// Layer 11: Telecom — IT & Data. Server racks, fiber optic backbones, WAPs with high-speed pulse.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for high-speed data pulse along fiber lines */
const fiberPulseVertexShader = /* glsl */ `
  attribute float aLineDistance;
  varying float vLineDistance;
  void main() {
    vLineDistance = aLineDistance;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Fragment shader for rapid emission pulse moving along line UVs */
const fiberPulseFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying float vLineDistance;

  void main() {
    // Fast-moving pulse packets along the fiber
    float packetSpeed = 8.0;
    float packetWidth = 0.8;
    float wave = smoothstep(0.0, packetWidth, fract(vLineDistance * 0.5 - uTime * packetSpeed));
    float packet = wave * (1.0 - smoothstep(packetWidth * 0.5, packetWidth, fract(vLineDistance * 0.5 - uTime * packetSpeed)));

    // Base glow + bright packet
    float brightness = 0.15 + packet * 0.85;
    vec3 color = uColor * brightness;
    float alpha = 0.3 + packet * 0.7;
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * TelecomLayer generates IT/data infrastructure:
 * - Central server rack bounding boxes at basement/ground
 * - Dense LineSegments fiber optic lines radiating from server room
 * - High-speed ShaderMaterial emission pulse simulating data packets
 * - WAP (wireless access point) discs on ceilings per floor
 */
export class TelecomLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-11-telecom";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    // --- Server racks: cluster of boxes at ground/basement level ---
    const serverRoomX = 0;
    const serverRoomZ = 0;
    const serverRoomY = -0.5; // slightly below ground (basement)
    const rackCount = Math.max(2, Math.min(6, Math.floor(footprintWidth / 4)));

    const rackGeo = new THREE.BoxGeometry(0.6, 2.0, 0.8);
    const rackMat = new THREE.MeshStandardMaterial({
      color: 0x1e1e2e,
      metalness: 0.7,
      roughness: 0.3,
    });
    const rackIM = new THREE.InstancedMesh(rackGeo, rackMat, rackCount);
    rackIM.userData = { type: "telecom-server-rack" };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    const rackSpacing = 0.9;
    const rackRowStart = -(rackCount * rackSpacing) / 2;
    for (let i = 0; i < rackCount; i++) {
      pos.set(
        serverRoomX + rackRowStart + i * rackSpacing,
        serverRoomY + 1.0,
        serverRoomZ
      );
      mat4.compose(pos, quat, scl);
      rackIM.setMatrixAt(i, mat4);
    }
    rackIM.instanceMatrix.needsUpdate = true;
    group.add(rackIM);

    // LED indicator strips on server racks (thin emissive boxes)
    const ledGeo = new THREE.BoxGeometry(0.5, 0.02, 0.02);
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.0,
    });
    const ledIM = new THREE.InstancedMesh(ledGeo, ledMat, rackCount * 4);
    ledIM.userData = { type: "telecom-rack-led" };

    let ledIdx = 0;
    for (let i = 0; i < rackCount; i++) {
      const rx = serverRoomX + rackRowStart + i * rackSpacing;
      for (let row = 0; row < 4; row++) {
        pos.set(rx, serverRoomY + 0.5 + row * 0.45, serverRoomZ + 0.41);
        mat4.compose(pos, quat, scl);
        ledIM.setMatrixAt(ledIdx++, mat4);
      }
    }
    ledIM.count = ledIdx;
    ledIM.instanceMatrix.needsUpdate = true;
    group.add(ledIM);

    // --- Vertical fiber backbone from server room to roof ---
    const backboneRadius = 0.06;
    const backboneGeo = new THREE.CylinderGeometry(
      backboneRadius,
      backboneRadius,
      totalHeight + 1,
      8
    );
    const backboneMat = new THREE.MeshStandardMaterial({
      color: 0xd946ef,
      emissive: 0xd946ef,
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.3,
    });
    const backbone = new THREE.Mesh(backboneGeo, backboneMat);
    backbone.position.set(serverRoomX, totalHeight / 2 - 0.25, serverRoomZ);
    backbone.userData = { type: "telecom-backbone" };
    group.add(backbone);

    // --- Dense fiber optic lines from backbone to floor distribution ---
    const fiberMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xd946ef) },
      },
      vertexShader: fiberPulseVertexShader,
      fragmentShader: fiberPulseFragmentShader,
      transparent: true,
      depthWrite: false,
    });

    const cyanFiberMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x06b6d4) },
      },
      vertexShader: fiberPulseVertexShader,
      fragmentShader: fiberPulseFragmentShader,
      transparent: true,
      depthWrite: false,
    });

    // Distribution pattern per floor
    const endpointsPerFloor = Math.max(
      4,
      Math.floor(8 * density)
    );

    for (let fi = 0; fi < aboveFloors.length; fi++) {
      const floor = aboveFloors[fi];
      const ceilingY = floor.y + floor.height - 0.15;
      const backbonePoint = new THREE.Vector3(
        serverRoomX,
        ceilingY,
        serverRoomZ
      );

      const fiberPoints: THREE.Vector3[] = [];
      const fiberDistances: number[] = [];

      for (let e = 0; e < endpointsPerFloor; e++) {
        const angle = (e / endpointsPerFloor) * Math.PI * 2;
        const radius =
          Math.min(halfW, halfD) * 0.7 + Math.sin(e * 1.7) * halfW * 0.15;
        const endX = Math.cos(angle) * radius;
        const endZ = Math.sin(angle) * radius;

        // From backbone to endpoint
        fiberPoints.push(backbonePoint.clone());
        fiberPoints.push(new THREE.Vector3(endX, ceilingY, endZ));

        // Line distances for shader
        fiberDistances.push(0);
        const d = backbonePoint.distanceTo(
          new THREE.Vector3(endX, ceilingY, endZ)
        );
        fiberDistances.push(d);
      }

      if (fiberPoints.length > 0) {
        const fiberGeo = new THREE.BufferGeometry().setFromPoints(fiberPoints);
        fiberGeo.setAttribute(
          "aLineDistance",
          new THREE.Float32BufferAttribute(fiberDistances, 1)
        );

        const mat = fi % 2 === 0 ? fiberMat.clone() : cyanFiberMat.clone();
        const fiberLines = new THREE.LineSegments(fiberGeo, mat);
        fiberLines.userData = { type: "telecom-fiber", animated: true };
        group.add(fiberLines);
      }
    }

    // --- WAP discs on ceilings ---
    const wapGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 12);
    const wapMat = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      metalness: 0.4,
      roughness: 0.5,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.2,
    });

    // ~1 WAP per 80 sqm
    const wapSpacingX = Math.max(4, Math.sqrt(80));
    const wapSpacingZ = wapSpacingX;
    const wapColsX = Math.max(1, Math.floor(footprintWidth / wapSpacingX));
    const wapColsZ = Math.max(1, Math.floor(footprintDepth / wapSpacingZ));
    const wapsPerFloor = wapColsX * wapColsZ;
    const totalWaps = wapsPerFloor * aboveFloors.length;

    const wapIM = new THREE.InstancedMesh(
      wapGeo,
      wapMat,
      Math.max(1, totalWaps)
    );
    wapIM.userData = { type: "telecom-wap" };

    let wIdx = 0;
    for (const floor of aboveFloors) {
      const ceilingY = floor.y + floor.height - 0.05;
      for (let cx = 0; cx < wapColsX; cx++) {
        for (let cz = 0; cz < wapColsZ; cz++) {
          const x = -halfW + wapSpacingX * 0.5 + cx * wapSpacingX;
          const z = -halfD + wapSpacingZ * 0.5 + cz * wapSpacingZ;
          pos.set(x, ceilingY, z);
          mat4.compose(pos, quat, scl);
          wapIM.setMatrixAt(wIdx++, mat4);
        }
      }
    }
    wapIM.count = wIdx;
    wapIM.instanceMatrix.needsUpdate = true;
    group.add(wapIM);

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.InstancedMesh ||
        obj instanceof THREE.Line ||
        obj instanceof THREE.LineSegments
      ) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.group = null;
  }
}
