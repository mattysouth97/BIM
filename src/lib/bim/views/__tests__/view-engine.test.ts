import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  createPlanView,
  createElevationView,
  createSectionView,
  create3dView,
  computeDefaultViewsForBuilding,
} from "../view-engine";
import type { FloorGeometry } from "@/lib/building-geometry";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeFloor(
  floorNo: number,
  label: string,
  y: number,
  height: number
): FloorGeometry {
  return {
    floorNo,
    label,
    type: floorNo < 0 ? "below" : "above",
    y,
    height,
    width: 12,
    depth: 8,
    area: 96,
    use: "",
    useCode: "02000",
    structure: "",
    structureCode: "11",
    color: "#B0C4DE",
    isGroundFloor: floorNo === 1,
  };
}

function makeBbox(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ)
  );
}

// ─── createPlanView ────────────────────────────────────────────────────────────

describe("createPlanView", () => {
  it("produces a plan ViewDefinition with kind 'plan'", () => {
    const view = createPlanView({ id: "1", name: "1F", elevation: 0, height: 3 });
    expect(view.kind).toBe("plan");
    expect(view.id).toBe("plan-1");
  });

  it("camera looks straight down (position.y > target.y, x/z near target)", () => {
    const view = createPlanView({ id: "1", name: "1F", elevation: 0, height: 3 });
    const [cx, cy, cz] = view.cameraState.position;
    const [tx, ty] = view.cameraState.target;
    expect(cy).toBeGreaterThan(ty);
    expect(cx).toBeCloseTo(tx, 1);
    expect(Math.abs(cz)).toBeLessThan(1); // near zero
  });

  it("clips just below the slab so the floor plate stays in the cut", () => {
    const elevation = 6;
    const view = createPlanView({ id: "2", name: "2F", elevation, height: 3 });
    const planes = view.clippingPlanes!;
    const lower = planes.find((p) => p.normal[1] === 1);
    expect(lower).toBeDefined();
    expect(lower!.constant).toBeCloseTo(-(elevation + (view.viewRange?.viewDepth ?? 0)), 4);
  });

  it("cuts at the view-range cut, not the ceiling slab", () => {
    const elevation = 6;
    const height = 4.15;
    const view = createPlanView({ id: "2", name: "2F", elevation, height });
    const planes = view.clippingPlanes!;
    const upper = planes.find((p) => p.normal[1] === -1);
    expect(upper).toBeDefined();
    expect(view.viewRange?.cut).toBeCloseTo(1.2, 4);
    expect(upper!.constant).toBeCloseTo(elevation + 1.2, 4);
    expect(upper!.constant).toBeLessThan(elevation + height);
  });

  it("stores levelElevation and levelHeight correctly", () => {
    const view = createPlanView({ id: "3", name: "3F", elevation: 9, height: 3.5 });
    expect(view.levelElevation).toBe(9);
    expect(view.levelHeight).toBe(3.5);
    expect(view.levelId).toBe("3");
  });

  it("camera near is less than far", () => {
    const view = createPlanView({ id: "1", name: "1F", elevation: 0, height: 3 });
    expect(view.cameraState.near).toBeLessThan(view.cameraState.far);
  });
});

// ─── createElevationView ───────────────────────────────────────────────────────

describe("createElevationView", () => {
  const bbox = makeBbox(-6, 0, -4, 6, 12, 4); // 12 x 12 x 8 building

  it("produces kind 'elevation'", () => {
    const view = createElevationView("front", bbox);
    expect(view.kind).toBe("elevation");
    expect(view.id).toBe("elev-front");
  });

  it("front camera is at positive Z, looking toward origin", () => {
    const view = createElevationView("front", bbox);
    const [, , cz] = view.cameraState.position;
    expect(cz).toBeGreaterThan(0);
  });

  it("back camera is at negative Z", () => {
    const view = createElevationView("back", bbox);
    const [, , cz] = view.cameraState.position;
    expect(cz).toBeLessThan(0);
  });

  it("left camera is at negative X", () => {
    const view = createElevationView("left", bbox);
    const [cx] = view.cameraState.position;
    expect(cx).toBeLessThan(0);
  });

  it("right camera is at positive X", () => {
    const view = createElevationView("right", bbox);
    const [cx] = view.cameraState.position;
    expect(cx).toBeGreaterThan(0);
  });

  it("camera target Y is at building vertical centre", () => {
    const view = createElevationView("front", bbox);
    const [, ty] = view.cameraState.target;
    const center = bbox.getCenter(new THREE.Vector3());
    expect(ty).toBeCloseTo(center.y, 1);
  });

  it("camera near is less than far", () => {
    const view = createElevationView("right", bbox);
    expect(view.cameraState.near).toBeLessThan(view.cameraState.far);
  });

  it("zoom encompasses building height", () => {
    const view = createElevationView("front", bbox);
    const size = bbox.getSize(new THREE.Vector3());
    // zoom (half-height) must be at least half the building height
    expect(view.cameraState.zoom).toBeGreaterThanOrEqual(size.y / 2);
  });
});

// ─── createSectionView ─────────────────────────────────────────────────────────

