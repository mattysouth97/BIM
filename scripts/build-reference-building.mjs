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

import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  slug,
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
import { ARCHITECTURAL_DETAIL_SOURCES, buildArchitecturalDetails } from "./lib/ifc-architectural-details.mjs";
import { buildAdditionalMepLayer, buildMepCoverage } from "./lib/ifc-mep-coverage.mjs";
import { collectFlowNetwork, annotateFlow, serialiseFlow } from "./lib/ifc-flow.mjs";
import { measureSpaceMeshes } from "./lib/ifc-space-volume.mjs";
import { allSpaceBoundaries, withMeasuredSpaceAreas } from "./lib/ifc-space-evidence.mjs";
import {
  spaceFootprints,
  spaceBoundaryIndex,
  collectHorizontalElements,
  dedupeByGlobalId,
  classifyRoofs,
  measureRoofs,
  measureGroundSlabs,
  roofFamily,
} from "./lib/ifc-horizontal.mjs";
import { roofPlanes, roofPlanesSvg, ROOF_PLANE_CONSTANTS } from "./lib/ifc-roof-planes.mjs";
import { collectSpaceSolids, openingApertures, summariseApertures } from "./lib/ifc-openings.mjs";

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
  /**
   * What the earlier, hand-derived standing-seam figure was. Measured
   * 2026-09-04: the five IfcRoof are IfcFaceBasedSurfaceModels with both
   * sheets wound upward; the faces within 26° of horizontal (|n_y| > 0.9)
   * sum to 764.56 m² across both sheets, and 764.56 ÷ 2 = 382.28 is the
   * figure bs-medical-dental-clinic-energy.ts carries as "projected". It is
   * the near-horizontal part of one sheet's SURFACE, with the steeper barrel
   * flanks left out and no cosine applied — neither the plan shadow (432.66
   * per element, 384.44 as one type) nor the full surface. Said here so the
   * next reader does not re-derive 382.28 and take it for a projection.
   */
  roofNote:
    "The five Standing Seam Metal Roof IfcRoof are IfcFaceBasedSurfaceModels " +
    "with both sheets wound upward. The 382.28 m² carried earlier as their " +
    "'projected' area is 764.56 ÷ 2, where 764.56 is the sum of the faces " +
    "within 26° of horizontal (|n_y| > 0.9) over both sheets: the " +
    "near-horizontal part of one sheet's surface, steeper flanks omitted and " +
    "no cosine applied — neither the shadow nor the full surface. Their " +
    "shadows sum to 432.66 m² and union to 384.44 m² (consecutive sections " +
    "telescope ~1.8 m along the spine); their one-sheet surface is larger " +
    "than both, as a pitched roof's must be.",
  /**
   * Curtain walls excluded from the glazing aperture BY NAME, each with its
   * reason stated. Everything else a curtain wall loses is decided by
   * geometry in `ifc-openings.mjs` — the interior atrium screens by a room on
   * both sides, the mirrored pair #879/#881 by coincident bounds.
   */
  openings: {
    curtainWallExclude: [
      {
        match: "Chain Link Fence",
        reason:
          "a chain-link fence around the mechanical yard: a storefront panel by name and by " +
          "structure (IfcCurtainWall → IfcPlate), and not envelope. The same fence already " +
          "pollutes this model's space-boundary sum — see invalidDiagnostics.",
      },
    ],
  },
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
   * Roof slabs the file types as FLOOR. Measured 2026-09-04: a type-only
   * rule (IfcRoof, IfcSlab ROOF, IfcCovering ROOFING) finds 62 elements and
   * 136 m² of pitched `sporenkap` on a four-storey block whose ground floor
   * covers 346 m². The flat decks are `IfcSlab` with `PredefinedType FLOOR`:
   * `dakvloer` (9 slabs at 11.62–11.84 m, on storey '04 dak' — the deck over
   * the top storey), `plat dak` (6 slabs at 5.67–5.84 m on '02 tweede
   * verdieping' — the low-rise wing's flat roof) and `lifttop` (1 slab at
   * 12.60–12.80 m). Declared here by name, and every row in `roofs` says
   * whether its basis was the type or this list.
   *
   * NOT declared, deliberately: `gootconstructie` (gutters, 12 slabs),
   * `prefab balkon` (balconies, 3), `dakelement` FLOOR (0.01 m²), and the
   * 5.22 m² FLOOR-typed `dakisolatie` at 12.80–12.91 m, which by elevation
   * and plan sits directly on the 5.75 m² lifttop already counted.
   */
  roofSlabMatch: ["dakvloer", "plat dak", "lifttop"],
  roofNote:
    "The file types its flat roof decks as IfcSlab FLOOR — dakvloer (9 slabs " +
    "at 11.62–11.84 m on storey '04 dak'), plat dak (6 at 5.67–5.84 m, the " +
    "low-rise wing) and lifttop (1 at 12.60–12.80 m) — so they are declared " +
    "roof by name; a type-only rule found 136 m² of roof on a four-storey " +
    "block. gootconstructie (gutters), prefab balkon (balconies) and the " +
    "FLOOR-typed dakisolatie stacked on the lifttop are not declared. The " +
    "pitched sporenkap is exported as stacked layer solids, which is why its " +
    "upward-face sum exceeds its shadow.",

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

  /**
   * ArchiCAD exports every window and door frame twice over: the opening
   * itself (`merk B2sp`, `merk A`…) and one `stelkozijn` sub-frame per leaf
   * that states no OverallWidth/OverallHeight at all. 182 of 259 IfcWindow
   * and 65 of 205 IfcDoor are such sub-frames; named here so they are
   * excluded as a stated fact rather than falling out as "no dimensions".
   */
  openings: {
    subFrameNames: ["stelkozijn"],
  },
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
   * Rooms live in their own model. `ROOMS_AND_SPACES` subdivides the plan more
   * finely than the architectural file — it states 18 rooms where `Duplex_A`
   * states 20, folding each unit's stair into the hallway (hallway 12.13 m²
   * against `Duplex_A`'s 7.80 m² + 4.92 m² stair).
   *
   * A CORRECTION to what this comment said until 2026-09-06. It read: "the
   * architectural file holds 10 spaces per level (141.79 + 134.53 m²) where
   * ROOMS_AND_SPACES holds 15 and 20 (264.97 + 264.49). It carries one
   * dwelling's rooms; a duplex has two." The first sentence's numbers are
   * right and the explanation of them is wrong. `Duplex_A` holds A101-A105
   * AND B101-B105 on Level 1 — both dwellings, five rooms each — so it is not
   * short a dwelling. What actually made the rooms file twice the size is
   * `analyticalPropertySets` below: it states every room twice. And the
   * direction was inverted too — a larger floor area makes a building read
   * MORE efficient, not less, so the trap was never the one described.
   *
   * A third set is a decoy — `Duplex_MEP` has 42 spaces totalling 797.79 m²,
   * within 2 m² of this file's UNFILTERED 799.76, so a check on the TOTAL
   * cannot separate them. Only the names can: they read "Kitchen MEP Space",
   * and they are ventilation zones rather than rooms.
   */
  spacesRole: "rooms",

  /**
   * The property sets that mark an `IfcSpace` as Revit's ANALYTICAL space
   * rather than a room. `classifyAnalyticalSpace` explains the trap; this is
   * the signature measured on this file, and `analyticalSplit` is the result
   * it must reproduce.
   *
   * Measured 2026-09-06 over all 37 rows: 18 carry all four of these sets and
   * 19 carry none of them — no row carries some. Both copies of a room state
   * the same Name, LongName and plan position, so no name rule and no geometry
   * test can tell them apart; the analysis psets are the only discriminator in
   * the file. The 19 kept rows reproduce `Duplex_A_20110907.ifc`'s own
   * `GSA BIM Area` values, which is the check that says the right half was
   * kept.
   */
  analyticalPropertySets: [
    "PSet_Revit_Energy Analysis",
    "PSet_Revit_Mechanical - Airflow",
    "PSet_Revit_Electrical - Loads",
    "PSet_Revit_Electrical - Lighting",
  ],

  /**
   * What the split above must produce. 18 analytical + 19 kept = 37 rows, and
   * of the 19 kept, 18 are floor and one is the ROOF space the name rules
   * drop separately — so `rooms` counts the floor-counting survivors.
   *
   * `A104 Bathroom 1` is the one room with no analytical twin: the file simply
   * has no Space over it. That asymmetry is the reason the ROOM set is kept
   * rather than the analytical one — keeping the analytical set would silently
   * lose a bathroom.
   */
  analyticalSplit: { analyticalSpaces: 18, rooms: 18, unpairedRooms: ["A104"] },

  /**
   * How this building's coordinate is to be judged. Declared, because the
   * fallback test is the Clinic's specific Boston point and this file's
   * coordinate is a different one — left undeclared it would fall through and
   * be reported as an ordinary unverified location, which is weaker than what
   * the file actually says about itself.
   *
   * The tell here is not the coordinate at all. It is that the template was
   * never filled in, stated three separate ways in the file:
   *   - `IfcSite.Name` is the literal string `'Default'`;
   *   - `IfcPostalAddress.AddressLines` is `('Enter address here')` — the
   *     authoring tool's own placeholder prompt, still in place;
   *   - `IfcSite.RefElevation` is `-0.`, a signed zero, i.e. unset.
   * `Town` reads 'Chicago' and `Region` 'IL', which is what the template
   * shipped with and not a statement about this building — so unlike
   * Schependomlaan, which states Nijmegen on two entities and is merely
   * unusable, this model states no location at all.
   */
  location: {
    rejectCoordinate: true,
    /** Nothing to fall back to: the town is part of the unfilled template. */
    statedTown: null,
    /** TrueNorth is `$` — absent — in BOTH representation contexts. */
    trueNorthStated: false,
    note:
      "IfcSite is an unfilled Autodesk Revit Architecture 2011 template: its " +
      "Name is the literal 'Default', its postal address line is still the " +
      "placeholder 'Enter address here', and its RefElevation is a signed " +
      "zero. The 41.8744 N, 87.6394 W coordinate and the 'Chicago', 'IL' " +
      "town and region are the template's own, not a survey and not a " +
      "statement about this building, so no position, orientation, climate " +
      "or solar geometry may be taken from any of them. TrueNorth is absent " +
      "($) in both the Model and Plan representation contexts, so the model " +
      "states no orientation either.",
  },

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

