import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { disposeObject3D } from "@/lib/layers/analysis/overlay-types";

import { buildDiagnosticSelectionGroup } from "../diagnostic-selection-layer";
import type { DiagnosticSpatialTarget } from "../diagnostic-selection-types";

function target(
  precision: DiagnosticSpatialTarget["precision"] = "exact_surface",
): DiagnosticSpatialTarget {
  return {
    selectionId: "finding:east-wall",
    precision,
    patches: [{
      canonicalObjectId: "surface:east",
      objectName: "three-surface:east",
      kind: "wall",
      points: [[5, -4], [5, 4]],
      elevationM: 0,
      heightM: 3,
    }],
    fallbackObjectIds: [],
    focus: {
      requestId: "finding:east-wall:surface:east",
      center: [5, 1.5, 0],
      radius: 4.5,
      viewDirection: [1, 0.28, 0],
    },
  };
}

describe("diagnostic selection layer geometry", () => {
  it("creates a named, evidence-linked surface mesh and outline", () => {
    const group = buildDiagnosticSelectionGroup(target());
    const mesh = group.getObjectByName("three-surface:east");
    const outline = group.getObjectByName("three-surface:east:outline");

    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(outline).toBeInstanceOf(THREE.LineSegments);
    expect(mesh?.userData).toMatchObject({
      canonicalObjectId: "surface:east",
      diagnosticPrecision: "exact_surface",
      diagnosticHighlighted: true,
    });
    const bounds = new THREE.Box3().setFromObject(group);
    expect(bounds.min.x).toBeCloseTo(5);
    expect(bounds.max.y).toBeCloseTo(3);
    expect(bounds.min.z).toBeCloseTo(-4);
    expect(bounds.max.z).toBeCloseTo(4);

    disposeObject3D(group);
  });

  it("renders a host-only surface more transparently than an exact surface", () => {
    const exact = buildDiagnosticSelectionGroup(target("exact_surface"));
    const host = buildDiagnosticSelectionGroup(target("host_surface"));
    const exactMaterial = (exact.getObjectByName("three-surface:east") as THREE.Mesh)
      .material as THREE.MeshBasicMaterial;
    const hostMaterial = (host.getObjectByName("three-surface:east") as THREE.Mesh)
      .material as THREE.MeshBasicMaterial;

    expect(hostMaterial.opacity).toBeLessThan(exactMaterial.opacity);

    disposeObject3D(exact);
    disposeObject3D(host);
  });
});
