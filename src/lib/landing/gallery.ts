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
  /**
   * The credit line, rendered verbatim — or `null` when the rights holder is
   * not established.
   *
   * Null is not "we did not get round to it". Schependomlaan's LICENSE.MD
   * grants CC BY 4.0 but names the holder only as "original owners", while the
   * IFC header names ROOT bv as author and a README in the same repository
   * says permission was given for scientific and academic purposes. CC BY
   * grants only what the licensor actually had authority to license, so a
   * credit naming the wrong holder would be worse than none — and under CC BY
   * the credit is a condition, not a courtesy. The card says the credit is
   * unresolved rather than inventing one.
   */
  attribution: string | null;
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
    'BSI (2020) "Medical-Dental Test Files", buildingSMART International — https://github.com/buildingsmart-community/Community-Sample-Test-Files',
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
      read: "IfcSpace − 6 ROOF − 3 OPEN TO BELOW − 1 MECH. YARD",
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

/**
 * Building #2 — Schependomlaan, ten apartments in Nijmegen.
 *
 * Every figure below was read from `IFC Schependomlaan.ifc` (49,286,967 bytes,
 * ArchiCAD IFC2X3) directly, and the per-storey rows reconcile to the totals
 * exactly: 19+20+29+32 = 100 rooms, 177.015+195.848+290.564+302.240 = 965.667 m².
 *
 * Two traps this building sets that the Clinic did not:
 *
 * 1. **The raw element counts are placeholders.** 259 `IfcWindow` and 205
 *    `IfcDoor` sound like the answer and are not: 182 of the windows and 65 of
 *    the doors are named `stelkozijn` — rough frames, not openings — and 36
 *    doors are `liftdeur`. The honest counts are 77 and 20, and the `read`
 *    strings say how. The doors also need `IsExternal`, not a subtraction: the
 *    lift doors fall out because they are internal, so "205 − 65 − 36" would
 *    be 104 and wrong.
 *
 * 2. **The file states millimetres.** `LENGTHUNIT` is `.MILLI.`, so a storey
 *    elevation reads 12000, not 12. The values here are metres.
 *
 * `excludedSpaces` is 0 on every storey, and that is a finding rather than a
 * gap: unlike the Clinic there are no ROOF or void spaces to drop.
 *
 * What this building was CHOSEN for did not survive verification. The
 * selection note recorded 97 `IfcThermalTransmittanceMeasure` occurrences
 * against the Clinic's zero and concluded U-values could be read as stated.
 * All 97 carry the value `0.` and sit only on 67 windows and 30 doors — no
 * wall, slab or roof has one. Under this repo's documented-zero rule a
 * recorded zero means unavailable, so this model states no U-value either. It
 * is kept for the thing that did survive: it states its town.
 */
const SCHEPENDOMLAAN: GalleryItem = {
  id: "schependomlaan",
  koTitle: "스헤펜돔라안 아파트",
  enTitle: "Schependomlaan Apartments",
  koUse: "공동주택 · 지상 4층 · 10세대 · 네덜란드 네이메헌",
  enUse: "Residential · four floors · ten dwellings · Nijmegen, NL",
  status: "modelling",
  modelFile: "IFC Schependomlaan.ifc",
  ifcSchema: "IFC2X3",
  viewDefinition: "CoordinationView_V2.0 + QuantityTakeOff + SpaceBoundary2ndLevel",
  authoringTool: "Graphisoft ArchiCAD-64 18.0.0 NED FULL",
  modelDate: "2015-08-27",
  licence: "CC BY 4.0",
  // Unresolved on purpose — see the field's own note. LICENSE.MD grants CC BY
  // 4.0 but names no holder; the IFC header names ROOT bv as author.
  attribution: null,
  datums: [
    { name: "04 dak", elevationM: 12, rooms: 0, roomAreaSqm: 0, excludedSpaces: 0 },
    { name: "03 derde verdieping", elevationM: 9, rooms: 19, roomAreaSqm: 177.015, excludedSpaces: 0 },
    { name: "02 tweede verdieping", elevationM: 6, rooms: 20, roomAreaSqm: 195.848, excludedSpaces: 0 },
    { name: "01 eerste verdieping", elevationM: 3, rooms: 29, roomAreaSqm: 290.564, excludedSpaces: 0 },
    { name: "00 begane grond", elevationM: 0, rooms: 32, roomAreaSqm: 302.24, excludedSpaces: 0 },
    { name: "-1 fundering", elevationM: -1, rooms: 0, roomAreaSqm: 0, excludedSpaces: 0 },
  ],
  figures: [
    {
      id: "floor-area",
      ko: "실 면적 합계",
      en: "Room floor area",
      value: "965.7 m²",
      read: "100 × IfcSpace NetFloorArea, 제외 없음",
    },
    {
      id: "rooms",
      ko: "실",
      en: "Rooms",
      value: "100",
      read: "IfcSpace, 비바닥 공간 0",
    },
    {
      id: "walls",
      ko: "벽",
      en: "Walls",
      value: "934",
      read: "IfcWallStandardCase 282 + IfcWall 652",
    },
    {
      id: "windows",
      ko: "창",
      en: "Windows",
      value: "77",
      read: "IfcWindow 259 − 182 stelkozijn(임시 틀)",
    },
    {
      id: "doors",
      ko: "문",
      en: "Doors",
      value: "20",
      read: "IfcDoor 외부 85 − 65 stelkozijn(임시 틀)",
    },
    {
      id: "boundaries",
      ko: "공간 경계",
      en: "Space boundaries",
      value: "1,675",
      read: "IfcRelSpaceBoundary",
    },
  ],
  href: "/models/schependomlaan",
} as const;