/**
 * Reference building #4 — the FZK Haus.
 *
 * KIT/IAI's "Simple Phantasy Building", ArchiCAD 20, IFC4, from
 * `https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples` — chosen over
 * the cached DigitalHub set (four IFCs, `%LOCALAPPDATA%\Temp\bimfit-reference-buildings\FM_*`)
 * because DigitalHub's own metadata states no reuse licence: DataCite's
 * record for its DOI (`10.18154/RWTH-2020-12381`) carries an empty
 * `rightsList`, and the repository's own OAI-PMH record's `dc:rights` is
 * `info:eu-repo/semantics/openAccess` — an access-rights term, not a licence.
 * Full finding in `docs/04_Agent-Handoffs/2026-09-06-gallery-consistency-visuals-brief.md`
 * under Lane 1B. KIT's grant, by contrast, is explicit and read from the
 * source: `Template:Example-Source`, transcluded onto the KIT_IFC_Examples
 * page, states in full "these examples are made by the Institute for
 * Applied Computer Science (IAI) at the Karlsruhe Institute of Technology
 * (KIT), and are for unrestricted use", with a named attribution string.
 *
 * The first building here with genuinely usable STATED U-values — not a
 * documented zero (Schependomlaan: 97 occurrences, all `0.`) and not absent
 * (Duplex: none at all). All 33 envelope-relevant elements (13 walls + 11
 * windows + 5 doors + 4 slabs) carry exactly one `IfcPropertySingleValue`
 * named `ThermalTransmittance`, non-zero and plausible for German
 * pre-WSchV/WSchV-era construction (exterior wall 0.4, interior partition
 * 1.5 — irrelevant to heat loss but present, window 1.4, exterior door 1.4,
 * ground slab 0.4, mezzanine floor 0.5, roof 0.3). Every element ALSO carries
 * an `IfcMaterialLayerSetUsage` with a real single-layer thickness (0.3 m
 * exterior wall / 0.24 m interior / 0.2 m slabs) — the criterion the 09-04
 * selection note asked for — though the material itself is a generic
 * ArchiCAD "Solid" for the slabs, so the thickness is real and the material
 * name is not; the stated U carries the physics, not a layer-conductivity
 * derivation.
 *
 * No services model of any kind (no MEP, electrical or plumbing IFC exists
 * for this building) — the inverse of DigitalHub and the mirror image of the
 * Duplex/DigitalHub framing already written for #3: this building states
 * ONLY its envelope, cleanly, and nothing else. `serviceLayers` is empty by
 * fact, not by omission.
 *
 * Site: `IfcSite` states `RefLatitude (49,6,1,566000)`,
 * `RefLongitude (8,26,11,540400)` → 49.100435N, 8.436539E — Eggenstein-
 * Leopoldshafen, the actual site of Forschungszentrum Karlsruhe (FZK, KIT
 * Campus North) the file is named for. Unlike Schependomlaan's coordinate
 * (52°09'/5°23' to the exact minute, zero seconds — a stamped datum
 * constant), this one carries fractional seconds (1.566", 11.5404") and
 * plots to the model's own naming institution, so it reads as a real
 * surveyed site rather than a tool default — carried as a stated fact, not
 * upgraded to a "surveyed" claim beyond what the digits themselves show.
 * `IfcPostalAddress` states no town, so the town name (Eggenstein-
 * Leopoldshafen / Karlsruhe) is read FROM the coordinate, not from a stated
 * place name — record it as derived, not stated, when it reaches the energy
 * inputs.
 */
const FZK_HAUS = Object.freeze({
  id: "fzk-haus",
  name: { ko: "FZK 하우스", en: "FZK House" },
  summary: {
    ko: "KIT(카를스루에 공과대학교) IAI가 공개한 검증용 단독주택 표준 모델.",
    en: "KIT's (Karlsruhe Institute of Technology) open validation single-family house.",
  },
  useType: "single_family_house",
  licence: "KIT/IAI unrestricted use (attribution required)",
  attribution:
    "Institute for Automation and Applied Informatics (IAI), Karlsruhe " +
    'Institute of Technology (KIT), "AC20-FZK-Haus" — ' +
    "https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples",
  sourceUrl: "https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples",
  files: [
    {
      role: "architectural",
      fileName: "AC20-FZK-Haus.ifc",
      url: "http://www.ifcwiki.org/images/e/e3/AC20-FZK-Haus.ifc",
    },
  ],
  serviceLayers: [],

  /**
   * The file states no `IsExternal` on any of its 13 walls at all (not one
   * true, not one false — the property is simply absent, a fourth way the
   * predicate can fail, distinct from Duplex's "true but wrong on 10 of
   * 23"). Naming carries the whole distinction instead, and does so without
   * ambiguity: 8 walls named `Wand-Ext-{ERDG,OG}-#` (German "exterior wall,
   * ground/upper floor"), 5 named `Wand-Int-ERDG-#` ("interior wall").
   */
  exteriorWallMatch: "Wand-Ext",

  /**
   * ArchiCAD's own Qto_WallBaseQuantities is present on every wall in
   * ENGLISH (`NetSideArea`, `GrossSideArea`, …) alongside a duplicate
   * German-language property set — the same shape as the Clinic and Duplex,
   * a quantity take-off export rather than a bare coordination model
   * (the file's own header names `QuantityTakeOffAddOnView`). Stated
   * exterior `NetSideArea` sums to 136.28 m² (85.66 ground + 50.62 upper);
   * interior partitions (excluded from the envelope) sum to 54.19 m².
   */
  areaSource: "stated_first",

  /**
   * The upper-storey ("Dachgeschoss") exterior walls are gable ends of
   * variable height (0.5-3.39 m) rising from the 2.7 m storey datum to the
   * ridge; 2.7 m is where the roof zone begins.
   */
  roofDatumM: 2.7,

  /**
   * Both roof decks (`Dach-1`, `Dach-2`, 82.56 m² each by NetArea, 71.5 m²
   * each by the file's own projected `Fläche`) are `IfcSlab` typed
   * `PredefinedType=ROOF` directly — `classifyRoofs` picks them up with no
   * `nameMatch` needed, the one trap the first three buildings each hit in
   * a different shape (Duplex/Schependomlaan type their flat decks FLOOR
   * and need a name list; the Clinic's are `IfcRoof` proper). Fourth
   * building, fourth outcome: this one needed nothing extra at all.
   *
   * `Slab-033` (the mezzanine/gallery floor at 2.7 m, `PredefinedType=FLOOR`,
   * NetArea 99.84 m², a 15.80 m² void where the stairwell/double-height
   * living space opens through it) is correctly excluded by the same
   * PredefinedType test — it separates two conditioned storeys and is not
   * envelope on either count basis.
   */
  roofNote:
    "Dach-1 and Dach-2 are IfcSlab typed PredefinedType=ROOF directly, so " +
    "classifyRoofs matches them with no nameMatch list. Slab-033 " +
    "(PredefinedType=FLOOR, the 2.7 m mezzanine floor under the Galerie) is " +
    "correctly excluded as an interior floor, not envelope.",

  /**
   * The upper storey's one IfcSpace, "Galerie" (107.16 m² GrossFloorArea),
   * is larger than the mezzanine's own physical floor slab (Slab-033, net
   * 99.84 m²) and than either roof deck's projected shadow (71.5 m² each).
   * Plausible for an open gallery overlooking a double-height living room
   * under a full-width pitched roof, but not independently cross-checked
   * against a plan drawing — recorded as read from the file's own stated
   * GrossFloorArea quantity, not re-derived or verified against the
   * building's other stated areas the way the Clinic's space list was.
   */
  spacesNote:
    "The Dachgeschoss space 'Galerie' (107.16 m²) exceeds its own storey's " +
    "physical floor slab (Slab-033, 99.84 m² net) and the roof's projected " +
    "footprint (71.5 m² per deck) — plausible for an open mezzanine over a " +
    "double-height room, taken as stated (GrossFloorArea quantity) and not " +
    "independently re-derived.",
});

