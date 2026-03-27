// src/lib/annotations/area-label.ts
// Area label annotation: sprite showing "XX.X m2" at a given position.

import * as THREE from "three";

/**
 * Create an area label sprite with semi-transparent white pill background.
 */
export function createAreaLabel(area: number, position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.name = "annotation-area";

  const text = `${area.toFixed(1)} m\u00B2`;

  const fontSize = 52;
  const padding = 20;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const th = fontSize;

  canvas.width = tw + padding * 2;
  canvas.height = th + padding * 2;

  // Semi-transparent white pill background
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  const r = (th + padding * 2) / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.fill();

  // Border
  ctx.strokeStyle = "#2196f3";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.stroke();

  // Text
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "#1565c0";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    sizeAttenuation: true,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);

  const aspect = canvas.width / canvas.height;
  const height = 0.5;
  sprite.scale.set(height * aspect, height, 1);

  // Position slightly above surface
  sprite.position.copy(position);
  sprite.position.y += 0.1;

  group.add(sprite);
  return group;
}
