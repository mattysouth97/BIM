#!/usr/bin/env node
// scripts/build-reference-building.mjs
//
// Turn a reference building's IFC discipline models into the two artifacts the
// app ships: a manifest of what the model states, and a GLB of its fabric.
//
//   node scripts/build-reference-building.mjs --generated-at 2026-09-04T00:00:00.000Z
//
// The source IFCs are NOT committed — they are 32 MB, they are not ours, and
// the committed artifacts are what the app uses. They are fetched once into a
// cache outside the repository and their SHA-256 recorded, so a re-run against
// a changed upstream fails loudly instead of regenerating silently.
//
// `--generated-at` is required rather than defaulted to a clock: the artifacts
// are committed, so building them twice from the same inputs must produce
// identical bytes or every rebuild shows up as a diff.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fetchSource, githubLfsUrl, openIfcFiles, compoundAngleDeg, str, num, refId } from "./lib/ifc-reader.mjs";
import {
  extractStoreys,
  extractSpaces,
  extractAssemblies,
  classifyExternalElements,
} from "./lib/ifc-envelope.mjs";
import { netFaceAreasByElement, orientWalls } from "./lib/ifc-face-area.mjs";
import { collectFabric, mergeFabric, writeGlb, SERVICE_GROUPS, SERVICE_COLOUR } from "./lib/ifc-glb.mjs";
import { collectServiceInstances } from "./lib/ifc-instances.mjs";
import { collectFlowNetwork, annotateFlow, serialiseFlow } from "./lib/ifc-flow.mjs";

const REPO = process.cwd();
const CACHE =
  process.env.REFERENCE_BUILDING_CACHE ??
  path.join(process.env.TEMP ?? "/tmp", "bimfit-reference-buildings");

const CLINIC = Object.freeze({
  id: "bs-medical-dental-clinic",
  name: { ko: "메디컬-덴탈 클리닉", en: "Medical-Dental Clinic" },
  summary: {
    ko: "buildingSMART가 공개한 미국 GSA 외래 진료소의 실제 조정 모델.",
    en: "A real US GSA outpatient clinic, released as an open coordination model.",
  },
  useType: "outpatient_clinic",
  licence: "CC BY 4.0",
  attribution:
    'BSI (2020) "Medical-Dental Test Files", buildingSMART International — ' +
    "https://github.com/buildingsmart-community/Community-Sample-Test-Files",
  sourceUrl:
    "https://github.com/buildingsmart-community/Community-Sample-Test-Files",
  files: [
    { role: "architectural", fileName: "Clinic_Architectural.ifc" },
    { role: "structural", fileName: "Clinic_Structural.ifc" },
    { role: "hvac", fileName: "Clinic_HVAC.ifc" },
    { role: "electrical", fileName: "Clinic_Electrical.ifc" },
    { role: "plumbing", fileName: "Clinic_Plumbing.ifc" },
  ],
  /** Discipline models rendered as their own toggleable layer. */
  serviceLayers: [
    { id: "hvac", role: "hvac", ko: "냉난방환기", en: "HVAC" },
    { id: "electrical", role: "electrical", ko: "전기", en: "Electrical" },
    { id: "plumbing", role: "plumbing", ko: "급탕/배관", en: "Plumbing" },
  ],
  /** The exterior wall type; both IfcWallStandardCase and IfcWall carry it. */
  exteriorWallMatch: "Exterior - Insul Panel",
  /** Main roof datum. Wall above this encloses plant, not conditioned space. */
  roofDatumM: 9.25,
});

/**
 * Reference building #2 — Schependomlaan, Nijmegen.
 *
 * Chosen to close the Clinic's location gap, and it does so far more narrowly
 * than intended: the model states a real TOWN and nothing else spatial. Its
 * IfcSite coordinate is a whole-minute value in Amersfoort, 46.2 km from the
 * real street and in the authoring architect's own city, and its TrueNorth is
 * the bare IFC default `(0.,1.)` in both representation contexts. So climate
 * cites the town name, orientation is an assumption, and neither is taken from
 * a coordinate that looks authoritative and is not.
 *
 * What it does carry, which the Clinic does not, is dimensioned construction:
 * typed thicknesses on 645/647 external walls and a real modelled cavity. That
 * is what feeds the ISO-6946 layer solve. It carries no usable U-value — see
 * `statedZeroThermalTransmittance` below.
 */
