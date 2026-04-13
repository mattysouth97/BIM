import { useCallback } from "react";
import type * as THREE from "three";
import { useOutlineStore } from "@/store/outline-store";

/**
 * Returns pointer event handlers that drive the outline store hover state.
 * Attach onPointerOver / onPointerOut to any R3F primitive or mesh.
 */
export function useOutlineHover() {
  const setHovered = useOutlineStore((s) => s.setHovered);
  const clearHovered = useOutlineStore((s) => s.clearHovered);

  const onPointerOver = useCallback(
    (e: { object: THREE.Object3D; stopPropagation: () => void }) => {
      e.stopPropagation();
      setHovered([e.object]);
    },
    [setHovered]
  );

  const onPointerOut = useCallback(() => {
    clearHovered();
  }, [clearHovered]);

  return { onPointerOver, onPointerOut };
}
