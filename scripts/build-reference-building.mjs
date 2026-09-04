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
import {
  fetchSource,
  githubLfsUrl,
  githubRawUrl,
  openIfcFiles,
  compoundAngleDeg,
  str,
  num,
  refId,
} from "./lib/ifc-reader.mjs";
import {
  extractStoreys,
  extractSpaces,
  extractAssemblies,
  classifyExternalElements,
} from "./lib/ifc-envelope.mjs";
import { netFaceAreasByElement, orientWalls } from "./lib/ifc-face-area.mjs";
import {
  collectFabric,
  collectServices,
  mergeFabric,
  writeGlb,
  SERVICE_GROUPS,
  SERVICE_COLOUR,
} from "./lib/ifc-glb.mjs";
import { collectServiceInstances } from "./lib/ifc-instances.mjs";
import { collectFlowNetwork, annotateFlow, serialiseFlow } from "./lib/ifc-flow.mjs";
import { measureSpaceMeshes } from "./lib/ifc-space-volume.mjs";

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
  /** What the 2,007.7 m² space-boundary sum on this file is, measured on 2026-09-04, so a reader finds it refuted. */
  boundaryDiagnosticsNote:
    "Space-boundary strip sums. INVALID as envelope areas: room-height not storey-height, " +
    "gross of openings, ~16% double-counted, missing 18 walls and 10 storefronts, and " +
    "including 60.17 m2 of chain-link fence. Diagnostic only.",
  /** Measured on this model: what the fabric GLB leaves out, and why the service GLBs are the size they are. */
  modelNote:
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
    /**
     * `raw`, not the LFS media host: this repository never used LFS, and
     * `media.githubusercontent.com` answers 404 for every file in it — the
     * architectural model included, so before 2026-09-04 this config could
     * only ever have run from a cache someone had filled by other means.
     */
    host: "raw",
    dir: "Design model IFC",
    /**
     * A second folder a file may name with `dir`. The coordination set lives
     * beside the design model, not under it, and its cache is kept apart so
     * a `desktop.ini`-sized name clash can never overwrite a design file.
     */
    dirs: {
      coordination: {
        path: "Coordination model and subcontractors models/BIMsight Projectdata1",
        cache: "schependomlaan-coordination",
      },
    },
  },
  /**
   * One architectural model plus the subcontractors' coordination set — the
   * top-level `BIMsight Projectdata1/` files, NOT the `ProjectData/`
   * duplicates. Every file below declares MILLIMETRE and no distribution
   * port (measured 2026-09-04, all 33 of them).
   *
   * Left out on purpose, and said here so the absence is a decision:
   *   - `JORDAHL-Gevelderagers.ifc` — façade anchors, invisible at building
   *     scale.
   *   - `V_L_Constructief.ifc` — 131 bytes, a pointer or an empty file.
   *   - The `.ifczip` / `.ifcZIP` archives (ROOT-*, LINDEN - Kozijnen): the
   *     ROOT set is the design model's own parts, already in the fabric.
   */
  files: [
    {
      role: "architectural",
      fileName: "IFC Schependomlaan.ifc",
      sha256: null,
    },
    // ── structure ── Tekla Structures 18.1, BERNTS
    { role: "bernts-steel", fileName: "BERNTS-Staalconstructie.ifc", dir: "coordination" },
    // ── precast ── iTConcrete (GEELEN), Tekla 19.1 (WAARDO), Tekla 20.1 (MULTICOM)
    { role: "geelen-v1", fileName: "GEELEN-Breedplaat V1.ifc", dir: "coordination" },
    { role: "geelen-v2", fileName: "GEELEN-Breedplaat V2.ifc", dir: "coordination" },
    { role: "geelen-v3", fileName: "GEELEN-Breedplaat V3.ifc", dir: "coordination" },
    { role: "geelen-roof", fileName: "GEELEN-Dakvloer.ifc", dir: "coordination" },
    { role: "waardo-hollowcore", fileName: "WAARDO-Kanaalplaatvloer.ifc", dir: "coordination" },
    { role: "multicom-balconies", fileName: "MULTICOM-balkons.ifc", dir: "coordination" },
    { role: "multicom-bands", fileName: "MULTICOM-banden.ifc", dir: "coordination" },
    { role: "multicom-stairs", fileName: "MULTICOM-trappen+bordessen.ifc", dir: "coordination" },
    // ── roofing ── EDM export (WILLEMSEN)
    { role: "willemsen-high", fileName: "WILLEMSEN-Hoogbouw.ifc", dir: "coordination" },
    { role: "willemsen-high-tiles", fileName: "WILLEMSEN-Hoogbouw dakpannen.ifc", dir: "coordination" },
    { role: "willemsen-low", fileName: "WILLEMSEN-Laagbouw.ifc", dir: "coordination" },
    { role: "willemsen-low-tiles", fileName: "WILLEMSEN-laagbouw dakpannen.ifc", dir: "coordination" },
    // ── railings ── HiCAD 2014 via ST-Developer (FEK)
    { role: "fek-balcony-2015-09", fileName: "BALKONHEKKEN 23-9-2015.IFC", dir: "coordination" },
    { role: "fek-balcony", fileName: "FEK - Balkonhekken en borstweringsleuningen.IFC", dir: "coordination" },
    { role: "fek-french", fileName: "FEK - Franse balkonhekken en doorvalbeveiliging.IFC", dir: "coordination" },
    { role: "fek-stair", fileName: "FEK - Traphekken.IFC", dir: "coordination" },
    // ── blockwork ── Xella's own exporter (XELLA storeys, YTONG plots)
    { role: "xella-ground", fileName: "XELLA-Begane grond.ifc", dir: "coordination" },
    { role: "xella-1", fileName: "XELLA-1e verdieping.ifc", dir: "coordination" },
    { role: "xella-2", fileName: "XELLA-2e verdieping.ifc", dir: "coordination" },
    { role: "xella-3", fileName: "XELLA-3e verdieping.ifc", dir: "coordination" },
    { role: "ytong-general", fileName: "YTONG-Algemeen.ifc", dir: "coordination" },
    { role: "ytong-01", fileName: "YTONG-Kavel 01.ifc", dir: "coordination" },
    { role: "ytong-02", fileName: "YTONG-Kavel 02.ifc", dir: "coordination" },
    { role: "ytong-03", fileName: "YTONG-Kavel 03.ifc", dir: "coordination" },
    { role: "ytong-04", fileName: "YTONG-Kavel 04.ifc", dir: "coordination" },
    { role: "ytong-05", fileName: "YTONG-Kavel 05.ifc", dir: "coordination" },
    { role: "ytong-06", fileName: "YTONG-Kavel 06.ifc", dir: "coordination" },
    { role: "ytong-07", fileName: "YTONG-Kavel 07.ifc", dir: "coordination" },
    { role: "ytong-08", fileName: "YTONG-Kavel 08.ifc", dir: "coordination" },
    { role: "ytong-09", fileName: "YTONG-Kavel 09.ifc", dir: "coordination" },
    { role: "ytong-10", fileName: "YTONG-Kavel 10.ifc", dir: "coordination" },
    // ── utilities ── SketchUp Pro 2015 (HB)
    { role: "hb-utilities", fileName: "HB_Nutsvoorzieningen.ifc", dir: "coordination" },
  ],

  /**
   * The subcontractors' models as layers. There is no MEP model in the
   * archive — measured: `HB_Nutsvoorzieningen.ifc` is 42 IfcBuildingElementProxy
   * and no IfcFlowSegment — so these are the trades that WERE coordinated:
   * steel, precast, roof, railings, blockwork, and the utility connections.
   *
   * `groups` maps the element types that ACTUALLY PRODUCE MESHES in each set
   * to one group per layer, and the list was taken from web-ifc's stream, not
   * from the entity table, because the two disagree in ways that matter:
   *   - XELLA's `IfcWallStandardCase`s carry no geometry; their
   *     `IfcBuildingElementPart` blocks do (710 parts on the first floor).
   *   - GEELEN's `IfcSlab`s are containers; the plank parts are
   *     `IfcBuildingElementProxy`.
   * A type listed here that never appears costs nothing; a meshed type left
   * off is silently absent from the layer, so each list is the measured set.
   *
   * One colour per layer, and the same hex is in `LAYER_COLOUR` in
   * `reference-building-workspace.tsx` so the swatch matches the geometry.
   */
  serviceLayers: [
    {
      id: "structure",
      roles: ["bernts-steel"],
      ko: "구조 (철골)",
      en: "Steel frame",
      // Bolts included: 121 `Bolt assembly` fasteners from 45 distinct
      // shapes, so they cost almost nothing and leaving them out would be a
      // quiet edit of the supplier's model.
      groups: { structure: ["IfcBeam", "IfcColumn", "IfcPlate", "IfcMechanicalFastener"] },
      colours: { structure: [0.42, 0.471, 0.537, 1] }, // #6b7889
    },
    {
      id: "precast",
      roles: [
        "geelen-v1", "geelen-v2", "geelen-v3", "geelen-roof",
        "waardo-hollowcore",
        "multicom-balconies", "multicom-bands", "multicom-stairs",
      ],
      ko: "프리캐스트 바닥·계단",
      en: "Precast floors & stairs",
      // WAARDO's single `IfcWall` named LIJNLAST-TRAP is a line-load marker
      // (12 triangles), not a wall; it is the one meshed element in these
      // eight files deliberately not drawn.
      groups: {
        precast: [
          "IfcBuildingElementProxy", "IfcSlab", "IfcBeam", "IfcPlate",
          "IfcMember", "IfcColumn", "IfcDiscreteAccessory", "IfcFastener",
        ],
      },
      colours: { precast: [0.722, 0.678, 0.62, 1] }, // #b8ad9e
    },
    {
      id: "roofing",
      roles: ["willemsen-high", "willemsen-high-tiles", "willemsen-low", "willemsen-low-tiles"],
      ko: "지붕 마감 (기와)",
      en: "Roof tiling",
      groups: { roofing: ["IfcBuildingElementProxy"] },
      colours: { roofing: [0.722, 0.38, 0.278, 1] }, // #b86147
    },
    {
      id: "railings",
      roles: ["fek-balcony-2015-09", "fek-balcony", "fek-french", "fek-stair"],
      ko: "난간·발코니",
      en: "Railings & balconies",
      groups: { railings: ["IfcBuildingElementProxy", "IfcBeam", "IfcPlate"] },
      colours: { railings: [0.8, 0.82, 0.851, 1] }, // #ccd1d9
    },
    {
      id: "blockwork",
      roles: [
        "xella-ground", "xella-1", "xella-2", "xella-3", "ytong-general",
        "ytong-01", "ytong-02", "ytong-03", "ytong-04", "ytong-05",
        "ytong-06", "ytong-07", "ytong-08", "ytong-09", "ytong-10",
      ],
      ko: "내벽 블록",
      en: "Internal blockwork",
      // The one `IfcBeam` per XELLA storey file is a `Vebo Latei` lintel.
      groups: { blockwork: ["IfcBuildingElementPart", "IfcBeam"] },
      colours: { blockwork: [0.902, 0.875, 0.659, 1] }, // #e6dfa8
    },
    {
      id: "utilities",
      roles: ["hb-utilities"],
      ko: "설비 인입",
      en: "Utility connections",
      groups: { utilities: ["IfcBuildingElementProxy"] },
      // Translucent, as the Clinic's equipment boxes are: a box says "this
      // volume is taken" and should not hide what stands inside it.
      colours: { utilities: [0.302, 0.749, 0.702, 0.55] }, // #4dbfb3
      /**
       * Boxes, and stated as such. The SketchUp export tessellates its 42
       * objects to 158,616 triangles (measured 2026-09-04) — more than the
       * steel frame, the blockwork and the roof tiles together — for shapes
       * that are, at building scale, a meter cabinet and a run of pipe.
       */
      boxes: true,
      note:
        "42 utility connections, drawn as boxes: the SketchUp export's " +
        "triangles carry no information a box does not.",
    },
  ],

  /**
   * Both sentences claim only what this build measured. The fabric GLB's
   * groups are read off `writeGlb`'s output (slab, wall, stair, glazing,
   * door, mullion); the layer figures are the six-layer build of 2026-09-04.
   */
  modelNote:
    "Building fabric from the architectural model only: walls, slabs, " +
    "stairs, glazing, doors and mullions. Nothing from the subcontractor " +
    "models is in this file — the steel frame, precast floors, roof tiling, " +
    "railings and blockwork are their own layers.",
  serviceNote:
    "Six layers from the 33 subcontractor models in the archive's " +
    "coordination set (BIMsight Projectdata1). Five carry each supplier's " +
    "geometry as modelled — a shape placed twice or more is stored once and " +
    "instanced, everything else is merged. Every file declares millimetres " +
    "and no distribution port, so no layer animates flow. The utilities " +
    "layer is the exception and says so under its row: its 42 SketchUp " +
    "objects are drawn as boxes.",

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

