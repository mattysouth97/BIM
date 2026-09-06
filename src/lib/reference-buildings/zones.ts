// src/lib/reference-buildings/zones.ts
//
// The 에너지 존 legend for a reference building, from its `spaces.json`.
//
// The twin builds zones from a BIM snapshot's Room elements grouped by
// (level × program). A reference building has no snapshot; it has the IFC's
// own IfcSpace rows, each with a name, a storey and a stated area. This maps
// those rows onto the same `EnergyZone` shape so the legend, the colour ramp
// and the apportionment rule are shared and cannot drift.
//
// The program of a room is read from its NAME by a keyword table. That is a
// classification, not a fact the file states, and it is kept visible: every
// program label is the table's, an unmatched name lands in "기타" rather than
// being guessed, and a test pins the table against the Clinic's 158 distinct
// names so a new name cannot silently join the wrong row.

import {
  analysisBandColor,
  analysisBandIndex,
} from "@/lib/layers/analysis/overlay-types";
import {
  ZONE_RESULT_SEMANTICS,
  type EnergyZone,
} from "@/lib/layers/analysis/zone-overlay";
import type {
  ReferenceBuildingManifest,
  ReferenceBuildingSpace,
} from "./manifest";

export type SpaceProgram = Readonly<{
  key: string;
  labelKo: string;
  labelEn: string;
  /** Tested against the upper-cased LongName (or Name). First match wins, in order. */
  patterns: readonly RegExp[];
}>;

/**
 * Order matters: a "TECH. WORK ROOM" is office before it is anything else,
 * and "STAFF TOILET" is a toilet before it is staff. The list runs from the
 * most specific word to the most generic.
 *
 * Two languages share this table, which is a choice worth stating. Dutch
 * keywords join the EXISTING rows wherever the program is the same thing in
 * both buildings — a BADKAMER and a STAFF TOILET are both 위생, and giving
 * them separate rows would put two sanitary bands on one legend. Only the
 * genuinely residential programs (거실·침실, 주방) get rows of their own, and
 * those are appended LAST so that no reordering can move a Clinic room: the
 * first match wins, and every English row is still tried first.
 */