const SCHEPENDOMLAAN = Object.freeze({
  id: "schependomlaan",
  name: { ko: "스헤펜돔라안 아파트", en: "Schependomlaan Apartments" },
  summary: {
    ko: "네덜란드 네이메헌의 10세대 공동주택. 실제 시공용 도면 모델(werktekening).",
    en: "A ten-dwelling apartment block in Nijmegen, released as a working-drawing model.",
  },
  useType: "apartment_building",
  licence: "CC BY 4.0",
  /**
   * NULL ON PURPOSE, and it must stay null until a person decides.
   *
   * `LICENSE.MD` in the archive repository grants CC BY 4.0 and our bytes are
   * byte-identical to the licensed blob. But it was committed by a master's
   * student in a single 2016 commit, while the repository and this IFC's own
   * header both name ROOT bv as the model's author — `('architect'),('ROOT bv')`.
   * No assignment is evidenced, the maintained README says permission was for
   * "scientific and academic purposes", and the DOI that might settle it
   * (10.17605/OSF.IO/NE2YU) resolves to a private OSF node.
   *
   * CC BY makes credit a licence condition, so a line naming the wrong holder
   * is a breach rather than a typo. Null renders as "저작권자가 확인되지 않아
   * 표기를 비워 둡니다", which is a statement, not a gap.
   */
  attribution: null,
  sourceUrl:
    "https://github.com/openBIMstandards/Archive-DataSetSchependomlaan",
  /**
   * The two locations the dataset advertises are both dead: the canonical repo
   * is now a 174-byte README pointing at buildingSMART/Sample-Test-Files, which
   * has been renamed to buildingSMART/Certification-datasets and no longer
   * contains this building. This is where the file actually is.
   */
  source: {
    owner: "openBIMstandards",
    repo: "Archive-DataSetSchependomlaan",
    ref: "master",
    dir: "Design model IFC",
  },
  files: [
    {
      role: "architectural",
      fileName: "IFC Schependomlaan.ifc",
      sha256: null,
    },
  ],
  /** Envelope only. The Clinic already carries the MEP story. */
  serviceLayers: [],

  /**
   * Dutch cavity wall (spouwmuur): the leaves are SEPARATE IfcWall instances
   * and BOTH carry `IsExternal = .T.`, so `IsExternal` cannot be the envelope
   * filter here — it selects 647 of 934 walls and yields 1,064.52 m², 2.50x the
   * real envelope, by counting every wall twice.
   *
   * The INNER leaf is the measurement. A x U must be counted once, and the
   * inner leaf is the one the openings are cut from and the only one any space
   * boundary references. `buitenblad` (the outer leaf, 363 elements) is
   * excluded deliberately rather than by silence.
   */
  exteriorWallMatch: ["binnenblad", "HSB-element"],
  exteriorWallExclude: ["buitenblad", "opgaand werk", "kozijn", "spouwisolatie"],

  /**
   * Where a wall's area comes from, declared per building because the right
   * answer is a property of the FILE, not a better rule.
   *
   * The Clinic is "mesh": its only IfcElementQuantity is `GSA BIM Area` and it
   * exists for spaces alone, so walls state nothing and a refused mesh is the
   * end of the line.
   *
   * This model is "stated_first": it is a werktekening exported with
   * `Multi-skin complex geometries: Building element parts`, so ONE WALL IS
   * MANY MESHES by construction and the tessellated area over-counts. Measured:
   * 26 of 58 `HSB-element` exceed their own bounding box, mesh 101.5 m2 against
   * a stated 43.92 — 2.31x, the double-count signature. `binnenblad` is the
   * control: 382.7 mesh against 382.71 stated, agreeing to the cent where the
   * geometry is single-skin.
   *
   * And the mesh cannot be merely distrusted, it is INCOMPLETE: 50 of 51
   * `kozijn` walls produce no triangles at all, and 55 of 934 walls never reach
   * the streamer, so they cannot even be flagged — a flag needs a result to
   * hang off. Stated NetSideArea covers all of them.
   */
  areaSource: "stated_first",

  /**
   * How this building's coordinate is to be judged, and what may be used
   * instead. Declared rather than detected: the Clinic's tell is a specific
   * Boston lat/lon, this one's is a whole-minute value in the architect's own
   * city, and a single hard-coded test cannot stand for both.
   */
  location: {
    rejectCoordinate: true,
    statedTown: "Nijmegen",
    /** `(0.,1.)` in BOTH representation contexts — the bare IFC default. */
    trueNorthStated: false,
    note:
      "IfcSite states 52°9'N 5°23'E — a whole-minute value with zero " +
      "seconds, 46.2 km from the real Schependomlaan in Nijmegen and in " +
      "Amersfoort, the authoring architect's own city. It is a stamped " +
      "constant, not a survey: no position, orientation or solar geometry may " +
      "be taken from it. The town 'Nijmegen' IS stated, on both IfcSite and " +
      "IfcBuilding, and is the only spatial fact this model supports. " +
      "TrueNorth is the schema default (0.,1.) in both representation " +
      "contexts, so orientation is an assumption — and note the geometry is " +
      "not purely cardinal: 88 element placements sit at 47.94°.",
  },

  /**
   * ASSUMPTION, not a reading. This model contains ZERO IfcRoof entities; the
   * datum is inferred from storey '03' at 9 m. Named here so it appears in the
   * assumption ledger rather than passing as a measurement.
   */
  roofDatumM: 9.0,

  /**
   * All 97 IfcThermalTransmittanceMeasure in this file are literally `0.`, on
   * 67 windows and 30 doors only — never on a wall, floor or roof. Envelope
   * coverage is 0%.
   *
   * A 0 W/m2K is a perfect insulator, so reading these produces a spectacular
   * building rather than an obviously broken one — the documented-zero trap
   * that `platArea=0` and `heit=0` already taught this repo. Emit no fact.
   */
  statedZeroThermalTransmittance: true,

  /**
   * Every diagonal sector is exactly 0, and that is measured, not a snap: all
   * 122 inner-leaf walls sit at 0/90/180/270 (23/24/38/37 in 15-degree bins).
   * The 88 placements at 47.94 degrees that exist in this model are the outer
   * leaf, `buitenblad`, plus its frames — excluded from the envelope by
   * design — so the splayed bay never enters the sector split. Recorded here
   * because four exact zeros are also the signature of a binner rounding to
   * cardinals, and the next reader should not have to re-prove which it is.
   */
  orientationNote:
    "All 122 inner-leaf walls are cardinal; the diagonal sectors are 0 by " +
    "measurement. The model's 88 placements at 47.94° are the excluded " +
    "outer leaf (buitenblad), so no envelope area is mis-binned.",
});

