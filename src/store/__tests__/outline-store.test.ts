import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { useOutlineStore } from "../outline-store";

describe("outline hover ownership", () => {
  beforeEach(() => {
    useOutlineStore.setState({
      hoveredObjects: [],
      selectedObjects: [],
      hoveredOwner: null,
    });
  });

  it("keeps an equipment hit until the equipment coordinator clears it", () => {
    const building = new THREE.Object3D();
    const equipment = new THREE.Object3D();
    const state = useOutlineStore.getState();

    state.setHovered([building], "building");
    state.setHovered([equipment], "equipment");
    state.setHovered([building], "building");
    state.clearHovered("building");

    expect(useOutlineStore.getState().hoveredObjects).toEqual([equipment]);
    expect(useOutlineStore.getState().hoveredOwner).toBe("equipment");

    state.clearHovered("equipment");
    expect(useOutlineStore.getState().hoveredObjects).toEqual([]);
    expect(useOutlineStore.getState().hoveredOwner).toBeNull();
  });
});