/**
 * Reference building #3 — the Duplex Apartment.
 *
 * The NIBS/buildingSMART Common BIM File, and the first model here that states
 * its SERVICES rather than its envelope: architectural, MEP, electrical and
 * plumbing models, plus COBie schedules and per-product data sheets. It states
 * no U-value at all (zero IfcThermalTransmittanceMeasure), so its fabric is
 * assumption and its plant is evidence — the mirror image of DigitalHub.
 *
 * Same licence and the same verifiable rights holder as the Clinic, which is
 * why it was chosen over richer models with no grant behind them.
 */
const DUPLEX = Object.freeze({
  id: "duplex-apartment",
  name: { ko: "듀플렉스 아파트", en: "Duplex Apartment" },
  summary: {
    ko: "buildingSMART 공개 표준 모델. 설비·전기·배관 모델을 모두 갖춘 2세대 주택.",
    en: "A two-dwelling house released as an open standard model, with its mechanical, electrical and plumbing models intact.",
  },
  useType: "apartment_building",
  licence: "CC BY 4.0",
  attribution:
    'BSI (2020) "Duplex Apartment Test Files", buildingSMART International — ' +
    "https://github.com/buildingsmart-community/Community-Sample-Test-Files",
  sourceUrl:
    "https://github.com/buildingsmart-community/Community-Sample-Test-Files",
  source: {
    owner: "buildingsmart-community",
    repo: "Community-Sample-Test-Files",
    ref: "main",
    dir: "IFC 2.3.0.1 (IFC 2x3)/Duplex Apartment",
  },
  files: [
    { role: "architectural", fileName: "Duplex_A_20110907.ifc" },
    { role: "rooms", fileName: "Duplex_M_20111024_ROOMS_AND_SPACES.ifc" },
    { role: "hvac", fileName: "Duplex_MEP_20110907.ifc" },
    { role: "electrical", fileName: "Duplex_Electrical_20121207.ifc" },
    { role: "plumbing", fileName: "Duplex_Plumbing_20121113.ifc" },
  ],
  serviceLayers: [
    { id: "hvac", role: "hvac", ko: "냉난방환기", en: "HVAC" },
    { id: "electrical", role: "electrical", ko: "전기", en: "Electrical" },
    { id: "plumbing", role: "plumbing", ko: "급탕/배관", en: "Plumbing" },
  ],

  /**
   * Rooms live in their own model. Measured: the architectural file holds
   * 10 spaces per level (141.79 + 134.53 m²) where ROOMS_AND_SPACES holds
   * 15 and 20 (264.97 + 264.49). It carries one dwelling's rooms; a duplex
   * has two.
   *
   * A third set is a decoy — `Duplex_MEP` has 42 spaces totalling 797.79 m²,
   * within 2 m² of the correct model, so a check on the TOTAL cannot separate
   * them. Only the names can: they read "Kitchen MEP Space", and they are
   * ventilation zones rather than rooms.
   */
  spacesRole: "rooms",

  /**
   * `IsExternal` is true on 23 of 57 walls and only 13 of those are envelope.
   * The other ten are two kinds of not-envelope, and both would inflate the
   * heat-loss area:
   *   - 4 `Party Wall - CMU Residential Unit Dimising Wall` separate the two
   *     dwellings. Conditioned on both sides, so no heat crosses them.
   *   - 6 `Foundation - Concrete` are below grade, a different boundary
   *     condition and a different U entirely.
   * Third building, third way `IsExternal` fails as an envelope filter.
   */
  exteriorWallMatch: "Exterior - Brick on Block",

  /**
   * Revit 2011, single-skin walls, and the file states no `NetSideArea` — the
   * same position as the Clinic, so the tessellated mesh is the only
   * measurement available and there is nothing to fall back to.
   */
  areaSource: "mesh",

  roofDatumM: 5.5,
});