/** Every building this script can build, selected with `--building <id>`. */
const BUILDINGS = Object.freeze({
  [CLINIC.id]: CLINIC,
  [SCHEPENDOMLAAN.id]: SCHEPENDOMLAAN,
});

/**
 * One predicate, two consumers.
 *
 * The completeness guard counts name-matching entities and the mesh walk
 * measures them, and the guard is only meaningful if both ask the same
 * question. When they were written separately the guard counted a string
 * `includes` while the walk matched a list, so a cavity-wall config reported
 * "0 match by name but 122 produced geometry" — the check failing on its own
 * definition rather than on the model.
 */
/**
 * Wall areas as the MODEL states them, keyed by expressID.
 *
 * Read for buildings whose `areaSource` is "stated_first". This is not a
 * distrust of tessellation in general — it is a property of the file. A model
 * exported with `Multi-skin complex geometries: Building element parts` splits
 * one wall into many meshes, so the tessellated sum over-counts, and elements
 * producing no triangles at all contribute nothing while looking like nothing
 * is wrong.
 *
 * `NetSideArea` by name rather than first-area-wins: an IfcElementQuantity
 * carries several areas, and taking whichever comes first makes the answer
 * depend on export order.
 */
function statedWallAreas(file, webIfc) {
  const byElement = new Map();
  for (const rel of file.byType(webIfc.IFCRELDEFINESBYPROPERTIES)) {
    const definition = file.deref(rel.RelatingPropertyDefinition);
    if (!definition || file.typeName(definition) !== "IfcElementQuantity") continue;
    let area = null;
    for (const q of definition.Quantities ?? []) {
      const quantity = file.deref(q);
      if (!quantity) continue;
      if (
        file.typeName(quantity) === "IfcQuantityArea" &&
        str(quantity.Name) === "NetSideArea"
      ) {
        area = num(quantity.AreaValue);
        break;
      }
    }
    if (area === null) continue;
    for (const object of rel.RelatedObjects ?? []) {
      const id = refId(object);
      if (id !== null && !byElement.has(id)) byElement.set(id, area);
    }
  }
  return byElement;
}

function isWallType(typeName) {
  return typeName === "IfcWallStandardCase" || typeName === "IfcWall";
}