/** KIT/IAI's explicitly fictional office example; licence verified at source. */
const KIT_OFFICE = Object.freeze({
  id: "kit-office",
  name: { ko: "KIT 오피스", en: "KIT Office" },
  summary: {
    ko: "KIT IAI가 공개한 사무·연구시설 예제 모델. 실제 부지의 건물이 아닌 IFC 검증용 설계입니다.",
    en: "KIT IAI's fictional office and laboratory example, released for IFC validation; not a surveyed building.",
  },
  useType: "office_building",
  licence: "KIT/IAI unrestricted use (attribution required)",
  attribution: 'Institute for Automation and Applied Informatics (IAI), Karlsruhe Institute of Technology (KIT), "AC20-Institute-Var-2" — https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples',
  sourceUrl: "https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples",
  files: [{ role: "architectural", fileName: "AC20-Institute-Var-2.ifc", url: "https://www.ifcwiki.org/images/9/98/AC20-Institute-Var-2.ifc", sha256: "cfb2124497b25d9a72101075e84be0feb44ff669cb1bd3251be11efebeea945c" }],
  serviceLayers: [],
  // Names repeat between internal and external walls; IsExternal is absent.
  // Read PHYSICAL/EXTERNAL boundary membership by element id, never infer
  // it from a matching wall name. Boundary strip areas are never consumed.
  exteriorWallsFromSpaceBoundaries: true,
  areaSource: "stated_first",
  roofDatumM: 9,
  location: {
    rejectCoordinate: true,
    statedTown: null,
    trueNorthStated: false,
    note: "IfcSite.Description explicitly states 'No real site'. The coordinate is an example location, not a surveyed site; the page uses a separately named Seoul climate assumption.",
  },
  spacesNote: "The file models basement laboratories, office rooms and two attic spaces. All enclosed IfcSpace floor quantities are recorded here; conditioning every enclosed space is a separately disclosed energy assumption, not an IFC reading.",
  roofNote: "Dach-001 consists of 21 IfcSlab ROOF strips forming curved roofs. Their surfaces are measured individually; no single flat or gable typology is asserted.",
});

