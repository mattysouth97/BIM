"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useAuthoringStore, type AnnotationMode } from "@/store/authoring-store";
import { createDimensionLine } from "@/lib/annotations/dimension-line";
import { createAreaLabel } from "@/lib/annotations/area-label";
import { createLevelMarker } from "@/lib/annotations/level-marker";
import { createSectionPlane, type SectionCutResult } from "@/lib/annotations/section-cut";
import type { BuildingRecipe } from "@/lib/procedural/types";

interface AnnotationToolsProps {
  recipe: BuildingRecipe;
}

/**
 * R3F component managing all measurement/annotation tools in the 3D scene.
 * Renders annotations as children of a dedicated THREE.Group.
 */
export function AnnotationTools({ recipe }: AnnotationToolsProps) {
  const { scene, gl, camera, raycaster } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const sectionRef = useRef<SectionCutResult | null>(null);
  const dimensionFirstPoint = useRef<THREE.Vector3 | null>(null);

  const annotationMode = useAuthoringStore((s) => s.annotationMode);
  const annotations = useAuthoringStore((s) => s.annotations);
  const addAnnotation = useAuthoringStore((s) => s.addAnnotation);
  const sectionPosition = useAuthoringStore((s) => s.sectionPosition);
  const sectionAxis = useAuthoringStore((s) => s.sectionAxis);

  // Map of annotation id -> THREE.Group for cleanup
  const annotationGroupsRef = useRef<Map<string, THREE.Group>>(new Map());

  // Raycast helper: cast into scene to find intersection point
  const getClickPoint = useCallback(
    (event: MouseEvent): THREE.Vector3 | null => {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);

      // Exclude annotation group from intersection
      const targets = scene.children.filter(
        (c) => c !== groupRef.current && c.type !== "TransformControls"
      );
      const intersects = raycaster.intersectObjects(targets, true);
      if (intersects.length > 0) {
        return intersects[0].point.clone();
      }
      return null;
    },
    [gl, camera, raycaster, scene]
  );

  // Get slab area from intersected object
  const getSlabArea = useCallback(
    (event: MouseEvent): { area: number; center: THREE.Vector3 } | null => {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const targets = scene.children.filter(
        (c) => c !== groupRef.current && c.type !== "TransformControls"
      );
      const intersects = raycaster.intersectObjects(targets, true);
      if (intersects.length > 0) {
        const hit = intersects[0];
        const obj = hit.object;
        // Try to find the floor slab from the hit object name or parent
        // Compute area from bounding box as approximation
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        // Use XZ footprint area (slab is horizontal)
        const area = size.x * size.z;
        const center = box.getCenter(new THREE.Vector3());
        center.y = box.max.y + 0.1;
        return { area: Math.max(area, 0.1), center };
      }
      return null;
    },
    [gl, camera, raycaster, scene]
  );

  // Click handler for annotation modes
  useEffect(() => {
    if (annotationMode === "none" || annotationMode === "level" || annotationMode === "section") {
      dimensionFirstPoint.current = null;
      return;
    }

    const handleClick = (event: MouseEvent) => {
      // Only handle left-click
      if (event.button !== 0) return;

      // Ignore if clicking on UI elements
      const target = event.target as HTMLElement;
      if (target.tagName !== "CANVAS") return;

      if (annotationMode === "dimension") {
        const point = getClickPoint(event);
        if (!point) return;

        if (!dimensionFirstPoint.current) {
          // First click: store start point
          dimensionFirstPoint.current = point;
        } else {
          // Second click: create dimension line
          const start = dimensionFirstPoint.current;
          const end = point;
          const id = `dim-${Date.now()}`;
          const dimGroup = createDimensionLine(start, end);
          dimGroup.userData.annotationId = id;

          if (groupRef.current) {
            groupRef.current.add(dimGroup);
            annotationGroupsRef.current.set(id, dimGroup);
          }

          addAnnotation({
            id,
            type: "dimension",
            data: {
              start: [start.x, start.y, start.z],
              end: [end.x, end.y, end.z],
            },
          });
          dimensionFirstPoint.current = null;
        }
      } else if (annotationMode === "area") {
        const result = getSlabArea(event);
        if (!result) return;

        const id = `area-${Date.now()}`;
        const areaGroup = createAreaLabel(result.area, result.center);
        areaGroup.userData.annotationId = id;

        if (groupRef.current) {
          groupRef.current.add(areaGroup);
          annotationGroupsRef.current.set(id, areaGroup);
        }

        addAnnotation({
          id,
          type: "area",
          data: {
            area: result.area,
            position: [result.center.x, result.center.y, result.center.z],
          },
        });
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [annotationMode, gl, getClickPoint, getSlabArea, addAnnotation]);

  // Level markers: auto-generate when mode is "level"
  useEffect(() => {
    if (annotationMode !== "level" || !groupRef.current) return;

    // Remove any existing level annotations
    const existing = annotations.filter((a) => a.type === "level");
    if (existing.length > 0) return; // Already generated

    const width = recipe.footprintWidth;
    recipe.floors.forEach((floor) => {
      const id = `level-${floor.floorNo}-${floor.type}`;
      const label = floor.label || `FL+${floor.y.toFixed(1)}m`;
      const marker = createLevelMarker(floor.y, label, width);
      marker.userData.annotationId = id;

      groupRef.current!.add(marker);
      annotationGroupsRef.current.set(id, marker);

      addAnnotation({
        id,
        type: "level",
        data: { elevation: floor.y, label, width },
      });
    });

    // Also add roof level
    const roofId = `level-roof`;
    const roofMarker = createLevelMarker(recipe.totalHeight, "Roof", width);
    roofMarker.userData.annotationId = roofId;
    groupRef.current.add(roofMarker);
    annotationGroupsRef.current.set(roofId, roofMarker);

    addAnnotation({
      id: roofId,
      type: "level",
      data: { elevation: recipe.totalHeight, label: "Roof", width },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationMode]);

  // Section cut plane: update when section mode is active
  const buildingSize = useMemo(
    () => Math.max(recipe.footprintWidth, recipe.footprintDepth, recipe.totalHeight) * 2,
    [recipe]
  );

  useEffect(() => {
    // Clean up previous section
    if (sectionRef.current) {
      sectionRef.current.dispose();
      if (groupRef.current && sectionRef.current.helper.parent) {
        groupRef.current.remove(sectionRef.current.helper);
      }
      gl.clippingPlanes = [];
      gl.localClippingEnabled = false;
      sectionRef.current = null;
    }

    if (annotationMode !== "section") return;

    // Calculate position from normalized value
    const range = sectionAxis === "x" ? recipe.footprintWidth : recipe.footprintDepth;
    const halfRange = range / 2;
    const pos = -halfRange + sectionPosition * range;

    const result = createSectionPlane(sectionAxis, pos, buildingSize);
    sectionRef.current = result;

    if (groupRef.current) {
      groupRef.current.add(result.helper);
    }

    gl.clippingPlanes = [result.plane];
    gl.localClippingEnabled = true;

    return () => {
      if (sectionRef.current) {
        sectionRef.current.dispose();
        if (groupRef.current && sectionRef.current.helper.parent) {
          // eslint-disable-next-line react-hooks/exhaustive-deps
          groupRef.current.remove(sectionRef.current.helper);
        }
        gl.clippingPlanes = [];
        gl.localClippingEnabled = false;
        sectionRef.current = null;
      }
    };
  }, [annotationMode, sectionPosition, sectionAxis, buildingSize, recipe, gl]);

  // Sync removed annotations
  useEffect(() => {
    const currentIds = new Set(annotations.map((a) => a.id));
    annotationGroupsRef.current.forEach((grp, id) => {
      if (!currentIds.has(id)) {
        grp.removeFromParent();
        annotationGroupsRef.current.delete(id);
      }
    });
  }, [annotations]);

  // Clean up all on unmount
  useEffect(() => {
    return () => {
      annotationGroupsRef.current.forEach((grp) => grp.removeFromParent());
      annotationGroupsRef.current.clear();
      gl.clippingPlanes = [];
      gl.localClippingEnabled = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set cursor based on mode
  useFrame(() => {
    const canvas = gl.domElement;
    if (annotationMode === "dimension" || annotationMode === "area") {
      canvas.style.cursor = "crosshair";
    }
    // Reset is handled elsewhere when mode is "none"
  });

  return <group ref={groupRef} />;
}
