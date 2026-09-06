import { describe, it, expect } from "vitest";
import {
  splitTrianglesByElevation,
  analyzeUpwardFaces,
  roofElevationThresholdM,
  classifyRoofTypeForSizing,
  panelLayoutForRoof,
  equipmentLayerReach,
  buildRetrofitLegendLines,
  deriveVisualState,
  PV_PANEL_RATED_KWP,
  PV_FIXED_RACK_TILT_DEG,
  type FaceSetAnalysis,
} from "../reference-retrofit-visuals";
import { NO_RETROFIT_VISUALS, effectiveMeasureIds, proposalVisualIds } from "@/lib/retrofit/measure-visuals";

/** Two coincident quads (4 verts each) sharing one position/index buffer: a floor at y=0, a roof at y=10. */
function twoStoreyQuads() {
  // prettier-ignore
  const positions = new Float32Array([
    // floor quad (y = 0), 10x10
    -5, 0, -5,   5, 0, -5,   5, 0, 5,   -5, 0, 5,
    // roof quad (y = 10), 10x10, flat
    -5, 10, -5,  5, 10, -5,  5, 10, 5,  -5, 10, 5,
  ]);
  const index = [
    0, 1, 2, 0, 2, 3, // floor
    4, 6, 5, 4, 7, 6, // roof — wound so the normal faces +Y (upward)
  ];
  return { positions, index };
}

