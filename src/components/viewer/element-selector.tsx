"use client";

import { useCallback, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useAuthoringStore, type AuthoringElementType } from "@/store/authoring-store";

const HIGHLIGHT_COLOR = new THREE.Color(0x2196f3);
const HIGHLIGHT_EMISSIVE_INTENSITY = 0.3;

/** Map userData.type from procedural building to AuthoringElementType */
function toElementType(userDataType: string | undefined): AuthoringElementType {
  switch (userDataType) {
    case "slab": return "slab";
    case "column": return "column";
    case "facade":
    case "glass":
    case "mullion":
    case "panel":
      return "wall";
    case "roof": return "roof";
    default: return "component";
  }
}

/**
 * R3F component for click-to-select building elements.
 * Only active when isAuthoring is true.
 * Highlights the selected mesh with emissive color.
 */
export function ElementSelector() {
  const { scene, camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const previousMeshRef = useRef<THREE.Mesh | THREE.InstancedMesh | null>(null);
  const previousEmissiveRef = useRef<THREE.Color | null>(null);
  const previousEmissiveIntensityRef = useRef<number>(0);

  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);
  const selectElement = useAuthoringStore((s) => s.selectElement);
  const clearSelection = useAuthoringStore((s) => s.clearSelection);
  const selectedElementId = useAuthoringStore((s) => s.selectedElementId);

  // Restore previous mesh material on deselect
  const restorePrevious = useCallback(() => {
    if (previousMeshRef.current) {
      const mat = (previousMeshRef.current as THREE.Mesh).material;
      if (mat && !Array.isArray(mat) && (mat as THREE.MeshStandardMaterial).emissive) {
        const stdMat = mat as THREE.MeshStandardMaterial;
        if (previousEmissiveRef.current) {
          stdMat.emissive.copy(previousEmissiveRef.current);
        }
        stdMat.emissiveIntensity = previousEmissiveIntensityRef.current;
      }
      previousMeshRef.current = null;
      previousEmissiveRef.current = null;
    }
  }, []);

  // Highlight the given mesh
  const highlightMesh = useCallback((mesh: THREE.Mesh | THREE.InstancedMesh) => {
    const mat = mesh.material;
    if (mat && !Array.isArray(mat) && (mat as THREE.MeshStandardMaterial).emissive) {
      const stdMat = mat as THREE.MeshStandardMaterial;
      previousMeshRef.current = mesh;
      previousEmissiveRef.current = stdMat.emissive.clone();
      previousEmissiveIntensityRef.current = stdMat.emissiveIntensity;
      stdMat.emissive.copy(HIGHLIGHT_COLOR);
      stdMat.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;
    }
  }, []);

  // Clear highlight when selection changes to null
  useEffect(() => {
    if (!selectedElementId) {
      restorePrevious();
    }
  }, [selectedElementId, restorePrevious]);

  // Clear highlight when leaving edit mode
  useEffect(() => {
    if (!isAuthoring) {
      restorePrevious();
    }
  }, [isAuthoring, restorePrevious]);

  useEffect(() => {
    if (!isAuthoring) return;

    const canvas = gl.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(pointer.current, camera);
      const intersects = raycaster.current.intersectObjects(scene.children, true);

      // Find first mesh with userData.type
      const hit = intersects.find(
        (i) => i.object.userData?.type && i.object instanceof THREE.Mesh || i.object instanceof THREE.InstancedMesh
      );

      if (hit) {
        const mesh = hit.object as THREE.Mesh | THREE.InstancedMesh;
        const elementType = toElementType(mesh.userData?.type);

        // Restore previous highlight
        restorePrevious();

        // Select and highlight new
        selectElement(mesh.uuid, elementType);
        highlightMesh(mesh);
      } else {
        restorePrevious();
        clearSelection();
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isAuthoring, scene, camera, gl, selectElement, clearSelection, restorePrevious, highlightMesh]);

  return null;
}
