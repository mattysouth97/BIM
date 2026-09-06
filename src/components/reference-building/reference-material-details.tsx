"use client";

import { useId, useState, type CSSProperties } from "react";
import { envelopeConstructions, solveConstructions, type SolvedConstruction } from "@/lib/reference-buildings/constructions";
import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { layerThermalDetail, sourceMaterialSample, type MaterialSample } from "@/lib/reference-buildings/material-appearance";

function sampleStyle(sample: MaterialSample): CSSProperties {
  return { backgroundColor: sample.colour, backgroundImage: sample.image, backgroundSize: sample.size, backgroundBlendMode: sample.kind === "brick" ? "luminosity" : undefined };
}

/** Source order is retained. No claim is made about which face is outdoors. */
export function ReferenceConstructionCard({ construction, buildingId, isKo, initiallyOpen = false }: {
  construction: SolvedConstruction;
  buildingId: string;
  isKo: boolean;
  initiallyOpen?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(initiallyOpen);
  const detailId = useId();
  const bodyId = `${detailId}-body`;
  const layer = construction.layers[selected] ?? construction.layers[0];
  if (!layer) return null;
  const sample = sourceMaterialSample(buildingId, layer.ifcName);
  const thermal = layerThermalDetail(layer, construction);
  const totalThickness = construction.layers.reduce((sum, item) => sum + item.thicknessM, 0);
  const name = construction.name.replace(/^[^:]*:/, "");
  return (
    <article className="border-t border-border py-3" data-testid="reference-material-construction" data-construction-id={construction.id}>
      <button type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((value) => !value)} data-testid="material-construction-toggle" className="w-full cursor-pointer rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-[12px] leading-relaxed text-foreground">{name}</span>
          <span className="shrink-0 text-right font-mono text-[12px] text-foreground">
            <span className="block text-[9px] text-muted-foreground">{isKo ? "층 구성 계산" : "Layer calculation"}</span>
            {construction.uValueWPerM2K === null ? (isKo ? "U 미해결" : "U unresolved") : `U ${construction.uValueWPerM2K.toFixed(3)}`}
            <span className="block text-[9px] text-muted-foreground">W/m²K</span>
          </span>
        </div>
        <div className="mt-2 flex h-10 w-full overflow-hidden rounded-sm border border-foreground/15" aria-hidden="true">
          {construction.layers.map((item, index) => <span key={`${item.ref}-${index}`} style={{ ...sampleStyle(sourceMaterialSample(buildingId, item.ifcName)), width: `${totalThickness > 0 ? item.thicknessM / totalThickness * 100 : 0}%` }} className="h-full shrink-0 border-r border-black/20 last:border-0" />)}
        </div>
        <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-muted-foreground">
          <span>{isKo ? "재료 예시 · 두께 비례" : "Illustrative materials · thickness to scale"} · {(totalThickness * 1000).toFixed(1)} mm</span>
          <span>{expanded ? (isKo ? "접기 −" : "Collapse −") : (isKo ? "재료 살펴보기 +" : "Explore layers +")}</span>
        </div>
      </button>
      <div id={bodyId} hidden={!expanded}>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground" data-testid="material-appearance-basis">
        {isKo ? "텍스처는 재료 이해를 위한 예시입니다. 원본 층 순서를 유지했으며, 실제 색상·마감·시공 방향은 확인되지 않았습니다." : "Textures illustrate materials in source layer order. Actual colour, finish and installation direction are unverified."}
      </p>
      <div className="mt-3 space-y-1" role="group" aria-label={isKo ? "원본 재료층 선택" : "Select a source material layer"}>
        {construction.layers.map((item, index) => {
          const itemSample = sourceMaterialSample(buildingId, item.ifcName);
          return <button key={`${item.ref}-${index}`} type="button" aria-pressed={index === selected} aria-controls={detailId} onClick={() => setSelected(index)} className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${index === selected ? "border-foreground/40 bg-muted/70" : "border-transparent hover:bg-muted/40"}`}>
            <span className="h-9 w-9 shrink-0 rounded-sm border border-black/15" style={sampleStyle(itemSample)} aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words text-[11px] leading-snug text-foreground">{item.ifcName}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{(item.thicknessM * 1000).toFixed(1)} mm</span>
          </button>;
        })}
      </div>
      <div id={detailId} className="mt-3 rounded-md border border-border p-3" data-testid="material-layer-detail">
        <div className="flex items-start gap-3">
          <div className="h-16 w-20 shrink-0 rounded-sm border border-black/15" style={sampleStyle(sample)} role="img" aria-label={`${isKo ? "재료 예시" : "Illustrative material"}: ${isKo ? sample.ko : sample.en}`} data-material-sample={sample.kind} />
          <div className="min-w-0">
            <p className="break-words text-[12px] leading-snug text-foreground">{layer.ifcName}</p>
            <p className="mt-1 break-words font-mono text-[9px] text-muted-foreground">{layer.ref}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{isKo ? "모델에 명시된 두께" : "Thickness stated in model"}: {(layer.thicknessM * 1000).toFixed(1)} mm</p>
          </div>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground">{isKo ? "열 계산에 사용한 가정" : "Assumption used for heat transfer"}</p>
          <p className="mt-1 text-[11px] text-foreground">{thermal.material ? (isKo ? thermal.material.nameKo : thermal.material.nameEn) : (isKo ? "물성 미확인 — 열저항을 계산하지 않습니다" : "Property unresolved — no resistance calculated")}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-foreground">
            {layer.conductivityWPerMK !== null ? <span>λ {layer.conductivityWPerMK.toFixed(4)} W/mK</span> : null}
            <span>{thermal.fixedResistance ? (isKo ? "고정 " : "Fixed ") : ""}R {layer.resistanceM2KPerW === null ? "—" : layer.resistanceM2KPerW.toFixed(3)} m²K/W</span>
          </div>
          {thermal.shareOfTotal !== null ? <div className="mt-2" data-testid="material-resistance-share" data-share={thermal.shareOfTotal}>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/60" style={{ width: `${thermal.shareOfTotal * 100}%` }} /></div>
            <p className="mt-1 text-[10px] text-muted-foreground">{isKo ? "표면 저항을 포함한 전체 R의 " : "Of total R, including surface resistance: "}{(thermal.shareOfTotal * 100).toFixed(1)}%</p>
          </div> : <p className="mt-2 text-[10px] text-muted-foreground">{isKo ? "미해결 재료가 있어 전체 R 비율과 U를 표시하지 않습니다." : "Unresolved materials prevent a total-R share and assembly U."}</p>}
          {layer.mapping?.basisNote ? <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{layer.mapping.basisNote}</p> : null}
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        {isKo ? "U는 이 층 구성의 공기–공기 계산값입니다. 지면 접촉, 다른 벽체와의 조합, 원본에 명시된 U를 반영하는 건물 에너지 입력과 다를 수 있습니다." : "U is an air-to-air calculation for this layer set. The building energy input may instead use ground coupling, combined wall leaves or a source-stated U."}
      </p>
      <p className="mt-1 font-mono text-[9px] text-muted-foreground">{isKo ? "계산 열류 방향" : "Calculation heat-flow direction"}: {construction.direction} · {construction.result ? `Rsi ${construction.result.surface.rsi.toFixed(3)} + ΣR + Rse ${construction.result.surface.rse.toFixed(3)}` : (isKo ? "U 미해결" : "U unresolved")}</p>
      </div>
    </article>
  );
}

export function ReferenceMaterialDetails({ manifest, isKo }: { manifest: ReferenceBuildingManifest; isKo: boolean }) {
  const envelope = envelopeConstructions(manifest);
  // The KIT models name materials rather than envelope roles. Show those sets
  // explicitly as such; a material name does not establish exterior placement.
  const constructions = envelope.length ? envelope : solveConstructions(manifest);
  return <section className="mt-6" data-testid="reference-model-constructions">
    <h2 className="text-[12px] font-medium text-foreground">{isKo ? "재료와 열 전달" : "Materials and heat transfer"}</h2>
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{isKo ? "두께와 재료명은 모델에서 읽었습니다. 열전도율 λ와 공기층 R은 가정입니다. 같은 면적·온도차에서 R이 커지면 열을 더 잘 막고, U가 작아지면 통과하는 열이 줄어듭니다." : "Layer names and thicknesses come from the model. Conductivity λ and cavity R are assumptions. For the same area and temperature difference, higher R resists heat transfer and lower U means less heat passes through."}</p>
    <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{envelope.length ? (isKo ? "아래는 외피 관련 층 구성입니다. 개별 벽체 층이 건물 전체 벽의 성능을 뜻하지는 않습니다." : "These are envelope-related layer sets. An individual wall leaf is not the performance of the whole wall.") : (isKo ? "아래는 모델의 재료층 목록입니다. 재료명만으로 외벽·지붕·바닥 위치를 정하지 않습니다." : "These are the model's material layer sets. Names alone do not establish wall, roof or floor placement.")}</p>
    {constructions.length ? <div className="mt-3">{constructions.map((construction, index) => <ReferenceConstructionCard key={construction.id} construction={construction} buildingId={manifest.id} isKo={isKo} initiallyOpen={index === 0} />)}</div> : <p className="mt-3 text-[11px] text-muted-foreground">{isKo ? "모델에 재료층 정보가 없습니다." : "The model supplies no material layer sets."}</p>}
  </section>;
}