/** Every building this script can build, selected with `--building <id>`. */
const BUILDINGS = Object.freeze({
  [CLINIC.id]: CLINIC,
  [SCHEPENDOMLAAN.id]: SCHEPENDOMLAAN,
  [DUPLEX.id]: DUPLEX,
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
  // A file comes from the building's folder unless it names one of the
  // building's other folders with `dir`. Schependomlaan's subcontractor set
  // sits beside the design model, not under it, and its cache is kept in a
  // sub-directory of its own so the two folders' names can never collide.
  const toUrl = src.host === "raw" ? githubRawUrl : githubLfsUrl;
  for (const file of building.files) {
    const named = file.dir ? src.dirs?.[file.dir] : null;
    if (file.dir && !named) {
      throw new Error(
        `"${file.fileName}" names dir "${file.dir}", which source.dirs does not declare.`,
      );
    }
    const remoteDir = named ? named.path : src.dir;
    const url = toUrl(src.owner, src.repo, src.ref, `${remoteDir}/${file.fileName}`);
    const cachePath = path.join(CACHE, named?.cache ?? "", file.fileName);
    const fetched = await fetchSource(url, cachePath, {
      expectedSha256: file.sha256,
    });
    sources.push({ ...file, ...fetched, cachePath, remoteDir });
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
  // Spaces may live in a model of their own. The Duplex ships its rooms in a
  // separate `ROOMS_AND_SPACES` file, and its architectural model carries only
  // one of the two dwellings' rooms — 276.32 m² of floor against a real
  // 529.46, so defaulting to `arch` would have made the building read about
  // twice as efficient as it is.
  //
  // Storeys come from the SAME file, not from `arch`: a space is linked to its
  // storey by expressID within one file, so a storey list from another model
  // cannot be matched against it.
  const spaceFile = byRole.get(building.spacesRole ?? "architectural") ?? arch;
  const storeys = extractStoreys(spaceFile, webIfc);
  const spaces = extractSpaces(spaceFile, webIfc, storeys);
  const floorSpaces = spaces.filter((s) => s.countsAsFloorArea);
  // Volume and plan extent of every space, from its own solid. The Clinic
  // states no volume quantity anywhere, so until this pass the conditioned
  // volume was a range (Σ floor × floor-to-floor, or slab × roof datum) with
  // the two-storey concourse somewhere between the two. A closed solid has an
  // exact volume, and the ventilation term multiplies it directly.
  const spaceMeshes = measureSpaceMeshes(api, webIfc, spaceFile.modelId);
  const r2 = (n) => Math.round(n * 100) / 100;
  const storeyById = new Map(storeys.map((s) => [s.id, s]));
  // Double-height air is sometimes its own space (OPEN TO BELOW) and
  // sometimes only the upper part of a tall room's solid. A tall room whose
  // upper part is ALSO a void row must stop at its storey, or that column of
  // air is counted twice; a tall room with nothing modelled above it — the
  // Duplex's 3.98 m foyer under a 3.10 m storey, the Clinic's 9.25 m lift
  // shaft — is the only record of its air, and its solid is the truth. So
  // the test is per room: is there a void solid overlapping it in plan that
  // begins where its storey ends?
  const voidSolids = spaces
    .filter((sp) => !sp.countsAsFloorArea && sp.countsAsConditionedVolume)
    .map((sp) => spaceMeshes.get(sp.expressID))
    .filter(Boolean);
  const hasVoidAbove = (mesh, storeyTopM) =>
    voidSolids.some(
      (v) =>
        v.minY < mesh.maxY - 0.01 &&
        v.maxY > storeyTopM + 0.01 &&
        v.minX < mesh.maxX && v.maxX > mesh.minX &&
        v.minZ < mesh.maxZ && v.maxZ > mesh.minZ,
    );
  const spaceRows = spaces.map((s) => {
    const mesh = spaceMeshes.get(s.expressID) ?? null;
    const meshHeight = mesh ? mesh.maxY - mesh.minY : null;
    // A stated IfcQuantityVolume wins. Otherwise the solid, when it is a
    // closed one; otherwise floor area × the solid's height, which is exact
    // for a prismatic room and an upper bound for a sloped one — and the
    // source says which of the three it was. Five of the Duplex's 37 room
    // solids failed the closed test (a 10 m² hallway read 128 m³), so this
    // branch is not theoretical.
    let netVolumeM3 = null;
    let netVolumeSource = null;
    if (s.volumeM3 != null) {
      netVolumeM3 = s.volumeM3;
      netVolumeSource = "quantity";
    } else if (mesh && mesh.closed) {
      netVolumeM3 = r2(mesh.volumeM3);
      netVolumeSource = "mesh";
    } else if (mesh && s.floorAreaSqm != null && meshHeight > 0) {
      netVolumeM3 = r2(s.floorAreaSqm * meshHeight);
      netVolumeSource = "area × solid height (solid not closed)";
    }
    // Gross conditioned volume, the quantity an infiltration rate is quoted
    // against: everything inside the air barrier, ceiling plenums included.
    // A floor-counting room is its floor area × its storey's floor-to-floor
    // (or its own solid's height where the storey has nothing above it); a
    // void (OPEN TO BELOW) is its own solid, which already runs from the
    // storey it sits on up to whatever closes it. Summing the two never
    // counts a slab of air twice: the room below a void stops at its storey
    // height, and the void starts there.
    const storey = s.storeyId ? storeyById.get(s.storeyId) : null;
    let grossVolumeM3 = null;
    let grossVolumeBasis = null;
    if (s.countsAsFloorArea && s.floorAreaSqm != null) {
      if (storey && storey.floorToFloorHeightM > 0) {
        const byStorey = r2(s.floorAreaSqm * storey.floorToFloorHeightM);
        // A room taller than its storey — the Duplex's 3.98 m foyer under a
        // 3.10 m storey — runs up through the level above, whose floor area
        // does not include it. Its own solid is the larger and the truer.
        const storeyTopM = storey.elevationM + storey.floorToFloorHeightM;
        if (
          netVolumeM3 != null &&
          netVolumeM3 > byStorey &&
          mesh &&
          !hasVoidAbove(mesh, storeyTopM)
        ) {
          grossVolumeM3 = netVolumeM3;
          grossVolumeBasis = "own solid (taller than its storey, no void modelled above it)";
        } else {
          grossVolumeM3 = byStorey;
          grossVolumeBasis = "floor area × storey floor-to-floor";
        }
      } else if (meshHeight != null && meshHeight > 0) {
        grossVolumeM3 = r2(s.floorAreaSqm * meshHeight);
        grossVolumeBasis = "floor area × own solid's height (top storey)";
      }
    } else if (s.countsAsConditionedVolume && netVolumeM3 != null) {
      grossVolumeM3 = netVolumeM3;
      grossVolumeBasis = "own solid (void above a counted floor)";
    }
    return Object.freeze({
      id: s.id,
      name: s.name,
      longName: s.longName,
      storeyId: s.storeyId,
      floorAreaSqm: s.floorAreaSqm,
      areaQuantityName: s.areaQuantityName,
      countsAsFloorArea: s.countsAsFloorArea,
      countsAsConditionedVolume: s.countsAsConditionedVolume,
      excludedFromFloorAreaReason: s.excludedFromFloorAreaReason,
      // A stated IfcQuantityVolume wins over the mesh when the file carries
      // one; the Clinic carries none, so every row here is "mesh".
      /** Air below the ceiling, from the space's own solid where it is closed. */
      netVolumeM3,
      netVolumeSource,
      /** False when the tessellated solid failed the closed-mesh test; see ifc-space-volume.mjs. */
      solidClosed: mesh ? mesh.closed : null,
      /** Inside the air barrier, plenum included — see the note above. */
      grossVolumeM3,
      grossVolumeBasis,
      // Plan-axis bounding box in the fabric GLB's frame (Y up, metres).
      extent: mesh
        ? {
            x: r2((mesh.minX + mesh.maxX) / 2),
            z: r2((mesh.minZ + mesh.maxZ) / 2),
            widthM: r2(mesh.maxX - mesh.minX),
            depthM: r2(mesh.maxZ - mesh.minZ),
            bottomM: r2(mesh.minY),
            topM: r2(mesh.maxY),
          }
        : null,
      ref: s.ref,
    });
  });
  const conditionedRows = spaceRows.filter(
    (s) => s.countsAsConditionedVolume && s.netVolumeM3 != null,
  );
  const roomVolumeNetM3 = r2(
    conditionedRows.reduce((sum, s) => sum + s.netVolumeM3, 0),
  );
  const grossRows = spaceRows.filter((s) => s.grossVolumeM3 != null);
  const conditionedVolumeGrossM3 = r2(
    grossRows.reduce((sum, s) => sum + s.grossVolumeM3, 0),
  );
  const unmeasuredConditioned = spaceRows.filter(
    (s) => s.countsAsConditionedVolume && s.netVolumeM3 == null,
  ).length;
  const openSolids = spaceRows.filter((s) => s.solidClosed === false).length;
  // Net is air below the ceiling; gross is everything inside the air barrier.
  // The first is a subset of the second by construction, so a row where it
  // is not is a measurement that went wrong, and it stops the build here
  // rather than reaching a manifest — which is exactly how the Duplex's
  // flipped-winding solids were caught (net 1,749 m³ against gross 1,588).
  for (const s of spaceRows) {
    if (s.netVolumeM3 != null && s.grossVolumeM3 != null && s.netVolumeM3 > s.grossVolumeM3 + 0.01) {
      throw new Error(
        `Space ${s.id} (${s.longName ?? s.name}): net volume ${s.netVolumeM3} m3 exceeds gross ${s.grossVolumeM3} m3 ` +
          `(net from ${s.netVolumeSource}, gross from ${s.grossVolumeBasis}). Net is a subset of gross by definition.`,
      );
    }
  }
  if (roomVolumeNetM3 > conditionedVolumeGrossM3 + 0.01) {
    throw new Error(
      `Net room volume ${roomVolumeNetM3} m3 exceeds gross conditioned volume ${conditionedVolumeGrossM3} m3.`,
    );
  }
  // The names actually excluded from the conditioned volume on THIS
  // building, so the note never mentions a room the building does not have.
  const excludedNames = [
    ...new Set(
      spaceRows
        .filter((s) => !s.countsAsConditionedVolume)
        .map((s) => (s.longName ?? s.name).trim().toUpperCase()),
    ),
  ].sort();
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
    // A layer may be ONE file (the Clinic's three disciplines) or MANY: the
    // apartment's subcontractor set has eleven blockwork files and four
    // roofing ones, because each supplier delivered its own model. `role`
    // stays for the single-file case; `roles` is the list form. Merging
    // happens on collectServiceInstances' OUTPUT rather than inside it,
    // because its internal keys are `group:geometryExpressID` and express IDs
    // are per-model — merging any earlier would silently treat two different
    // suppliers' geometry #123 as one shape.
    const roles = layer.roles ?? [layer.role];
    const layerFiles = roles.map((r) => byRole.get(r)).filter(Boolean);
    if (layerFiles.length === 0) continue;

    const collected = { groups: new Map(), instanced: [], stats: { elements: 0, distinctGeometries: 0 } };
    const flowCounts = {};
    let flowReason = null;
    let flowWavelengthM = null;
    const flowSegments = [];

    for (const file of layerFiles) {
      // `boxes` is a stated simplification, never a quiet decimation: the
      // layer's `note` says so on the page, and every element still gets a
      // box at its real position and extent. Used where a model's triangles
      // carry nothing a box does not — Schependomlaan's SketchUp utilities.
      const part = layer.boxes
        ? (({ groups, proxied }) => ({
            groups,
            instanced: [],
            stats: { elements: proxied, distinctGeometries: 0 },
          }))(
            collectServices(api, webIfc, file.modelId, {
              serviceGroups: layer.groups ?? SERVICE_GROUPS,
              detailedTypes: [],
            }),
          )
        : collectServiceInstances(api, webIfc, file.modelId, {
            serviceGroups: layer.groups ?? SERVICE_GROUPS,
          });
      // Self-contained already — one geometry plus its own transforms.
      collected.instanced.push(...part.instanced);
      for (const [name, bucket] of part.groups) {
        let into = collected.groups.get(name);
        if (!into) {
          into = { positions: [], normals: [], indices: [], vertexCount: 0 };
          collected.groups.set(name, into);
        }
        // Indices are local to their bucket, so they shift by however many
        // vertices are already in the merged one.
        // Appended with loops, NOT `push(...bucket.positions)`. A merged
        // bucket holds hundreds of thousands of floats and spreading one into
        // push() passes them as arguments — "Maximum call stack size
        // exceeded", on the first real building this ran against.
        const base = into.vertexCount;
        for (const v of bucket.positions) into.positions.push(v);
        for (const v of bucket.normals) into.normals.push(v);
        for (const i of bucket.indices) into.indices.push(i + base);
        into.vertexCount += bucket.vertexCount;
      }
      collected.stats.elements += part.stats.elements;
      collected.stats.distinctGeometries += part.stats.distinctGeometries;

      const f = serialiseFlow(annotateFlow(collectFlowNetwork(api, webIfc, file.modelId)));
      flowSegments.push(...f.segments);
      for (const [k, v] of Object.entries(f.counts)) {
        flowCounts[k] = (flowCounts[k] ?? 0) + v;
      }
      // A layer that cannot animate must still say why, so the first stated
      // reason is kept rather than the last empty one.
      if (!flowReason && f.reason) flowReason = f.reason;
      if (flowWavelengthM === null) flowWavelengthM = f.wavelengthM;
    }

    const written = await writeGlb(
      path.join(outDir, `${layer.id}.glb`),
      collected.groups,
      {
        generator,
        colours: layer.colours ?? SERVICE_COLOUR,
        instanced: collected.instanced,
      },
    );
    // The routed network, direction included, from the model's own ports.
    // Written as its own file for the same reason the GLB is: a reader who
    // never switches flow on should never pay for it.
    // Reassembled in `serialiseFlow`'s exact shape and key order. The
    // viewer (`flow-network.tsx`) accepts a document only when its `kind` is
    // "bimfit_flow_network", so a merged object that dropped the header would
    // be a file the page fetches and silently never draws — and the committed
    // Clinic flow files, written by the single-file loop, must come out
    // byte-identical from this one.
    const flow = {
      kind: "bimfit_flow_network",
      schemaVersion: 1,
      wavelengthM: flowWavelengthM,
      counts: flowCounts,
      reason: flowReason,
      segments: flowSegments,
    };
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
       * Present only where the layer is NOT the model's own geometry, and
       * rendered under the layer's row. A layer drawn as boxes with no such
       * sentence would be the Clinic's opaque-elevator mistake again — a
       * shape that is right and a claim that is not.
       */
      ...(layer.note ? { note: layer.note } : {}),
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
        `flow ${flow.counts.drawnEdges ?? 0}/${flow.counts.connections ?? 0} directed` +
        (layerFiles.length > 1 ? ` (${layerFiles.length} files)` : ""),
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
      // Which folder of the repository the file came from, when it is not
      // the building's own. Two files of the same name in two folders are
      // two different files, and the record has to be able to say which.
      ...(s.dir ? { dir: s.remoteDir } : {}),
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
      /**
       * Two volumes, because they answer different questions and the file
       * states neither as a quantity.
       *
       * `conditionedVolumeGrossM3` is everything inside the air barrier —
       * each floor-counting room as floor area × storey floor-to-floor, plus
       * each OPEN TO BELOW void as its own solid. This is the volume an
       * infiltration rate (ACH50) is quoted against, and what the
       * ventilation term multiplies.
       *
       * `roomVolumeNetM3` is the sum of the space solids as modelled, which
       * stop at the ceilings: the air people stand in, plenums excluded. It
       * is the smaller number and it is NOT the engine's volume.
       */
      conditionedVolumeGrossM3,
      roomVolumeNetM3,
      volumeNote:
        `Gross from ${grossRows.length} spaces (floor area × storey height; voids, and rooms taller than their storey with no void above, as their own solids); ` +
        `net from ${conditionedRows.length} space solids` +
        (excludedNames.length > 0 ? `, ${excludedNames.join(" and ")} excluded` : "") +
        (openSolids > 0
          ? `; ${openSolids} solids failed the closed-mesh test and are counted as floor area × their own height`
          : "") +
        (unmeasuredConditioned > 0
          ? `; ${unmeasuredConditioned} conditioned spaces have no solid and are in neither figure`
          : "") +
        ". A closed tessellation's signed volume is exact.",
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
    /** Every level the file declares, lowest first — including datums that hold no rooms. */
    storeys: storeys.map((s) => ({
      id: s.id,
      name: s.name,
      elevationM: s.elevationM,
      floorToFloorHeightM: s.floorToFloorHeightM,
      spaceCount: spaces.filter((sp) => sp.storeyId === s.id).length,
      floorAreaSqm: round(
        floorSpaces
          .filter((sp) => sp.storeyId === s.id)
          .reduce((sum, sp) => sum + (sp.floorAreaSqm ?? 0), 0),
      ),
      ref: s.ref,
    })),
    spacesFile: "spaces.json",
    serviceLayers,
    model: {
      file: "model.glb",
      byteLength: glb.byteLength,
      triangleCount: glb.triangleCount,
      groups: glb.groups,
      /**
       * Per building, because the sentences carry the building's own figures.
       * Until 2026-09-04 both were the Clinic's text emitted for every
       * building, so Schependomlaan's manifest claimed "82% of the model's
       * triangles" and "plumbing ships 402 shapes" about a model with no
       * plumbing — the label failure this repository is defined against, in
       * the file that exists to prevent it. A building without its own
       * sentence gets the generic one, which claims no number.
       */
      note:
        building.modelNote ??
        "Building fabric only: walls, slabs, roofs and openings. Furniture, " +
          "fixtures, railings and the structural frame are not in this file.",
      ...(serviceLayers.length > 0
        ? {
            serviceNote:
              building.serviceNote ??
              "Service layers carry every component at the model's own geometry; " +
                "a repeated shape is stored once and placed by instancing.",
          }
        : {}),
    },
    /**
     * Recorded so a future reader who recomputes a space-boundary sum finds it
     * already refuted rather than concluding the extraction lost a third of
     * the building.
     */
    invalidDiagnostics: {
      ...classification.invalidAreaDiagnostics,
      // A building whose boundary sum was refuted in detail keeps its own
      // sentence; the generic one claims only what every file shares.
      ...(building.boundaryDiagnosticsNote
        ? { note: building.boundaryDiagnosticsNote }
        : {}),
    },
  };

  // One row per IfcSpace, so the page can show rooms by storey and program
  // without re-reading the IFC — the manifest stays aggregate.
  await writeFile(
    path.join(outDir, "spaces.json"),
    `${JSON.stringify({ kind: "bimfit_reference_building_spaces", id: building.id, spaces: spaceRows }, null, 2)}\n`,
    "utf8",
  );

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
  console.log(
    `    spaces.json    ${spaceRows.length} spaces, volume gross ${conditionedVolumeGrossM3} m3 / net ${roomVolumeNetM3} m3`,
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
