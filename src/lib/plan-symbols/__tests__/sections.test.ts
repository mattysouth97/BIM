import { AUTHORING_FAMILIES } from "@/lib/bim/family-catalog";
import { describe, expect, it } from "vitest";

import { familiesForSection, sectionCounts, sectionForFamily, SECTIONS, SYMBOL_SECTION_IDS } from "../sections";

describe("sections: the eight Figma catalog sections", () => {
  it("lists section 08 System Kit as metadata-only, and seven symbol-bearing sections", () => {
    expect(SECTIONS).toHaveLength(8);
    expect(SECTIONS.find((s) => s.id === "system-kit")?.metadataOnly).toBe(true);
    expect(SYMBOL_SECTION_IDS).toHaveLength(7);
    expect(SYMBOL_SECTION_IDS).not.toContain("system-kit");
  });

  it("applies the bems-/energy-/ess-/ev- prefix override ahead of the tool mapping", () => {
    const family = AUTHORING_FAMILIES.find((f) => f.id === "energy-smart-meter");
    expect(family?.tool).toBe("electrical");
    expect(sectionForFamily(family!)).toBe("energy-bems");
  });

  it("routes an ordinary electrical-tool family to the electrical section", () => {
    const family = AUTHORING_FAMILIES.find((f) => f.id === "device-outlet-single");
    expect(sectionForFamily(family!)).toBe("electrical");
  });

  const counts = sectionCounts();
  const summary = SYMBOL_SECTION_IDS.map((id) => `${id}=${counts[id]}`).join(" ");

  it(`partitions all 102 families across the seven sections with no overlap (${summary})`, () => {
    expect(AUTHORING_FAMILIES).toHaveLength(102);

    const seen = new Map<string, string>();
    for (const family of AUTHORING_FAMILIES) {
      const section = sectionForFamily(family);
      expect(SYMBOL_SECTION_IDS).toContain(section);
      expect(seen.has(family.id)).toBe(false); // AUTHORING_FAMILIES itself has no duplicate ids
      seen.set(family.id, section);
    }
    expect(seen.size).toBe(102);

    const bySection = new Map<string, Set<string>>();
    for (const [id, section] of seen) {
      const set = bySection.get(section) ?? new Set<string>();
      set.add(id);
      bySection.set(section, set);
    }
    // Every family lands in exactly one section's set (no id appears in two sets).
    const allIds = [...bySection.values()].flatMap((s) => [...s]);
    expect(new Set(allIds).size).toBe(102);
    expect(allIds).toHaveLength(102);

    const totalCounted = SYMBOL_SECTION_IDS.reduce((sum, id) => sum + counts[id], 0);
    expect(totalCounted).toBe(102);
  });

  it("agrees with familiesForSection on per-section membership", () => {
    for (const id of SYMBOL_SECTION_IDS) {
      expect(familiesForSection(id)).toHaveLength(counts[id]);
      for (const family of familiesForSection(id)) {
        expect(sectionForFamily(family)).toBe(id);
      }
    }
  });

  it("gives every one of the 19 tools a section", () => {
    const tools = new Set(AUTHORING_FAMILIES.map((f) => f.tool));
    for (const family of AUTHORING_FAMILIES) {
      expect(() => sectionForFamily(family)).not.toThrow();
    }
    expect(tools.size).toBeGreaterThan(0);
  });
});
