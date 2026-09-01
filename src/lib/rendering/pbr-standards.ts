// src/lib/rendering/pbr-standards.ts
// Physically-plausible reflectance ranges for real-time architectural PBR.
// Sources: physicallybased.info dielectric/metal charts; ISO 6946-adjacent
// visual albedos (not thermal λ). Values are sRGB working-copy clamps used
// at material construction time — they never rewrite BIM engineering data.

const DIELECTRIC_ALBEDO_MIN = 0.04;
const DIELECTRIC_ALBEDO_MAX = 0.94;
const METAL_ALBEDO_MIN = 0.56;
const METAL_ALBEDO_MAX = 1.0;

export const DIELECTRIC_F0 = 0.04;
export const GLASS_IOR = 1.52;
export const WATER_IOR = 1.33;
export const PLASTIC_IOR = 1.45;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const v = Number.parseInt(n, 16);
  return {
    r: ((v >> 16) & 255) / 255,
    g: ((v >> 8) & 255) / 255,
    b: (v & 255) / 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Clamp an sRGB albedo so it is neither a crushed black nor a blown white.
 * Metals keep a higher floor (real metals do not have 0.1 albedo).
 */
export function clampAlbedoHex(hex: string, metallic: boolean): string {
  const { r, g, b } = hexToRgb(hex);
  const y = luminance(r, g, b);
  const min = metallic ? METAL_ALBEDO_MIN : DIELECTRIC_ALBEDO_MIN;
  const max = metallic ? METAL_ALBEDO_MAX : DIELECTRIC_ALBEDO_MAX;
  if (y >= min && y <= max) return hex.startsWith("#") ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
  if (y < 1e-6) return metallic ? "#c8c8c8" : "#1a1a1a";
  const target = y < min ? min : max;
  const k = target / y;
  return rgbToHex(r * k, g * k, b * k);
}

export function clampRoughness(value: number): number {
  return Math.min(1, Math.max(0.02, value));
}

export function clampMetalness(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function clampIor(value: number): number {
  return Math.min(2.5, Math.max(1.0, value));
}

/**
 * True when a glazing colour is the legacy CAD "transparent blue" that should
 * be remapped to a physically plausible glass tint in realistic modes.
 */
export function isCadBlueGlass(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return b > 0.55 && b > r * 1.15 && g > r * 0.9 && r < 0.75;
}

export function srgbLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return luminance(r, g, b);
}
