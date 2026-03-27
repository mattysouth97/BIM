"use client";

import { useRef, useMemo, useCallback, useEffect } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useComponentStore } from "@/store/component-store";
import type { ComponentPreset, PlacedComponent } from "@/lib/components/component-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { generateDoor } from "@/lib/components/door-generator";
import { generateWindow } from "@/lib/components/window-generator";
import { generateMEPFixture } from "@/lib/components/mep-fixture-generator";
import { generateStair } from "@/lib/components/stair-generator";

function generateForPreset(preset: ComponentPreset): THREE.Group {
  switch (preset.category) {
    case "door":
      return generateDoor(preset);
    case "window":
      return generateWindow(preset);
    case "mep":
      return generateMEPFixture(preset);
    case "stair":
      return generateStair(preset);
  }
}

/** Find the presets by id from all preset arrays */
function findPreset(presetId: string): ComponentPreset | undefined {
  // Dynamic import of presets to avoid circular deps
  const {
    DOOR_PRESETS,
    WINDOW_PRESETS,
    MEP_PRESETS,
    STAIR_PRESETS,
  } = require("@/lib/components/component-types");
  return [...DOOR_PRESETS, ...WINDOW_PRESETS, ...MEP_PRESETS, ...STAIR_PRESETS].find(
    (p: ComponentPreset) => p.id === presetId
  );
}

/**
 * Renders a single placed component instance as a Three.js group.
 */
function PlacedComponentMesh({ component }: { component: PlacedComponent }) {
  const groupRef = useRef<THREE.Group>(null);

  const preset = useMemo(() => findPreset(component.presetId), [component.presetId]);
  const generatedGroup = useMemo(() => {
    if (!preset) return null;
    return generateForPreset(preset);
  }, [preset]);

  useEffect(() => {
    const parent = groupRef.current;
    if (!parent || !generatedGroup) return;
    // Clear existing children
    while (parent.children.length > 0) {
      parent.remove(parent.children[0]);
    }
    parent.add(generatedGroup);
    return () => {
      // Dispose geometry on unmount
      generatedGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) mat.dispose();
        }
      });
    };
  }, [generatedGroup]);

  return (
    <group
      ref={groupRef}
      position={component.position}
      rotation={component.rotation}
    />
  );
}

/**
 * Ghost preview of the component being dragged, following the mouse
 * intersection with the scene.
 */
function DragPreview({ recipe }: { recipe: BuildingRecipe }) {
  const groupRef = useRef<THREE.Group>(null);
  const { raycaster, camera, scene, gl } = useThree();
  const dragging = useComponentStore((s) => s.dragging);
  const placeComponent = useComponentStore((s) => s.placeComponent);
  const setDragging = useComponentStore((s) => s.setDragging);

  const generatedGroup = useMemo(() => {
    if (!dragging) return null;
    const g = generateForPreset(dragging);
    // Make semi-transparent for preview
    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material;
        if (mat instanceof THREE.Material) {
          const clone = mat.clone();
          clone.transparent = true;
          clone.opacity = 0.5;
          obj.material = clone;
        }
      }
    });
    return g;
  }, [dragging]);

  useEffect(() => {
    const parent = groupRef.current;
    if (!parent) return;
    // Clear
    while (parent.children.length > 0) {
      parent.remove(parent.children[0]);
    }
    if (generatedGroup) {
      parent.add(generatedGroup);
    }
    return () => {
      if (generatedGroup) {
        generatedGroup.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            const mat = obj.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else if (mat) mat.dispose();
          }
        });
      }
    };
  }, [generatedGroup]);

  // Track mouse position via pointer move
  const mouse = useRef(new THREE.Vector2());
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useRef(new THREE.Vector3());

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!dragging || e.button !== 0) return;

      raycaster.setFromCamera(mouse.current, camera);

      // Try to intersect with building geometry first
      const meshes: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          if (!obj.userData?.type?.startsWith("component-")) {
            meshes.push(obj);
          }
        }
      });

      const hits = raycaster.intersectObjects(meshes, false);
      let placePos: [number, number, number];

      if (hits.length > 0) {
        const hit = hits[0];
        const p = hit.point;

        if (dragging.category === "mep") {
          // Snap to ceiling: find nearest floor ceiling
          const floors = recipe.floors.filter((f) => f.type === "above");
          let ceilingY = recipe.totalHeight;
          for (const floor of floors) {
            const fy = floor.y + floor.height;
            if (Math.abs(fy - p.y) < Math.abs(ceilingY - p.y)) {
              ceilingY = fy;
            }
          }
          placePos = [p.x, ceilingY - 0.02, p.z];
        } else if (dragging.category === "door" || dragging.category === "window") {
          // Snap to wall face: use hit normal to place flush
          const normal = hit.face?.normal?.clone() ?? new THREE.Vector3(0, 0, 1);
          if (hit.object.matrixWorld) {
            normal.transformDirection(hit.object.matrixWorld);
          }
          const wallY = dragging.category === "window" ? p.y : hit.point.y - (hit.point.y % 0.1);
          placePos = [p.x, Math.max(0, wallY), p.z];
        } else {
          // Stairs: place on ground
          placePos = [p.x, 0, p.z];
        }
      } else {
        // Fallback: intersect ground plane
        raycaster.ray.intersectPlane(groundPlane, intersection.current);
        placePos = [intersection.current.x, 0, intersection.current.z];
      }

      const comp: PlacedComponent = {
        instanceId: crypto.randomUUID(),
        presetId: dragging.id,
        position: placePos,
        rotation: [0, 0, 0],
        buildingPk: "",
      };

      // buildingPk is set by the parent wrapper
      placeComponent("__current__", comp);
      setDragging(null);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [dragging, camera, raycaster, scene, gl, recipe, placeComponent, setDragging, groundPlane]);

  // Update preview position each frame
  useFrame(() => {
    const parent = groupRef.current;
    if (!parent || !dragging) {
      if (parent) parent.visible = false;
      return;
    }
    parent.visible = true;
    raycaster.setFromCamera(mouse.current, camera);
    raycaster.ray.intersectPlane(groundPlane, intersection.current);
    parent.position.copy(intersection.current);

    if (dragging.category === "mep") {
      // Preview at approximate ceiling
      parent.position.y = recipe.totalHeight - 0.5;
    }
  });

  return <group ref={groupRef} />;
}

interface PlacedComponentsProps {
  buildingPk: string;
  recipe: BuildingRecipe;
}

/**
 * R3F component that renders all placed components and provides
 * click-to-place functionality via DragPreview.
 */
export function PlacedComponents({ buildingPk, recipe }: PlacedComponentsProps) {
  const placed = useComponentStore((s) => s.placed[buildingPk] ?? s.placed["__current__"] ?? []);

  return (
    <>
      {placed.map((comp) => (
        <PlacedComponentMesh key={comp.instanceId} component={comp} />
      ))}
      <DragPreview recipe={recipe} />
    </>
  );
}
