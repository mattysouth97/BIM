"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/store/app-store";

import type { ReferenceBuildingId, ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import type { SolvedConstruction } from "@/lib/reference-buildings/constructions";
import type { ReferenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { ReferenceModelViewer } from "./reference-model-viewer";
import {
  ReferenceEnergyFrame,
  ReferenceEnergyPanel,
  ReferenceAnalysisOverlays,
  useSeedReferenceEnergy,
} from "./reference-energy";
import { ReferenceRetrofitPanel } from "./reference-retrofit";
import { ReferenceViewControls, type ReferenceViewRequest } from "./reference-view-controls";
import { ReferenceDatasetDownloads } from "./reference-dataset-downloads";
import { ReferenceArchitecturalDetails, type ArchitecturalDetailsStatus } from "./reference-architectural-details";
import { clearArchitecturalDetails } from "./reference-detail-geometry";
import { ReferenceMepCoverage } from "./reference-mep-coverage";
import { ReferenceMaterialDetails } from "./reference-material-details";
import { ReferenceInfoNavigation, useReferenceInfoSection } from "./reference-info-navigation";

export const FABRIC_LAYER = "fabric";

export const LAYER_COLOUR: Record<string, string> = {
  fabric: "#c9c5bd",
  hvac: "#9ebcdb",
  electrical: "#f0cc5c",
  plumbing: "#dc855c",
  // Schependomlaan's subcontractor set. Each hex is the same colour the
  // layer's GLB material carries (`colours` in build-reference-building.mjs),
  // so the swatch beside the row is the colour of the thing it switches on.
  structure: "#6b7889",
  precast: "#b8ad9e",
  roofing: "#b86147",
  railings: "#ccd1d9",
  blockwork: "#e6dfa8",
  utilities: "#4dbfb3",
};

/**
 * The model page's two halves: a canvas that holds only the building, and a
 * panel that holds everything said about it.
 *
 * Layer state lives here rather than in the viewer because both halves need
 * it — the canvas to draw, the panel to offer. Keeping the controls out of the
 * canvas means the 3D view never has to compete with a legend for the same
 * pixels, and the panel can scroll on a short window without the model moving.
 */
export function ReferenceBuildingWorkspace({
  manifest,
  modelUrl,
  baseUrl,
  constructions,
  energy,
  locale: fallbackLocale,
}: {
  manifest: ReferenceBuildingManifest;
  modelUrl: string;
  baseUrl: string;
  /** Solved on the server — see the note in `page.tsx`. */
  constructions: readonly SolvedConstruction[];
  /**
   * The building's recipe + materials for the demo's energy frame, or null
   * for a building whose inputs have not been written — in which case the
   * page shows the model and says nothing about energy.
   */
  energy: ReferenceBuildingEnergyInputs | null;
  locale: "ko" | "en";
}) {
  const locale = useAppStore((state) => state.language) ?? fallbackLocale;
  const isKo = locale === "ko";
  const [activeSection, setActiveSection] = useReferenceInfoSection();
  useSeedReferenceEnergy(energy);
  const [active, setActive] = useState<ReadonlySet<string>>(
    () => new Set([FABRIC_LAYER, ...(manifest.architecturalDetails ? [manifest.architecturalDetails.id] : [])]),
  );
  const [detailsStatus, setDetailsStatus] = useState<ArchitecturalDetailsStatus>("waiting");
  const [detailsRetry, setDetailsRetry] = useState(0);
  const [flowVisible, setFlowVisible] = useState(true);
  const [inspection, setInspection] = useState(false);
  const [viewRequest, setViewRequest] = useState<ReferenceViewRequest>({ view: "exterior", revision: 0 });

  const toggle = (id: string) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const services = manifest.serviceLayers ?? [];
  const activeServices = services.filter((layer) => active.has(layer.id));
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  // A 28 KB layer printed as "0.0 MB" is a true rounding and a false size.
  const fmtBytes = (bytes: number) =>
    bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return (
    // `h-dvh` minus the app header's h-12 row and one-pixel border. A div rather than a
    // second <main>: the root layout already provides one, and nesting them
    // both broke the landmark and pushed this panel's heading up behind the
    // header bar where it was clipped.
    <div className="mx-auto grid h-[calc(100dvh-3rem-1px)] max-w-[92rem] grid-rows-[minmax(15rem,42%)_minmax(0,1fr)] gap-3 p-3 lg:flex lg:gap-4 lg:p-4" data-testid="reference-workspace">
      <section className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-xs" data-testid="reference-model-canvas">
        <ReferenceModelViewer
          modelUrl={modelUrl}
          baseUrl={baseUrl}
          services={services}
          active={active}
          fabricLayerId={FABRIC_LAYER}
          flowVisible={flowVisible}
          manifest={manifest}
          energy={energy}
          locale={locale}
          viewRequest={viewRequest}
          inspection={inspection}
          detailsRetry={detailsRetry}
          onDetailsStatus={setDetailsStatus}
        />
        {energy ? (
          <div className={inspection ? "hidden" : undefined} data-testid="reference-energy-overlays">
          <ReferenceEnergyFrame
            energy={energy}
            manifest={manifest}
            baseUrl={baseUrl}
            locale={locale}
          />
          </div>
        ) : null}
      </section>

      {/* Scrolls on its own so a short window never clips what is written
          here. The attribution in particular is a CC BY condition, and a
          licence term that only appears on a tall monitor is not met. */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col lg:w-[24rem]" aria-label={isKo ? "건물 정보" : "Building information"}>
        <div className="mb-2 flex shrink-0 items-start gap-3">
        <Link
          href="/"
          aria-label={isKo ? "모델 갤러리로 돌아가기" : "Back to model gallery"}
          className="inline-flex min-h-8 items-center rounded-sm font-mono text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          ← BIMFIT
        </Link>
        <h1 className="min-w-0 flex-1 pt-1 text-base font-medium leading-snug text-foreground lg:text-lg">{isKo ? manifest.name.ko : manifest.name.en}</h1>
        </div>
        <ReferenceViewControls
          request={viewRequest}
          onView={(view) => setViewRequest((current) => ({ view, revision: current.revision + 1 }))}
          inspection={inspection}
          onInspection={() => setInspection((current) => !current)}
          isKo={isKo}
        />
        <ReferenceInfoNavigation activeSection={activeSection} onSectionChange={setActiveSection} isKo={isKo}>
        {{
          overview: <>
            <h2 className="text-sm font-medium text-foreground">{isKo ? "건물과 에너지" : "Building & energy"}</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{isKo ? manifest.summary.ko : manifest.summary.en}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border p-3">
                <dt className="text-xs text-muted-foreground">{isKo ? "원본 연면적" : "Source floor area"}</dt>
                <dd className="mt-1 font-mono text-base">{fmt(manifest.areas.totalFloorAreaSqm)} <span className="text-xs">m²</span></dd>
              </div>
              <div className="rounded-md border border-border p-3">
                <dt className="text-xs text-muted-foreground">{isKo ? "공간이 기록된 층" : "Storeys with spaces"}</dt>
                <dd className="mt-1 font-mono text-base">{manifest.counts.storeys}</dd>
              </div>
            </dl>
            {energy ? <>
              <ReferenceEnergyPanel energy={energy} manifest={manifest} locale={locale} />
              <ReferenceRetrofitPanel energy={energy} locale={locale} />
            </> : <p className="mt-4 text-xs text-muted-foreground">{isKo ? "이 모델의 에너지 입력은 아직 준비되지 않았습니다." : "Energy inputs are not yet available for this model."}</p>}
          </>,
          materials: <div className="[&>section]:mt-0"><ReferenceMaterialDetails manifest={manifest} constructions={constructions} isKo={isKo} /></div>,
          layers: <>
        <section data-testid="reference-model-layers">
          <h2 className="text-sm font-medium text-foreground">
            {isKo ? "모델 레이어" : "Model layers"}
          </h2>
          <div className="mt-2">
            <LayerRow
              id={FABRIC_LAYER}
              // "외피·구조" until 2026-09-04, which claimed something the file
              // does not contain: `build-reference-building.mjs` calls
              // `collectFabric` without `includeStructure`, so the frame — 82%
              // of the model's triangles — is deliberately not in this GLB.
              // The manifest said so all along in `model.note`; the label
              // contradicted it and the note was never rendered.
              label={isKo ? "외피" : "Fabric"}
              detail={`${manifest.model.triangleCount.toLocaleString()} ${isKo ? "삼각형" : "tris"} · ${(manifest.model.byteLength / 1048576).toFixed(1)} MB`}
              colour={LAYER_COLOUR.fabric}
              on={active.has(FABRIC_LAYER)}
              onToggle={toggle}
            />
            {manifest.architecturalDetails ? (
              <ReferenceArchitecturalDetails
                layer={manifest.architecturalDetails}
                active={active.has(manifest.architecturalDetails.id)}
                status={detailsStatus}
                baseUrl={baseUrl}
                isKo={isKo}
                onToggle={() => toggle(manifest.architecturalDetails!.id)}
                onRetry={() => {
                  clearArchitecturalDetails(`${baseUrl}/${manifest.architecturalDetails!.file}`);
                  setDetailsStatus("waiting");
                  setDetailsRetry((current) => current + 1);
                }}
              />
            ) : null}
            {services.map((layer) => (
              <div key={layer.id}>
                <LayerRow
                  id={layer.id}
                  label={isKo ? layer.ko : layer.en}
                  // "0 shapes → 0 placements" under a layer of 4,293 roof
                  // tiles is a true sentence that reads as an empty layer. A
                  // set with no repeated shape gets the fabric row's form —
                  // triangles and bytes — instead of an instancing figure
                  // that has nothing to count.
                  detail={
                    layer.instancedShapes > 0
                      ? isKo
                        ? `요소 ${layer.elements.toLocaleString()} · 형상 ${layer.instancedShapes.toLocaleString()}종 → ${layer.instancedPlacements.toLocaleString()}회 · ${fmtBytes(layer.byteLength)}`
                        : `${layer.elements.toLocaleString()} elements · ${layer.instancedShapes.toLocaleString()} shapes → ${layer.instancedPlacements.toLocaleString()} placements · ${fmtBytes(layer.byteLength)}`
                      : isKo
                        ? `요소 ${layer.elements.toLocaleString()} · ${layer.triangleCount.toLocaleString()} 삼각형 · ${fmtBytes(layer.byteLength)}`
                        : `${layer.elements.toLocaleString()} elements · ${layer.triangleCount.toLocaleString()} tris · ${fmtBytes(layer.byteLength)}`
                  }
                  colour={LAYER_COLOUR[layer.id] ?? "#9aa0a6"}
                  on={active.has(layer.id)}
                  onToggle={toggle}
                />
                {/* A layer that is NOT the model's own geometry says so here,
                    in the generator's words, directly under its row. */}
                {layer.note ? (
                  <p
                    className="mb-1 pl-6 pr-1.5 text-[10px] leading-relaxed text-muted-foreground"
                    data-testid={`reference-model-layer-${layer.id}-note`}
                  >
                    {layer.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <ReferenceMepCoverage coverage={manifest.mepCoverage} isKo={isKo} />
          {/* The generator's own sentence about how THIS building's layers
              were packed, when it wrote one. The generic line below it
              claimed every component was the model's own geometry, which
              stopped being true the day a layer shipped as boxes. */}
          <details className="mt-3 rounded-md border border-border p-3">
            <summary className="cursor-pointer text-xs text-foreground">{isKo ? "레이어 범위와 생략 항목" : "Layer scope & omissions"}</summary>
            {manifest.model.serviceNote ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{manifest.model.serviceNote}</p> : null}
          {/* What the fabric GLB leaves out, in the generator's own words.
              The manifest has carried this sentence since the first build and
              nothing displayed it, so the one place a reader could learn that
              the structural frame is absent was a file they never open. */}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground/70">{isKo ? "기본 외피 파일: " : "Base fabric file: "}</span>
            {manifest.model.note}
          </p>
          </details>

          {/* Flow is a property of the SOURCE, not a decoration we add. The
              toggle sits with the layers, but what each discipline can say
              about direction is stated underneath rather than implied by
              whether something moves. */}
          {services.some((layer) => layer.flow) ? (
            <div className="mt-4 border-t border-border pt-3">
              {/* The toggle exists only where some layer can animate. A
                  building whose every model declares no ports — the
                  apartment's 33 subcontractor files — keeps the heading and
                  the per-layer statements below, and offers no switch for
                  an animation that cannot happen. */}
              {services.some((layer) => layer.flow?.file) ? (
                <LayerRow
                  id="flow"
                  label={isKo ? "흐름 방향" : "Flow direction"}
                  detail={
                    isKo
                      ? "모델이 명시한 방향만 · 포트 그래프에서 추출"
                      : "Only where the model states it · read from the port graph"
                  }
                  colour="#67e8f9"
                  on={flowVisible}
                  onToggle={() => setFlowVisible((on) => !on)}
                />
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {isKo ? "흐름 방향" : "Flow direction"}
                  </p>
                  {/* A heading with nothing under it is an absence rendered as
                      a blank. The generator's own sentence about WHY says so
                      in the services note, which a reader has no reason to
                      connect to this heading — so the reason is stated here,
                      where the question is asked. */}
                  <p
                    className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground"
                    data-testid="reference-model-flow-absent"
                  >
                    {isKo
                      ? `서비스 모델 ${services.length}개 모두 배분 포트가 명시되지 않아 흐름 방향을 표시할 수 없습니다.`
                      : `None of the ${services.length} service models declares distribution ports, so flow direction is unavailable.`}
                  </p>
                </>
              )}
              {activeServices.map((layer) => (
                <FlowNote
                  key={`${layer.id}-note`}
                  label={isKo ? layer.ko : layer.en}
                  flow={layer.flow}
                  isKo={isKo}
                />
              ))}
            </div>
          ) : null}
        </section>

        {energy ? <ReferenceAnalysisOverlays locale={locale} /> : null}
          </>,
          data: <>
        <h2 className="text-sm font-medium text-foreground">{isKo ? "원본 데이터" : "Source data"}</h2>
        <div className="mt-3">
          <ReferenceDatasetDownloads buildingId={manifest.id as ReferenceBuildingId} locale={locale} />
        </div>
        <details className="mt-4 rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground">{isKo ? "모델 수량과 산출 근거" : "Model quantities & evidence"}</summary>
        <dl className="mt-3">
          <Stated
            label={isKo ? "연면적" : "Floor area"}
            value={`${fmt(manifest.areas.totalFloorAreaSqm)} m²`}
            // Written from the counts, not from a sentence: this line read
            // "GSA BIM Area, less 0 m² of ROOF / OPEN TO BELOW / MECH. YARD"
            // on the apartment, which has no GSA quantity and none of those
            // rooms. The Clinic's exclusions are named in its spaces.json
            // per row; here only the arithmetic the manifest states is shown.
            read={
              manifest.counts.spacesTotal > manifest.counts.spacesFloor
                ? `${manifest.counts.spacesFloor} of ${manifest.counts.spacesTotal} spaces · the model's own area quantity, less ${fmt(
                    manifest.areas.areaPlanTotalSqm - manifest.areas.totalFloorAreaSqm,
                  )} m² over ${manifest.counts.spacesTotal - manifest.counts.spacesFloor} non-floor spaces`
                : `${manifest.counts.spacesFloor} spaces · the model's own area quantity · every space is floor`
            }
          />
          <Stated
            label={isKo ? "외벽 (순)" : "Net exterior wall"}
            value={`${fmt(manifest.areas.exteriorWallNetSqm)} m²`}
            read={manifest.areas.exteriorWallNote ?? `${manifest.counts.exteriorWalls} walls · extracted net area of selected exterior walls`}
          />
          <Stated
            label={isKo ? "공간이 기록된 층" : "Storeys with modeled spaces"}
            value={`${manifest.counts.storeys}`}
            read="IfcBuildingStorey referenced by at least one IfcSpace · includes below-grade storeys"
          />
          <Stated
            label={isKo ? "재료층 구성" : "Material assemblies"}
            value={`${manifest.counts.assemblies}`}
            read="IfcMaterialLayerSet · layer names and thicknesses"
          />
        </dl>
        </details>

        {/* The model states no location, and saying so is the point. */}
        {manifest.site.locationIsAuthoringDefault ? (
          <p className="mt-6 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
            {manifest.site.locationNote}
          </p>
        ) : null}

        <section className="mt-4 border-t border-border pt-4">
        <h3 className="text-xs font-medium">{isKo ? "출처와 라이선스" : "Source & licence"}</h3>
        <p
          className="mt-2 text-xs leading-relaxed break-words text-muted-foreground"
          data-testid="reference-model-attribution"
        >
          {manifest.attribution
            ? `${manifest.licence} · ${manifest.attribution}`
            : locale === "ko"
              ? `${manifest.licence} · 저작권자 미확인`
              : `${manifest.licence} · rights holder unconfirmed`}
        </p>
        </section>
          </>,
        }}
        </ReferenceInfoNavigation>
      </aside>
    </div>
  );
}

type ServiceLayer = NonNullable<
  ReferenceBuildingManifest["serviceLayers"]
>[number];

/**
 * What one discipline model can say about the direction of flow — including,
 * for two of the Clinic's three, that it says nothing.
 *
 * Written from the counts rather than from the extractor's prose so there is
 * one source of truth and nothing to translate. The electrical model declaring
 * no ports at all is the most informative line on this panel: it is a concrete
 * statement about what a coordination model does and does not carry, and it
 * would be invisible if the layer simply animated nothing.
 *
 * It said "N downstream of plant, M upstream" until 2026-09-06, which is a
 * supply/return claim the extractor never makes. `supplySegments` is what the
 * walk REACHED from a plant node and `returnSegments` is, in the manifest
 * type's own words, "the rest" — so on a layer with no plant the second
 * number is every segment there is, and the sentence describes a
 * classification that never ran on a plant the file does not contain.
 */
/**
 * The sentence itself, as a pure function so a test can parse the claim back
 * out. Exported for that reason and no other.
 */
export function flowNoteBody(
  flow: NonNullable<ServiceLayer["flow"]>,
  isKo: boolean,
): string {
  const n = (value: number) => value.toLocaleString("en-US");

  if (flow.ports === 0) {
    return isKo
      ? "배분 포트를 선언하지 않음 — 이 파일에는 계통 위상이 없습니다."
      : "declares no distribution ports — this file carries no network topology.";
  }
  if (flow.drawnEdges === 0) {
    return isKo
      ? `연결 ${n(flow.connections)}개가 모두 양방향으로 선언됨 — 방향을 읽을 수 없습니다.`
      : `all ${n(flow.connections)} connections are declared bidirectional — no direction to read.`;
  }
  const ratio =
    flow.drawnEdges === flow.connections
      ? isKo
        ? `연결 ${n(flow.connections)}개 전부에 방향이 명시됨`
        : `all ${n(flow.connections)} connections state a direction`
      : isKo
        ? `연결 ${n(flow.connections)}개 중 ${n(flow.drawnEdges)}개만 방향이 명시됨 (나머지 ${n(flow.bidirectionalEdges)}개는 양방향 선언)`
        : `${n(flow.drawnEdges)} of ${n(flow.connections)} connections state a direction (the other ${n(flow.bidirectionalEdges)} are declared bidirectional)`;

  // `returnSegments` is not "return" — the manifest's own field comment calls
  // it "the rest": everything the walk did not reach from a plant node.
  // Printing it as 상류/upstream states a classification the file did not
  // make, and with no plant to walk from it states one that never ran. The
  // Clinic's plumbing declares 2 plant nodes and lands 944 of its 954
  // directed segments in "the rest"; domestic water is mostly supply to
  // fixtures, so that is a reachability result, not a supply/return split.
  const split =
    flow.plantNodes === 0
      ? isKo
        ? ` · 기기(플랜트)를 선언하지 않아 급기/환기 구분은 계산되지 않았습니다`
        : ` · no plant is declared, so supply and return were never classified`
      : isKo
        ? ` · 선언된 기기 ${n(flow.plantNodes)}개에서 도달 가능한 구간 ${n(flow.supplySegments)} · 도달하지 못한 구간 ${n(flow.returnSegments)}`
        : ` · ${n(flow.supplySegments)} reachable from the ${n(flow.plantNodes)} declared plant node${flow.plantNodes === 1 ? "" : "s"}, ${n(flow.returnSegments)} not reached`;

  return ratio + split;
}

function FlowNote({
  label,
  flow,
  isKo,
}: {
  label: string;
  flow: ServiceLayer["flow"];
  isKo: boolean;
}) {
  if (!flow) return null;
  return (
    <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
      <span className="text-foreground/70">{label}</span> — {flowNoteBody(flow, isKo)}
    </p>
  );
}

/** A figure and the thing in the model that states it. */
function Stated({
  label,
  value,
  read,
}: {
  label: string;
  value: string;
  read: string;
}) {
  return (
    <div className="border-t border-border py-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-base text-foreground">{value}</dd>
      <dd className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
        {read}
      </dd>
    </div>
  );
}

function LayerRow({
  id,
  label,
  detail,
  colour,
  on,
  onToggle,
}: {
  id: string;
  label: string;
  detail: string;
  colour: string;
  on: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      aria-pressed={on}
      data-testid={`reference-model-layer-${id}`}
      className="flex min-h-11 w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span
        aria-hidden
        className="mt-[3px] size-2.5 shrink-0 rounded-full border"
        style={{
          backgroundColor: on ? colour : "transparent",
          borderColor: colour,
        }}
      />
      <span className="min-w-0">
        <span
          className={`block text-xs ${on ? "text-foreground" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}
