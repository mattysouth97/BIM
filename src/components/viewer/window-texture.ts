// src/components/viewer/window-texture.ts
import * as THREE from "three";
import type { BuildingEra } from "@/lib/material-types";

interface WindowTextureConfig {
  width: number;          // facade width in meters
  height: number;         // floor height in meters
  windowRatio: number;    // 0-1 window-to-wall ratio
  era: BuildingEra;
  isGroundFloor: boolean;
  useCode?: string;
}

const CANVAS_SCALE = 64; // pixels per meter

export function generateWindowTexture(config: WindowTextureConfig): THREE.CanvasTexture {
  const { width, height, windowRatio, era, isGroundFloor, useCode } = config;

  const canvasW = Math.round(width * CANVAS_SCALE);
  const canvasH = Math.round(height * CANVAS_SCALE);

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(canvasW, 2048);
  canvas.height = Math.min(canvasH, 512);
  const ctx = canvas.getContext("2d")!;

  // Fill with wall color (slightly darker than the PBR base)
  ctx.fillStyle = "#00000000"; // transparent — PBR material shows through
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Calculate window grid
  const windowW = getWindowWidth(era);
  const windowH = getWindowHeight(era);
  const spacingX = getSpacingX(era);
  const spacingY = (canvas.height - windowH) / 2;

  const cols = Math.max(1, Math.floor((canvas.width - spacingX) / (windowW + spacingX)));

  // Adjust columns based on window ratio
  const targetCols = Math.round(cols * windowRatio / 0.4); // 0.4 is baseline ratio for full grid
  const actualCols = Math.max(1, Math.min(targetCols, cols));

  const totalWindowsWidth = actualCols * windowW + (actualCols - 1) * spacingX;
  const startX = (canvas.width - totalWindowsWidth) / 2;

  if (isGroundFloor && (useCode === "07000" || useCode === "11000")) {
    // Ground floor retail/commercial — large glass panels
    drawRetailWindows(ctx, canvas.width, canvas.height, era);
  } else if (isGroundFloor) {
    // Ground floor — entrance + regular windows
    drawGroundFloorWindows(ctx, startX, spacingY, windowW, windowH, spacingX, actualCols, canvas.width, canvas.height, era);
  } else {
    // Regular floors
    for (let col = 0; col < actualCols; col++) {
      const x = startX + col * (windowW + spacingX);
      drawWindow(ctx, x, spacingY, windowW, windowH, era);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function getWindowWidth(era: BuildingEra): number {
  const widths: Record<BuildingEra, number> = {
    "pre-1970": 40, "1970-1989": 48, "1990-1999": 56,
    "2000-2009": 64, "2010-2019": 72, "2020+": 80,
  };
  return widths[era];
}

function getWindowHeight(era: BuildingEra): number {
  const heights: Record<BuildingEra, number> = {
    "pre-1970": 50, "1970-1989": 60, "1990-1999": 80,
    "2000-2009": 100, "2010-2019": 120, "2020+": 140,
  };
  return heights[era];
}

function getSpacingX(era: BuildingEra): number {
  const spacings: Record<BuildingEra, number> = {
    "pre-1970": 40, "1970-1989": 32, "1990-1999": 24,
    "2000-2009": 16, "2010-2019": 10, "2020+": 6,
  };
  return spacings[era];
}

function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, era: BuildingEra) {
  // Window frame
  const frameWidth = era >= "2000-2009" ? 2 : 3;

  // Glass - slight blue tint with transparency
  ctx.fillStyle = "rgba(120, 160, 200, 0.6)";
  ctx.fillRect(x, y, w, h);

  // Frame
  ctx.strokeStyle = era >= "2010-2019" ? "#555555" : "#666666";
  ctx.lineWidth = frameWidth;
  ctx.strokeRect(x, y, w, h);

  // Mullion (vertical divider) for older buildings
  if (era <= "1990-1999" || era === "pre-1970" || era === "1970-1989") {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
  }

  // Slight reflection highlight
  ctx.fillStyle = "rgba(200, 220, 240, 0.15)";
  ctx.fillRect(x + 2, y + 2, w * 0.4, h * 0.3);
}

function drawRetailWindows(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, _era: BuildingEra) {
  const margin = 20;
  const doorWidth = 60;

  // Large glass panel
  ctx.fillStyle = "rgba(100, 150, 190, 0.5)";
  ctx.fillRect(margin, margin, canvasW - margin * 2, canvasH - margin * 2);

  // Frame
  ctx.strokeStyle = "#444444";
  ctx.lineWidth = 3;
  ctx.strokeRect(margin, margin, canvasW - margin * 2, canvasH - margin * 2);

  // Door in center
  const doorX = (canvasW - doorWidth) / 2;
  ctx.fillStyle = "rgba(80, 130, 170, 0.7)";
  ctx.fillRect(doorX, canvasH * 0.3, doorWidth, canvasH * 0.7 - margin);
  ctx.strokeRect(doorX, canvasH * 0.3, doorWidth, canvasH * 0.7 - margin);
}

function drawGroundFloorWindows(
  ctx: CanvasRenderingContext2D,
  startX: number, spacingY: number,
  windowW: number, windowH: number, spacingX: number,
  cols: number, canvasW: number, canvasH: number,
  era: BuildingEra
) {
  // Entrance door in center
  const doorW = 50;
  const doorH = canvasH * 0.7;
  const doorX = (canvasW - doorW) / 2;
  const doorY = canvasH - doorH;

  ctx.fillStyle = "rgba(100, 140, 180, 0.6)";
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = "#555555";
  ctx.lineWidth = 2;
  ctx.strokeRect(doorX, doorY, doorW, doorH);

  // Windows on either side
  for (let col = 0; col < cols; col++) {
    const x = startX + col * (windowW + spacingX);
    if (Math.abs(x + windowW / 2 - canvasW / 2) > doorW) {
      drawWindow(ctx, x, spacingY, windowW, windowH, era);
    }
  }
}
