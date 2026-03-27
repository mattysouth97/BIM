// src/lib/annotations/dimension-line.ts
// Dimension line annotation: line + arrow heads + distance label sprite.

import * as THREE from "three";

/**
 * Create a text sprite using CanvasTexture.
 * Returns a Sprite with the given text rendered on a rounded-rect background.
 */
function createTextSprite(
  text: string,
  opts: { fontSize?: number; bgColor?: string; textColor?: string; padding?: number } = {}
): THREE.Sprite {
  const fontSize = opts.fontSize ?? 48;
  const bgColor = opts.bgColor ?? "rgba(255,255,255,0.92)";
  const textColor = opts.textColor ?? "#222222";
  const padding = opts.padding ?? 16;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const th = fontSize;

  canvas.width = tw + padding * 2;
  canvas.height = th + padding * 2;

  // Background pill
  ctx.fillStyle = bgColor;
  const r = (th + padding * 2) / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.fill();

  // Border
  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.stroke();

  // Text
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
  const sprite = new THREE.Sprite(mat);

  // Scale so the label is readable in world units
  const aspect = canvas.width / canvas.height;
  const height = 0.4;
  sprite.scale.set(height * aspect, height, 1);

  return sprite;
}

/**
 * Create an arrowhead cone aligned to a direction.
 */
function createArrowHead(position: THREE.Vector3, direction: THREE.Vector3, color: number): THREE.Mesh {
  const coneGeo = new THREE.ConeGeometry(0.04, 0.12, 8);
  const coneMat = new THREE.MeshBasicMaterial({ color });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.copy(position);

  // Orient cone along direction
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
  cone.quaternion.copy(q);

  return cone;
}

/**
 * Create a dimension line between two 3D points.
 * Includes: line segment, arrow heads at both ends, perpendicular ticks, distance label.
 */
export function createDimensionLine(start: THREE.Vector3, end: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.name = "annotation-dimension";

  const dir = new THREE.Vector3().subVectors(end, start);
  const dist = dir.length();
  const dirN = dir.clone().normalize();

  // Main line
  const lineGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 });
  const line = new THREE.Line(lineGeo, lineMat);
  group.add(line);

  // Arrow heads
  const arrowStart = createArrowHead(start.clone(), dirN.clone(), 0x333333);
  const arrowEnd = createArrowHead(end.clone(), dirN.clone().negate(), 0x333333);
  group.add(arrowStart, arrowEnd);

  // Perpendicular tick marks at start and end
  // Pick a perpendicular direction (prefer Y-up cross, fallback to X)
  let perpDir = new THREE.Vector3().crossVectors(dirN, new THREE.Vector3(0, 1, 0));
  if (perpDir.lengthSq() < 0.001) {
    perpDir = new THREE.Vector3().crossVectors(dirN, new THREE.Vector3(1, 0, 0));
  }
  perpDir.normalize().multiplyScalar(0.15);

  const tickPoints = [
    start.clone().add(perpDir), start.clone().sub(perpDir),
    end.clone().add(perpDir), end.clone().sub(perpDir),
  ];
  const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPoints);
  // Draw as two separate line segments
  const tickIndices = [0, 1, 2, 3];
  tickGeo.setIndex(tickIndices);
  const tickLine = new THREE.LineSegments(tickGeo, lineMat);
  group.add(tickLine);

  // Distance label at midpoint
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const label = createTextSprite(`${dist.toFixed(2)} m`);
  label.position.copy(midpoint);
  // Offset slightly above the line
  label.position.y += 0.3;
  group.add(label);

  return group;
}
