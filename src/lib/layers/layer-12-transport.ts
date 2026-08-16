// src/lib/layers/layer-12-transport.ts
// Layer 12: Kinetic Transport — elevator shafts with step-animated cabs and floor indicators.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import { computeCoreLayout } from "./core-layout";
import { getBuildingCodeRules } from "./building-code-rules";
import {
  ASSET_NATIVE_DIMS,
  getEquipmentGeometryClone,
  getEquipmentObjectClone,
  tagEquipmentObject,
} from "@/lib/equipment-assets";

/**
 * Vertex shader for elevator cab with discrete floor-step animation.
 * Instead of smooth oscillation, the cab dwells at floor heights and
 * lerps quickly between them (simulating real elevator behavior).
 *
 * uTopLanding is the highest landing INDEX (floorCount - 1), not the floor
 * count — the previous uFloorCount travel range let the cab climb one full
 * interval past the top landing, poking through the roof.
 */
const cabVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTopLanding;
  uniform float uFloorHeight;
  uniform float uShaftIndex;
  varying vec3 vNormal;
  varying float vBrightness;

  void main() {
    vNormal = normalMatrix * normal;

    // Phase offset per shaft
    float phase = uShaftIndex * 2.7;
    float cycle = mod(uTime * 0.25 + phase, uTopLanding * 2.0);

    // Ping-pong between the ground landing and the TOP landing
    float floorF;
    if (cycle < uTopLanding) {
      floorF = cycle;
    } else {
      floorF = uTopLanding * 2.0 - cycle;
    }

    // Discrete step: snap to nearest floor with quick transition
    float currentFloor = floor(floorF);
    float frac = fract(floorF);
    // Quick lerp: spend 80% of time dwelling, 20% moving
    float lerpT = smoothstep(0.0, 0.2, frac);
    float y = mix(currentFloor, currentFloor + 1.0, lerpT) * uFloorHeight;

    // Brightness pulses when doors would be open (dwelling)
    vBrightness = frac < 0.8 ? 1.2 : 0.8;

    vec3 displaced = position;
    displaced.y += y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

/** Fragment shader for elevator cab — bright amber glow */
const cabFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying float vBrightness;

  void main() {
    float lighting = 0.3 + 0.7 * abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)));
    gl_FragColor = vec4(uColor * lighting * vBrightness, 0.9);
  }