describe("createSectionView", () => {
  const bbox = makeBbox(-6, 0, -4, 6, 12, 4);

  it("produces kind 'section'", () => {
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const view = createSectionView(plane, bbox, "section-A", "Section A");
    expect(view.kind).toBe("section");
    expect(view.id).toBe("section-A");
  });

  it("cut plane descriptor matches the input plane", () => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2);
    const view = createSectionView(plane, bbox);
    expect(view.cutPlane.normal).toEqual([0, 0, 1]);
    expect(view.cutPlane.constant).toBeCloseTo(-2, 4);
  });

  it("clippingPlanes contains exactly the cut plane", () => {
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const view = createSectionView(plane, bbox);
    expect(view.clippingPlanes).toHaveLength(1);
    expect(view.clippingPlanes![0]).toEqual(view.cutPlane);
  });

  it("camera is on the normal side of the plane", () => {
    // Plane pointing in +X direction at x=0 → camera should be at positive X
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const view = createSectionView(plane, bbox);
    const [cx] = view.cameraState.position;
    expect(cx).toBeGreaterThan(0);
  });
});

// ─── computeDefaultViewsForBuilding ────────────────────────────────────────────

describe("computeDefaultViewsForBuilding", () => {
  function makeFloors(count: number, floorHeight = 3): FloorGeometry[] {
    return Array.from({ length: count }, (_, i) =>
      makeFloor(i + 1, `${i + 1}F`, i * floorHeight, floorHeight)
    );
  }

  it("returns N+6 views for N floors (3D + plans + 4 elev + section)", () => {
    const floors = makeFloors(5);
    const bbox = makeBbox(-6, 0, -4, 6, 15, 4);
    const views = computeDefaultViewsForBuilding(floors, bbox);
    expect(views).toHaveLength(5 + 6);
  });

  it("returns 1+6 = 7 views for a single floor", () => {
    const floors = makeFloors(1);
    const bbox = makeBbox(-6, 0, -4, 6, 3, 4);
    const views = computeDefaultViewsForBuilding(floors, bbox);
    expect(views).toHaveLength(7);
  });

  it("returns 10+6 = 16 views for a 10-floor building", () => {
    const floors = makeFloors(10);
    const bbox = makeBbox(-6, 0, -4, 6, 30, 4);
    const views = computeDefaultViewsForBuilding(floors, bbox);
    expect(views).toHaveLength(16);
  });

  it("includes a 3D view and a longitudinal section", () => {
    const views = computeDefaultViewsForBuilding(
      makeFloors(2),
      makeBbox(-6, 0, -4, 6, 6, 4),
    );
    expect(views.some((v) => v.id === "3d-iso" && v.kind === "3d")).toBe(true);
    expect(views.some((v) => v.id === "section-long" && v.kind === "section")).toBe(true);
  });

  it("all plan views have kind 'plan'", () => {
    const floors = makeFloors(3);
    const bbox = makeBbox(-6, 0, -4, 6, 9, 4);
    const views = computeDefaultViewsForBuilding(floors, bbox);
    const planViews = views.filter((v) => v.kind === "plan");
    expect(planViews).toHaveLength(3);
  });

  it("four elevation views are front/back/left/right", () => {
    const floors = makeFloors(3);
    const bbox = makeBbox(-6, 0, -4, 6, 9, 4);
    const views = computeDefaultViewsForBuilding(floors, bbox);
    const elevViews = views.filter((v) => v.kind === "elevation");
    expect(elevViews).toHaveLength(4);
    const sides = elevViews.map((v) => (v as import("../view-definition").ElevationView).side);
    expect(sides).toContain("front");
    expect(sides).toContain("back");
    expect(sides).toContain("left");
    expect(sides).toContain("right");
  });

  it("plan views are sorted ground-up (ascending y)", () => {
    const floors = makeFloors(4);
    const bbox = makeBbox(-6, 0, -4, 6, 12, 4);
    const views = computeDefaultViewsForBuilding(floors, bbox);
    const planViews = views.filter((v) => v.kind === "plan") as import("../view-definition").PlanView[];
    for (let i = 1; i < planViews.length; i++) {
      expect(planViews[i].levelElevation).toBeGreaterThan(
        planViews[i - 1].levelElevation
      );
    }
  });

  it("plan view clipping lower bound includes view-depth below the slab", () => {
    const floorHeight = 3;
    const floors = makeFloors(3, floorHeight);
    const bbox = makeBbox(-6, 0, -4, 6, 9, 4);
    const views = computeDefaultViewsForBuilding(floors, bbox);
    const planViews = views.filter((v) => v.kind === "plan") as import("../view-definition").PlanView[];
    // 2nd floor: elevation = 3m
    const secondFloor = planViews.find((v) => v.levelElevation === floorHeight);
    expect(secondFloor).toBeDefined();
    const lowerPlane = secondFloor!.clippingPlanes!.find((p) => p.normal[1] === 1);
    const depth = secondFloor!.viewRange?.viewDepth ?? 0;
    expect(lowerPlane!.constant).toBeCloseTo(-(floorHeight + depth), 4);
  });
});

describe("create3dView", () => {
  it("returns a perspective isometric view that does not clip", () => {
    const bbox = makeBbox(-6, 0, -4, 6, 9, 4);
    const view = create3dView(bbox);
    expect(view.id).toBe("3d-iso");
    expect(view.kind).toBe("3d");
    expect(view.cameraState.kind).toBe("persp");
    expect(view.clippingPlanes).toEqual([]);
  });
});
