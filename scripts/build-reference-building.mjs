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

  const outDir = path.join(REPO, "public", "reference-buildings", CLINIC.id);
  await mkdir(outDir, { recursive: true });

  // ── Fetch (or reuse) the discipline models ─────────────────────────────
  const sources = [];
  for (const file of CLINIC.files) {
    const url = githubLfsUrl(
      "buildingsmart-community",
      "Community-Sample-Test-Files",
      "main",
      `IFC 2.3.0.1 (IFC 2x3)/Medical-Dental Clinic/${file.fileName}`,
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
  const assemblies = [
    ...extractAssemblies(arch, webIfc),
    ...extractAssemblies(struct, webIfc),
  ];
  const classification = classifyExternalElements(arch, webIfc);

  // Areas come from the built solid, never from space boundaries — see the
  // retraction in ifc-envelope.mjs.
  const exteriorWalls = netFaceAreasByElement(
    api,
    arch.modelId,
    (typeName, name) =>
      (typeName === "IfcWallStandardCase" || typeName === "IfcWall") &&
      name.includes(CLINIC.exteriorWallMatch),
    { heightSplitM: CLINIC.roofDatumM },
  );
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
  // Revit stamps its factory default (Boston, MA) on every new project, so a
  // populated IfcSite is not evidence of where a building is.
  const isAuthoringDefault =
    latitudeDeg !== null &&
    longitudeDeg !== null &&
    Math.abs(latitudeDeg - 42.35843) < 1e-3 &&
    Math.abs(longitudeDeg + 71.05978) < 1e-3;

  // ── Fabric geometry for the viewer ─────────────────────────────────────
  const generator = `bimfit build-reference-building (web-ifc ${webIfcVersion()})`;
  const fabric = new Map();
  for (const file of [arch, struct]) {
    mergeFabric(fabric, collectFabric(api, webIfc, file.modelId).groups);
  }
  const glb = await writeGlb(path.join(outDir, "model.glb"), fabric, { generator });

  // One GLB per discipline, so a layer that is never switched on is never
  // downloaded. Together they are 17 MB; as one file they would double the
  // page's cost for everyone who only wanted to look at the building.
  const serviceLayers = [];
  for (const layer of CLINIC.serviceLayers) {
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
    id: CLINIC.id,
    name: CLINIC.name,
    summary: CLINIC.summary,
    useType: CLINIC.useType,
    licence: CLINIC.licence,
    attribution: CLINIC.attribution,
    sourceUrl: CLINIC.sourceUrl,
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
      storeys: storeys.filter((s) => s.floorToFloorHeightM > 0).length,
      spacesTotal: spaces.length,
      spacesFloor: floorSpaces.length,
      assemblies: assemblies.length,
      externalElements: classification.elements.length,
      exteriorWalls: exteriorWalls.size,
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
      wallCount: orientation.walls.length,
      note:
        "Azimuths are clockwise from north, where north is the model's -Z " +
        "after web-ifc's Z-up to Y-up conversion. Outward face inferred by " +
        "comparing each face's centroid with the building centre, which is " +
        "correct for a convex plan and can be wrong at a re-entrant corner.",
    },
    site: {
      declaredSiteName: site ? str(site.Name) : null,
      declaredLatitudeDeg: latitudeDeg,
      declaredLongitudeDeg: longitudeDeg,
      locationIsAuthoringDefault: isAuthoringDefault,
      locationNote: isAuthoringDefault
        ? "IfcSite matches the authoring tool's factory default (Boston, MA). " +
          "The building's real location is redacted; no climate may be taken from it."
        : "IfcSite coordinates recorded; not verified against any other source.",
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
