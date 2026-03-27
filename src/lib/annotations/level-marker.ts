// src/lib/annotations/level-marker.ts
// Level marker annotation: dashed horizontal line at floor elevation + label sprite.

import * as THREE from "three";

/**
 * Create a level marker at a given elevation.
 * Includes: horizontal dashed line, label sprite, triangle marker at left edge.
 */
export function createLevelMarker(
  elevation: number,
  label: string,
  width: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = "annotation-level";

  const halfW = width / 2;
  const offset = halfW + 1.0; // Extend slightly beyond building

  // Dashed horizontal line
  const points = [
    new THREE.Vector3(-offset, elevation, 0),
    new THREE.Vector3(offset, elevation, 0),
  ];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineDashedMaterial({
    color: 0x666666,
    dashSize: 0.2,
    gapSize: 0.1,
    linewidth: 1,
  });
  const line = new THREE.Line(lineGeo, lineMat);
  line.computeLineDistances(); // Required for dashed lines
  group.add(line);

  // Triangle marker at left edge
  const triShape = new THREE.Shape();
  triShape.moveTo(0, 0);
  triShape.lineTo(0.15, 0.08);
  triShape.lineTo(0.15, -0.08);
  triShape.closePath();
  const triGeo = new THREE.ShapeGeometry(triShape);
  const triMat = new THREE.MeshBasicMaterial({ color: 0x666666, side: THREE.DoubleSide });
  const tri = new THREE.Mesh(triGeo, triMat);
  tri.position.set(-offset, elevation, 0);
  group.add(tri);

  // Label sprite at left end
  const displayText = label.includes("FL") ? label : `FL+${elevation.toFixed(1)}m`;

  const fontSize = 40;
  const padding = 12;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const tw = ctx.measureText(displayText).width;

  canvas.width = tw + padding * 2;
  canvas.height = fontSize + padding * 2;

  // Background
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border-bottom accent
  ctx.fillStyle = "#666666";
  ctx.fillRect(0, canvas.height - 3, canvas.width, 3);

  // Text
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "#444444";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
  const sprite = new THREE.Sprite(mat);

  const aspect = canvas.width / canvas.height;
  const h = 0.35;
  sprite.scale.set(h * aspect, h, 1);
  sprite.position.set(-offset - 0.6, elevation, 0);

  group.add(sprite);

  return group;
}
