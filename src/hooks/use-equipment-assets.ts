"use client";

// useEquipmentAssets — kicks off the one-time GLB preload and reports
// readiness. Components regenerate their Three.js content when `ready` flips
// to true so synchronous generators pick up the detailed Blender assets.

import { useEffect, useState } from "react";
import {
  areEquipmentAssetsReady,
  preloadEquipmentAssets,
} from "@/lib/equipment-assets";

export function useEquipmentAssets(): boolean {
  const [ready, setReady] = useState<boolean>(() => areEquipmentAssetsReady());

  useEffect(() => {
    if (ready) return;
    let mounted = true;
    preloadEquipmentAssets().then((ok) => {
      if (mounted && ok) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [ready]);

  return ready;
}
