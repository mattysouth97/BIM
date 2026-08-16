// src/lib/layers/layer-6-dhw.ts
// Layer 6: MEP Water DHW 급탕
// Orange/magenta domestic hot water piping: strict vertical risers in core
// shaft with horizontal branching ONLY to restroom/kitchen zones.
// Pure Three.js, no React.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import type { DhwParams } from "./mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "./mep-equipment-params";

const DHW_ORANGE = 0xf97316;
const PIPE_RADIUS = 0.05;
const PIPE_SEGMENTS = 8;

/**
 * Build a merged DHW storage vessel with jacket bands, service controls,
 * support feet, and flanged top, bottom, and side connections.
 */
function buildTankGeometry(p: DhwParams): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(p.tankRadius, p.tankRadius, p.tankHeight, 24);
  const parts: THREE.BufferGeometry[] = [body];

  // Top pipe stub (vertical cylinder protruding up)
  const topPipe = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8);
  topPipe.translate(0, p.tankHeight / 2 + 0.15, 0);
  parts.push(topPipe);

  // Bottom pipe stub (vertical cylinder protruding down)
  const bottomPipe = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8);
  bottomPipe.translate(0, -(p.tankHeight / 2 + 0.15), 0);
  parts.push(bottomPipe);

  // Side outlet (horizontal pipe on +X face, mid-height)
  const sidePipe = new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8);
  sidePipe.rotateZ(Math.PI / 2);
  sidePipe.translate(p.tankRadius + 0.175, 0, 0);
  parts.push(sidePipe);

  // Jacket bands and end collars make the vessel legible at overview scale.
  const bandRadius = p.tankRadius * 1.015;
  const bandTube = Math.max(0.022, p.tankRadius * 0.038);
  for (const y of [-p.tankHeight * 0.29, p.tankHeight * 0.29]) {
    const jacketBand = new THREE.TorusGeometry(bandRadius, bandTube, 6, 24);
    jacketBand.rotateX(Math.PI / 2);
    jacketBand.translate(0, y, 0);
    parts.push(jacketBand);
  }

  const collarHeight = Math.max(0.07, p.tankHeight * 0.045);
  for (const y of [
    -p.tankHeight / 2 - collarHeight / 2,
    p.tankHeight / 2 + collarHeight / 2,
  ]) {
    const collar = new THREE.CylinderGeometry(
      p.tankRadius * 1.06,
      p.tankRadius * 1.06,
      collarHeight,
      24
    );
    collar.translate(0, y, 0);
    parts.push(collar);
  }

  // Pipe flanges distinguish service connections from generic cylinders.
  const topFlange = new THREE.CylinderGeometry(0.1, 0.1, 0.055, 12);
  topFlange.translate(0, p.tankHeight / 2 + 0.27, 0);
  parts.push(topFlange);

  const bottomFlange = new THREE.CylinderGeometry(0.1, 0.1, 0.055, 12);
  bottomFlange.translate(0, -(p.tankHeight / 2 + 0.27), 0);
  parts.push(bottomFlange);

  const sideFlange = new THREE.CylinderGeometry(0.09, 0.09, 0.055, 12);
  sideFlange.rotateZ(Math.PI / 2);
  sideFlange.translate(p.tankRadius + 0.32, 0, 0);
  parts.push(sideFlange);

  // Front control enclosure and four feet keep the tank visually serviceable.
  const controlDepth = Math.max(0.1, p.tankRadius * 0.18);
  const controlBox = new THREE.BoxGeometry(
    p.tankRadius * 0.72,
    p.tankHeight * 0.22,
    controlDepth
  );
  controlBox.translate(0, -p.tankHeight * 0.08, p.tankRadius + controlDepth / 2);
  parts.push(controlBox);

  const controlFace = new THREE.BoxGeometry(
    p.tankRadius * 0.42,
    p.tankHeight * 0.065,
    Math.max(0.025, controlDepth * 0.24)
  );
  controlFace.translate(
    0,
    -p.tankHeight * 0.06,
    p.tankRadius + controlDepth + Math.max(0.0125, controlDepth * 0.12)
  );
  parts.push(controlFace);

  const footSize = Math.max(0.09, p.tankRadius * 0.17);
  const footHeight = Math.max(0.12, p.tankHeight * 0.08);
  for (const x of [-p.tankRadius * 0.55, p.tankRadius * 0.55]) {
    for (const z of [-p.tankRadius * 0.5, p.tankRadius * 0.5]) {
      const foot = new THREE.BoxGeometry(footSize, footHeight, footSize);
      foot.translate(x, -p.tankHeight / 2 - collarHeight - footHeight / 2, z);
      parts.push(foot);
    }
  }

  return mergeGeometries(parts);
}

