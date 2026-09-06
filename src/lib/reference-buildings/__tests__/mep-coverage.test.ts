import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InstancedMesh, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { REFERENCE_BUILDING_IDS } from "../manifest";
import { inventoryMepStep, mepClassesForSchema } from "../../../../scripts/lib/ifc-mep-coverage.mjs";

const read = (id: string, name: string) => readFileSync(path.join(process.cwd(), "public/reference-buildings", id, name));
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Source = { role: string; fileName: string; sha256: string; schema: string; typedElementCount: number; entitiesByType: Record<string, number>; distributionPorts: number; systems: number };
type Coverage = { status: string; publishedLayerIds: string[]; typedElementCount: number; distributionPortCount: number; sources: Source[]; summary: { ko: string; en: string }; limitations: { ko: string; en: string }[] };
type Layer = { id: string; file: string; byteLength: number; sha256: string; indexFile: string; indexSha256: string; elements: number; triangleCount: number; placedTriangleCount: number; drawCalls: number; note: string; flow?: unknown };
type Manifest = { mepCoverage: Coverage; sourceFiles: Source[]; serviceLayers: Layer[] };
const manifestOf = (id: string): Manifest => JSON.parse(read(id, "manifest.json").toString());

describe("IFC services source inventory", () => {
  it("counts schema occurrence classes, excluding catalogue types and generic objects", () => {
    const result = inventoryMepStep(`ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCFLOWSEGMENT('a');
#2=IFCFLOWTERMINAL('b');
#3=IFCPIPESEGMENTTYPE('catalogue');
#4=IFCFURNISHINGELEMENT('generic');
#5=IFCBUILDINGELEMENTPROXY('unclassified');
#6=IFCDISTRIBUTIONPORT('port');
#7=IFCSYSTEM('system');
ENDSEC;END-ISO-10303-21;`);
    expect(result).toEqual({ schema: "IFC2X3", typedElementCount: 2, entitiesByType: { IfcFlowSegment: 1, IfcFlowTerminal: 1 }, distributionPorts: 1, systems: 1 });
  });

  it("uses IFC4 inheritance for specific devices and refuses unknown schemas", () => {
    const result = inventoryMepStep("FILE_SCHEMA(('IFC4'));\n#1=IFCAIRTERMINAL('a');\n#2=IFCBOILER('b');\n#3=IFCAIRTERMINALTYPE('catalogue');");
    expect(result.entitiesByType).toEqual({ IfcAirTerminal: 1, IfcBoiler: 1 });
    expect(mepClassesForSchema("IFC4X3_ADD2").elements).toContain("IfcPipeSegment");
    expect(() => inventoryMepStep("FILE_SCHEMA(('UNKNOWN'));\n#1=IFCBOILER('b');")).toThrow("does not support");
  });

  const expected: Record<string, [number, number, number]> = {
    "bs-medical-dental-clinic": [12482, 20448, 3],
    "duplex-apartment": [2010, 970, 3],
    schependomlaan: [73, 0, 2],
    "fzk-haus": [0, 0, 0],
    "kit-office": [0, 0, 0],
    "klassiqua-office-1970": [0, 0, 0],
    "taltech-maemaja": [528, 1644, 1],
  };
  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: coverage counts reconcile all pinned source files and actual published layers`, () => {
      const manifest = manifestOf(id);
      const coverage = manifest.mepCoverage;
      expect(coverage.sources).toHaveLength(manifest.sourceFiles.length);
      for (const source of coverage.sources) {
        expect(manifest.sourceFiles.find((entry) => entry.role === source.role)).toMatchObject({ fileName: source.fileName, sha256: source.sha256 });
        expect(Object.values(source.entitiesByType).reduce((sum, count) => sum + count, 0)).toBe(source.typedElementCount);
        for (const name of Object.keys(source.entitiesByType)) expect(mepClassesForSchema(source.schema).elements).toContain(name);
      }
      expect(coverage.sources.reduce((sum, source) => sum + source.typedElementCount, 0)).toBe(coverage.typedElementCount);
      expect(coverage.sources.reduce((sum, source) => sum + source.distributionPorts, 0)).toBe(coverage.distributionPortCount);
      expect([coverage.typedElementCount, coverage.distributionPortCount, coverage.publishedLayerIds.length]).toEqual(expected[id]);
      for (const layerId of coverage.publishedLayerIds) {
        const layer = manifest.serviceLayers.find((candidate) => candidate.id === layerId)!;
        expect(layer).toBeDefined();
        expect(read(id, layer.file).length).toBe(layer.byteLength);
      }
      for (const note of coverage.limitations) {
        expect(note.ko.length).toBeGreaterThan(10);
        expect(note.en.length).toBeGreaterThan(10);
      }
      expect(coverage.limitations.map((note) => note.en).join(" ")).toContain("no cross-file equipment deduplication");
      if (coverage.status === "no_typed_mep_occurrences") {
        expect(coverage.typedElementCount).toBe(0);
        expect(coverage.distributionPortCount).toBe(0);
        expect(coverage.publishedLayerIds).toEqual([]);
        expect(coverage.summary.en).toContain("Generic furniture and proxies are not interpreted as services");
      }
    });
  }

  it("Schependomlaan publishes the actual 60 drainage elements and 13 grilles, without invented flow", async () => {
    const manifest = manifestOf("schependomlaan");
    const layer = manifest.serviceLayers.find((entry) => entry.id === "source-services")!;
    const indexBytes = read("schependomlaan", layer.indexFile);
    const index = JSON.parse(indexBytes.toString()) as { entities: { ifcType: string; name: string; placedTriangles: number }[] };
    expect(digest(indexBytes)).toBe(layer.indexSha256);
    const counts = [
      index.entities.filter((e) => e.ifcType === "IfcFlowSegment" && e.name === "hwa afvoer").length,
      index.entities.filter((e) => e.ifcType === "IfcDistributionElement" && e.name === "vent. rooster").length,
    ];
    expect(counts).toEqual([60, 13]);
    expect(index.entities).toHaveLength(73);
    expect(layer.elements).toBe(73);
    const claimed = /Shows (\d+) rainwater drainage elements and (\d+) ventilation grilles/.exec(manifest.mepCoverage.summary.en)!;
    expect(claimed.slice(1).map(Number)).toEqual(counts);
    const noteClaims = /geometry: (\d+) IfcFlowSegment[\s\S]* and (\d+) IfcDistributionElement/.exec(layer.note)!;
    expect(noteClaims.slice(1).map(Number)).toEqual(counts);
    expect(layer.flow).toBeUndefined();
    const glb = read("schependomlaan", layer.file);
    expect(digest(glb)).toBe(layer.sha256);
    expect(glb.length).toBe(layer.byteLength);
    expect(glb.length).toBeLessThan(1024 * 1024);
    const model = await new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, "");
    let calls = 0, stored = 0, placed = 0;
    model.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      calls += 1;
      const triangles = object.geometry.index!.count / 3;
      stored += triangles;
      placed += triangles * (object instanceof InstancedMesh ? object.count : 1);
    });
    expect(calls).toBe(layer.drawCalls);
    expect(stored).toBe(layer.triangleCount);
    expect(placed).toBe(layer.placedTriangleCount);
    expect(placed).toBe(index.entities.reduce((sum, e) => sum + e.placedTriangles, 0));
  });
});
