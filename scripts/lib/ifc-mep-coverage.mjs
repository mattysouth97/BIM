import { readFile } from "node:fs/promises";
import * as webIfc from "web-ifc";
import { sha256 } from "./ifc-reader.mjs";
import { buildSourceElementLayer } from "./ifc-architectural-details.mjs";

// Derive occurrence classes from the parser's actual schema inheritance.
// IFC4 names the specific terminal/device classes that IFC2x3 often expresses
// through IfcFlowTerminal + an Ifc*Type. A prefix list can silently miss them.
// This excludes type catalogues and relationships by construction.
export function mepClassesForSchema(schema) {
  const name = schema === "IFC2X3" ? "IFC2X3" : /^IFC4X3(?:_ADD\d+)?$/.test(schema) ? "IFC4X3" : /^IFC4(?:_ADD\d+)?$/.test(schema) ? "IFC4" : null;
  const model = name ? webIfc[name] : null;
  if (!model) throw new Error(`MEP inventory does not support source schema ${schema ?? "missing"}`);
  const bases = [model.IfcDistributionElement, model.IfcElectricalElement].filter(Boolean);
  const descendantsOf = (roots) => Object.entries(model)
    .filter(([, candidate]) => typeof candidate === "function" && roots.some((base) => candidate === base || candidate.prototype instanceof base))
    .map(([className]) => className);
  return {
    elements: descendantsOf(bases),
    systems: descendantsOf([model.IfcSystem]),
  };
}