export const SPACE_PROGRAMS: readonly SpaceProgram[] = Object.freeze([
  {
    key: "circulation",
    labelKo: "동선 (복도·계단·승강기)",
    labelEn: "Circulation (corridor, stair, lift)",
    // ENTREE (entrance hall), GANG (hall), OVERLOOP (landing) — Schependomlaan.
    // FOYER, HALLWAY and the model's own misspelling HALLYWAY — the Duplex.
    // FLUR (hallway) — FZK Haus.
    patterns: [/\bSTAIRWELL\b/, /\bCORRIDOR\b/, /\bSTAIR\b/, /\bELEVATOR\b/, /\bELEV\.?\b/, /\bVEST\.?\b/, /\bENTREE\b/, /\bGANG\b/, /\bOVERLOOP\b/, /\bFOYER\b/, /\bHALLWAY\b/, /\bHALLYWAY\b/, /\bFLUR\b/],
  },
  {
    key: "sanitary",
    labelKo: "위생·청소 (화장실·잡용실)",
    labelEn: "Sanitary & housekeeping",
    // BADKAMER (bathroom) — Schependomlaan. TOILET is already Dutch as it stands.
    // BATHROOM (1 and 2) — the Duplex. BAD (bathroom) — FZK Haus; \b keeps it
    // from ever matching inside BADKAMER (no boundary between D and K).
    patterns: [/\bTOILET\b/, /\bJAN\.?\b/, /\bHK\b/, /\bSOIL\.?/, /\bTRASH\b/, /\bCLEAN U\.?/, /\bDIPC\b/, /\bSCOPE WASH\b/, /\bDECON/, /\bBADKAMER\b/, /\bBATHROOM\b/, /\bBAD\b/, /\bWC\b/],
  },
  {
    key: "plant",
    labelKo: "기계·전기·통신실",
    labelEn: "Mechanical, electrical & comms",
    // MK is the meterkast, the dwelling's utility-meter cupboard; INSTAL.
    // RUIMTE is the plant room. Both Schependomlaan, both services.
    // UTILITY is the Duplex's equivalent: a 1.4-1.8 m² closet off each
    // dwelling's hallway, which is a services cupboard and not a room.
    patterns: [/\bTECHNICALROOM\b/, /\bMECH/, /\bELEC/, /\bCOMM\. ROOM\b/, /\bCOMPUTER ROOM\b/, /\bADP EQUIP/, /\bDATA \//, /\bMK\b/, /\bINSTAL\.?/, /\bUTILITY\b/, /\bTECHNIKRAUM\b/],
  },
  {
    key: "dental",
    labelKo: "치과 진료",
    labelEn: "Dental treatment",
    patterns: [/\bDTR\b/, /\bDENTAL\b/, /\bPROSTH\.?/, /\bCERAMIC LAB\b/],
  },
  {
    key: "lab",
    labelKo: "검사실·약국·영상",
    labelEn: "Laboratory, pharmacy & imaging",
    patterns: [/\bLAB\b/, /\bLABOR\b/, /\bSPECIMEN\b/, /\bPHARM\.?/, /\bX-RAY\b/, /\bRADIOGRAPHIC\b/, /\bFILM VIEW\b/, /\bDEVELOPING\b/, /\bMDIS VIEW\b/, /\bFUNDUS\b/],
  },
  {
    key: "clinical",
    labelKo: "진료·검사·상담",
    labelEn: "Examination, treatment & counselling",
    patterns: [/\bEXAM\b/, /\bTRMT\b/, /\bINTERACTION STATION\b/, /\bPROVIDER\b/, /\bCONSULT\.?/, /\bBLOOD DRAW\b/, /\bIMMUNIZ/, /\bECG\b/, /\bAUDIO\b/, /\bVISUAL FIELD\b/, /\bSCREEN EYE\b/, /\bHIST\.?/, /\bPSYCH\b/, /\bCOUNSELING\b/, /\bGROUP THERAPY\b/, /\bWTS\b/, /\bISOLATION\b/, /\bPH TECH\b/, /\bBEE TECH\b/, /\bPH SUPER\b/],
  },
  {
    key: "waiting",
    labelKo: "대기·접수",
    labelEn: "Waiting & reception",
    patterns: [/\bWAIT/, /\bRECEPT/, /\bAPPMTS\b/, /\bCENTRAL ISSUE\b/, /\bLOBBY\b/, /\bERGOM\b/],
  },
  {
    key: "storage",
    labelKo: "창고·수납",
    labelEn: "Storage",
    // BERGING (store), KAST (cupboard) — Schependomlaan.
    patterns: [/\bSTOR/, /\bSTO\.?\b/, /\bRECEIVING\b/, /\bBENCHSTOCK\b/, /\bPARTS\b/, /\bRECORDS\b/, /\bRECS\b/, /\bFILE\b/, /\bSUPPLY\b/, /\bSUP\.? &/, /\bBERGING\b/, /\bKAST\b/],
  },
  {
    key: "office",
    labelKo: "사무·회의·휴게",
    labelEn: "Office, meeting & staff",
    // BUERO (office) — FZK Haus, the model's own ASCII transliteration of
    // Büro; appended to the existing row rather than given its own, checked
    // against all three prior buildings' space names for a collision (none).
    patterns: [/\bOPENPLANOFFICE\b/, /\bMEETINGSPACE\b/, /\bOFFICE\b/, /\bOFF\.?\b/, /\bADMIN/, /\bANALYST\b/, /\bDIR\.?\b/, /\bDIRECTOR\b/, /\bCHIEF\b/, /\bMGR\b/, /\bSUPER\b/, /\bNCOIC\b/, /\bCMDR\b/, /\bSGT\b/, /\bTECH\.?\b/, /\bWORK STAT/, /\bWORK ROOM\b/, /\bCOPY\b/, /\bCREDENTIALS\b/, /\bCONF\.?/, /\bLIBRARY\b/, /\bCLASSROOM\b/, /\bTEAM\b/, /\bLOUNGE\b/, /\bBREAK ROOM\b/, /\bDRESS\b/, /\bFITTING\b/, /\bGROUP IS\b/, /\bBMET\b/, /\bDISP\.?\b/, /\bKITCHENET/, /\bCL\. UTL/, /\bBUERO\b/, /\bBESPRECHUNGSRAUM\b/, /\bSEMINARRAUM\b/],
  },
  // ── Residential programs. Appended last on purpose: every row above is
  // tried first, so adding these cannot move a room in a building that has
  // none of these names.
  {
    key: "dwelling",
    labelKo: "거실·침실",
    labelEn: "Living & sleeping",
    // WOONKAMER (living room), SLAAPKAMER (bedroom, numbered or bare).
    // One program, not two, because the parity brief groups them and because
    // a dwelling heats and occupies both on the same schedule.
    // LIVING ROOM, BEDROOM 1 and BEDROOM 2 — the Duplex's English for the
    // same two programs, joining the same row for the same reason.
    // WOHNEN (living), SCHLAFZIMMER (bedroom) — FZK Haus's German. GALERIE
    // (the Dachgeschoss mezzanine) joins here too: it is an open gallery
    // over the living room below, not a distinct program of its own — see
    // the FZK_HAUS config comment (build-reference-building.mjs) for the
    // area/volume caveats on that one space.
    patterns: [/\bWOONKAMER\b/, /\bSLAAPKAMER\b/, /\bLIVING ROOM\b/, /\bBEDROOM\b/, /\bWOHNEN\b/, /\bSCHLAFZIMMER\b/, /\bGALERIE\b/],
  },
  {
    key: "kitchen",
    labelKo: "주방",
    labelEn: "Kitchen",
    // KEUKEN. Its own row rather than folded into 거실·침실: a kitchen's
    // internal gains and hot-water draw are the part of a dwelling that is
    // least like the rest of it.
    //
    // KITCHEN is the Duplex's English name for the same program. Note the
    // office row above already carries /\bKITCHENET/ for the Clinic's
    // kitchenettes, and it does NOT match "KITCHEN" — the pattern needs the
    // letters "KITCHENET", which a bare KITCHEN does not have — so a
    // dwelling kitchen cannot be swallowed by the staff-room row.
    //
    // KÜCHE — FZK Haus's German. The umlaut survives classifySpaceProgram's
    // toUpperCase() (Unicode-aware in JS), and \b only anchors the pattern's
    // own start/end, so it does not care that Ü sits outside \w internally.
    patterns: [/\bKEUKEN\b/, /\bKITCHEN\b/, /\bKÜCHE\b/],
  },
]);

/**
 * The Duplex Apartment's English room names, appended to the rows above
 * rather than given rows of their own.
 *
 * Measured before adding them: none of BATHROOM, BEDROOM, FOYER, HALLWAY,
 * HALLYWAY, KITCHEN, LIVING or UTILITY appears in any of the Clinic's 269 or
 * Schependomlaan's 100 space names, so every pattern below is inert on both
 * existing buildings and no room in either can move. That check is what makes
 * it safe to put UTILITY on the `plant` row, which is EARLY in the table —
 * the residential rows are appended last precisely because appending cannot
 * reorder, but `plant` is not appended and needed the collision check.
 *
 * The rows these join:
 *   BATHROOM 1 / 2   → sanitary
 *   BEDROOM 1 / 2, LIVING ROOM → dwelling
 *   FOYER, HALLWAY, HALLYWAY → circulation
 *   KITCHEN          → kitchen
 *   UTILITY          → plant
 *
 * `HALLYWAY` is not a typo in this comment. The model spells it that way, on
 * exactly one of its 37 rows (B201's Room; the analytical Space over the same
 * room spells it HALLWAY). The pattern matches the misspelling because the
 * table's job is to classify the name the file states, not the name it meant
 * — and the alternative is one hallway landing in 기타 beside its own twin.
 */


/**
 * Schependomlaan's ONBEN. RUIMTE — "onbenoemde ruimte", an unallocated space
 * — deliberately has no row. The model declines to say what it is for, so the
 * table declines to guess, and its one instance lands in 기타 where the
 * legend prints it as a name the table does not cover.
 */

export const OTHER_PROGRAM: SpaceProgram = Object.freeze({
  key: "other",
  labelKo: "기타 (표에 없는 실명)",
  labelEn: "Other (name not in the table)",
  patterns: [],
});

export function classifySpaceProgram(space: Pick<ReferenceBuildingSpace, "name" | "longName">): SpaceProgram {
  // Klassiqua prefixes its eight explicit room programs with storey 00–03.
  // Strip only that verified vocabulary; an unfamiliar underscore name remains unmatched.
  const label = (space.longName ?? space.name ?? "").toUpperCase().trim()
    .replace(/^0[0-3]_(?=(?:OPENPLANOFFICE|BATHROOM|TECHNICALROOM|OFFICE|MEETINGSPACE|KITCHEN|STAIRWELL|CORRIDOR)(?:\.|$))/, "");
  for (const program of SPACE_PROGRAMS) {
    if (program.patterns.some((p) => p.test(label))) return program;
  }
  return OTHER_PROGRAM;
}

/**
 * Zones = (storey × program) over the floor-counting spaces, with the
 * building's HVAC demand apportioned by floor-area share — the same rule
 * `buildEnergyZones` applies to a snapshot, and the same disclaimer the
 * legend prints under it.
 */
export function buildReferenceEnergyZones(
  spaces: readonly ReferenceBuildingSpace[],
  storeys: NonNullable<ReferenceBuildingManifest["storeys"]>,
  hvacDemandKwhYr: number,
): EnergyZone[] {
  const storeyIndex = new Map(storeys.map((s, i) => [s.id, { ...s, floorNo: i }]));
  const byKey = new Map<string, EnergyZone>();

  for (const space of spaces) {
    if (!space.countsAsFloorArea) continue;
    if (space.floorAreaSqm == null || !(space.floorAreaSqm > 0)) continue;
    const storey = space.storeyId ? storeyIndex.get(space.storeyId) : undefined;
    if (!storey) continue;
    const program = classifySpaceProgram(space);
    const key = `${storey.id}::${program.key}`;

    let zone = byKey.get(key);
    if (!zone) {
      zone = {
        key,
        keySource: "level_program_fallback",
        programKey: program.key,
        labelKo: program.labelKo,
        labelEn: program.labelEn,
        levelId: storey.id,
        floorNo: storey.floorNo,
        elevationM: storey.elevationM,
        storeyHeightM: storey.floorToFloorHeightM,
        rooms: [],
        areaSqm: 0,
        areaShare: 0,
        demandKwhPerYear: 0,
        intensityKwhPerSqm: 0,
        resultValueKwhPerYear: 0,
        resultIntensityKwhPerSqm: 0,
        resultStatus: "area_apportioned_approximation",
        resultSemantics: ZONE_RESULT_SEMANTICS,
        bandIndex: 0,
        color: analysisBandColor(0),
      };
      byKey.set(key, zone);
    }
    zone.rooms.push({
      id: space.id,
      x: space.extent?.x ?? 0,
      z: space.extent?.z ?? 0,
      widthM: space.extent?.widthM ?? 0,
      depthM: space.extent?.depthM ?? 0,
      areaSqm: space.floorAreaSqm,
    });
    zone.areaSqm += space.floorAreaSqm;
  }

  const zones = [...byKey.values()].sort(
    (a, b) => a.floorNo - b.floorNo || a.programKey.localeCompare(b.programKey),
  );
  const totalArea = zones.reduce((sum, z) => sum + z.areaSqm, 0);
  const demand =
    Number.isFinite(hvacDemandKwhYr) && hvacDemandKwhYr > 0 ? hvacDemandKwhYr : 0;
  const maxDemand =
    totalArea > 0
      ? zones.reduce((max, z) => Math.max(max, (z.areaSqm / totalArea) * demand), 0)
      : 0;
  for (const zone of zones) {
    zone.areaShare = totalArea > 0 ? zone.areaSqm / totalArea : 0;
    zone.demandKwhPerYear = zone.areaShare * demand;
    zone.intensityKwhPerSqm = zone.areaSqm > 0 ? zone.demandKwhPerYear / zone.areaSqm : 0;
    zone.resultValueKwhPerYear = zone.demandKwhPerYear;
    zone.resultIntensityKwhPerSqm = zone.intensityKwhPerSqm;
    const fraction = maxDemand > 0 ? zone.demandKwhPerYear / maxDemand : 0;
    zone.bandIndex = analysisBandIndex(fraction);
    zone.color = analysisBandColor(fraction);
  }
  return zones;
}
