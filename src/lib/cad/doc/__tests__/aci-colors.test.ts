// src/lib/cad/doc/__tests__/aci-colors.test.ts
import { describe, it, expect } from "vitest";
import { aciToHex } from "../aci-colors";

describe("aciToHex", () => {
  it("maps the 9 primary ACI colors exactly", () => {
    expect(aciToHex(1)).toBe("#ff0000"); // red
    expect(aciToHex(2)).toBe("#ffff00"); // yellow
    expect(aciToHex(3)).toBe("#00ff00"); // green
    expect(aciToHex(4)).toBe("#00ffff"); // cyan
    expect(aciToHex(5)).toBe("#0000ff"); // blue
    expect(aciToHex(6)).toBe("#ff00ff"); // magenta
    expect(aciToHex(7)).toBe("#ffffff"); // white/black
    expect(aciToHex(8)).toBe("#808080");
    expect(aciToHex(9)).toBe("#c0c0c0");
  });
  it("maps grays 250–255 as an ascending ramp", () => {
    const grays = [250, 251, 252, 253, 254, 255].map(aciToHex);
    expect(grays[0]).toBe("#333333");
    expect(grays[5]).toBe("#ffffff");
    expect(new Set(grays).size).toBe(6);
  });
  it("returns a valid hex for every chromatic index 10–249", () => {
    for (let i = 10; i <= 249; i++) {
      expect(aciToHex(i)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("falls back to white for 0 (ByBlock) and out-of-range", () => {
    expect(aciToHex(0)).toBe("#ffffff");
    expect(aciToHex(256)).toBe("#ffffff");
    expect(aciToHex(-3)).toBe("#ffffff");
  });
});
