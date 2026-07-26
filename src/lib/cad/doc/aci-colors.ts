// src/lib/cad/doc/aci-colors.ts
// AutoCAD Color Index → hex. Indices 1–9 and 250–255 are the canonical
// values; 10–249 are generated with the standard ACI hue/shade layout
// (24 hues × 10 shades) — an approximation, fine for viewing.

const PRIMARY: Record<number, string> = {
  1: "#ff0000", 2: "#ffff00", 3: "#00ff00", 4: "#00ffff",
  5: "#0000ff", 6: "#ff00ff", 7: "#ffffff", 8: "#808080", 9: "#c0c0c0",
};

const GRAYS: Record<number, string> = {
  250: "#333333", 251: "#5c5c5c", 252: "#858585",
  253: "#adadad", 254: "#d6d6d6", 255: "#ffffff",
};

export function aciToHex(index: number): string {
  if (!Number.isInteger(index)) return "#ffffff";
  if (PRIMARY[index]) return PRIMARY[index];
  if (GRAYS[index]) return GRAYS[index];
  if (index < 10 || index > 249) return "#ffffff";

  // Chromatic band: pairs step through 24 hues; within each hue,
  // 5 lightness levels, odd indices are the "half saturation" variant.
  const i = index - 10;
  const hue = (Math.floor(i / 10) * 360) / 24; // degrees
  const shade = Math.floor((i % 10) / 2);       // 0..4 dark ramp
  const muted = i % 2 === 1;
  const lightness = 0.5 - shade * 0.08;
  const saturation = muted ? 0.55 : 1.0;
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
