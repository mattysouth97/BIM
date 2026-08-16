import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useOutlineStore } from "@/store/outline-store";

/**
 * Returns pointer event handlers that drive the outline store hover state.
 * Attach onPointerOver / onPointerOut to any R3F primitive or mesh.
 */
export function useOutlineHover() {
  const { scene } = useThree();
  const setHovered = useOutlineStore((s) => s.setHovered);
  const clearHovered = useOutlineStore((s) => s.clearHovered);
  const instanceMatrix = useRef(new THREE.Matrix4());
  const resourcesRef = useRef<HoverResources | null>(null);

  useEffect(() => {
    const resources = createHoverResources();
    resourcesRef.current = resources;
    scene.add(resources.instanceProxy);
    return () => {
      scene.remove(resources.instanceProxy);
      resources.instanceProxy.visible = false;
      useOutlineStore.getState().clearHovered("building");
      resources.emptyGeometry.dispose();
      resources.proxyMaterial.dispose();
      resourcesRef.current = null;
    };
  }, [scene]);

  const updateHovered = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const resources = resourcesRef.current;
      if (!resources) return;
      if (
        event.object instanceof THREE.InstancedMesh &&
        event.instanceId !== undefined
      ) {
        event.object.getMatrixAt(event.instanceId, instanceMatrix.current);
        resources.instanceProxy.geometry = event.object.geometry;
        resources.instanceProxy.matrix.multiplyMatrices(
          event.object.matrixWorld,
          instanceMatrix.current
        );
        resources.instanceProxy.matrixWorld.copy(resources.instanceProxy.matrix);
        resources.instanceProxy.visible = true;
        setHovered([resources.instanceProxy], "building");
        return;
      }

      resources.instanceProxy.visible = false;
      setHovered([event.object], "building");
    },
    [setHovered]
  );

  const onPointerOut = useCallback(() => {
    const resources = resourcesRef.current;
    if (resources) resources.instanceProxy.visible = false;
    clearHovered("building");
  }, [clearHovered]);

  return {
    onPointerOver: updateHovered,
    onPointerMove: updateHovered,
    onPointerOut,
  };
}

interface HoverResources {
  emptyGeometry: THREE.BufferGeometry;
  proxyMaterial: THREE.MeshBasicMaterial;
  instanceProxy: THREE.Mesh;
}

function createHoverResources(): HoverResources {
  const emptyGeometry = new THREE.BufferGeometry();
  const proxyMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const instanceProxy = new THREE.Mesh(emptyGeometry, proxyMaterial);
  instanceProxy.name = "building-hover-instance-proxy";
  instanceProxy.matrixAutoUpdate = false;
  instanceProxy.frustumCulled = false;
  instanceProxy.visible = false;
  return { emptyGeometry, proxyMaterial, instanceProxy };
}