/** Every building this script can build, selected with `--building <id>`. */
const BUILDINGS = Object.freeze({
  [CLINIC.id]: CLINIC,
  [SCHEPENDOMLAAN.id]: SCHEPENDOMLAAN,
  [DUPLEX.id]: DUPLEX,
  [FZK_HAUS.id]: FZK_HAUS,
  [KIT_OFFICE.id]: KIT_OFFICE,
  "klassiqua-office-1970": {
    id: "klassiqua-office-1970",
    name: { ko: "Klassiqua 1970 오피스", en: "Klassiqua Office · 1970" },
    summary: {
      ko: "독일 오피스 통계를 바탕으로 만든 1970년 기준 연구용 원형. 실제 준공 건물이 아닌 4개 층·48개 공간의 에너지 비교 모델입니다.",
      en: "A synthetic 1970 office archetype derived from German building statistics: four storeys and 48 spaces for energy comparison, not a constructed building.",
    },
    useType: "office_building",
    licence: "CC BY 4.0",
    attribution: "Verena Dannapfel, Moritz Müller, Rita Streblow, Dirk Müller, Lisa Karber and Alexander Hickertz; Klassiqua Office Building Archetypes, July 2026, Zenodo 21727160 (CC BY 4.0). Extracted and adapted by BIMFIT.",
    sourceUrl: "https://zenodo.org/records/21727160",
    documentation: [{
      fileName: "2026-07_Klassiqua_Buero_Archetypen_Dokumentation.pdf",
      url: "https://zenodo.org/api/records/21727160/files/2026-07_Klassiqua_Buero_Archetypen_Dokumentation.pdf/content",
      sha256: "116268af3109e568616acf4aa83b61e81905ee05a8590f249166be0746afa659",
      licence: "CC BY 4.0",
      note: "July source documentation: archetype geometry table 2.1, combined envelope U-values table 3.1, window/door properties table 3.4, and technical scenario T1_1970 table 3.5. Source design inputs, not measured operation.",
    }],
    files: [{ role: "architectural", fileName: "2026-07_Klassiqua_Buero_Archetyp_Baujahr_1970.ifc", url: "https://zenodo.org/api/records/21727160/files/2026-07_Klassiqua_Buero_Archetyp_Baujahr_1970.ifc/content", sha256: "4d77774850b817d8ed9534e19886a1ff7fbcbe734a8f3138eebf2751e4c879fb" }],
    serviceLayers: [],
    fabricExcludeTypes: ["IfcCurtainWall"],
    materialThermalPropertiesInSI: true,
    exteriorWallsFromSpaceBoundaries: true,
    exteriorWallExclude: ["Attica"],
    exteriorWallNote: "Opaque envelope follows the 16 source AluminiumCladding_1970 solids, including floor-edge bands omitted by the masonry wall solids. Voided vertical faces are clipped from the lowest room floor to the highest room ceiling (0–14 m). The 16 PHYSICAL/EXTERNAL calcium-silicate walls remain the opening-host set. Upper parapet faces are recorded separately and excluded from the conditioned envelope; boundary areas are not used.",
    opaqueFacade: { type: "IfcCurtainWall", name: "AluminiumCladding_1970" },
    areaSource: "mesh",
    roofDatumM: 14,
    roofSlabMatch: ["FlatRoofSlab_ReinforcedConcrete"],
    roofCoveringMatch: ["Roofing_Insulation_BituminousSheeting_Gravel"],
    roofExclude: ["Attica"],
    openings: { curtainWallExclude: [{ match: "AluminiumCladding_1970", reason: "Opaque mineral-wool and ventilated aluminium cladding assembly, not glazing; source material layer set CurtainWall_Aluminium_AirGap_Insulation_74mm_Exterior_1970." }] },
    location: {
      rejectCoordinate: true, statedTown: "Aachen (synthetic scenario)", trueNorthStated: true,
      note: "The research archetype assigns Aachen and a true-north direction as simulation inputs. Its coordinates do not identify a constructed office. BIMFIT uses a separately disclosed Seoul climate comparison.",
    },
    spacesNote: "All 48 IfcSpace solids have measurable plan footprints but no floor-area quantities. Their plan unions total 1507.02 m², consistent with the documentation's rounded 1507 m² usable floor area. All 48 spaces are included in the energy conditioning scenario; this is not measured operation.",
    roofNote: "The structural flat-roof slab and overlying roofing assembly are separate IFC elements. The sky-visible plane union supplies the single roof area; layer sums must not be priced twice.",
  },
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

function exteriorWallPredicate(building, file, webIfc) {
  if (building.exteriorWallsFromSpaceBoundaries) {
    const exteriorIds = new Set();
    for (const boundary of allSpaceBoundaries(file, webIfc)) {
      if (str(boundary.PhysicalOrVirtualBoundary) !== "PHYSICAL" ||
          str(boundary.InternalOrExternalBoundary) !== "EXTERNAL") continue;
      const element = file.deref(boundary.RelatedBuildingElement);
      if (element && isWallType(file.typeName(element)) &&
          !(building.exteriorWallExclude ?? []).some((name) => (str(element.Name) ?? "").toLowerCase().includes(name.toLowerCase()))) exteriorIds.add(element.expressID);
    }
    if (exteriorIds.size === 0) throw new Error(`${building.id}: no physical exterior wall boundary membership`);
    return (_name, line) => exteriorIds.has(line?.expressID);
  }
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


function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function attachOpeningObstructions(planes, unresolved) {
  for (const opening of unresolved) {
    const plan = opening.footprint?.plan;
    if (!Array.isArray(plan) || plan.length < 3) continue;
    const cx = plan.reduce((s, q) => s + q[0], 0) / plan.length;
    const cz = plan.reduce((s, q) => s + q[1], 0) / plan.length;
    const bottom = opening.footprint.bottomM;
    for (const plane of planes) {
      const outer = plane.outline.find((ring) => ring.kind === "outer");
      if (!outer || !pointInRing(cx, cz, outer.points)) continue;
      if (bottom < plane.minElevationM - 0.5 || bottom > plane.maxElevationM + 0.5) continue;
      plane.obstructions.push({
        kind: "opening",
        elementRef: opening.ref,
        elementName: opening.name,
        elementType: opening.type,
        plan: [...plan, plan[0]],
        areaSqm: Math.round(opening.footprint.widthM * opening.footprint.depthM * 100) / 100,
      });
      break;
    }
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * The analytical-space split, asserted rather than trusted.
 *
 * `classifyAnalyticalSpace` drops roughly half this building's `IfcSpace` rows,
 * which is the largest single subtraction any building here makes. A signature
 * that silently stopped matching — a Revit version renaming a property set, a
 * re-export dropping the analysis psets — would not fail: it would quietly
 * publish a doubled floor area again, and a doubled floor area reads as a
 * building that is twice as efficient. So the count the split is expected to
 * produce is declared in the config and checked here, and the expectation is
 * checked from BOTH sides: how many rows matched, and how many survived.
 *
 * `unpairedRooms` is the other half of the evidence. Every analytical space on
 * this file overlays a room of the same Name, and exactly one room (`A104`) has
 * no analytical twin. If that pairing ever fails, the two sets are not what
 * this function thinks they are and the split is not a de-duplication.
 */
function assertAnalyticalSplit(building, spaces) {
  const expected = building.analyticalSplit;
  if (!expected) return;
  const dropped = spaces.filter((s) => s.excludedBy === "analytical");
  const kept = spaces.filter((s) => s.countsAsFloorArea);
  if (dropped.length !== expected.analyticalSpaces || kept.length !== expected.rooms) {
    throw new Error(
      `${building.id}: the analytical-space signature split ${spaces.length} IfcSpace into ` +
        `${dropped.length} analytical / ${kept.length} floor-counting, and the config ` +
        `declares ${expected.analyticalSpaces} / ${expected.rooms}. Either the file changed ` +
        "or the property-set signature no longer identifies the analysis objects. Do NOT " +
        "relax this check: an unmatched signature republishes a doubled floor area, which " +
        "reads as a building twice as efficient as it is.",
    );
  }
  const analyticalNames = new Set(dropped.map((s) => s.name));
  const unpaired = kept
    .filter((s) => s.countsAsFloorArea && !analyticalNames.has(s.name))
    .map((s) => s.name)
    .sort();
  const declared = [...(expected.unpairedRooms ?? [])].sort();
  if (unpaired.join("|") !== declared.join("|")) {
    throw new Error(
      `${building.id}: rooms with no analytical twin are [${unpaired.join(", ")}], and the ` +
        `config declares [${declared.join(", ")}]. The two sets are not the room/space pair ` +
        "this split assumes.",
    );
  }
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

  // A details-only build leaves all measured quantities and existing GLBs
  // alone. It also pins the cached IFC to the published source hash.
  const detailsOnly = process.argv.includes("--details-only");
  const mepOnly = process.argv.includes("--mep-only");
  if (detailsOnly && mepOnly) throw new Error("Use --details-only or --mep-only, not both");
  const incrementalOnly = detailsOnly || mepOnly;
  const manifestPath = path.join(outDir, "manifest.json");
  const previousManifestText = incrementalOnly ? await readFile(manifestPath, "utf8") : null;
  const previousManifest = previousManifestText ? JSON.parse(previousManifestText) : null;
  const detailRoles = Object.keys(ARCHITECTURAL_DETAIL_SOURCES[buildingId] ?? {});
  if (incrementalOnly && previousManifest?.id !== buildingId) {
    throw new Error("Incremental extraction requires this building's existing manifest.json in --out-dir");
  }

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
    if (detailsOnly && !detailRoles.includes(file.role)) continue;
    const named = file.dir ? src.dirs?.[file.dir] : null;
    if (file.dir && !named) {
      throw new Error(
        `"${file.fileName}" names dir "${file.dir}", which source.dirs does not declare.`,
      );
    }
    // FZK-Haus is the first building not hosted in a GitHub repository — it
    // ships from a MediaWiki file upload (ifcwiki.org/images/...), which has
    // no owner/repo/ref/dir shape to assemble a URL from. `file.url` is a
    // literal escape hatch for that case; every other building keeps
    // resolving through the GitHub-shaped `source` object above.
    const remoteDir = file.url ? null : named ? named.path : src.dir;
    const url = file.url ?? toUrl(src.owner, src.repo, src.ref, `${remoteDir}/${file.fileName}`);
    const cachePath = path.join(CACHE, named?.cache ?? "", file.fileName);
    const expectedSha256 = incrementalOnly
      ? previousManifest.sourceFiles.find((entry) => entry.role === file.role)?.sha256
      : file.sha256;
    if (incrementalOnly && !expectedSha256) throw new Error(`${file.fileName}: published source hash missing`);
    const fetched = await fetchSource(url, cachePath, {
      expectedSha256,
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

  if (detailsOnly) {
    try {
      const architecturalDetails = await buildArchitecturalDetails({
        buildingId, api, webIfc, byRole, sources, outDir,
        generator: `bimfit build-reference-building (web-ifc ${webIfcVersion()})`,
      });
      const lineEnding = previousManifestText.includes("\r\n") ? "\r\n" : "\n";
      await writeFile(manifestPath, `${JSON.stringify({ ...previousManifest, architecturalDetails }, null, 2)}\n`.replaceAll("\n", lineEnding));
      console.log(`  architectural-details.glb ${architecturalDetails.elements} elements, ${architecturalDetails.byteLength} bytes, ${architecturalDetails.drawCalls} draw calls`);
      console.log(JSON.stringify(architecturalDetails.sourceFiles, null, 2));
    } finally {
      files.forEach((file) => file.close());
    }
    return;
  }

  if (mepOnly) {
    let serviceLayers = [...(previousManifest.serviceLayers ?? [])];
    // Only the newly added architectural service geometry needs tessellation.
    // Inventory the other discipline/supplier IFCs directly from their STEP
    // records so this mode does not reload and rewrite their existing GLBs.
    if (buildingId === "schependomlaan") {
      const selected = sources.filter((source) => source.role === "architectural");
      const { api, files, webIfc } = await openIfcFiles(selected.map((s) => s.cachePath), {
        wasmDir: path.join(REPO, "node_modules", "web-ifc") + path.sep,
      });
      try {
        const additional = await buildAdditionalMepLayer({
          buildingId, api, webIfc,
          byRole: new Map(selected.map((s, i) => [s.role, files[i]])),
          sources, outDir,
          generator: `bimfit build-reference-building (web-ifc ${webIfcVersion()})`,
        });
        serviceLayers = serviceLayers.filter((layer) => layer.id !== additional.id);
        serviceLayers.push(additional);
      } finally {
        files.forEach((file) => file.close());
      }
    }
    const mepCoverage = await buildMepCoverage({ buildingId, sources, serviceLayers });
    const lineEnding = previousManifestText.includes("\r\n") ? "\r\n" : "\n";
    await writeFile(manifestPath, `${JSON.stringify({ ...previousManifest, serviceLayers, mepCoverage }, null, 2)}\n`.replaceAll("\n", lineEnding));
    console.log(`  MEP inventory: ${mepCoverage.typedElementCount} source occurrences, ${mepCoverage.distributionPortCount} ports, published [${mepCoverage.publishedLayerIds.join(", ")}]`);
    return;
  }

  // ── What the model states ──────────────────────────────────────────────
  // Spaces may live in a model of their own. The Duplex ships its rooms in a
  // separate `ROOMS_AND_SPACES` file, which subdivides the plan more finely
  // than the architectural model does — it splits the stair into the hallway
  // and states 18 rooms where `Duplex_A` states 20.
  //
  // It also states every one of those rooms TWICE, once as an architectural
  // Room and once as an analytical Space (`analyticalPropertySets` below, and
  // `classifyAnalyticalSpace`). Reading the file naively gives 799.76 m² of
  // floor for a building whose floor is 284.98 m². An earlier revision of this
  // comment recorded the opposite conclusion — that `arch` held one dwelling
  // and the rooms file both — and it was wrong twice over: `Duplex_A` carries
  // A- and B-unit rooms alike, and a LARGER floor area makes a building read
  // MORE efficient, not less. Both dwellings are in both files.
  //
  // Storeys come from the SAME file, not from `arch`: a space is linked to its
  // storey by expressID within one file, so a storey list from another model
  // cannot be matched against it.
  const spaceFile = byRole.get(building.spacesRole ?? "architectural") ?? arch;
  const storeys = extractStoreys(spaceFile, webIfc);
  const statedSpaces = extractSpaces(spaceFile, webIfc, storeys, {
    analyticalPropertySets: building.analyticalPropertySets ?? null,
  });
  const missingAreaSpaces = statedSpaces.filter((space) => space.floorAreaSqm == null);
  const spaces = missingAreaSpaces.length
    ? withMeasuredSpaceAreas(statedSpaces, spaceFootprints(api, webIfc, spaceFile, missingAreaSpaces))
    : statedSpaces;
  const floorSpaces = spaces.filter((s) => s.countsAsFloorArea);
  assertAnalyticalSplit(building, spaces);
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
      ...(s.floorAreaSource ? { floorAreaSource: s.floorAreaSource } : {}),
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
  // Only rows that actually reach a volume figure. The note this feeds says
  // these solids "are counted as floor area × their own height", which is a
  // claim about rows that are counted — an excluded row whose solid also
  // failed to close is not counted as anything. On a building whose rooms are
  // each stated twice, 4 of the 6 failures were the analytical copies, so the
  // sentence promised 6 substitutions where the net figure made 2.
  const openSolids = spaceRows.filter(
    (s) => s.countsAsConditionedVolume && s.solidClosed === false,
  ).length;
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
  //
  // NAME exclusions only. An analytical-space exclusion cannot be reported by
  // naming rooms: both copies carry the same LongName, so the list would read
  // "BEDROOM 1 ... excluded" about a building whose BEDROOM 1 is counted —
  // every word true, the sentence false. Those rows are counted instead, in
  // the clause below.
  // Read from `spaces`, not `spaceRows`: `spaceRows` is the shape written to
  // spaces.json and lists its fields explicitly, so it deliberately does not
  // carry the internal `excludedBy` tag. The two arrays are 1:1.
  const excludedNames = [
    ...new Set(
      spaces
        .filter((s) => !s.countsAsConditionedVolume && s.excludedBy === "name")
        .map((s) => (s.longName ?? s.name).trim().toUpperCase()),
    ),
  ].sort();
  const analyticalExcluded = spaces.filter((s) => s.excludedBy === "analytical").length;
  // A building need not have a structural model. Schependomlaan is one
  // architectural file; the Clinic is five. Absent roles are skipped rather
  // than assumed, so a missing discipline is an empty contribution and not a
  // crash halfway through an extraction.
  const assemblies = [arch, struct]
    .filter(Boolean)
    .flatMap((file) => extractAssemblies(file, webIfc, { thermalPropertiesInSI: building.materialThermalPropertiesInSI ?? false }));
  const classification = classifyExternalElements(arch, webIfc);

  // Areas come from the built solid, never from space boundaries — see the
  // retraction in ifc-envelope.mjs.
  const isExteriorWallName = exteriorWallPredicate(building, arch, webIfc);
  const exteriorWalls = netFaceAreasByElement(
    api,
    arch.modelId,
    (typeName, name, line) => isWallType(typeName) && isExteriorWallName(name, line),
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
      if (isExteriorWallName(str(line.Name) ?? "", line)) {
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

  const hostOrientation = orientWalls(exteriorWalls, { trueNorthDeg });
  let orientation = hostOrientation;
  let opaqueFacade = null;
  if (building.opaqueFacade) {
    const relevantMeshes = spaces.filter((s) => s.countsAsConditionedVolume).map((s) => spaceMeshes.get(s.expressID)).filter(Boolean);
    const fromHeightM = Math.min(...relevantMeshes.map((mesh) => mesh.minY));
    const toHeightM = Math.max(...relevantMeshes.map((mesh) => mesh.maxY));
    if (!Number.isFinite(fromHeightM) || !Number.isFinite(toHeightM)) throw new Error("Opaque façade clipping needs measured room elevations");
    const { type, name } = building.opaqueFacade;
    const faces = netFaceAreasByElement(api, arch.modelId, (elementType, elementName) => elementType === type && elementName === name,
      { heightFloorM: fromHeightM, heightSplitM: toHeightM });
    const expected = arch.byType(webIfc[type.toUpperCase()]).filter((row) => str(row.Name) === name).length;
    if (!expected || faces.size !== expected || [...faces.values()].some((face) => face.exceedsBounds || face.thinAxisForced)) throw new Error("Opaque façade geometry is incomplete or not a single vertical skin");
    const clipped = new Map([...faces].map(([id, face]) => [id, { ...face, netFaceAreaSqm: face.netFaceAreaBelowSplitSqm }]));
    const fullFaceSqm = [...faces.values()].reduce((sum, face) => sum + face.netFaceAreaSqm, 0);
    wallNet = [...clipped.values()].reduce((sum, face) => sum + face.netFaceAreaSqm, 0);
    wallBelowRoof = wallNet;
    wallAboveRoof = 0;
    orientation = orientWalls(clipped, { trueNorthDeg });
    opaqueFacade = {
      fullFaceSqm: r2(fullFaceSqm), conditionedFaceSqm: r2(wallNet), excludedFaceSqm: r2(fullFaceSqm - wallNet),
      fromHeightM: r2(fromHeightM), toHeightM: r2(toHeightM),
      elements: [...faces.keys()].map((id) => ({ ref: arch.ref(id), fullFaceSqm: r2(faces.get(id).netFaceAreaSqm), conditionedFaceSqm: r2(clipped.get(id).netFaceAreaSqm) })),
    };
  }
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

  // ── Roofs and ground slabs ─────────────────────────────────────────────
  // The two horizontal envelope areas, from the same tessellated geometry as
  // the walls. The rules — plan SHADOW rather than an upward-face sum, and
  // "a conditioned space stands on it" rather than IsExternal for the ground
  // — are argued in ifc-horizontal.mjs; what is decided here is only which
  // files and which storey.
  //
  // The ground storey is the lowest one that holds rooms (the same test the
  // storey count uses), taken from the SPACE file; slabs on any storey at or
  // below its elevation are candidates, so a lift-pit slab filed under a
  // footing datum is still seen. Roofs and slabs are read from the
  // architectural and structural models both — the Clinic keeps every roof
  // and floor slab in Structural, Schependomlaan keeps everything in one
  // file — and an element present in both files is counted once, by
  // GlobalId.
  const groundStorey =
    storeys.find((s) => spaces.some((sp) => sp.storeyId === s.id)) ?? storeys[0];
  const groundConditionedSpaces = spaces.filter(
    (sp) => sp.storeyId === groundStorey?.id && sp.countsAsConditionedVolume,
  );
  const groundFootprints = spaceFootprints(api, webIfc, spaceFile, groundConditionedSpaces);
  const horizontalSets = [];
  let geometrylessRoofs = 0;
  for (const file of [arch, struct].filter(Boolean)) {
    const fileStoreys = file === spaceFile ? storeys : extractStoreys(file, webIfc);
    const collected = collectHorizontalElements(api, webIfc, file, fileStoreys);
    horizontalSets.push(collected.rows);
    geometrylessRoofs += collected.geometrylessRoofs;
  }
  const horizontal = dedupeByGlobalId(horizontalSets);
  // Kept rather than inlined: `measureRoofs` reduces these rows to areas, and
  // stage 1 of the PV methodology needs the rows themselves — a plan shadow
  // cannot be un-flattened into the planes that cast it.
  const classifiedRoofs = classifyRoofs(horizontal.rows, {
    nameMatch: building.roofSlabMatch ?? [],
    coveringNameMatch: building.roofCoveringMatch ?? [],
    excludeNames: building.roofExclude ?? [],
  });
  const roofs = measureRoofs(classifiedRoofs);
  const roofPlaneResult = roofPlanes(
    classifiedRoofs.map((row) => ({
      ...row,
      id: `roof-${row.expressID}`,
      family: roofFamily(row.name),
      storeyId: row.storey?.name ? `storey-${slug(row.storey.name)}` : null,
    })),
    { trueNorthDeg },
  );
  const ground = measureGroundSlabs(horizontal.rows, {
    groundStorey,
    conditionedSpaces: groundConditionedSpaces,
    footprints: groundFootprints,
    // Boundaries can only name elements of their own file, so only the space
    // file's index is consulted; a slab in another file is judged by overlap.
    boundaries: new Map([[spaceFile, spaceBoundaryIndex(spaceFile, webIfc)]]),
  });
  const roofBasisSummary = Object.entries(
    roofs.rows.reduce((acc, r) => {
      acc[r.basis] = (acc[r.basis] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([basis, n]) =>
      basis === "declared roof slab name"
        ? `${n} by declared slab name (${(building.roofSlabMatch ?? []).join(", ")})`
        : `${n} ${basis}`,
    )
    .join(", ");
  const excludedGround = ground.rows.filter((r) => !r.countsAsGround);
  console.log(
    `  roofs: ${roofs.rows.length} elements, ${roofs.familyCount} types, ` +
      `${roofs.projectedSqm} m² projected (elements sum ${roofs.elementSumSqm}, union ${roofs.unionSqm})`,
  );
  console.log(
    `  ground: ${ground.includedCount}/${ground.candidateCount} slabs, ` +
      `${ground.groundSlabSqm} m² (sum ${ground.groundSlabSumSqm}), perimeter ${ground.groundPerimeterM} m` +
      (excludedGround.length > 0
        ? `; excluded ${excludedGround.map((r) => `"${r.name}" ${r.projectedSqm} m²`).join(", ")}`
        : ""),
  );

  // ── Openings: glazing and exterior doors, per opening ──────────────────
  // Measured after the walls because attribution needs the exterior-wall set
  // (post-substitution, so the apartment's stated-area walls still carry
  // their mesh bounds) and the orientation pass's sectors. The both-sides
  // probe uses the space file's conditioned solids — on the Duplex that is a
  // different file from the walls, in the same site frame.
  const conditionedIds = new Set(
    spaces.filter((s) => s.countsAsConditionedVolume).map((s) => s.expressID),
  );
  const spaceSolids = collectSpaceSolids(api, webIfc, spaceFile.modelId, (id) => conditionedIds.has(id));
  const isExcludedWallName = (name) =>
    (building.exteriorWallExclude ?? []).some((x) => String(name ?? "").toLowerCase().includes(x.toLowerCase()));
  const openings = openingApertures(api, arch, webIfc, {
    exteriorWalls,
    sectorByHost: new Map(hostOrientation.walls.map((w) => [w.id, w.sector])),
    buildingCentre: hostOrientation.buildingCentre,
    trueNorthDeg,
    spaceSolids,
    conditionedSpaceCount: conditionedIds.size,
    spaceName: new Map(spaces.map((s) => [s.expressID, s.longName ?? s.name])),
    isExteriorWallName,
    isExcludedWallName,
    curtainWallExclude: building.openings?.curtainWallExclude ?? [],
    subFrameNames: building.openings?.subFrameNames ?? [],
  });
  const apertures = summariseApertures(openings);
  const openingsNote = describeOpenings(apertures, building.openings?.curtainWallExclude ?? []);
  // The split must account for the same area as the headline, exactly as
  // the wall split must — an aperture whose host has no sector would
  // otherwise vanish from the per-sector WWR while staying in the total.
  const glazingSplitTotal = Object.values(apertures.glazingByOrientationSqm).reduce((s, v) => s + v, 0);
  if (Math.abs(glazingSplitTotal + apertures.unsectoredSqm - apertures.glazingApertureSqm) > 0.05) {
    throw new Error(
      `Glazing by orientation ${glazingSplitTotal.toFixed(2)} + unsectored ${apertures.unsectoredSqm} ` +
        `does not reconcile with the total ${apertures.glazingApertureSqm} m².`,
    );
  }
  console.log(
    `  openings: glazing ${apertures.glazingApertureSqm} m² (${apertures.windowCount} windows` +
      (apertures.curtainWallCount > 0 ? ` + ${apertures.curtainWallCount} curtain walls` : "") +
      `), doors ${apertures.exteriorDoorSqm} m² (${apertures.doorCount}), ` +
      `unresolved ${apertures.unresolved.length} (${apertures.unresolvedSqm} m²)`,
  );

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
  const architecturalDetails = await buildArchitecturalDetails({
    buildingId, api, webIfc, byRole, sources, outDir, generator,
  });
  const fabric = new Map();
  for (const file of [arch, struct].filter(Boolean)) {
    mergeFabric(fabric, collectFabric(api, webIfc, file.modelId, { excludeTypes: building.fabricExcludeTypes ?? [] }).groups);
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
  const additionalMep = await buildAdditionalMepLayer({ buildingId, api, webIfc, byRole, sources, outDir, generator });
  if (additionalMep) serviceLayers.push(additionalMep);
  const mepCoverage = await buildMepCoverage({ buildingId, sources, serviceLayers });
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
    ...(building.documentation ? { documentation: building.documentation } : {}),
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
      /** Openings counted in the aperture. The excluded and unresolved ones are in `openings.json`. */
      windows: apertures.windowCount,
      exteriorCurtainWalls: apertures.curtainWallCount,
      exteriorDoors: apertures.doorCount,
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
              (building.exteriorWallsFromSpaceBoundaries
                ? `stated wall NetSideArea or solid geometry. Exterior wall membership uses ` +
                  `the boundary's element reference and PHYSICAL/EXTERNAL flags directly; ` +
                  `it does not require a readable boundary surface or consume its area.`
                : `the wall walk, not from boundaries, so nothing published depends on this.`),
          }
        : {}),
    },
    areas: {
      totalFloorAreaSqm: round(
        floorSpaces.reduce((sum, s) => sum + (s.floorAreaSqm ?? 0), 0),
      ),
      ...(spaces.some((s) => s.floorAreaSource) ? {
        floorAreaNote: `${spaces.filter((s) => s.floorAreaSource).length} spaces with no area quantity use measured plan unions of their solid or FootPrint geometry; quantities retain priority where present. See spaces.json floorAreaSource per row.`,
      } : {}),
      areaPlanTotalSqm: round(
        spaces.reduce((sum, s) => sum + (s.floorAreaSqm ?? 0), 0),
      ),
      exteriorWallNetSqm: round(wallNet),
      ...(opaqueFacade ? { opaqueFacade } : {}),
      ...(building.exteriorWallsFromSpaceBoundaries ? {
        exteriorWallNote: building.exteriorWallNote ?? `${exteriorWalls.size} walls selected by IfcRelSpaceBoundary PHYSICAL/EXTERNAL element references; area from each wall's stated NetSideArea (openings already removed). Boundary surface areas are not used.`,
      } : {}),
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
       * Glazing and exterior-door aperture, measured per opening and binned
       * by the host wall's sector — the same eight keys as the wall split, so
       * aperture ÷ wall is a per-sector window-to-wall ratio that is
       * measured on both sides of the division. What each figure is, and
       * what was excluded and why, is in `openingsNote`; every opening is a
       * row in `openings.json`.
       */
      glazingApertureSqm: apertures.glazingApertureSqm,
      glazingByOrientationSqm: apertures.glazingByOrientationSqm,
      exteriorDoorSqm: apertures.exteriorDoorSqm,
      exteriorDoorByOrientationSqm: apertures.exteriorDoorByOrientationSqm,
      openingsNote,
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
        // "solids" was the Clinic's truth and a lie on the apartment, whose
        // nets come from stated IfcQuantityVolume rows (94 of 100 spaces have
        // no solid at all). Count each source the rows actually carry.
        `net from ${conditionedRows.length} spaces (` +
        [
          ["quantity", "stated volume quantity"],
          ["mesh", "own solid"],
          ["area × solid height (solid not closed)", "floor area × solid height, solid not closed"],
        ]
          .map(([src, label]) => [conditionedRows.filter((r) => r.netVolumeSource === src).length, label])
          .filter(([count]) => count > 0)
          .map(([count, label]) => `${count} from ${label}`)
          .join(", ") +
        ")" +
        (excludedNames.length > 0 ? `, ${excludedNames.join(" and ")} excluded` : "") +
        (analyticalExcluded > 0
          ? `; a further ${analyticalExcluded} rows are the authoring tool's analytical spaces standing over these same rooms and are excluded from both figures, because that is the same air counted twice`
          : "") +
        (openSolids > 0
          ? `; ${openSolids} solids failed the closed-mesh test and are counted as floor area × their own height`
          : "") +
        (unmeasuredConditioned > 0
          ? `; ${unmeasuredConditioned} conditioned spaces have no solid and are in neither figure`
          : "") +
        ". A closed tessellation's signed volume is exact.",
      /**
       * Roof, horizontal-projected: the sum over roof TYPES of each type's
       * plan coverage — the union of that type's element shadows. This is
       * the area a per-type U-value multiplies; the per-element rows are in
       * `roofs`, and the two other totals are beside it so a reader can see
       * how much of the difference is overlap.
       */
      roofProjectedSqm: roofs.projectedSqm,
      roofProjectedByFamilySqm: roofs.byFamilySqm,
      /** Σ of every element's own shadow; exceeds the above where elements of one type overlap in plan. */
      roofElementSumSqm: roofs.elementSumSqm,
      /** One union over every roof element — what the sky sees; less than the above where one type sits over another. */
      roofUnionSqm: roofs.unionSqm,
      /**
       * True one-sheet SURFACE, Σ per type and over all — what heat crosses.
       * A flat deck's surface is its shadow; a pitched roof's is larger by
       * 1/cos(tilt). A sum, not a union: surfaces cannot be unioned, so
       * where elements of one type overlap in plan the strips are in twice.
       */
      roofSurfaceSqm: roofs.surfaceSqm,
      roofSurfaceByFamilySqm: roofs.surfaceByFamilySqm,
      roofNote:
        `Plan shadow per element (union of its projected triangles, ifc-plan-shadow.mjs): ` +
        `${roofs.rows.length} elements — ${roofBasisSummary}. ` +
        `roofProjectedSqm sums ${roofs.familyCount} roof type(s), each as the union of its elements; ` +
        `the elements themselves sum to ${roofs.elementSumSqm} m² (elements of one type overlapping in plan) ` +
        `and all types together cover ${roofs.unionSqm} m² (one type above another). ` +
        `surfaceSqm is each element's true one-sheet surface (Σ area of its upward faces; ÷ 2 where a ` +
        `surface model has no downward face and both sheets are wound upward; ÷ the coverage where its ` +
        `parts cover its shadow more than once, as stacked layer solids do — surfaceBasis says which), summing to ` +
        `${roofs.surfaceSqm} m²; a flat deck's surface equals its shadow, a pitched roof's exceeds it. ` +
        (geometrylessRoofs > 0
          ? `${geometrylessRoofs} IfcRoof carry no geometry of their own and are measured through the IfcSlab ROOF parts they aggregate. `
          : "") +
        (horizontal.duplicates > 0
          ? `${horizontal.duplicates} element(s) present in two files counted once by GlobalId. `
          : "") +
        (roofs.upFacingExceedsShadowCount > 0
          ? `${roofs.upFacingExceedsShadowCount} element(s) present their top face more than once (upward-face sum above shadow) — the reason the shadow is used and Σ area×n_y is not. `
          : "") +
        (roofs.snappedCount > 0
          ? `${roofs.snappedCount} shadow(s) needed a vertex grid coarser than 1 µm to union. `
          : "") +
        (building.roofNote ?? ""),
      /**
       * Ground slab and exposed perimeter. The area is the UNION of the
       * counted slabs' shadows (a screed over a structural floor is one
       * floor); the perimeter is that outline's outer ring. Rows in
       * `groundSlabs`, including the ones excluded and why.
       */
      groundSlabSqm: ground.groundSlabSqm,
      groundSlabSumSqm: ground.groundSlabSumSqm,
      groundPerimeterM: ground.groundPerimeterM,
      groundHolePerimeterM: ground.groundHolePerimeterM,
      groundNote:
        `IfcSlab (not ROOF or LANDING) on storeys at or below ${groundStorey?.name ?? "?"} ` +
        `(${groundStorey?.elevationM ?? "?"} m): ${ground.candidateCount} candidate(s). A slab counts as ground ` +
        `envelope when a conditioned space stands on it — its shadow overlaps a conditioned ` +
        `ground-storey space footprint (${ground.footprintedSpaceCount} of ${ground.conditionedSpaceCount} ` +
        `such spaces have one: ${Object.entries(ground.footprintSources).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}) ` +
        `or an IfcRelSpaceBoundary names it as bounding one. IsExternal is not consulted. ` +
        `${ground.includedCount} counted, ${excludedGround.length} excluded` +
        (excludedGround.length > 0
          ? `: ${excludedGround.map((r) => `"${r.name}" ${r.projectedSqm} m²`).join(", ")}`
          : "") +
        `. groundSlabSqm is the union of the counted shadows (they sum to ${ground.groundSlabSumSqm} m²; ` +
        `stacked build-up layers count once); groundPerimeterM is the outline's outer ring` +
        (ground.outlinePolygons > 1 ? `s (${ground.outlinePolygons} polygons)` : "") +
        (ground.outlineHoles > 0
          ? `; ${ground.outlineHoles} hole ring(s) totalling ${ground.groundHolePerimeterM} m are reported and not added`
          : "") +
        ".",
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
        ...(l.sourceThermalProperties ? { sourceThermalProperties: l.sourceThermalProperties } : {}),
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
      ...(s.elevationSource ? { elevationSource: s.elevationSource } : {}),
      floorToFloorHeightM: s.floorToFloorHeightM,
      spaceCount: spaces.filter((sp) => sp.storeyId === s.id).length,
      /**
       * `spaceCount` is EVERY `IfcSpace` on the storey and `floorAreaSqm` is
       * the floor-counting subset's area, so the pair reads as a per-room mean
       * that is not one — the Clinic's roof storey has shipped "6 spaces,
       * 64.8 m²" for one 64.8 m² room since it was first built.
       *
       * On a building whose rooms are each stated twice that gap stops being a
       * detail: Level 1 would read "15 spaces, 141.79 m²" for 8 rooms. So the
       * floor-counting count is emitted beside it — and ONLY for a building
       * that declares the analytical signature, so adding this does not
       * rewrite the two manifests already committed. Same rule, and the same
       * reason, as `site.statedTown` above.
       */
      ...(building.analyticalPropertySets
        ? {
            spacesCountingAsFloor: floorSpaces.filter((sp) => sp.storeyId === s.id).length,
          }
        : {}),
      floorAreaSqm: round(
        floorSpaces
          .filter((sp) => sp.storeyId === s.id)
          .reduce((sum, sp) => sum + (sp.floorAreaSqm ?? 0), 0),
      ),
      ref: s.ref,
    })),
    spacesFile: "spaces.json",
    /** One row per roof element with geometry; `family` keeps the roof types apart. */
    roofs: roofs.rows,
    /** One row per candidate ground slab, counted or excluded with the reason. */
    groundSlabs: ground.rows,
    /** One row per IfcWindow, IfcDoor and IfcCurtainWall — counted, excluded with a reason, or unresolved. */
    openingsFile: "openings.json",
    serviceLayers,
    architecturalDetails,
    mepCoverage,
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

  // Stage 1 of the PV placement methodology: the roof as PLANES, not as the
  // bounding box both viewers grid modules into today. Written beside the
  // manifest from the same `--generated-at`, byte-stable like every other
  // artifact here.
  //
  // `obstructions` is emitted on every plane and is EMPTY in this pass. The
  // shape lands ahead of its content deliberately — the layout library is
  // built against this contract, and an absent field and an empty one are
  // different claims. Not yet populated: roof-hosted openings (the Duplex's
  // two skylights, already in openings.json), roof-mounted plant, parapets.
  // Obstructions, first content: roof-hosted openings. An opening the aperture
  // walk could not place in a wall, whose plan rectangle centre lies inside a
  // plane's outer ring and whose bottom sits within 0.5 m of that plane's
  // elevation range, is a hole a module cannot cover — the Duplex's two
  // skylights. Judged by geometry, not by name: the apartment has 52
  // unresolved openings whose reason text mentions "roof" generically, and
  // every one of them sits at 0.78 m, four metres under any roof.
  attachOpeningObstructions(roofPlaneResult.planes, apertures.unresolved ?? []);
  await writeFile(
    path.join(outDir, "roof-planes.json"),
    `${JSON.stringify(
      {
        kind: "bimfit_reference_building_roof_planes",
        id: building.id,
        generatedAt,
        northAssumed: orientation.northAssumed,
        trueNorthDeg,
        note:
          `Upward faces (within ${ROOF_PLANE_CONSTANTS.upwardWithinDeg}°) of each roof element, ` +
          `region-grown into connected coplanar patches: normals within ` +
          `${ROOF_PLANE_CONSTANTS.normalToleranceDeg}°, offsets within ` +
          `${ROOF_PLANE_CONSTANTS.offsetToleranceM * 1000} mm across shared edges; then patches of one ` +
          `element with the same normal, offsets within ${ROOF_PLANE_CONSTANTS.mergeOffsetM * 1000} mm ` +
          `and plan boxes touching within ${ROOF_PLANE_CONSTANTS.mergeGapM * 1000} mm are one surface ` +
          `(a ribbed metal roof is modelled as one pan solid per rib bay). Then what the sky sees: ` +
          `planes highest first, each keeping only the plan area no higher plane covers, so a roof's ` +
          `lower layers (deck under tiles, insulation under deck) are not planes; occludedSqm is what ` +
          `each kept plane lost, and skyUnionSqm the union of every upward shadow before occlusion. ` +
          `Because lower layers are dropped, sum(surfaceSqm) is BELOW the manifest's roofSurfaceSqm, ` +
          `which keeps every layer and every verge because heat crosses them. tiltDeg and azimuthDeg ` +
          `are each plane's own and never a blend across the roof; azimuth is the downslope bearing ` +
          `clockwise from source true north when stated, otherwise project north (the model's −Z); trueNorthDeg records the rotation, and flat planes carry null. outline rings ` +
          `are the plane's visible plan area, outer counter-clockwise and holes clockwise, simplified ` +
          `to ${ROOF_PLANE_CONSTANTS.simplifyM * 1000} mm. obstructions is EMPTY in this pass: the ` +
          `shape is the contract, its content is a later stage.`,
        skyUnionSqm: roofPlaneResult.skyUnionSqm,
        occludedPlanes: roofPlaneResult.occludedPlanes,
        planes: roofPlaneResult.planes,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outDir, "roof-planes-qa.svg"),
    roofPlanesSvg(roofPlaneResult.planes, { id: building.id, title: building.name?.en ?? "", trueNorthDeg }),
    "utf8",
  );

  // One row per opening, so every figure in `areas` above can be traced to
  // the elements it came from — and every element it did NOT come from can
  // be seen with the reason it was left out.
  const { excluded: _excluded, unresolved: openingsUnresolved, ...openingsSummary } = apertures;
  await writeFile(
    path.join(outDir, "openings.json"),
    `${JSON.stringify(
      {
        kind: "bimfit_reference_building_openings",
        id: building.id,
        note: openingsNote,
        summary: openingsSummary,
        openings: openings.rows,
        unresolved: openingsUnresolved,
      },
      null,
      2,
    )}\n`,
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

/**
 * The sentence beside the aperture figures: what each one is, what was left
 * out and why, in the building's own numbers. Assembled from the summary so
 * it cannot describe a building other than the one it sits on — the way the
 * Clinic's model note once did for the apartment.
 */
function describeOpenings(a, curtainWallExclude) {
  const parts = [];
  parts.push(
    `Glazing aperture ${a.glazingApertureSqm} m² = ${a.windowCount} IfcWindow at OverallWidth × OverallHeight (${a.windowSqm} m²)` +
      (a.curtainWallCount > 0
        ? ` + ${a.curtainWallCount} exterior IfcCurtainWall at the projected outline of their plates and mullions (${a.curtainWallSqm} m²; the glass plates alone give ${a.curtainWallPlateSqm} m², the bounding rectangles ${a.curtainWallBboxSqm} m²)`
        : "") +
      `. Exterior doors are separate — a door is aperture, not glazing: ${a.doorCount} IfcDoor, ${a.exteriorDoorSqm} m², OverallWidth × OverallHeight.`,
  );
  const hb = a.hostBasis;
  parts.push(
    `Host wall by IfcRelFillsElement → IfcOpeningElement → IfcRelVoidsElement (${hb.fills} openings)` +
      (hb.adjacent > 0
        ? `, or where that chain does not reach the exterior-wall set, by an exterior wall adjacent in the opening's plane within 0.3 m (${hb.adjacent})`
        : "") +
      (hb.self > 0 ? `; a curtain wall is its own wall segment (${hb.self})` : "") +
      (hb["curtain-wall part"] > 0 ? `; ${hb["curtain-wall part"]} door(s) inside a curtain wall` : "") +
      `. Sector is the host wall's, from the same orientation pass as the wall split.`,
  );
  const anyCurtainWalls = a.curtainWallCount + a.interiorCurtainWalls.count > 0 || a.excluded.some((e) => e.type === "IfcCurtainWall");
  const probe = a.probe.usable
    ? `Envelope by a both-sides probe against the conditioned IfcSpace solids (${a.probe.spaceSolids} of ${a.probe.conditionedSpaces} have geometry${a.probe.complete ? "" : ", so an empty probe is inconclusive and the host wall decides"})` +
      (anyCurtainWalls
        ? `: ${a.interiorCurtainWalls.count} curtain wall(s) with a room on both sides excluded as interior screens (${a.interiorCurtainWalls.sqm} m²)`
        : "; this file has no IfcCurtainWall")
    : "No conditioned space solids to probe, so envelope rests on the host wall alone";
  const named = curtainWallExclude.map((x) => {
    const hits = a.excluded.filter((e) => e.reason === x.reason);
    if (hits.some((entry) => entry.areaSqm == null)) return `${hits.length} "${x.match}" excluded by name (aperture area not measured): ${x.reason.replace(/\.\s*$/, "")}`;
    return `${hits.length} "${x.match}" excluded by name (${r2s(hits.reduce((s, e) => s + (e.areaSqm ?? 0), 0))} m²): ${x.reason.replace(/\.\s*$/, "")}`;
  });
  // Revit repeats a family name three times over in `Name`
  // ("M_Single-Flush:0915 x 2134mm Exterior:0915 x 2134mm Exterior:222415");
  // once is enough in a sentence. The row keeps the full string.
  const shortName = (name) => {
    const seen = new Set();
    return String(name).split(":").filter((s) => !seen.has(s) && seen.add(s)).join(":");
  };
  const coincident = a.excluded.filter((e) => /^coincident/.test(e.reason ?? ""));
  parts.push(
    `${probe}` +
      (named.length ? `; ${named.join("; ")}` : "") +
      (coincident.length ? `; ${coincident.length} coincident twin(s) counted once` : "") +
      (a.hostedInInteriorWalls.count ? `; ${a.hostedInInteriorWalls.count} openings hosted in walls outside the exterior set` : "") +
      (a.outsideWallSetWindows.count || a.outsideWallSetDoors.count
        ? `; ${a.outsideWallSetWindows.count} window(s) (${a.outsideWallSetWindows.sqm} m²) and ${a.outsideWallSetDoors.count} door(s) (${a.outsideWallSetDoors.sqm} m²) sit in the plane of walls outside the exterior-wall set and are not counted — the wall names are on each row`
        : "") +
      (a.subFrames ? `; ${a.subFrames} sub-frames` : "") +
      (a.unresolved.length ? `; ${a.unresolved.length} unresolved (${a.unresolvedSqm} m² where a size is stated)` : "; nothing unresolved") +
      ".",
  );
  parts.push(
    `IsExternal is reported per row and never used as a filter — it means "not an interior partition" to an authoring tool, never "bounds conditioned space against outdoor air". ` +
      `It marks ${a.isExternalDoors.total} door(s) here; ${a.isExternalDoors.counted} confirm against an exterior wall` +
      (a.isExternalDoors.notCounted.length
        ? `, ${a.isExternalDoors.notCounted.length} do not: ${a.isExternalDoors.notCounted.map((d) => `#${d.id} ${shortName(d.name)}${d.areaSqm != null ? ` ${r2s(d.areaSqm)} m²` : ""}`).join(", ")}`
        : "") +
      ". Rows in openings.json.",
  );
  return parts.join(" ");
}

const r2s = (n) => Math.round(n * 100) / 100;

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