function buildRecirculationTankGeometry(p: DhwParams): THREE.BufferGeometry {
  const radius = p.tankRadius * 0.7;
  const height = p.tankHeight * 0.8;
  const body = new THREE.CylinderGeometry(radius, radius, height, 20);
  const parts: THREE.BufferGeometry[] = [body];

  for (const y of [-height * 0.28, height * 0.28]) {
    const band = new THREE.TorusGeometry(
      radius * 1.015,
      Math.max(0.018, radius * 0.045),
      6,
      20
    );
    band.rotateX(Math.PI / 2);
    band.translate(0, y, 0);
    parts.push(band);
  }

  const topOutlet = new THREE.CylinderGeometry(0.05, 0.05, 0.24, 10);
  topOutlet.translate(0, height / 2 + 0.12, 0);
  parts.push(topOutlet);

  const outletFlange = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 12);
  outletFlange.translate(0, height / 2 + 0.22, 0);
  parts.push(outletFlange);

  const gauge = new THREE.CylinderGeometry(
    Math.max(0.06, radius * 0.15),
    Math.max(0.06, radius * 0.15),
    0.05,
    14
  );
  gauge.rotateX(Math.PI / 2);
  gauge.translate(0, height * 0.17, radius + 0.035);
  parts.push(gauge);

  const footHeight = Math.max(0.1, height * 0.08);
  for (const x of [-radius * 0.5, radius * 0.5]) {
    const foot = new THREE.BoxGeometry(radius * 0.26, footHeight, radius * 0.34);
    foot.translate(x, -height / 2 - footHeight / 2, 0);
    parts.push(foot);
  }

  return mergeGeometries(parts);
}

/**
 * DHWLayer generates domestic hot water distribution:
 * - Hot water storage tank (merged cylinder + pipe stubs) at basement
 * - Optional pump housing (horizontal cylinder + motor box) next to tank
 * - Thick vertical risers in core shaft (CylinderGeometry)
 * - Horizontal branches restricted to restroom/kitchen zones
 *   (1/3 and 2/3 of depth, near perimeter walls)
 * - Fixture endpoints (small spheres) at branch terminations
 */