/**
 * Building #3 — the Duplex Apartment, two dwellings under one roof.
 *
 * Chosen for what it states that the other two do not: its MECHANICAL,
 * ELECTRICAL and PLUMBING models, 1,522 elements across three files. The
 * Clinic and Schependomlaan are envelope buildings; this is the first one
 * here whose services can be seen.
 *
 * ── The trap, and it is the worst one any of these three has set ──────────
 * `Duplex_M_20111024_ROOMS_AND_SPACES.ifc` states EVERY ROOM TWICE. Revit
 * models an architectural Room and an analytical Space as two objects in the
 * same place, and this export carries both: 37 IfcSpace for 19 distinct
 * rooms, same Name, same LongName, same plan position, two GlobalIds and two
 * slightly different areas. Nothing in the file calls either a duplicate.
 *
 * Summed as they come, the rows give 799.76 m²; with the existing ROOF rule
 * removing the two 135.15 m² roof planes, 529.46 m². The building's floor is
 * 284.98 m². Floor area is the denominator of every intensity, so the 529.46
 * this project was about to publish would have shown the building reading
 * 46 % better than it is — and it would have looked like a measurement,
 * because both copies are real entities carrying real quantities.
 *
 * They are separated by property set, not by name: 18 rows carry all four
 * Revit analysis sets (Energy Analysis, Mechanical - Airflow, Electrical -
 * Loads, Electrical - Lighting) and 19 carry none, with nothing in between.
 * The architectural half is kept, because its areas reproduce
 * `Duplex_A_20110907.ifc`'s own `GSA BIM Area` exactly and because one room —
 * A104 Bathroom 1 — has no analytical twin and would otherwise be lost.
 *
 * A second thing this building corrects: an earlier note in the build script
 * explained the two files' disagreement by saying the architectural model
 * held "one dwelling's rooms". It holds both — A101-A105 and B101-B105 are
 * on Level 1 together — and the direction was inverted too, since a larger
 * floor area makes a building read better, not worse.
 *
 * `excludedSpaces` on the datums below is therefore the analytical duplicates
 * plus the roof planes: 7 + 10 + 2 = 19, against 18 rooms, for the 37 rows
 * the file holds.
 */
const DUPLEX: GalleryItem = {
  id: "duplex-apartment",
  koTitle: "듀플렉스 아파트",
  enTitle: "Duplex Apartment",
  koUse: "공동주택 · 지상 2층 · 2세대",
  enUse: "Residential · two floors · two dwellings",
  status: "modelling",
  modelFile: "Duplex_A_20110907.ifc",
  ifcSchema: "IFC2X3",
  viewDefinition: "CoordinationView",
  authoringTool: "Autodesk Revit Architecture 2011",
  modelDate: "2011-09-07",
  licence: "CC BY 4.0",
  // Same repository, same grant and the same named rights holder as the
  // Clinic, which is why this building was taken before richer models with
  // no licence behind them.
  attribution:
    'BSI (2020) "Duplex Apartment Test Files", buildingSMART International — https://github.com/buildingsmart-community/Community-Sample-Test-Files',
  datums: [
    // The roof datum carries two ROOF spaces — one architectural, one
    // analytical — and no floor.
    { name: "Roof", elevationM: 6, rooms: 0, roomAreaSqm: 0, excludedSpaces: 2 },
    { name: "Level 2", elevationM: 3.1, rooms: 10, roomAreaSqm: 143.183, excludedSpaces: 10 },
    { name: "Level 1", elevationM: 0, rooms: 8, roomAreaSqm: 141.792, excludedSpaces: 7 },
  ],
  figures: [
    {
      id: "floor-area",
      ko: "실 면적 합계",
      en: "Room floor area",
      // 141.792 + 143.183 = 284.975. The manifest rounds it to 284.98; the
      // storeys' own 2-dp rows would give 284.97, so this card carries the
      // 3-dp datums and the test sums those.
      value: "285.0 m²",
      read: "18 × GSA BIM Area, 해석용 중복 18실·ROOF 1실 제외",
    },
    {
      id: "rooms",
      ko: "실",
      en: "Rooms",
      value: "18",
      // 37 − 18 − 1 = 18. One of the two ROOF spaces is itself one of the 18
      // analytical rows, so it is subtracted once, not twice.
      read: "IfcSpace 37 − 18 해석용 중복 − 1 ROOF",
    },
    {
      id: "walls",
      ko: "벽",
      en: "Walls",
      value: "57",
      read: "IfcWallStandardCase 56 + IfcWall 1",
    },
    {
      id: "windows",
      ko: "창",
      en: "Windows",
      value: "22",
      // The two dropped are M_Skylight, hosted in the IfcRoof rather than in
      // a wall. They are real glazing (1.49 m²) and the aperture omits them.
      read: "IfcWindow 24 − 2 천창(지붕에 설치)",
    },
    {
      id: "doors",
      ko: "문",
      en: "Doors",
      value: "4",
      read: "IfcDoor 14 − 10 내부 칸막이벽",
    },
    {
      id: "services",
      ko: "기계·전기·배관 요소",
      en: "Mechanical, electrical & plumbing elements",
      value: "1,522",
      read: "Duplex_MEP 924 + Duplex_Electrical 100 + Duplex_Plumbing 498",
    },
    {
      id: "boundaries",
      ko: "공간 경계",
      en: "Space boundaries",
      value: "265",
      read: "IfcRelSpaceBoundary",
    },
  ],
  href: "/models/duplex-apartment",
} as const;

