"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { AxisConstraint, AlignmentGuide } from "@/lib/plan/snap-engine";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSTRAINT_COLOR_X = 0xff0000; // Red for X-axis constraint
const CONSTRAINT_COLOR_Z = 0x00ff00; // Green for Z-axis constraint
const ALIGNMENT_COLOR = 0xff00ff;    // Magenta for alignment guides
const GUIDE_Y = 0.04;                // Slightly below snap indicator (0.05)
const CONSTRAINT_EXTENT = 50;        // meters in each direction along axis

// ---------------------------------------------------------------------------
// AlignmentGuides
// ---------------------------------------------------------------------------

export interface AlignmentGuidesProps {
  constraint: AxisConstraint;
  constraintOrigin: [number, number] | null; // drawingWall start point
  constraintDirection: "x" | "z" | null;     // resolved direction (for "auto")
  alignments: AlignmentGuide[];
}

/**
 * R3F component rendering:
 * a) Axis constraint line — colored dashed line along the locked axis from origin
 * b) Alignment guides — magenta dashed lines to collinear wall endpoints
 */
export function AlignmentGuides({
  constraint,
  constraintOrigin,
  constraintDirection,
  alignments,
}: AlignmentGuidesProps) {
  // Determine the resolved constraint axis for rendering
  const resolvedAxis: "x" | "z" | null = useMemo(() => {
    if (constraint === "none" || !constraintOrigin) return null;
    if (constraint === "x") return "x";
    if (constraint === "z") return "z";
    // "auto" — use the resolved direction provided by wall-drawer
    return constraintDirection ?? null;
  }, [constraint, constraintOrigin, constraintDirection]);

  // Build constraint line geometry (extends +/- CONSTRAINT_EXTENT along locked axis)
  const constraintLineObj = useMemo(() => {
    if (!resolvedAxis || !constraintOrigin) return null;

    const [ox, oz] = constraintOrigin;
    let points: [number, number, number, number, number, number];

    if (resolvedAxis === "x") {
      // Line runs along X axis; Z is locked to origin Z
      points = [ox - CONSTRAINT_EXTENT, GUIDE_Y, oz, ox + CONSTRAINT_EXTENT, GUIDE_Y, oz];
    } else {
      // Line runs along Z axis; X is locked to origin X
      points = [ox, GUIDE_Y, oz - CONSTRAINT_EXTENT, ox, GUIDE_Y, oz + CONSTRAINT_EXTENT];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(points), 3)
    );

    const color = resolvedAxis === "x" ? CONSTRAINT_COLOR_X : CONSTRAINT_COLOR_Z;
    const mat = new THREE.LineDashedMaterial({
      color,
      dashSize: 0.3,
      gapSize: 0.15,
      transparent: true,
      opacity: 0.5,
    });

    const line = new THREE.Line(geom, mat);
    line.computeLineDistances();
    return line;
  }, [resolvedAxis, constraintOrigin]);

  // Build alignment guide objects (one per AlignmentGuide)
  const alignmentObjs = useMemo(() => {
    if (alignments.length === 0) return [];

    return alignments.map((guide) => {
      const [fx, fz] = guide.fromPoint;
      const [tx, tz] = guide.toPoint;

      // Line from fromPoint to toPoint
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([fx, GUIDE_Y, fz, tx, GUIDE_Y, tz]),
          3
        )
      );
      const lineMat = new THREE.LineDashedMaterial({
        color: ALIGNMENT_COLOR,
        dashSize: 0.15,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.6,
      });
      const line = new THREE.Line(lineGeom, lineMat);
      line.computeLineDistances();

      // Small diamond marker at toPoint (4 vertices, radius 0.06m)
      const r = 0.06;
      const diamondGeom = new THREE.BufferGeometry();
      diamondGeom.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([
            tx,      GUIDE_Y, tz - r, // top (north)
            tx + r,  GUIDE_Y, tz,     // right (east)
            tx,      GUIDE_Y, tz + r, // bottom (south)
            tx - r,  GUIDE_Y, tz,     // left (west)
            tx,      GUIDE_Y, tz - r, // close back to top
          ]),
          3
        )
      );
      const diamondMat = new THREE.LineBasicMaterial({
        color: ALIGNMENT_COLOR,
        transparent: true,
        opacity: 0.8,
      });
      const diamond = new THREE.Line(diamondGeom, diamondMat);

      return { line, diamond };
    });
  }, [alignments]);

  // Return null when nothing to render
  if (!constraintLineObj && alignmentObjs.length === 0) return null;

  return (
    <group>
      {constraintLineObj && <primitive object={constraintLineObj} />}
      {alignmentObjs.map((obj, i) => (
        <group key={i}>
          <primitive object={obj.line} />
          <primitive object={obj.diamond} />
        </group>
      ))}
    </group>
  );
}
