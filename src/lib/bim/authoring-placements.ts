// Instance poses for published authoring GLBs.
// Origins follow public/models/authoring/README.md (Y-up, metres).

import type { BuildingRecipe } from "@/lib/procedural/types";
import { AUTHORING_ASSET_MANIFEST } from "./authoring-asset-manifest";
import { authoringFamilyUrl } from "./family-catalog";

export interface FamilyInstancePose {
  id: string;
  url: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
}

function slotUrl(slot: keyof typeof AUTHORING_ASSET_MANIFEST): string {
  return AUTHORING_ASSET_MANIFEST[slot]?.uri ?? "";
}

/**
 * Place authored families on the live twin:
 * columns on the structural grid, a front door + windows, roof MEP, and
 * an optional selected-type preview pad beside the building.
 */
export function planAuthoringInstances(
  recipe: BuildingRecipe,
  selectedFamilyId?: string | null
): FamilyInstancePose[] {
  const poses: FamilyInstancePose[] = [];
  const w = recipe.footprintWidth;
  const d = recipe.footprintDepth;
  const inset = recipe.column.inset;
  const spacing = Math.max(recipe.column.spacing, 1);
  const columnUrl = slotUrl("family.column.rectangular");
  const windowUrl = slotUrl("family.window.fixed");
  const doorUrl = slotUrl("family.door.single-flush");

  const xs: number[] = [];
  for (let x = -w / 2 + inset; x <= w / 2 - inset + 0.01; x += spacing) xs.push(x);
  const zs: number[] = [];
  for (let z = -d / 2 + inset; z <= d / 2 - inset + 0.01; z += spacing) zs.push(z);

  for (const floor of recipe.floors) {
    if (columnUrl) {
      for (const x of xs) {
        for (const z of zs) {
          poses.push({
            id: `col:${floor.floorNo}:${x.toFixed(2)}:${z.toFixed(2)}`,
            url: columnUrl,
            position: [x, floor.y, z],
            scale: [1, Math.max(floor.height, 0.1), 1],
            rotation: [0, 0, 0],
          });
        }
      }
    }

    if (windowUrl && floor.type === "above") {
      const y = floor.y + recipe.facade.sillHeight + recipe.facade.windowHeight / 2;
      let count = 0;
      for (
        let x = -w / 2 + recipe.facade.windowSpacing;
        x < w / 2 - 1 && count < 6;
        x += recipe.facade.windowSpacing
      ) {
        poses.push({
          id: `win:${floor.floorNo}:${count}`,
          url: windowUrl,
          position: [x, y, d / 2 + 0.06],
          scale: [1, 1, 1],
          rotation: [0, 0, 0],
        });
        count += 1;
      }
    }
  }

  const ground = recipe.floors.find((f) => f.isGroundFloor) ?? recipe.floors[0];
  if (doorUrl && ground) {
    poses.push({
      id: "door:entry",
      url: doorUrl,
      position: [0, ground.y, d / 2 + 0.08],
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
    });
  }

  const roofY = recipe.totalHeight;
  const plant: Array<[string, keyof typeof AUTHORING_ASSET_MANIFEST, number, number]> = [
    ["mep:chiller", "family.mep.chiller", w * 0.22, 0],
    ["mep:boiler", "family.mep.boiler", -w * 0.22, 0],
    ["mep:dhw", "family.mep.dhw", 0, d * 0.22],
    ["mep:ahu", "family.mep.ahu", 0, -d * 0.22],
  ];
  for (const [id, slot, x, z] of plant) {
    const url = slotUrl(slot);
    if (!url) continue;
    poses.push({
      id,
      url,
      position: [x, roofY, z],
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
    });
  }

  const lightUrl = slotUrl("family.lighting.fixture");
  if (lightUrl) {
    for (const floor of recipe.floors) {
      poses.push({
        id: `light:${floor.floorNo}`,
        url: lightUrl,
        position: [0, floor.y + floor.height - 0.05, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
      });
    }
  }

  if (selectedFamilyId) {
    poses.push({
      id: `preview:${selectedFamilyId}`,
      url: authoringFamilyUrl(selectedFamilyId),
      position: [w / 2 + 4, 0, 0],
      scale: [1, 1, 1],
      rotation: [0, -Math.PI / 6, 0],
    });
  }

  return poses.filter((p) => p.url.length > 0);
}