describe("splitTrianglesByElevation", () => {
  it("puts the roof quad's triangles above and the floor's below", () => {
    const { positions, index } = twoStoreyQuads();
    const { above, below } = splitTrianglesByElevation(positions, index, 5);
    expect(above).toEqual([4, 6, 5, 4, 7, 6]);
    expect(below).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("treats the threshold as inclusive", () => {
    const positions = new Float32Array([0, 5, 0, 1, 5, 0, 0, 5, 1]);
    const { above, below } = splitTrianglesByElevation(positions, [0, 1, 2], 5);
    expect(above).toEqual([0, 1, 2]);
    expect(below).toEqual([]);
  });
});

describe("analyzeUpwardFaces", () => {
  it("measures a flat 10x10 quad's area and zero tilt", () => {
    const { positions, index } = twoStoreyQuads();
    const roofOnly = index.slice(6);
    const result = analyzeUpwardFaces(positions, roofOnly);
    expect(result).not.toBeNull();
    expect(result!.areaSqm).toBeCloseTo(100, 5);
    expect(result!.tiltDeg).toBeCloseTo(0, 5);
    expect(result!.minX).toBe(-5);
    expect(result!.maxX).toBe(5);
    expect(result!.apexY).toBe(10);
  });

  it("measures a 45-degree pitched triangle", () => {
    // A=(0,0,0), B=(0,1,1), C=(1,0,0): cross(B-A, C-A) = (0,1,-1), an
    // upward-facing normal 45 degrees from vertical.
    const positions = new Float32Array([0, 0, 0, 0, 1, 1, 1, 0, 0]);
    const result = analyzeUpwardFaces(positions, [0, 1, 2]);
    expect(result).not.toBeNull();
    expect(result!.tiltDeg).toBeCloseTo(45, 3);
  });

  it("excludes downward and near-vertical faces from area and tilt", () => {
    // A vertical wall quad (normal horizontal) contributes nothing.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);
    const result = analyzeUpwardFaces(positions, [0, 1, 2, 0, 2, 3]);
    expect(result).toBeNull();
  });
});

describe("roofElevationThresholdM", () => {
  const storeys = [
    { id: "s1", name: "1F", elevationM: 0, floorToFloorHeightM: 4.57, spaceCount: 1, floorAreaSqm: 1, ref: "" },
    { id: "s2", name: "2F", elevationM: 4.57, floorToFloorHeightM: 4.68, spaceCount: 1, floorAreaSqm: 1, ref: "" },
    { id: "roof", name: "Roof", elevationM: 9.25, floorToFloorHeightM: 0, spaceCount: 0, floorAreaSqm: 0, ref: "" },
  ];

  it("uses the MAX elevation among roof-referenced storeys, minus the margin", () => {
    const roofs = [
      { id: "r1", name: "", family: "", elementType: "IfcRoof", predefinedType: null, basis: "", storeyId: "roof", projectedSqm: 1, upFacingProjectedSqm: 1, tiltDeg: 0, surfaceSqm: 1, surfaceBasis: "", partOf: null, ref: "" },
      { id: "r2", name: "", family: "", elementType: "IfcRoof", predefinedType: null, basis: "", storeyId: "s2", projectedSqm: 1, upFacingProjectedSqm: 1, tiltDeg: 0, surfaceSqm: 1, surfaceBasis: "", partOf: null, ref: "" },
    ];
    // MAX(9.25, 4.57) - 1.0 = 8.25, NOT min(4.57) - 1.0 = 3.57 — the latter
    // would misclassify the second floor's own floor slab (also near 4.57).
    expect(roofElevationThresholdM(roofs, storeys)).toBeCloseTo(8.25, 5);
  });

  it("returns null with no roofs or no storeys", () => {
    expect(roofElevationThresholdM(undefined, storeys)).toBeNull();
    expect(roofElevationThresholdM([], storeys)).toBeNull();
    expect(
      roofElevationThresholdM(
        [{ id: "r1", name: "", family: "", elementType: "IfcRoof", predefinedType: null, basis: "", storeyId: "roof", projectedSqm: 1, upFacingProjectedSqm: 1, tiltDeg: 0, surfaceSqm: 1, surfaceBasis: "", partOf: null, ref: "" }],
        undefined,
      ),
    ).toBeNull();
  });

  it("returns null when every roof's storeyId is unresolvable", () => {
    const roofs = [
      { id: "r1", name: "", family: "", elementType: "IfcRoof", predefinedType: null, basis: "", storeyId: null, projectedSqm: 1, upFacingProjectedSqm: 1, tiltDeg: 0, surfaceSqm: 1, surfaceBasis: "", partOf: null, ref: "" },
    ];
    expect(roofElevationThresholdM(roofs, storeys)).toBeNull();
  });
});

describe("classifyRoofTypeForSizing", () => {
  it("treats under-5-degree tilt as flat, everything else as gable", () => {
    expect(classifyRoofTypeForSizing(0)).toBe("flat");
    expect(classifyRoofTypeForSizing(4.9)).toBe("flat");
    expect(classifyRoofTypeForSizing(5)).toBe("gable");
    expect(classifyRoofTypeForSizing(35)).toBe("gable");
  });
});

describe("panelLayoutForRoof", () => {
  const flatFace: FaceSetAnalysis = {
    areaSqm: 500,
    tiltDeg: 0,
    minX: -15,
    maxX: 15,
    minZ: -10,
    maxZ: 10,
    apexY: 9.25,
  };
  const pitchedFace: FaceSetAnalysis = {
    areaSqm: 80,
    tiltDeg: 35,
    minX: -8,
    maxX: 8,
    minZ: -3,
    maxZ: 3,
    apexY: 7,
  };

  it("uses the fixed rack tilt on a flat roof, not the roof's own (zero) tilt", () => {
    const layout = panelLayoutForRoof(flatFace);
    expect(layout).not.toBeNull();
    expect(layout!.tiltDeg).toBe(PV_FIXED_RACK_TILT_DEG);
  });

  it("flush-mounts at the roof's own tilt on a pitched roof — never flat panels on a tiled roof", () => {
    const layout = panelLayoutForRoof(pitchedFace);
    expect(layout).not.toBeNull();
    expect(layout!.tiltDeg).toBe(35);
    expect(layout!.tiltDeg).not.toBe(PV_FIXED_RACK_TILT_DEG);
  });

  it("more kWp yields at least as many panel instances, bounded by what the roof can hold", () => {
    const small = panelLayoutForRoof(flatFace, 2);
    const big = panelLayoutForRoof(flatFace, 40);
    expect(small).not.toBeNull();
    expect(big).not.toBeNull();
    expect(big!.instances.length).toBeGreaterThanOrEqual(small!.instances.length);
    expect(Math.round(2 / PV_PANEL_RATED_KWP)).toBe(small!.instances.length);
  });

  it("returns null when the roof is too small to place even one panel's worth of kWp", () => {
    expect(panelLayoutForRoof(flatFace, 0)).toBeNull();
  });

  it("every instance sits at the same height, at the analysed apex plus clearance", () => {
    const layout = panelLayoutForRoof(flatFace, 10)!;
    for (const inst of layout.instances) {
      expect(inst.y).toBeCloseTo(flatFace.apexY + 0.15, 5);
    }
  });
});

describe("equipmentLayerReach", () => {
  const services = [{ id: "hvac" }, { id: "electrical" }];

  it("is 'not-modeled' when the building carries no such discipline file", () => {
    expect(equipmentLayerReach(services, new Set(), "plumbing")).toBe("not-modeled");
  });

  it("is 'layer-off' when the file exists but the reader has not switched it on", () => {
    expect(equipmentLayerReach(services, new Set(), "hvac")).toBe("layer-off");
  });

  it("is 'tinted' when the file exists and is active", () => {
    expect(equipmentLayerReach(services, new Set(["hvac"]), "hvac")).toBe("tinted");
  });
});

describe("buildRetrofitLegendLines", () => {
  it("says the 3D preview is off when previewProposal is false, regardless of the selection", () => {
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: ["envelope-wall-insulation", "solar-pv-flat"],
      previewProposal: false,
      // The real chain would also hand this in as NO_RETROFIT_VISUALS
      // (deriveVisualState(proposalVisualIds(false, ids)) === all-false),
      // but the legend must not depend on that — it should say the same
      // thing even if a visual state leaked through some other way.
      visual: { ...NO_RETROFIT_VISUALS, wallsUpgraded: true, solarInstalled: true },
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: true,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].en).toMatch(/preview is off/i);
    expect(lines[0].en).not.toMatch(/wall|solar/i);
  });

  it("says no scenario has been evaluated when selectedMeasureIds is null", () => {
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: null,
      previewProposal: true,
      visual: NO_RETROFIT_VISUALS,
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: false,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].en).toMatch(/no green-remodelling scenario evaluated/i);
  });

  it("says nothing is selected when the array is empty", () => {
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: [],
      previewProposal: true,
      visual: NO_RETROFIT_VISUALS,
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: false,
    });
    expect(lines[0].en).toMatch(/no measures selected/i);
  });

  it("names exactly the envelope elements the visual state has on, and none it doesn't", () => {
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: ["envelope-wall-insulation", "envelope-window-replacement"],
      previewProposal: true,
      visual: { ...NO_RETROFIT_VISUALS, wallsUpgraded: true, windowsUpgraded: true },
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: false,
    });
    const envelopeLine = lines.find((l) => l.key === "envelope")!;
    expect(envelopeLine.en).toMatch(/wall finish/i);
    expect(envelopeLine.en).toMatch(/glazing/i);
    expect(envelopeLine.en).not.toMatch(/roof/i);
  });

  it("flags solar as visual-only when the engine cannot price it", () => {
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: ["solar-pv-flat"],
      previewProposal: true,
      visual: { ...NO_RETROFIT_VISUALS, solarInstalled: true },
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: true,
    });
    const solarLine = lines.find((l) => l.key === "solar")!;
    expect(solarLine.en).toMatch(/does not move the energy grade/i);
  });

  it("says panels cannot be placed when the building has no roof geometry", () => {
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: ["solar-pv-flat"],
      previewProposal: true,
      visual: { ...NO_RETROFIT_VISUALS, solarInstalled: true },
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: false,
    });
    const solarLine = lines.find((l) => l.key === "solar-no-roof")!;
    expect(solarLine.en).toMatch(/no roof geometry/i);
  });

  it("distinguishes 'layer is off' from 'model carries no such layer' for hvac/lighting", () => {
    const offLines = buildRetrofitLegendLines({
      selectedMeasureIds: ["hvac-heat-pump"],
      previewProposal: true,
      visual: { ...NO_RETROFIT_VISUALS, hvacUpgraded: true },
      hvacReach: "layer-off",
      lightingReach: "not-modeled",
      roofGeometryAvailable: false,
    });
    const hvacLine = offLines.find((l) => l.key.startsWith("equipment-HVAC"))!;
    expect(hvacLine.en).toMatch(/switched off/i);

    const notModeledLines = buildRetrofitLegendLines({
      selectedMeasureIds: ["hvac-heat-pump"],
      previewProposal: true,
      visual: { ...NO_RETROFIT_VISUALS, hvacUpgraded: true },
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: false,
    });
    const hvacLine2 = notModeledLines.find((l) => l.key.startsWith("equipment-HVAC"))!;
    expect(hvacLine2.en).toMatch(/no such discipline model/i);
  });

  it("falls back to 'no visible change' when a selection maps to no on-page visual", () => {
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: ["envelope-floor-insulation"],
      previewProposal: true,
      visual: NO_RETROFIT_VISUALS,
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: false,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].en).toMatch(/none map to a visible change/i);
  });

  it("says nothing about HVAC or lighting when neither measure is in the selection", () => {
    // Regression: an earlier draft named HVAC/lighting reach whenever ANY
    // visual was showing, not just when that discipline's own measure was
    // selected — caught live on Schependomlaan, where a solar-only selection
    // still claimed "this model carries no HVAC file".
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: ["solar-pv-flat"],
      previewProposal: true,
      visual: { ...NO_RETROFIT_VISUALS, solarInstalled: true },
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: true,
    });
    expect(lines.some((l) => l.key.startsWith("equipment-"))).toBe(false);
  });

  it("names the below-grade floor slab as having no visual here, rather than silently passing hasAnyVisual", () => {
    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: ["envelope-floor-insulation"],
      previewProposal: true,
      visual: { ...NO_RETROFIT_VISUALS, floorsUpgraded: true },
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: false,
    });
    const floorLine = lines.find((l) => l.key === "floor")!;
    expect(floorLine).toBeDefined();
    expect(floorLine.en).toMatch(/not visible from this camera/i);
  });
});

