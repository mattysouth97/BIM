"use client";

// src/components/viewer/interior-layer.tsx
//
// The solved interior, mounted.
//
// Every geometric decision was already made — and tested — in src/lib/interior:
// which walls exist, where the openings split them, which GLB a generated door
// is, how a guard run follows a stair shaft. This file owns exactly three
// things: WHICH storeys to draw, three.js resource lifetime, and the fact that
// a wall is an InstancedMesh while a door is a cloned GLB.
//
// Two canvases mount it — the workspace viewport inside `BuildingScene`, and
// the studio's own Canvas — so the snapshot arrives as a PROP rather than being
// read from a store: the workspace's snapshot lives in `bim-model-store`, the
// studio's lives in the session's current (or pending) design, and neither
// viewport should have to know about the other's source.
//
// DRAW CALLS   One InstancedMesh of walls per storey, plus one of railings per
//              storey that has any — so a 5-storey building is 10 draw calls
//              plus one per family GLB (doors, windows, stairs), which drei's
//              cache shares geometry for but not draw calls.
//
// COLOUR       Walls are white-materialled and coloured PER INSTANCE, so core
//              walls read darker than partitions inside one mesh rather than
//              costing a second one.
//
// FRAME        `WallInstance.matrix` is already `Matrix4.elements` for a unit
//              BoxGeometry — see the conventions block in src/lib/interior/
//              index.ts. Nothing here re-derives a transform, and in particular
//              nothing re-derives a rotation from `placement.rotationY`.

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import type { BimModelSnapshot } from "@/lib/bim/model/types";
import { planInteriorView } from "@/lib/interior/view-select";
import { disposeObject3D } from "@/lib/layers/analysis/overlay-types";
import { useLayerStore } from "@/store/layer-store";

import { FamilyInstance } from "./family-instance";

/** Root group name — targeted lookup and disposal, like the analysis overlays. */
export const INTERIOR_LAYER_GROUP = "interior-layer-root";

/**
 * Warm neutral, deliberately unlike anything the massing shell uses (its
 * facades are era-recipe glass/panel colours): an interior partition seen
 * through a hidden facade must not read as part of the envelope.
 */
const PARTITION_COLOR = 0xd8d4cb;
/** Core walls: the same hue, darker — a shaft wall is not a partition. */
const CORE_COLOR = 0xa49f96;
const RAILING_COLOR = 0x64748b;
/** A guard is drawn as one thin box, not the 1 m module GLB (see below). */
const RAILING_THICKNESS_M = 0.05;

export interface InteriorLayerProps {
  /**
   * The building whose solved interior to draw. Null/undefined ⇒ nothing (the
   * design has not loaded yet), which is not the same as "empty interior".
   */
  snapshot: BimModelSnapshot | null | undefined;
  /**
   * Visibility override. Omitted ⇒ the persisted `interiorVisible` toggle in
   * layer-store, which is what the workspace wants (default off, layer panel
   * turns it on). The studio passes `true`: its viewport exists to show the
   * solve, and it mounts no layer panel to turn the toggle back on with. One
   * store field, two defaults — a second field would let the two viewports
   * disagree about a single user preference.
   */
  enabled?: boolean;
  /**
   * Draw the envelope walls and their windows too. Omitted ⇒ the persisted
   * `interiorIncludeExterior` sub-toggle (default false, because the massing
   * shell already draws the facade and drawing it twice z-fights).
   */
  includeExterior?: boolean;
  /**
   * Draw only these storeys (`floorNo`). `null` means "no restriction"; an
   * empty array means "nothing". Compared BY VALUE, so a caller that rebuilds
   * its isolation list every render (the studio does) does not rebuild the
   * meshes for it.
   */
  floors?: readonly number[] | null;
  /**
   * Clicking a family selects its BIM element in `bim-model-store`. Only the
   * workspace sets this: the studio's design is not the store's snapshot, so a
   * click there would select an id the inspector cannot resolve.
   */
  selectable?: boolean;
}