export function inventoryMepStep(text) {
  const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(text)?.[1]?.toUpperCase();
  const classes = mepClassesForSchema(schema);
  const canonicalType = new Map(classes.elements.map((name) => [name.toUpperCase(), name]));
  const systemTypes = new Set(classes.systems.map((name) => name.toUpperCase()));
  const entitiesByType = {};
  let distributionPorts = 0;
  let systems = 0;
  for (const match of text.matchAll(/^\s*#\d+\s*=\s*(IFC[A-Z0-9_]+)\s*\(/gmi)) {
    const rawType = match[1].toUpperCase();
    const type = canonicalType.get(rawType);
    if (type) entitiesByType[type] = (entitiesByType[type] ?? 0) + 1;
    if (rawType === "IFCDISTRIBUTIONPORT") distributionPorts += 1;
    if (systemTypes.has(rawType)) systems += 1;
  }
  return {
    schema,
    typedElementCount: Object.values(entitiesByType).reduce((sum, count) => sum + count, 0),
    entitiesByType,
    distributionPorts,
    systems,
  };
}

const LAYER_IDS = {
  "bs-medical-dental-clinic": ["hvac", "electrical", "plumbing"],
  "duplex-apartment": ["hvac", "electrical", "plumbing"],
  schependomlaan: ["utilities", "source-services"],
  "fzk-haus": [],
  "kit-office": [],
};

export async function buildMepCoverage({ buildingId, sources, serviceLayers }) {
  const inventory = [];
  for (const source of sources) {
    const bytes = await readFile(source.cachePath);
    const digest = sha256(bytes);
    if (digest !== source.sha256) throw new Error(`${source.fileName}: IFC changed during MEP inventory`);
    inventory.push({
      role: source.role, fileName: source.fileName, sha256: digest,
      ...inventoryMepStep(bytes.toString("utf8")),
    });
  }
  const candidateLayers = LAYER_IDS[buildingId] ?? ["hvac", "electrical", "plumbing", "utilities", "source-services"];
  const publishedLayerIds = candidateLayers.filter((id) => serviceLayers.some((layer) => layer.id === id));
  const typedElementCount = inventory.reduce((sum, source) => sum + source.typedElementCount, 0);
  const distributionPortCount = inventory.reduce((sum, source) => sum + source.distributionPorts, 0);
  return {
    schemaVersion: 1,
    status: publishedLayerIds.length > 0 ? "source_geometry_published" : typedElementCount === 0 ? "no_typed_mep_occurrences" : "source_occurrences_unpublished",
    publishedLayerIds,
    typedElementCount,
    distributionPortCount,
    sources: inventory,
    summary: publishedLayerIds.length === 0 && typedElementCount === 0 ? {
      ko: "제공된 IFC에는 분류된 MEP 요소와 배관·덕트 포트가 없습니다. 일반 가구·프록시는 설비로 추정하지 않습니다.",
      en: "The supplied IFC contains no typed MEP elements or distribution ports. Generic furniture and proxies are not interpreted as services.",
    } : publishedLayerIds.length === 0 ? {
      ko: "원본 IFC에 설비 요소가 있지만 검증된 MEP 형상 레이어는 아직 공개되지 않았습니다.",
      en: "The source IFC states services occurrences, but a verified MEP geometry layer has not been published.",
    } : buildingId === "schependomlaan" ? {
      ko: "건축 IFC의 우수배수 60개·환기구 13개와 별도 공급업체 유틸리티 연결 형상을 표시합니다. 포트가 없어 흐름 방향은 추정하지 않습니다.",
      en: "Shows 60 rainwater drainage elements and 13 ventilation grilles from the architectural IFC, plus the supplier utility connections. No distribution ports; no inferred flow direction.",
    } : {
      ko: "공개된 냉난방환기·전기·배관 IFC를 각각 표시합니다. 모델 간 중복 가능성이 있어 원본 요소 수를 설치 설비의 고유 개수로 해석하지 않습니다.",
      en: "Published HVAC, electrical and plumbing IFCs are shown separately. Source occurrence counts can overlap between models and are not unique installed equipment counts.",
    },
    limitations: [
      {
        ko: "해시로 고정된 IFC 파일에서 해당 스키마의 설비 분류 상속을 확인한 요소 목록이며, 실제 설치 설비의 완전성 조사가 아닙니다.",
        en: "Inventory of distribution occurrence classes using each pinned IFC file's schema inheritance, not a completeness survey of installed services.",
      },
      {
        ko: "분야별·수정본 모델 간 요소가 중복될 수 있으며 파일 간 설비 중복 제거는 하지 않았습니다.",
        en: "Counts include overlapping discipline and revision models; there is no cross-file equipment deduplication.",
      },
      {
        ko: "일반 IfcBuildingElementProxy·IfcFurnishingElement는 원본 근거 없이 MEP로 분류하지 않습니다.",
        en: "Generic IfcBuildingElementProxy and IfcFurnishingElement occurrences are not classified as MEP without source evidence.",
      },
      ...(buildingId === "bs-medical-dental-clinic" ? [
        {
          ko: "건축 모델의 말단기기는 목록에 포함하되, 설비 모델과의 중복 식별이 해결되지 않아 추가로 겹쳐 표시하지 않습니다.",
          en: "Architectural terminal occurrences are inventoried but not added over the coordinated services; duplicate identity has not been resolved.",
        },
      ] : []),
      ...(buildingId === "duplex-apartment" ? [
        {
          ko: "실·공간 IFC에도 별도 설비 표현이 있어 목록에 포함하되, 공개된 분야별 레이어 위에 겹쳐 표시하지 않습니다.",
          en: "The rooms-and-spaces IFC also contains an alternative services representation; it is inventoried but not overlaid on the published discipline layers.",
        },
      ] : []),
    ],
  };
}

export async function buildAdditionalMepLayer(options) {
  if (options.buildingId !== "schependomlaan") return null;
  return buildSourceElementLayer({
    ...options,
    selection: { architectural: ["IfcFlowSegment", "IfcDistributionElement"] },
    groupByType: { IfcFlowSegment: "rainwater", IfcDistributionElement: "vent" },
    layer: {
      id: "source-services", ko: "우수배수 · 환기구", en: "Rainwater drainage · vents",
      stem: "source-services", kind: "bimfit_reference_source_services",
      note: "Source architectural IFC geometry: 60 IfcFlowSegment named 'hwa afvoer' (rainwater drainage) and 13 IfcDistributionElement named 'vent. rooster' (ventilation grille). No distribution ports are stated, so no connectivity or flow direction is inferred. This is a partial source services layer, not a complete MEP design.",
    },
  });
}
