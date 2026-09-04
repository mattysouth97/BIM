/**
 * The gallery index — the models this project has actually taken in.
 *
 * The landing page is a gallery, so its one job is to show a building
 * truthfully before anyone opens it. That makes the same stated-versus-assumed
 * rule the rest of the app lives under apply here too, and for the same
 * reason: a figure on a card is read as a fact about the building.
 *
 * So every figure carries `read` — the IFC entity class or quantity set the
 * value was counted or summed from, INCLUDING what was excluded from it.
 * Nothing on a card is inferred, rounded up, or borrowed from a sibling model,
 * and there is no U-value, airtightness, HVAC or climate figure here at all: a
 * coordination model states none of them, and a gallery card is exactly the
 * wrong place to start pretending otherwise.
 *
 * ── The trap this file already fell into once ───────────────────────────────
 * Summing all 269 `GSA BIM Area` quantities gives 6,935.8 m², and that number
 * is wrong by 58% as a floor area. Nine of those spaces are not floor: six are
 * named ROOF (2,299.2 m² — the roof plane, sliced into pieces) and three are
 * OPEN TO BELOW (242.4 m² — the void over a double-height room, counted again
 * on the storey above), and one is MECH. YARD — an outdoor equipment yard with
 * outdoor air above it, which an area plan counts and a floor schedule does
 * not. Excluding those ten gives 4,314.2 m² across 259 rooms, which is what
 * the card shows and what
 * public/reference-buildings/bs-medical-dental-clinic/manifest.json emits.
 * An area-plan total is not a floor area, and nothing in the file says so —
 * the space names are the only signal.
 *
 * Everything below was read from `Clinic_Architectural.ifc`: counts by entity
 * class, areas by summing `GSA BIM Area` per space and grouping by the
 * storey's `IfcRelAggregates` set, storey datums from
 * `IfcBuildingStorey.Elevation`.
 *
 * These figures are still literals, and that is now a known debt rather than a
 * waiting game: `public/reference-buildings/bs-medical-dental-clinic/manifest.json`
 * exists and carries the same numbers, generated. A literal cannot notice that
 * the extraction moved under it — this file said 4,394.3 m² for an hour after
 * the extraction said 4,314.2, on two pages of the same app. Every numeric
 * field here should be read from the manifest, keeping only the editorial ones
 * by hand.
 * `landing-gallery.test.tsx` pins the arithmetic that ties the numbers to each
 * other, so a drift in one of them fails a test rather than passing quietly.
 */

export type GalleryItemStatus = "modelling" | "published";

/** One storey datum, drawn as a line and a bar in the card's section diagram. */
export type GalleryDatum = Readonly<{
  /** The storey's own name in the model — never a translated invention. */
  name: string;
  elevationM: number;
  /** Spaces on this storey that are rooms. 0 means a datum, not a floor. */
  rooms: number;
  /** Floor area of those rooms. Drives the bar length. */
  roomAreaSqm: number;
  /** ROOF and OPEN TO BELOW spaces dropped from the two figures above. */
  excludedSpaces: number;
}>;

/** A stated figure and the thing in the model that states it. */
export type GalleryFigure = Readonly<{
  id: string;
  ko: string;
  en: string;
  value: string;
  /** e.g. "IfcWindow" — what was counted, and what was left out. */
  read: string;
}>;

export type GalleryItem = Readonly<{
  id: string;
  koTitle: string;
  enTitle: string;
  koUse: string;
  enUse: string;
  status: GalleryItemStatus;
  /** The source file, named as the model names itself. */
  modelFile: string;
  ifcSchema: string;
  viewDefinition: string;
  authoringTool: string;
  /** ISO-8601 date carried in the IFC header, not a clock reading. */
  modelDate: string;
  /** e.g. "CC BY 4.0". Rendered on the card because the licence requires it. */
  licence: string;
  /** The credit line, rendered verbatim and never abbreviated to fit. */
  attribution: string;
  datums: readonly GalleryDatum[];
  figures: readonly GalleryFigure[];
  /**
   * Where the card opens, or null while there is nothing to open. A gallery
   * card that navigates to a *different* building would be the same lie as a
   * card illustrated with a different building's render.
   */
  href: string | null;
}>;

