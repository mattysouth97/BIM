// src/lib/procedural/__tests__/demo-envelope.test.ts
// Envelope invariant for the 데모모드 building: composing the FULL procedural
// building from the real demo fixtures (with the footprint polygon projected
// and re-centered exactly like BuildingScene does) must place every mesh and
// every InstancedMesh instance inside the 34 × 24 m plan envelope. Guards the
// "floating panels / parapet bars sticking out in mid-air" class of bug.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { generateBuildingGeometry, toRecipe } from "@/lib/building-geometry";
import { demoTitle, demoFloors, DEMO_FOOTPRINT } from "@/lib/demo/demo-building";
import { createSceneProjection } from "@/lib/gis/gis-transform";
import { ringBboxCenter } from "@/lib/gis/ring-utils";
import { ProceduralBuilding } from "../procedural-building";

const HALF_W = 17; // 34 m / 2
const HALF_D = 12; // 24 m / 2
const TOL = 1.0; // wall build-up, parapet caps, antenna bases

function buildDemoGroup(): THREE.Group {
  const geo = generateBuildingGeometry(demoTitle, demoFloors);

  // Replicate BuildingScene's polygon override: project WGS84 → local metres,
  // re-center on the projected bbox, override bbox dims.
  const outerRing = DEMO_FOOTPRINT[0];
  const [centerLng, centerLat] = ringBboxCenter(outerRing);
  const proj = createSceneProjection(centerLng, centerLat);
  const projected: [number, number][][] = DEMO_FOOTPRINT.map((ring) =>
    ring.map(([lng, lat]) => proj.project(lng, lat) as [number, number]),
  );
  const [cx, cz] = ringBboxCenter(projected[0]);
  geo.footprintPolygon = projected.map((ring) =>
    ring.map(([x, z]) => [x - cx, z - cz] as [number, number]),
  );
  const xs = geo.footprintPolygon[0].map((p) => p[0]);
  const zs = geo.footprintPolygon[0].map((p) => p[1]);
  geo.footprintWidth = Math.max(...xs) - Math.min(...xs);
  geo.footprintDepth = Math.max(...zs) - Math.min(...zs);

  const building = new ProceduralBuilding(toRecipe(geo));
  const group = building.generate();
  group.updateMatrixWorld(true);
  return group;
}

interface Offender {
  path: string;
  kind: string;
  x: number;
  z: number;
  detail?: string;
}

function collectOffenders(group: THREE.Group): Offender[] {
  const offenders: Offender[] = [];
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();

  group.traverse((o) => {
    const path: string[] = [];
    let p: THREE.Object3D | null = o;
    while (p && path.length < 6) {
      path.push(p.name || (p.userData?.type as string) || p.type);
      p = p.parent;
    }
    const pathStr = path.join(" < ");

    if ((o as THREE.InstancedMesh).isInstancedMesh) {
      const im = o as THREE.InstancedMesh;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m4);
        pos.setFromMatrixPosition(m4).applyMatrix4(im.matrixWorld);
        if (
          Math.abs(pos.x) > HALF_W + TOL ||
          Math.abs(pos.z) > HALF_D + TOL
        ) {
          offenders.push({
            path: pathStr,
            kind: "instance",
            x: +pos.x.toFixed(1),
            z: +pos.z.toFixed(1),
            detail: `instance ${i}/${im.count}`,
          });
          break; // one sample per mesh keeps the report readable
        }
      }
    } else if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry) {
      const mesh = o as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!.clone();
      bb.applyMatrix4(mesh.matrixWorld);
      const maxAbsX = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x));
      const maxAbsZ = Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z));
      if (maxAbsX > HALF_W + TOL || maxAbsZ > HALF_D + TOL) {
        offenders.push({
          path: pathStr,
          kind: "mesh",
          x: +maxAbsX.toFixed(1),
          z: +maxAbsZ.toFixed(1),
        });
      }
    }
  });
  return offenders;
}

describe("demo building stays inside its plan envelope", () => {
  it("places every mesh and instance within 34 × 24 m (+1 m tolerance)", () => {
    const offenders = collectOffenders(buildDemoGroup());
    expect(
      offenders,
      `out-of-envelope objects:\n${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });
});