export class DHWLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    _density: number = 1.0,
    equipParams: Partial<DhwParams> = {}
  ): THREE.Group {
    this.dispose();

    const dhwParams: DhwParams = {
      ...DEFAULT_MEP_EQUIPMENT_PARAMS.dhw,
      ...equipParams,
    };

    const group = new THREE.Group();
    group.name = "layer-6-dhw";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;

    // --- Pipe material ---
    const pipeMat = new THREE.MeshStandardMaterial({
      color: DHW_ORANGE,
      emissive: DHW_ORANGE,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });

    // --- Tank material ---
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      emissive: DHW_ORANGE,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      metalness: 0.4,
    });

    // Basement Y position for tank base
    const basementY = -(dhwParams.tankHeight / 2);

    // --- Hot water storage tank at basement (merged geometry with pipe stubs) ---
    const tankGeo = buildTankGeometry(dhwParams);
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(0.8, basementY, 0.5);
    tank.userData = { type: "dhw-storage-tank" };
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);

    // Secondary recirculation tank with bands, gauge, outlet, and support feet.
    const tank2Geo = buildRecirculationTankGeometry(dhwParams);
    const tank2 = new THREE.Mesh(tank2Geo, tankMat);
    tank2.position.set(-0.8, -(dhwParams.tankHeight * 0.4), 0.5);
    tank2.userData = { type: "dhw-recirc-tank" };
    tank2.castShadow = true;
    tank2.receiveShadow = true;
    group.add(tank2);

    // --- Pump housing: volute, flanges, discharge, coupling, motor, and base ---
    if (dhwParams.showPump) {
      const pumpParts: THREE.BufferGeometry[] = [];

      const pumpBody = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 16);
      pumpBody.rotateZ(Math.PI / 2);
      pumpBody.translate(-0.2, 0, 0);
      pumpParts.push(pumpBody);

      const volute = new THREE.SphereGeometry(0.22, 16, 10);
      volute.scale(0.78, 1, 1);
      volute.translate(-0.25, 0, 0);
      pumpParts.push(volute);

      const inlet = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12);
      inlet.rotateZ(Math.PI / 2);
      inlet.translate(-0.4, 0, 0);
      pumpParts.push(inlet);

      const inletFlange = new THREE.CylinderGeometry(0.15, 0.15, 0.055, 12);
      inletFlange.rotateZ(Math.PI / 2);
      inletFlange.translate(-0.53, 0, 0);
      pumpParts.push(inletFlange);

      const discharge = new THREE.CylinderGeometry(0.09, 0.09, 0.28, 12);
      discharge.translate(-0.24, 0.25, 0);
      pumpParts.push(discharge);

      const dischargeFlange = new THREE.CylinderGeometry(0.14, 0.14, 0.05, 12);
      dischargeFlange.translate(-0.24, 0.39, 0);
      pumpParts.push(dischargeFlange);

      const coupling = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 12);
      coupling.rotateZ(Math.PI / 2);
      coupling.translate(0.08, 0, 0);
      pumpParts.push(coupling);

      const motor = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16);
      motor.rotateZ(Math.PI / 2);
      motor.translate(0.37, 0, 0);
      pumpParts.push(motor);

      const motorEnd = new THREE.CylinderGeometry(0.17, 0.17, 0.055, 16);
      motorEnd.rotateZ(Math.PI / 2);
      motorEnd.translate(0.59, 0, 0);
      pumpParts.push(motorEnd);

      for (const x of [0.22, 0.32, 0.42, 0.52]) {
        const coolingFin = new THREE.CylinderGeometry(0.18, 0.18, 0.025, 16);
        coolingFin.rotateZ(Math.PI / 2);
        coolingFin.translate(x, 0, 0);
        pumpParts.push(coolingFin);
      }

      const basePlate = new THREE.BoxGeometry(1.05, 0.06, 0.42);
      basePlate.translate(0.02, -0.245, 0);
      pumpParts.push(basePlate);

      for (const x of [-0.32, 0.4]) {
        const foot = new THREE.BoxGeometry(0.2, 0.12, 0.24);
        foot.translate(x, -0.32, 0);
        pumpParts.push(foot);
      }

      const pumpGeo = mergeGeometries(pumpParts);
      const pumpMesh = new THREE.Mesh(pumpGeo, tankMat);
      pumpMesh.userData = { type: "dhw-pump" };
      pumpMesh.castShadow = true;
      pumpMesh.receiveShadow = true;
      // Position next to storage tank (+X side, at basement level)
      pumpMesh.position.set(0.8 + dhwParams.tankRadius + 0.6, basementY + 0.18, 0.5);
      group.add(pumpMesh);
    }

    // --- Vertical risers in core shaft (strict CylinderGeometry) ---
    // Two risers: supply and return, slightly offset in core
    const riserPositions = [
      { x: 0.15, z: 0.15 },  // Supply
      { x: -0.15, z: -0.15 }, // Return (slightly thinner)
    ];
    const riserRadii = [PIPE_RADIUS * 1.5, PIPE_RADIUS * 1.2];

    for (let r = 0; r < riserPositions.length; r++) {
      const rp = riserPositions[r];
      const riserGeo = new THREE.CylinderGeometry(
        riserRadii[r], riserRadii[r], totalHeight + 1.0, PIPE_SEGMENTS
      );
      const riser = new THREE.Mesh(riserGeo, pipeMat);
      riser.position.set(rp.x, totalHeight / 2 - 0.5, rp.z);
      riser.userData = { type: "dhw-riser", riserType: r === 0 ? "supply" : "return" };
      group.add(riser);
    }

    // --- Per-floor horizontal branches to restroom/kitchen zones ONLY ---
    // Restroom zone: 1/3 of depth, near back wall (+Z side)
    // Kitchen zone: 2/3 of depth, near back wall (+Z side)
    const wetZones = [
      { name: "restroom", x: hw * 0.6, z: hd * 0.33 },
      { name: "kitchen", x: -hw * 0.5, z: hd * 0.67 },
    ];

    for (const floor of aboveFloors) {
      const pipeY = floor.y + 0.3; // Embedded in or just above slab

      for (const zone of wetZones) {
        // Horizontal branch from core to wet zone
        const branchCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(riserPositions[0].x, pipeY, riserPositions[0].z),
          new THREE.Vector3(zone.x * 0.3, pipeY, zone.z * 0.5),
          new THREE.Vector3(zone.x * 0.7, pipeY - 0.02, zone.z * 0.8),
          new THREE.Vector3(zone.x, pipeY, zone.z),
        ]);

        const branchGeo = new THREE.TubeGeometry(branchCurve, 16, PIPE_RADIUS, PIPE_SEGMENTS, false);
        const branch = new THREE.Mesh(branchGeo, pipeMat);
        branch.userData = { type: "dhw-branch", zone: zone.name, floorNo: floor.floorNo };
        group.add(branch);

        // Return branch (thinner, slightly offset)
        const returnCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(riserPositions[1].x, pipeY - 0.1, riserPositions[1].z),
          new THREE.Vector3(zone.x * 0.4, pipeY - 0.1, zone.z * 0.5 - 0.15),
          new THREE.Vector3(zone.x, pipeY - 0.1, zone.z - 0.15),
        ]);
        const returnGeo = new THREE.TubeGeometry(returnCurve, 12, PIPE_RADIUS * 0.8, PIPE_SEGMENTS, false);
        const returnBranch = new THREE.Mesh(returnGeo, pipeMat);
        returnBranch.userData = { type: "dhw-return", zone: zone.name, floorNo: floor.floorNo };
        group.add(returnBranch);

        // --- Fixture endpoint (small sphere at zone terminus) ---
        const fixtureSphereGeo = new THREE.SphereGeometry(0.08, 8, 6);
        const fixtureMat = new THREE.MeshStandardMaterial({
          color: DHW_ORANGE,
          emissive: DHW_ORANGE,
          emissiveIntensity: 0.6,
          roughness: 0.3,
          metalness: 0.5,
        });
        const fixture = new THREE.Mesh(fixtureSphereGeo, fixtureMat);
        fixture.position.set(zone.x, pipeY, zone.z);
        fixture.userData = { type: "dhw-fixture", zone: zone.name, floorNo: floor.floorNo };
        group.add(fixture);
      }
    }

    // --- Connection pipe from tanks to risers ---
    const connectCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.8, -dhwParams.tankHeight * 0.3, 0.5),
      new THREE.Vector3(0.5, -0.2, 0.3),
      new THREE.Vector3(riserPositions[0].x, 0.1, riserPositions[0].z),
    ]);
    const connectGeo = new THREE.TubeGeometry(connectCurve, 12, PIPE_RADIUS * 1.3, PIPE_SEGMENTS, false);
    const connectPipe = new THREE.Mesh(connectGeo, pipeMat);
    connectPipe.userData = { type: "dhw-tank-connect" };
    group.add(connectPipe);

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          mat.dispose();
        }
      }
    });
    this.group = null;
  }
}