/**
 * All three buildings render.
 *
 * Schependomlaan was briefly pulled out of this array on a relayed instruction
 * — "build now, publish later". That was an over-reading of it: taking the
 * card off the user's own screen is not what publishing means. Publishing is
 * the deploy, and the deploy is a separate, deliberate act that nothing here
 * performs.
 *
 * The licence question behind that instruction is still open and still real,
 * and it is carried where it belongs: `SCHEPENDOMLAAN.attribution` stays null
 * and renders as a statement rather than a blank. It gates shipping this
 * building to production, not seeing it here.
 *
 * The Duplex has no such question: same repository, same CC BY 4.0 grant and
 * the same named rights holder as the Clinic.
 */
/**
 * KIT/IAI's "Simple Phantasy Building" — a validation test house, not a
 * dated real project. Every wall, window, door and slab states a real,
 * non-zero `ThermalTransmittance` (33 occurrences), the first building here
 * where that is true; the Clinic states none and Schependomlaan's 97 are all
 * a documented zero. Licence: `Template:Example-Source`, transcluded onto
 * ifcwiki.org's KIT_IFC_Examples page — "unrestricted use", KIT/IAI
 * attribution required, read from the source's raw wikitext.
 */
const FZK_HAUS: GalleryItem = {
  id: "fzk-haus",
  koTitle: "FZK 하우스",
  enTitle: "FZK House",
  koUse: "단독주택 · 지상 2층",
  enUse: "Single-family house · two floors",
  status: "modelling",
  modelFile: "AC20-FZK-Haus.ifc",
  ifcSchema: "IFC4",
  viewDefinition: "QuantityTakeOffAddOnView, SpaceBoundary2ndLevelAddOnView",
  authoringTool: "Graphisoft ArchiCAD 20",
  modelDate: "n/a — a validation test house, no project date stated",
  licence: "KIT/IAI unrestricted use (attribution required)",
  attribution:
    "Institute for Automation and Applied Informatics (IAI), Karlsruhe " +
    'Institute of Technology (KIT), "AC20-FZK-Haus" — ' +
    "https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples",
  datums: [
    { name: "Dachgeschoss (Galerie)", elevationM: 2.7, rooms: 1, roomAreaSqm: 107.16, excludedSpaces: 0 },
    { name: "Erdgeschoss", elevationM: 0, rooms: 6, roomAreaSqm: 101.39, excludedSpaces: 0 },
  ],
  figures: [
    {
      id: "floor-area",
      ko: "실 면적 합계",
      en: "Room floor area",
      value: "208.6 m²",
      read: "IfcSpace 7 × GrossFloorArea, 제외 없음",
    },
    {
      id: "rooms",
      ko: "실",
      en: "Rooms",
      value: "7",
      read: "IfcSpace 7",
    },
    {
      id: "walls",
      ko: "벽",
      en: "Walls",
      value: "13",
      read: "IfcWallStandardCase 13 (외벽 8·내벽 5)",
    },
    {
      id: "windows",
      ko: "창",
      en: "Windows",
      value: "11",
      read: "IfcWindow 11",
    },
    {
      id: "doors",
      ko: "문",
      en: "Doors",
      value: "2",
      read: "IfcDoor 5 − 3 내부 칸막이벽",
    },
    {
      id: "u-values",
      ko: "실측 열관류율",
      en: "Stated U-values",
      value: "33",
      read: "IfcPropertySingleValue 'ThermalTransmittance', 요소당 1개",
    },
    {
      id: "boundaries",
      ko: "공간 경계",
      en: "Space boundaries",
      value: "36",
      // classifyExternalElements resolves 0 of these — swept-curve boundary
      // geometry, not IfcSurfaceOfLinearExtrusion — so envelope areas here
      // come from the wall walk, never from this count.
      read: "IfcRelSpaceBoundary 36 (분류 미해결, 벽체 산출과 무관)",
    },
  ],
  href: "/models/fzk-haus",
} as const;

export const GALLERY_ITEMS: readonly GalleryItem[] = [CLINIC, SCHEPENDOMLAAN, DUPLEX, FZK_HAUS];

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