export function InteriorLayer({
  snapshot,
  enabled: enabledProp,
  includeExterior: includeExteriorProp,
  floors,
  selectable = false,
}: InteriorLayerProps) {
  const storeVisible = useLayerStore((s) => s.interiorVisible);
  const storeIncludeExterior = useLayerStore((s) => s.interiorIncludeExterior);

  const enabled = enabledProp ?? storeVisible;
  const includeExterior = includeExteriorProp ?? storeIncludeExterior;

  // Value key for the floor filter. Cheap to recompute every render; what it
  // buys is that `view` — and therefore the whole InstancedMesh rebuild — only
  // changes when the SET of isolated storeys changes.
  const floorKey = useMemo(
    () => (floors ? [...floors].sort((a, b) => a - b).join(",") : null),
    [floors],
  );

  const view = useMemo(
    () =>
      planInteriorView(snapshot, {
        enabled,
        includeExterior,
        floors: floorKey === null ? null : floorKey === "" ? [] : floorKey.split(",").map(Number),
      }),
    [snapshot, enabled, includeExterior, floorKey],
  );

  // Lazy state initializer, not a ref: the group must be readable during render
  // to be handed to <primitive>, and this keeps one instance for the lifetime
  // of the component (same pattern as envelope-layer.tsx).
  const [root] = useState(() => {
    const group = new THREE.Group();
    group.name = INTERIOR_LAYER_GROUP;
    return group;
  });

  // Walls + railings: built imperatively because an InstancedMesh is filled by
  // 16 numbers at a time, and rebuilt only when the model or the storey filter
  // changes. Everything allocated here is disposed by this effect's teardown —
  // nothing is allocated per frame.
  useEffect(() => {
    if (!view) return;

    const box = new THREE.BoxGeometry(1, 1, 1);
    const wallMaterial = new THREE.MeshStandardMaterial({
      // White base: the visible colour comes from `instanceColor`.
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0,
    });
    const railingMaterial = new THREE.MeshStandardMaterial({
      color: RAILING_COLOR,
      roughness: 0.4,
      metalness: 0.6,
    });

    // Scratch objects, reused across every instance of every storey.
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();

    const group = new THREE.Group();
    group.name = "interior-layer-content";

    for (const floorNo of view.floors) {
      const walls = view.model.wallsByFloor[floorNo] ?? [];
      const railings = view.model.railingsByFloor[floorNo] ?? [];
      if (walls.length === 0 && railings.length === 0) continue;

      const floorGroup = new THREE.Group();
      floorGroup.name = `interior-floor-${floorNo}`;

      if (walls.length > 0) {
        const mesh = new THREE.InstancedMesh(box, wallMaterial, walls.length);
        mesh.name = `interior-walls-${floorNo}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        for (let i = 0; i < walls.length; i += 1) {
          const wall = walls[i];
          matrix.fromArray(wall.matrix as number[]);
          mesh.setMatrixAt(i, matrix);
          mesh.setColorAt(i, color.setHex(wall.isCore ? CORE_COLOR : PARTITION_COLOR));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        floorGroup.add(mesh);
      }

      if (railings.length > 0) {
        // A guard is a thin box rather than the `railing-guard-1m` GLB: the run
        // is a straight horizontal edge, and a box states exactly that without
        // paying for a stretched module chain the family was not authored to be.
        const mesh = new THREE.InstancedMesh(box, railingMaterial, railings.length);
        mesh.name = `interior-railings-${floorNo}`;
        mesh.castShadow = true;
        for (let i = 0; i < railings.length; i += 1) {
          const run = railings[i];
          // `run.position` is the START of the run, at the storey's finished
          // floor; a box is centred, so it moves half a run along the heading
          // and half a guard height up. Ry(θ) sends local +X to
          // (cos θ, 0, −sin θ) — the same convention `composeTrs` documents.
          const half = run.lengthM / 2;
          position.set(
            run.position[0] + Math.cos(run.rotationY) * half,
            run.position[1] + run.heightM / 2,
            run.position[2] - Math.sin(run.rotationY) * half,
          );
          quaternion.setFromEuler(euler.set(0, run.rotationY, 0));
          scale.set(run.lengthM, run.heightM, RAILING_THICKNESS_M);
          matrix.compose(position, quaternion, scale);
          mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        floorGroup.add(mesh);
      }

      group.add(floorGroup);
    }

    root.add(group);

    return () => {
      root.remove(group);
      disposeObject3D(group);
      // The geometry and the two materials are SHARED by every mesh above, so
      // they are disposed once here rather than once per mesh.
      box.dispose();
      wallMaterial.dispose();
      railingMaterial.dispose();
    };
  }, [view, root]);

  // Anything still mounted when the component goes away.
  useEffect(() => {
    return () => {
      disposeObject3D(root);
      root.clear();
    };
  }, [root]);

  // Families are declarative: `useGLTF` suspends, so a door cannot be created
  // inside the effect above. The poses come out of the same model.
  const poses = useMemo(() => {
    if (!view) return [];
    return view.floors.flatMap((floorNo) =>
      (view.model.posesByFloor[floorNo] ?? []).map((pose) => ({
        key: pose.id,
        elementId: pose.elementId,
        url: pose.url,
        position: pose.position,
        scale: pose.scale,
        // The pose already carries a three.js yaw — never re-derived here.
        rotation: [0, pose.rotationY, 0] as [number, number, number],
        mirrored: pose.mirrored,
      })),
    );
  }, [view]);

  return (
    <group name="interior-layer" visible={enabled}>
      <primitive object={root} />
      {poses.map((pose) => (
        <FamilyInstance
          key={pose.key}
          url={pose.url}
          position={pose.position}
          scale={pose.scale}
          rotation={pose.rotation}
          mirrored={pose.mirrored}
          instanceId={selectable ? pose.elementId : undefined}
        />
      ))}
    </group>
  );
}