`;

/**
 * TransportLayer generates kinetic transport infrastructure:
 * - Vertical elevator shafts as wireframe LineSegments
 * - BoxGeometry elevator cabs with step-animated Y positions
 * - Floor indicator markers at each landing
 * - Guide rail vertical lines at shaft corners
 * - Shaft count scales with building height (1-3 shafts)
 */
export class TransportLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, _density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-12-transport";

    const { floors, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    // 건축법 제64조: passenger elevators are required from 6 above-ground
    // floors — low-rise buildings genuinely have none (stairwells, rendered
    // by the safety layer, are their vertical circulation), so the twin
    // renders no shaft rather than inventing one.
    if (!getBuildingCodeRules(recipe).elevatorRequired) {
      this.group = group;
      return group;
    }

    const floorCount = aboveFloors.length;
    const avgFloorHeight =
      floorCount > 0 ? totalHeight / floorCount : 3.5;

    // Shaft bank comes from the shared parametric core layout: positioned
    // against the rear (-Z) wall and sized to the footprint, so the shafts
    // no longer punch through the centre of the floor plate (where the
    // cooling riser, boiler, and DHW tanks used to interpenetrate them).
    const { elevator } = computeCoreLayout(recipe);
    const shaftPositions = elevator.shafts;
    const shaftWidth = elevator.shaftWidth;
    const shaftDepth = elevator.shaftDepth;
    const cabWidth = shaftWidth * 0.75;
    const cabDepth = shaftDepth * 0.75;
    const cabHeight = Math.min(2.6, avgFloorHeight * 0.75);

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);

    // Equipment sits ON TOP of the roof slab — for flat roofs the roof box
    // extends flatThickness above totalHeight (same convention as the other
    // MEP layers' rooftop plant placement).
    const roofTopY =
      totalHeight + (recipe.roof?.type === "flat" ? recipe.roof.flatThickness : 0);

    // Landing doors are detailed-asset-only and collected across ALL shafts
    // so the whole layer adds exactly one InstancedMesh (1 draw call) for
    // this element kind, rather than one IM per shaft.
    const doorPositions: { x: number; y: number; z: number; scale: number }[] = [];
    const doorNativeHeight = ASSET_NATIVE_DIMS["landing-door"].h;
    // Doors mount on the shaft's front face. With the bank now against the
    // rear (-Z) wall, the front face is the interior-facing +Z side of the
    // shaft box. The door's thin native axis (d=0.12, its hinge/thickness
    // axis) already points along world +Z, so no rotation is needed.
    const doorQuat = new THREE.Quaternion();

    for (let si = 0; si < shaftPositions.length; si++) {
      const sp = shaftPositions[si];

      // --- Shaft wireframe: full-height bounding box ---
      const shaftGeo = new THREE.BoxGeometry(
        shaftWidth,
        totalHeight,
        shaftDepth
      );
      const edgesGeo = new THREE.EdgesGeometry(shaftGeo);
      const shaftLines = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.4,
        })
      );
      shaftLines.position.set(sp.x, totalHeight / 2, sp.z);
      shaftLines.userData = { type: "transport-shaft" };
      group.add(shaftLines);
      shaftGeo.dispose();

      // --- Guide rails: 4 vertical lines at shaft corners ---
      const railHW = shaftWidth / 2 - 0.06;
      const railHD = shaftDepth / 2 - 0.06;
      const railCorners = [
        [sp.x - railHW, sp.z - railHD],
        [sp.x + railHW, sp.z - railHD],
        [sp.x - railHW, sp.z + railHD],
        [sp.x + railHW, sp.z + railHD],
      ];

      const railMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.25,
      });

      for (const [rx, rz] of railCorners) {
        const railGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(rx, 0, rz),
          new THREE.Vector3(rx, totalHeight, rz),
        ]);
        const rail = new THREE.LineSegments(railGeo, railMat.clone());
        group.add(rail);
      }

      // --- Floor indicator markers at each landing ---
      const indicatorGeo = new THREE.PlaneGeometry(0.15, 0.1);
      const indicatorMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.6,
        side: THREE.DoubleSide,
      });
      const indicatorIM = new THREE.InstancedMesh(
        indicatorGeo,
        indicatorMat,
        floorCount
      );
      indicatorIM.userData = { type: "transport-floor-indicator" };

      // Indicators face the interior (+Z) — the same side the landing doors
      // mount on now that the bank backs onto the rear wall.
      const indQuat = new THREE.Quaternion();
      for (let fi = 0; fi < floorCount; fi++) {
        const floorY = aboveFloors[fi].y + aboveFloors[fi].height * 0.5;
        pos.set(sp.x, floorY, sp.z + shaftDepth / 2 + 0.02);
        mat4.compose(pos, indQuat, scl);
        indicatorIM.setMatrixAt(fi, mat4);
      }
      indicatorIM.count = floorCount;
      indicatorIM.instanceMatrix.needsUpdate = true;
      group.add(indicatorIM);

      // --- Horizontal landing marks (thin lines at each floor) ---
      const landingMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.15,
      });
      for (const floor of aboveFloors) {
        const landingY = floor.y;
        const landingGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(
            sp.x - shaftWidth / 2,
            landingY,
            sp.z - shaftDepth / 2
          ),
          new THREE.Vector3(
            sp.x + shaftWidth / 2,
            landingY,
            sp.z - shaftDepth / 2
          ),
          new THREE.Vector3(
            sp.x + shaftWidth / 2,
            landingY,
            sp.z + shaftDepth / 2
          ),
          new THREE.Vector3(
            sp.x - shaftWidth / 2,
            landingY,
            sp.z + shaftDepth / 2
          ),
          new THREE.Vector3(
            sp.x - shaftWidth / 2,
            landingY,
            sp.z - shaftDepth / 2
          ),
        ]);
        const landing = new THREE.Line(landingGeo, landingMat.clone());
        group.add(landing);
      }

      // --- Animated elevator cab ---
      // Detailed Blender asset when preloaded — geometry-only swap; the
      // material, position, userData, and step-animation shader below are
      // unchanged. Fallback = existing BoxGeometry when the cache is empty.
      const cabAssetGeo = getEquipmentGeometryClone("elevator-cab");
      let cabGeo: THREE.BufferGeometry;
      if (cabAssetGeo) {
        const native = ASSET_NATIVE_DIMS["elevator-cab"];
        cabAssetGeo.scale(
          cabWidth / native.w,
          cabHeight / native.h,
          cabDepth / native.d
        );
        cabGeo = cabAssetGeo;
      } else {
        cabGeo = new THREE.BoxGeometry(cabWidth, cabHeight, cabDepth);
      }
      const cabMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          // Highest landing index — cab travel tops out at the top FLOOR,
          // not at roof level (floorCount would overshoot by one interval).
          uTopLanding: { value: Math.max(1, floorCount - 1) },
          uFloorHeight: { value: avgFloorHeight },
          uShaftIndex: { value: si },
          uColor: { value: new THREE.Color(0xf59e0b) },
        },
        vertexShader: cabVertexShader,
        fragmentShader: cabFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const cabMesh = new THREE.Mesh(cabGeo, cabMat);
      cabMesh.position.set(sp.x, cabHeight / 2, sp.z);
      cabMesh.userData = { type: "transport-cab", animated: true, shaftIndex: si };
      group.add(cabMesh);

      // --- Counterweight on opposite side (thin box) ---
      // Detailed Blender asset when preloaded — geometry-only swap, scaled
      // to the same box dims used today; material/position/userData
      // unchanged. Fallback = existing BoxGeometry when the cache is empty.
      const cwAssetGeo = getEquipmentGeometryClone("elevator-counterweight");
      let cwGeo: THREE.BufferGeometry;
      if (cwAssetGeo) {
        const native = ASSET_NATIVE_DIMS["elevator-counterweight"];
        cwAssetGeo.scale(
          0.3 / native.w,
          (cabHeight * 0.6) / native.h,
          (cabDepth * 0.3) / native.d
        );
        cwGeo = cwAssetGeo;
      } else {
        cwGeo = new THREE.BoxGeometry(0.3, cabHeight * 0.6, cabDepth * 0.3);
      }
      const cwMat = new THREE.MeshStandardMaterial({
        color: 0x666666,
        metalness: 0.6,
        roughness: 0.4,
      });
      const cw = new THREE.Mesh(cwGeo, cwMat);
      cw.position.set(
        sp.x - shaftWidth / 2 + 0.2,
        totalHeight * 0.6,
        sp.z
      );
      cw.userData = { type: "transport-counterweight" };
      group.add(cw);

      // --- Hoist machine at shaft top (detailed-asset-only) ---
      // Base-origin asset: base rests exactly on the roof top surface, same
      // convention as the other MEP layers' rooftop plant placement.
      const hoistAsset = getEquipmentObjectClone("hoist-machine");
      if (hoistAsset) {
        hoistAsset.position.set(sp.x, roofTopY, sp.z);
        tagEquipmentObject(
          hoistAsset,
          { type: "transport-hoist-machine" },
          { castShadow: true, receiveShadow: true }
        );
        group.add(hoistAsset);
      }

      // --- Landing-door placements for this shaft (front face, +Z side) ---
      // Collected here; the combined single IM is built once after the
      // shaft loop (detailed-asset-only — no coarse fallback).
      for (const floor of aboveFloors) {
        // Clamp the door's Y scale to the floor's clear height: at unit
        // scale the asset's native 2.1 m height (centred at floor.y + 1.05)
        // punches into the slab above on floors shorter than ~2.2 m. 0.15 m
        // is reserved as clearance under that slab; the centre-y offset is
        // derived from the same scale so the door stays vertically centred
        // within the clamped envelope instead of sinking into the floor.
        const doorScale = Math.max(
          0,
          Math.min(1, (floor.height - 0.15) / doorNativeHeight)
        );
        doorPositions.push({
          x: sp.x,
          y: floor.y + (doorNativeHeight * doorScale) / 2,
          z: sp.z + shaftDepth / 2,
          scale: doorScale,
        });
      }
    }

    // --- Landing doors: one IM across every shaft × above-floor combo ---
    // Detailed-asset-only — no coarse fallback for this element kind, so
    // with an empty cache none of this is added.
    if (doorPositions.length > 0) {
      const doorGeo = getEquipmentGeometryClone("landing-door");
      if (doorGeo) {
        const doorMat = new THREE.MeshStandardMaterial({
          color: 0x9ca3af,
          emissive: 0x64748b,
          emissiveIntensity: 0.15,
        });
        const doorIM = new THREE.InstancedMesh(
          doorGeo,
          doorMat,
          doorPositions.length
        );
        doorIM.userData = { type: "transport-landing-door" };
        // Rotation about Y (doorQuat) doesn't mix the Y axis with X/Z, so
        // scaling only the Y component here clamps the door's world-space
        // height to the floor's clear height regardless of shaft orientation.
        const doorScl = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < doorPositions.length; i++) {
          const dp = doorPositions[i];
          pos.set(dp.x, dp.y, dp.z);
          doorScl.set(1, dp.scale, 1);
          mat4.compose(pos, doorQuat, doorScl);
          doorIM.setMatrixAt(i, mat4);
        }
        doorIM.count = doorPositions.length;
        doorIM.instanceMatrix.needsUpdate = true;
        group.add(doorIM);
      }
    }

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
