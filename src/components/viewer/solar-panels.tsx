"use client";

// src/components/viewer/solar-panels.tsx
// The twin's rooftop PV, drawn where the layout put it. Until 2026-09-06 this
// gridded `footprintWidth × footprintDepth` — a rectangle, even after P2-30
// gave the twin per-storey plates — so modules sat over terraces and past
// setbacks the layout would never allow. Now it draws the same layout the
// legend counts and the economics prices (`usePvLayout` over the twin's own
// planes, published by `building-scene.tsx`). `recipe` is accepted and
// unused so the mount site in building-scene.tsx did not have to change.

import type { BuildingRecipe } from "@/lib/procedural/types";
import { usePvLayout } from "@/hooks/use-pv-layout";
import { PvModulesVisual } from "./pv-modules";

export function SolarPanels({ recipe: _recipe }: { recipe: BuildingRecipe }) {
  const layout = usePvLayout();
  return <PvModulesVisual layout={layout} />;
}