describe("end-to-end: the legend reproduces the state that produced it", () => {
  // Runs the REAL derivation chain (deriveVisualState + equipmentLayerReach)
  // instead of a hand-built `visual`/`reach`, then parses the legend text
  // back and checks it names exactly the measures/layers that chain
  // actually produced — the same failure shape AGENTS.md names for the
  // apartment's awaiting-measurement badge: a claim that was right when
  // written and silently stopped matching the state behind it.
  const services = [{ id: "hvac" }, { id: "electrical" }];

  it("a wall+window+hvac selection with HVAC's layer OFF and no electrical activity", () => {
    const selectedMeasureIds = [
      "envelope-wall-insulation",
      "envelope-window-replacement",
      "hvac-heat-pump",
    ];
    const visual = deriveVisualState(selectedMeasureIds);
    const active = new Set<string>(); // neither hvac nor electrical switched on
    const hvacReach = equipmentLayerReach(services, active, "hvac");
    const lightingReach = equipmentLayerReach(services, active, "electrical");

    const lines = buildRetrofitLegendLines({
      selectedMeasureIds,
      previewProposal: true,
      visual,
      hvacReach,
      lightingReach,
      roofGeometryAvailable: false,
    });
    const text = lines.map((l) => l.en).join(" | ");

    expect(text).toMatch(/3 measure\(s\)/i);
    expect(text).toMatch(/wall finish/i);
    expect(text).toMatch(/glazing/i);
    expect(text).not.toMatch(/roof finish/i); // roof was never selected
    expect(text).toMatch(/HVAC: its discipline layer is switched off/i);
    expect(text).not.toMatch(/Lighting/i); // lighting was never selected
  });

  it("the same selection with HVAC's layer switched ON reports 'tinted', not 'off'", () => {
    const selectedMeasureIds = ["hvac-boiler-upgrade"];
    const visual = deriveVisualState(selectedMeasureIds);
    const active = new Set(["hvac"]);
    const hvacReach = equipmentLayerReach(services, active, "hvac");
    const lightingReach = equipmentLayerReach(services, active, "electrical");

    const lines = buildRetrofitLegendLines({
      selectedMeasureIds,
      previewProposal: true,
      visual,
      hvacReach,
      lightingReach,
      roofGeometryAvailable: false,
    });
    const text = lines.map((l) => l.en).join(" | ");
    expect(text).toMatch(/HVAC: shown as renewed equipment/i);
  });

  it("a lighting-only selection on a building with no electrical file names the absence, not 'off'", () => {
    const selectedMeasureIds = ["lighting-led-smart"];
    const visual = deriveVisualState(selectedMeasureIds);
    const noServices: { id: string }[] = []; // e.g. Schependomlaan
    const active = new Set<string>();
    const hvacReach = equipmentLayerReach(noServices, active, "hvac");
    const lightingReach = equipmentLayerReach(noServices, active, "electrical");

    const lines = buildRetrofitLegendLines({
      selectedMeasureIds,
      previewProposal: true,
      visual,
      hvacReach,
      lightingReach,
      roofGeometryAvailable: false,
    });
    const text = lines.map((l) => l.en).join(" | ");
    expect(text).not.toMatch(/HVAC/i); // HVAC was never selected — must stay silent
    expect(text).toMatch(/Lighting.*this file carries no such discipline model/i);
  });

  it("header count matches the APPLIED set, not the recommendation, when the two disagree", () => {
    // Regression: reference-model-viewer.tsx once fed the raw knapsack
    // RECOMMENDATION (scenario-store.selectedMeasureIds) into the legend's
    // header count while the bullets were driven by useProposalVisualIds()
    // (which resolves the user's APPLIED set) — a real defect caught live on
    // /models/schependomlaan: recommendation = 2 (HRV + PV), user's chosen
    // set = 1 (PV only), header said "2개" over a single bullet. This
    // replicates the viewer's actual wiring — effectiveMeasureIds() then
    // proposalVisualIds() from the SAME resolved set — so the header and the
    // bullets can never again come from two different ids.
    const recommended = ["hvac-hrv", "solar-pv-flat"];
    const applied = ["solar-pv-flat"];
    const effective = effectiveMeasureIds(applied, recommended);
    expect(effective).toEqual(["solar-pv-flat"]); // applied wins outright, not a merge

    const isSeeded = applied !== null || recommended !== null;
    const headerMeasureIds = isSeeded ? effective : null;
    const visual = deriveVisualState(proposalVisualIds(true, effective));

    const lines = buildRetrofitLegendLines({
      selectedMeasureIds: headerMeasureIds,
      previewProposal: true,
      visual,
      hvacReach: "not-modeled",
      lightingReach: "not-modeled",
      roofGeometryAvailable: true,
    });
    const header = lines.find((l) => l.key === "header")!;
    expect(header.en).toMatch(/1 measure\(s\)/); // the applied count (1), never the recommendation's (2)
    expect(lines.some((l) => l.key === "solar")).toBe(true);
    expect(lines.some((l) => l.en.match(/HVAC/i))).toBe(false); // HRV was recommended, not applied — must not appear
  });
});