const CLINIC: GalleryItem = {
  id: "clinic",
  koTitle: "치과 병원",
  enTitle: "Dental Clinic",
  koUse: "의료시설 · 지상 2층 + 옥탑",
  enUse: "Healthcare · two floors and a roof level",
  status: "modelling",
  modelFile: "Clinic_Architectural.ifc",
  ifcSchema: "IFC2X3",
  viewDefinition: "CoordinationView",
  authoringTool: "Autodesk Revit Architecture 2011",
  modelDate: "2011-09-06",
  // Licence and credit come from the reference-building ingestion work, not
  // from the IFC header — an IFC states neither. They are rendered because
  // CC BY requires the credit to travel with the work; a gallery that shows
  // the building without it is in breach, not merely untidy.
  licence: "CC BY 4.0",
  attribution:
    "BSI (2020) 'Medical-Dental Test Files', buildingSMART International",
  datums: [
    // The roof datum carries one real room (a 64.8 m² penthouse) and five
    // ROOF/void spaces. Drawing it as an occupied storey would put a floor
    // where the model has a roof.
    { name: "Roof - Main", elevationM: 9.25, rooms: 1, roomAreaSqm: 64.8, excludedSpaces: 5 },
    { name: "Second Floor", elevationM: 4.57, rooms: 105, roomAreaSqm: 1723.7, excludedSpaces: 4 },
    { name: "First Floor", elevationM: 0, rooms: 153, roomAreaSqm: 2525.7, excludedSpaces: 1 },
    { name: "TOF Footing", elevationM: -1, rooms: 0, roomAreaSqm: 0, excludedSpaces: 0 },
  ],
  figures: [
    {
      id: "floor-area",
      ko: "실 면적 합계",
      en: "Room floor area",
      value: "4,314.2 m²",
      read: "259 × GSA BIM Area, ROOF·OPEN TO BELOW·MECH. YARD 제외",
    },
    {
      id: "rooms",
      ko: "실",
      en: "Rooms",
      value: "259",
      read: "IfcSpace − 6 ROOF − 3 OPEN TO BELOW",
    },
    {
      id: "walls",
      ko: "벽",
      en: "Walls",
      value: "1,080",
      read: "IfcWallStandardCase + IfcWall",
    },
    { id: "windows", ko: "창", en: "Windows", value: "58", read: "IfcWindow" },
    {
      id: "curtain-walls",
      ko: "커튼월",
      en: "Curtain walls",
      value: "31",
      read: "IfcCurtainWall",
    },
    { id: "doors", ko: "문", en: "Doors", value: "254", read: "IfcDoor" },
    {
      id: "boundaries",
      ko: "공간 경계",
      en: "Space boundaries",
      value: "3,124",
      read: "IfcRelSpaceBoundary",
    },
  ],
  // The model now exists: tessellated from the two IFCs at build time into
  // public/reference-buildings/bs-medical-dental-clinic/, fabric only.
  href: "/models/bs-medical-dental-clinic",
} as const;

export const GALLERY_ITEMS: readonly GalleryItem[] = [CLINIC];

/** Lowest and highest datum, for the section diagram's vertical range. */
export function datumRange(datums: readonly GalleryDatum[]) {
  const elevations = datums.map((d) => d.elevationM);
  return { minM: Math.min(...elevations), maxM: Math.max(...elevations) };
}

/** Storeys that hold rooms — the ones drawn as bars. */
export function occupiedDatums(datums: readonly GalleryDatum[]) {
  return datums.filter((d) => d.rooms > 0);
}

/** The largest storey floor area, which the diagram scales its bars against. */
export function widestStoreyAreaSqm(datums: readonly GalleryDatum[]) {
  return Math.max(0, ...datums.map((d) => d.roomAreaSqm));
}