function exteriorWallPredicate(building) {
  const match = building.exteriorWallMatch;
  const exclude = building.exteriorWallExclude ?? [];
  return (name) => {
    const lower = String(name ?? "").toLowerCase();
    // An exclude list rather than reliance on the match alone: on a cavity
    // wall BOTH leaves carry `IsExternal`, and the outer leaf's name is a
    // near-miss for the inner's, so what is left OUT has to be stated.
    if (exclude.some((x) => lower.includes(x.toLowerCase()))) return false;
    return Array.isArray(match)
      ? match.some((m) => lower.includes(m.toLowerCase()))
      : String(name ?? "").includes(match);
  };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const generatedAt = arg("generated-at");
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error(
      "--generated-at <ISO-8601> is required. The artifacts are committed, so " +
        "the same inputs must always produce the same bytes.",
    );
  }

  const buildingId = arg("building") ?? CLINIC.id;
  const building = BUILDINGS[buildingId];
  if (!building) {
    throw new Error(
      `Unknown --building "${buildingId}". Known: ${Object.keys(BUILDINGS).join(", ")}.`,
    );
  }

  // `--out-dir` exists so a building whose licence authority is unresolved can
  // be built and inspected without its artifacts landing under `public/`,
  // where they would ship on the next deploy. Publication is a decision, not a
  // side effect of running the extractor.
  const outDir = arg("out-dir")
    ? path.resolve(arg("out-dir"))
    : path.join(REPO, "public", "reference-buildings", building.id);
  await mkdir(outDir, { recursive: true });

  // ── Fetch (or reuse) the discipline models ─────────────────────────────
  const sources = [];
  const src = building.source ?? {
    owner: "buildingsmart-community",
    repo: "Community-Sample-Test-Files",
    ref: "main",
    dir: "IFC 2.3.0.1 (IFC 2x3)/Medical-Dental Clinic",
  };
  for (const file of building.files) {
    const url = githubLfsUrl(
      src.owner,
      src.repo,
      src.ref,
      `${src.dir}/${file.fileName}`,
    );
    const cachePath = path.join(CACHE, file.fileName);
    const fetched = await fetchSource(url, cachePath, {
      expectedSha256: file.sha256,
    });
    sources.push({ ...file, ...fetched, cachePath });
    console.log(
      `  ${file.fileName}  ${(fetched.byteLength / 1048576).toFixed(1)} MB  sha256 ${fetched.sha256.slice(0, 12)}…`,
    );
  }

  const { api, files, webIfc } = await openIfcFiles(
    sources.map((s) => s.cachePath),
    { wasmDir: path.join(REPO, "node_modules", "web-ifc") + path.sep },
  );
  const byRole = new Map(sources.map((s, i) => [s.role, files[i]]));
  const arch = byRole.get("architectural");
  const struct = byRole.get("structural");

  // ── What the model states ──────────────────────────────────────────────
  const storeys = extractStoreys(arch, webIfc);
  const spaces = extractSpaces(arch, webIfc, storeys);
  const floorSpaces = spaces.filter((s) => s.countsAsFloorArea);
  // A building need not have a structural model. Schependomlaan is one
  // architectural file; the Clinic is five. Absent roles are skipped rather
  // than assumed, so a missing discipline is an empty contribution and not a
  // crash halfway through an extraction.
  const assemblies = [arch, struct]
    .filter(Boolean)
    .flatMap((file) => extractAssemblies(file, webIfc));
  const classification = classifyExternalElements(arch, webIfc);

  // Areas come from the built solid, never from space boundaries — see the
  // retraction in ifc-envelope.mjs.
  const isExteriorWallName = exteriorWallPredicate(building);
  const exteriorWalls = netFaceAreasByElement(
    api,
    arch.modelId,
    (typeName, name) => isWallType(typeName) && isExteriorWallName(name),
    { heightSplitM: building.roofDatumM },
  );
  // How many walls SHOULD there be, counted from the file's own entity list
  // rather than from anything the geometry pass produced?
  //
  // This is a separate question from whether a measurement is sound, and the
  // flags on `netFaceArea` cannot answer it: an element whose mesh the
  // streamer never emits produces no result at all, so there is nothing for a
  // flag to hang off. It does not read as zero — it is simply absent, and the
  // total is quietly smaller. bim-bf found 55 of 934 walls vanishing that way
  // on another model, including 50 of 51 `kozijn` frames.
  let namedWalls = 0;
  for (const type of [webIfc.IFCWALLSTANDARDCASE, webIfc.IFCWALL]) {
    for (const line of arch.byType(type)) {
      if (isExteriorWallName(str(line.Name) ?? "")) {
        namedWalls += 1;
      }
    }
  }
  if (namedWalls !== exteriorWalls.size) {
    throw new Error(
      `${namedWalls} elements match the exterior wall type by name but only ` +
        `${exteriorWalls.size} produced geometry. The missing ${namedWalls - exteriorWalls.size} ` +
        `are absent from the total rather than zero in it, and no per-element ` +
        `flag can report them. Either they carry a stated quantity to fall back ` +
        `on, or the shortfall has to be explained before an area is published.`,
    );
  }

  // Where a wall's area comes from is declared per building, because the right
  // answer is a property of the file rather than a better rule. "mesh" suits a
  // coordination model whose walls state no quantity at all — there a refused
  // measurement is the end of the line. "stated_first" suits a working-drawing
  // export that splits one wall into many meshes, where the tessellated sum
  // over-counts and some elements produce no triangles at all.
  //
  // The substitution is applied INTO the map, before anything reads it, so the
  // headline total and the orientation split cannot end up describing
  // different areas. Substituting only at the accumulator left the sector pass
  // still summing meshes, and the two disagreed by 40 m².
  const substituted = [];
  if (building.areaSource === "stated_first") {
    const stated = statedWallAreas(arch, webIfc);
    for (const [id, wall] of exteriorWalls) {
      const value = stated.get(id);
      if (value === undefined || value === null) continue;
      const mesh = wall.netFaceAreaSqm;
      // Split the stated area the way the mesh was split, so a roof datum keeps
      // meaning something. Where the mesh is unusable there is nothing to take
      // a ratio from, and the whole area sits below the split rather than being
      // invented on both sides of it.
      const belowShare =
        mesh > 0 && Number.isFinite(wall.netFaceAreaBelowSplitSqm / mesh)
          ? wall.netFaceAreaBelowSplitSqm / mesh
          : 1;
      exteriorWalls.set(id, {
        ...wall,
        netFaceAreaSqm: value,
        netFaceAreaBelowSplitSqm: value * belowShare,
        netFaceAreaAboveSplitSqm: value * (1 - belowShare),
        // The measurement is no longer the mesh, so the mesh's complaints no
        // longer describe it. Keeping them would block a publishable
        // extraction over an element measured correctly by another route.
        exceedsBounds: false,
        thinAxisForced: false,
        areaSource: "stated",
      });
      substituted.push({ id, name: wall.name, mesh, stated: value });
    }
  }

  let wallNet = 0;
  let wallBelowRoof = 0;
  let wallAboveRoof = 0;
  const impossible = [];
  const notWalls = [];
  for (const [id, wall] of exteriorWalls) {
    wallNet += wall.netFaceAreaSqm;
    wallBelowRoof += wall.netFaceAreaBelowSplitSqm;
    wallAboveRoof += wall.netFaceAreaAboveSplitSqm;
    if (wall.exceedsBounds) impossible.push({ id, ...wall });
    if (wall.thinAxisForced) notWalls.push(id);
  }
  if (substituted.length > 0) {
    const disagreeing = substituted.filter((x) => x.mesh > 0);
    const worst = disagreeing.sort((a, b) => b.mesh / b.stated - a.mesh / a.stated)[0];
    console.log(
      `  ${substituted.length} wall(s) measured from the model's stated NetSideArea` +
        (worst
          ? `, worst #${worst.id} "${worst.name}" mesh ${worst.mesh.toFixed(2)} vs stated ` +
            `${worst.stated.toFixed(2)} m² (${(worst.mesh / worst.stated).toFixed(2)}x)`
          : "") +
        `; ${substituted.length - disagreeing.length} produced no geometry at all`,
    );
  }
  // Refuse rather than publish. A net face area above the element's own gross
  // face is not a bad estimate, it is impossible — the signature of a
  // multi-skin element counted once per skin. Publishing it would put a
  // confident wrong number on a card, which is the failure this repo keeps
  // finding. Same for an element flatter than it is wide: this measurement is
  // wall-only and returns a plausible zero on anything horizontal.
  if (impossible.length > 0) {
    const worst = impossible.sort((a, b) => b.fillRatio - a.fillRatio)[0];
    throw new Error(
      `${impossible.length} exterior wall(s) measure more face area than their own ` +
        `bounding box can hold — worst #${worst.id} at ${worst.netFaceAreaSqm.toFixed(2)} m² ` +
        `against a ${worst.grossFaceSqm.toFixed(2)} m² face (${worst.fillRatio.toFixed(2)}x). ` +
        `That is the multi-skin double-count; fix the measurement before publishing an area.`,
    );
  }
  if (notWalls.length > 0) {
    throw new Error(
      `${notWalls.length} element(s) matched as exterior wall are flatter than they are ` +
        `wide (ids ${notWalls.slice(0, 5).join(", ")}). netFaceArea is wall-only and ` +
        `returns 0.00 for horizontal elements rather than an error.`,
    );
  }

  // True north, if the model states one.
  //
  // `IfcGeometricRepresentationContext.TrueNorth` is an IfcDirection in the
  // plan, giving north relative to the project's own +Y. Absent, project north
  // IS true north — which is an assumption, not a reading, and `northAssumed`
  // carries that distinction into the orientation result. It matters more
  // under a monthly method than it ever did under degree days: solar gain is
  // computed per orientation, so a building rotated 30° off the grid puts its
  // gains on the wrong faces all year.
  let trueNorthDeg = null;
  for (const context of arch.byType(webIfc.IFCGEOMETRICREPRESENTATIONCONTEXT)) {
    const direction = arch.line(refId(context.TrueNorth));
    const ratios = direction?.DirectionRatios;
    if (!Array.isArray(ratios) || ratios.length < 2) continue;
    const dx = num(ratios[0]);
    const dy = num(ratios[1]);
    if (dx === null || dy === null) continue;
    // (0, 1) is IFC's own default — 0° from +Y — so a context carrying it
    // states nothing. Reading it as a surveyed value is worse than finding
    // nothing at all, because a populated TrueNorth looks like evidence.
    // bim-bf found exactly this on Schependomlaan: both of its representation
    // contexts carry IFCDIRECTION((0.,1.)), and a naive reader would have
    // reported a known orientation for a building that states none.
    if (Math.abs(dx) < 1e-9 && Math.abs(dy - 1) < 1e-9) continue;
    trueNorthDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
    break;
  }

  const orientation = orientWalls(exteriorWalls, { trueNorthDeg });
  // The oriented split must account for the same area as the headline total.
  // It did not on the first run — 7 walls with a single aligned face were
  // skipped, so the manifest would have carried 2,150.3 m² of wall and
  // 2,119.33 m² of oriented wall, both true-looking and disagreeing by 1.4%.
  const orientedTotal = Object.values(orientation.byOrientation).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (Math.abs(orientedTotal - wallNet) > 0.05) {
    throw new Error(
      `Oriented wall area ${orientedTotal.toFixed(2)} m² does not reconcile with ` +
        `the total ${wallNet.toFixed(2)} m² (${orientation.walls.length} of ` +
        `${exteriorWalls.size} walls oriented). Every wall must land in a sector.`,
    );
  }

  const site = arch.byType(webIfc.IFCSITE)[0];
  const latitudeDeg = site ? compoundAngleDeg(site.RefLatitude) : null;
  const longitudeDeg = site ? compoundAngleDeg(site.RefLongitude) : null;
  // A populated IfcSite is not evidence of where a building is. Revit stamps
  // its factory default (Boston, MA) on every new project; ArchiCAD's Dutch
  // template stamps a whole-minute value in Amersfoort. Both read as a
  // location and neither is one, so each building declares how its coordinate
  // is to be judged rather than one hard-coded test standing for all of them.
  const isAuthoringDefault = building.location
    ? building.location.rejectCoordinate
    : latitudeDeg !== null &&
      longitudeDeg !== null &&
      Math.abs(latitudeDeg - 42.35843) < 1e-3 &&
      Math.abs(longitudeDeg + 71.05978) < 1e-3;

  // ── Fabric geometry for the viewer ─────────────────────────────────────
  const generator = `bimfit build-reference-building (web-ifc ${webIfcVersion()})`;
  const fabric = new Map();
  for (const file of [arch, struct].filter(Boolean)) {
    mergeFabric(fabric, collectFabric(api, webIfc, file.modelId).groups);
  }
  const glb = await writeGlb(path.join(outDir, "model.glb"), fabric, { generator });

  // One GLB per discipline, so a layer that is never switched on is never
  // downloaded. Together they are 17 MB; as one file they would double the
  // page's cost for everyone who only wanted to look at the building.
  const serviceLayers = [];
  for (const layer of building.serviceLayers) {
    const file = byRole.get(layer.role);
    if (!file) continue;
    const collected = collectServiceInstances(api, webIfc, file.modelId, {
      serviceGroups: SERVICE_GROUPS,
    });
    const written = await writeGlb(
      path.join(outDir, `${layer.id}.glb`),
      collected.groups,
      { generator, colours: SERVICE_COLOUR, instanced: collected.instanced },
    );
    // The routed network, direction included, from the model's own ports.
    // Written as its own file for the same reason the GLB is: a reader who
    // never switches flow on should never pay for it.
    const flow = serialiseFlow(annotateFlow(collectFlowNetwork(api, webIfc, file.modelId)));
    let flowFile = null;
    if (flow.segments.length > 0) {
      flowFile = `${layer.id}-flow.json`;
      await writeFile(
        path.join(outDir, flowFile),
        `${JSON.stringify(flow)}\n`,
        "utf8",
      );
    }

    serviceLayers.push({
      id: layer.id,
      ko: layer.ko,
      en: layer.en,
      file: `${layer.id}.glb`,
      byteLength: written.byteLength,
      triangleCount: written.triangleCount,
      groups: written.groups,
      /**
       * Every component is at its real geometry now; what varies is whether a
       * shape is shipped once and placed many times, or merged in because it
       * only occurs a few times. `drawCalls` is the number that matters for
       * whether the layer is usable — an instanced shape is one draw call
       * however often it is placed.
       */
      elements: collected.stats.elements,
      distinctGeometries: collected.stats.distinctGeometries,
      instancedShapes: written.instancedShapes,
      instancedPlacements: written.instancedPlacements,
      drawCalls: written.drawCalls,
      /**
       * Null when the model states no direction of flow. The counts stay
       * either way — a layer that cannot animate should still be able to say
       * why, and "this file declares no ports" is a fact about the model worth
       * showing rather than an empty space.
       */
      flow: {
        file: flowFile,
        ...flow.counts,
        reason: flow.reason,
        wavelengthM: flow.wavelengthM,
      },
    });
    console.log(
      `    ${layer.id}.glb`.padEnd(20) +
        `${(written.byteLength / 1048576).toFixed(2)} MB, ` +
        `${written.triangleCount.toLocaleString()} tris, ` +
        `${written.instancedShapes} shapes x ${written.instancedPlacements} placements, ` +
        `${written.drawCalls} draw calls, ` +
        `flow ${flow.counts.drawnEdges}/${flow.counts.connections} directed`,
    );
  }

  const round = (n) => Math.round(n * 100) / 100;
  const manifest = {
    kind: "bimfit_reference_building_manifest",
    schemaVersion: 1,
    id: building.id,
    name: building.name,
    summary: building.summary,
    useType: building.useType,
    licence: building.licence,
    attribution: building.attribution,
    sourceUrl: building.sourceUrl,
    generatedAt,
    sourceFiles: sources.map((s, i) => ({
      role: s.role,
      fileName: s.fileName,
      sha256: s.sha256,
      byteLength: s.byteLength,
      /**
       * The file's own declared units, recorded so a reader can tell whether
       * a length was converted or merely happened to be right. Every Clinic
       * file is METRE / SQUARE_METRE, which is why nothing here needed
       * converting — but nothing read the unit assignment at all until
       * 2026-09-04, so that was luck rather than handling.
       */
      units: files[i].units,
    })),
    counts: {
      // A storey is one that holds rooms. Counting by height instead counted
      // Schependomlaan's `-1 fundering` — a footing datum one metre below the
      // ground floor, with no spaces — and reported 5 storeys for a 4-storey
      // building. A wrong count under a real number is the defect this repo is
      // defined against, and it would have sat on the card. The Clinic is
      // unchanged by this: its `TOF Footing` holds no rooms either.
      storeys: storeys.filter((s) => spaces.some((sp) => sp.storeyId === s.id)).length,
      spacesTotal: spaces.length,
      spacesFloor: floorSpaces.length,
      assemblies: assemblies.length,
      externalElements: classification.elements.length,
      exteriorWalls: exteriorWalls.size,
      // A bare zero cannot be told from "does not apply". When boundaries
      // exist and none resolved, say why — Schependomlaan carries 820
      // (.PHYSICAL., .EXTERNAL.) boundaries, every one an IfcCurveBoundedPlane,
      // and the classifier reads only IfcSurfaceOfLinearExtrusion, so it found
      // nothing while looking straight at them. Emitted only in that case, so
      // the Clinic's manifest (80 resolved) is byte-for-byte unchanged.
      ...(classification.elements.length === 0 && classification.unresolved.length > 0
        ? {
            externalElementsNote:
              `${classification.unresolved.length} external physical space boundaries ` +
              `exist and none resolved: ` +
              `${[...new Set(classification.unresolved.map((u) => u.reason))].join("; ")}. ` +
              `The classifier reads IfcSurfaceOfLinearExtrusion (Revit); this file's ` +
              `boundaries are another surface type. Envelope areas here come from ` +
              `the wall walk, not from boundaries, so nothing published depends on this.`,
          }
        : {}),
    },
    areas: {
      totalFloorAreaSqm: round(
        floorSpaces.reduce((sum, s) => sum + (s.floorAreaSqm ?? 0), 0),
      ),
      areaPlanTotalSqm: round(
        spaces.reduce((sum, s) => sum + (s.floorAreaSqm ?? 0), 0),
      ),
      exteriorWallNetSqm: round(wallNet),
      exteriorWallBelowRoofSqm: round(wallBelowRoof),
      exteriorWallAboveRoofSqm: round(wallAboveRoof),
      /**
       * Wall area by compass sector, which a monthly method needs and a
       * degree-day one does not: ISO 13790 computes solar gain per
       * orientation, and 2,150.3 m² is the same total whether it all faces
       * north or all faces south. Those are very different buildings.
       *
       * Two inferences are folded in and both are reported rather than
       * hidden — which face of a wall is outward (`weakOutward` counts the
       * ones where the call was close) and where north is (`northAssumed`).
       */
      exteriorWallByOrientationSqm: orientation.byOrientation,
    },
    /**
     * The layer stacks, outside-in, as the model states them.
     *
     * Names and thicknesses only — this file carries no
     * `IfcMaterialProperties`, so there is no conductivity to read and none is
     * invented here. That absence is the whole reason this building was
     * chosen: layer order and thickness are EVIDENCE, citable to an entity,
     * while every λ is an ASSUMPTION the model builder names. A stated U-value
     * would have been weaker, because it could be mistaken for a measurement.
     *
     * Emitted because the manifest previously carried only a count, and a
     * count cannot be solved into a U-value.
     */
    assemblies: assemblies.map((a) => ({
      id: a.id,
      name: a.name,
      totalThicknessM: a.totalThicknessM,
      layers: a.layers.map((l) => ({
        name: l.name,
        thicknessM: l.thicknessM,
        ref: l.ref,
      })),
      ref: a.ref,
    })),
    orientation: {
      trueNorthDeg: trueNorthDeg === null ? null : round(trueNorthDeg),
      northAssumed: orientation.northAssumed,
      weakOutwardCount: orientation.weakOutward,
      offCardinalCount: orientation.offCardinalCount,
      offCardinalSqm: orientation.offCardinalSqm,
      wallCount: orientation.walls.length,
      note:
        "Azimuths are clockwise from north, where north is the model's -Z " +
        "after web-ifc's Z-up to Y-up conversion. Outward face inferred by " +
        "comparing each face's centroid with the building centre, which is " +
        "correct for a convex plan and can be wrong at a re-entrant corner." +
        (building.orientationNote ? ` ${building.orientationNote}` : ""),
    },
    site: {
      declaredSiteName: site ? str(site.Name) : null,
      declaredLatitudeDeg: latitudeDeg,
      declaredLongitudeDeg: longitudeDeg,
      locationIsAuthoringDefault: isAuthoringDefault,
      locationNote: building.location
        ? building.location.note
        : isAuthoringDefault
          ? "IfcSite matches the authoring tool's factory default (Boston, MA). " +
            "The building's real location is redacted; no climate may be taken from it."
          : "IfcSite coordinates recorded; not verified against any other source.",
      /**
       * Emitted only for a building that declares a location verdict, so
       * adding a second building does not rewrite the first one's committed
       * manifest with two null fields. `statedTown` is the town the model
       * states, and it is what a climate dataset may be keyed to — never the
       * coordinate above.
       */
      ...(building.location
        ? {
            statedTown: building.location.statedTown ?? null,
            trueNorthStated: building.location.trueNorthStated ?? null,
          }
        : {}),
    },
    serviceLayers,
    model: {
      file: "model.glb",
      byteLength: glb.byteLength,
      triangleCount: glb.triangleCount,
      groups: glb.groups,
      note:
        "Building fabric only. Furniture, sanitary fixtures, railings and the " +
        "structural frame are excluded — together they are 82% of the model's " +
        "triangles and none of them is visible from outside the building.",
      serviceNote:
        "Service layers carry every component at the model's own geometry — " +
        "no bounding-box stand-ins. The discipline models looked far too large " +
        "for that (plumbing tessellates to 3,184,148 triangles) but that total " +
        "counts the same catalogue parts over and over: only 340,774 of them " +
        "are distinct shapes. Each shape is stored once and placed by " +
        "instancing, so plumbing ships 402 shapes across 7,872 placements.",
    },
    /**
     * Recorded so a future reader who recomputes a space-boundary sum finds it
     * already refuted rather than concluding the extraction lost a third of
     * the building.
     */
    invalidDiagnostics: classification.invalidAreaDiagnostics,
  };

  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  files.forEach((f) => f.close());

  console.log(`\n  ${path.relative(REPO, outDir)}`);
  console.log(
    `    model.glb      ${(glb.byteLength / 1048576).toFixed(2)} MB, ${glb.triangleCount.toLocaleString()} triangles`,
  );
  console.log(
    `    manifest.json  floor ${manifest.areas.totalFloorAreaSqm} m2 over ${manifest.counts.spacesFloor} spaces, ` +
      `wall ${manifest.areas.exteriorWallNetSqm} m2`,
  );
}

function webIfcVersion() {
  try {
    return process.env.npm_package_dependencies_web_ifc ?? "0.0.77";
  } catch {
    return "unknown";
  }
}

main().catch((error) => {
  console.error(`\n  ${error.message}\n`);
  process.exitCode = 1;
});
