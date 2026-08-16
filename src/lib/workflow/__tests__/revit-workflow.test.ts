import { describe, it, expect } from "vitest";
import {
  REVIT_WORK_MODES,
  REVIT_FEATURE_MAP,
  getWorkMode,
  featuresForMode,
  defaultLeftDockTab,
} from "../revit-workflow";

describe("REVIT_WORK_MODES", () => {
  it("covers the six Revit-aligned authoring modes", () => {
    expect(REVIT_WORK_MODES.map((m) => m.id)).toEqual([
      "authoring",
      "views",
      "annotate",
      "schedules",
      "sheets",
      "energy",
    ]);
  });

  it("every mode has bilingual labels and course chapters", () => {
    for (const mode of REVIT_WORK_MODES) {
      expect(mode.labelKo.length).toBeGreaterThan(0);
      expect(mode.labelEn.length).toBeGreaterThan(0);
      expect(mode.courseChapters.length).toBeGreaterThan(0);
    }
  });
});

describe("REVIT_FEATURE_MAP", () => {
  it("maps core course topics", () => {
    const topics = REVIT_FEATURE_MAP.map((f) => f.courseTopic);
    expect(topics).toEqual(
      expect.arrayContaining([
        "Architecture tab / building authoring",
        "BIM vs CAD",
        "Level of Development",
        "Category / Family / Type",
        "Project Browser",
        "Schedules",
        "Sheets + title blocks",
      ])
    );
  });

  it("wires the single-model and live-views features", () => {
    expect(REVIT_FEATURE_MAP.find((f) => f.id === "single-model")?.status).toBe("wired");
    expect(REVIT_FEATURE_MAP.find((f) => f.id === "live-views")?.status).toBe("wired");
    expect(REVIT_FEATURE_MAP.find((f) => f.id === "schedules")?.status).toBe("wired");
    expect(REVIT_FEATURE_MAP.find((f) => f.id === "sheets")?.status).toBe("wired");
  });

  it("defers family editor and 4D/5D", () => {
    expect(REVIT_FEATURE_MAP.find((f) => f.id === "family-editor")?.status).toBe("deferred");
    expect(REVIT_FEATURE_MAP.find((f) => f.id === "phasing-5d")?.status).toBe("deferred");
  });
});

describe("helpers", () => {
  it("getWorkMode returns the views definition", () => {
    expect(getWorkMode("views").labelEn).toBe("Views");
  });

  it("featuresForMode filters by work mode", () => {
    expect(featuresForMode("schedules").every((f) => f.workMode === "schedules")).toBe(true);
  });

  it("energy mode opens insights; other modes open the browser", () => {
    expect(defaultLeftDockTab("energy")).toBe("insights");
    expect(defaultLeftDockTab("views")).toBe("browser");
    expect(defaultLeftDockTab("authoring")).toBe("browser");
  });
});
