"use client";

import { useState } from "react";
import Link from "next/link";

import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import type { SolvedConstruction } from "@/lib/reference-buildings/constructions";
import type { ReferenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { ReferenceModelViewer } from "./reference-model-viewer";
import {
  ReferenceEnergyFrame,
  ReferenceEnergyPanel,
  useSeedReferenceEnergy,
} from "./reference-energy";

export const FABRIC_LAYER = "fabric";

export const LAYER_COLOUR: Record<string, string> = {
  fabric: "#c9c5bd",
  hvac: "#9ebcdb",
  electrical: "#f0cc5c",
  plumbing: "#dc855c",
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
  locale,
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
  const isKo = locale === "ko";
  useSeedReferenceEnergy(energy);
  const [active, setActive] = useState<ReadonlySet<string>>(
    () => new Set([FABRIC_LAYER]),
  );
  const [flowVisible, setFlowVisible] = useState(true);

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

  return (
    // `h-dvh` minus the app header's own `h-12`, and a div rather than a
    // second <main>: the root layout already provides one, and nesting them
    // both broke the landmark and pushed this panel's heading up behind the
    // header bar where it was clipped.
    <div className="mx-auto flex h-[calc(100dvh-3rem)] max-w-[92rem] flex-col gap-4 px-4 py-4 lg:flex-row">
      <section className="relative min-h-[24rem] flex-1 overflow-hidden rounded-[8px] border border-border bg-card shadow-xs">
        <ReferenceModelViewer
          modelUrl={modelUrl}
          baseUrl={baseUrl}
          services={services}
          active={active}
          fabricLayerId={FABRIC_LAYER}
          flowVisible={flowVisible}
        />
        {energy ? (
          <ReferenceEnergyFrame
            energy={energy}
            manifest={manifest}
            baseUrl={baseUrl}
            locale={locale}
          />
        ) : null}
      </section>

      {/* Scrolls on its own so a short window never clips what is written
          here. The attribution in particular is a CC BY condition, and a
          licence term that only appears on a tall monitor is not met. */}
      <aside className="w-full shrink-0 overflow-y-auto lg:w-[23rem]">
        <Link
          href="/"
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          ← BIMFIT
        </Link>
        <h1 className="mt-4 text-2xl text-foreground">{manifest.name.ko}</h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {manifest.name.en}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {manifest.summary.ko}
        </p>

        <section className="mt-6" data-testid="reference-model-layers">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {isKo ? "디지털 트윈 레이어" : "Model layers"}
          </p>
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
            {services.map((layer) => (
              <LayerRow
                key={layer.id}
                id={layer.id}
                label={isKo ? layer.ko : layer.en}
                detail={
                  isKo
                    ? `요소 ${layer.elements.toLocaleString()} · 형상 ${layer.instancedShapes.toLocaleString()}종 → ${layer.instancedPlacements.toLocaleString()}회 · ${(layer.byteLength / 1048576).toFixed(1)} MB`
                    : `${layer.elements.toLocaleString()} elements · ${layer.instancedShapes.toLocaleString()} shapes → ${layer.instancedPlacements.toLocaleString()} placements · ${(layer.byteLength / 1048576).toFixed(1)} MB`
                }
                colour={LAYER_COLOUR[layer.id] ?? "#9aa0a6"}
                on={active.has(layer.id)}
                onToggle={toggle}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {isKo
              ? "모든 부재가 모델의 실제 형상입니다. 반복되는 형상은 한 번만 담고 배치 정보로 놓았습니다. 레이어는 켤 때 내려받습니다."
              : "Every component is the model's own geometry. A repeated shape is stored once and placed many times. Layers download when switched on."}
          </p>
          {/* What the fabric GLB leaves out, in the generator's own words.
              The manifest has carried this sentence since the first build and
              nothing displayed it, so the one place a reader could learn that
              the structural frame is absent was a file they never open. */}
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {manifest.model.note}
          </p>

          {/* Flow is a property of the SOURCE, not a decoration we add. The
              toggle sits with the layers, but what each discipline can say
              about direction is stated underneath rather than implied by
              whether something moves. */}
          {services.some((layer) => layer.flow) ? (
            <div className="mt-4 border-t border-border pt-3">
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

        {/* What the envelope is made of, and what that makes it worth
            thermally. Worst first: the standing-seam roof at U 3.45 sits
            beside an EPDM roof at 0.317, and an alphabetical list would bury
            the worst surface in the building under the best one. */}
        {constructions.length > 0 ? (
          <section className="mt-6" data-testid="reference-model-constructions">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {isKo ? "외피 구성 · U-값" : "Envelope constructions · U-value"}
            </p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              {isKo
                ? "층 순서와 두께는 모델이 명시한 사실입니다. 열전도율은 모두 가정이며, 각 층마다 근거를 답니다 — 이 파일에는 U-값도 재료 물성도 없습니다."
                : "Layer order and thickness are stated by the model. Every conductivity is an assumption with a named basis — this file states no U-value and no material property."}
            </p>
            <div className="mt-3">
              {constructions.map((c) => (
                <Construction key={c.id} construction={c} isKo={isKo} />
              ))}
            </div>
          </section>
        ) : null}

        {energy ? (
          <ReferenceEnergyPanel energy={energy} manifest={manifest} locale={locale} />
        ) : null}

        <dl className="mt-6">
          <Stated
            label="연면적"
            value={`${fmt(manifest.areas.totalFloorAreaSqm)} m²`}
            read={`${manifest.counts.spacesFloor} spaces · GSA BIM Area, less ${fmt(
              manifest.areas.areaPlanTotalSqm - manifest.areas.totalFloorAreaSqm,
            )} m² of ROOF / OPEN TO BELOW / MECH. YARD`}
          />
          <Stated
            label="외벽 (순)"
            value={`${fmt(manifest.areas.exteriorWallNetSqm)} m²`}
            read={`${manifest.counts.exteriorWalls} walls · tessellated solid, openings and clips already voided`}
          />
          <Stated
            label="지상층"
            value={`${manifest.counts.storeys}`}
            read="IfcBuildingStorey with a storey above it"
          />
          <Stated
            label="구성 (레이어)"
            value={`${manifest.counts.assemblies}`}
            read="IfcMaterialLayerSet · names and thicknesses only, no U-value stated"
          />
        </dl>

        {/* The model states no location, and saying so is the point. */}
        {manifest.site.locationIsAuthoringDefault ? (
          <p className="mt-6 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
            {manifest.site.locationNote}
          </p>
        ) : null}

        <p
          className="mt-4 pb-6 font-mono text-[10px] leading-relaxed break-words text-muted-foreground"
          data-testid="reference-model-attribution"
        >
          {manifest.attribution
            ? `${manifest.licence} · ${manifest.attribution}`
            : locale === "ko"
              ? `${manifest.licence} · 저작권자가 확인되지 않아 표기를 비워 둡니다. 틀린 이름을 적는 것보다 낫습니다.`
              : `${manifest.licence} · the rights holder is not established, so no credit is given. A wrong name would be worse than none.`}
        </p>
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
 */
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
  const n = (value: number) => value.toLocaleString("en-US");

  let body: string;
  if (flow.ports === 0) {
    body = isKo
      ? "배분 포트를 선언하지 않음 — 이 파일에는 계통 위상이 없습니다."
      : "declares no distribution ports — this file carries no network topology.";
  } else if (flow.drawnEdges === 0) {
    body = isKo
      ? `연결 ${n(flow.connections)}개가 모두 양방향으로 선언됨 — 방향을 읽을 수 없습니다.`
      : `all ${n(flow.connections)} connections are declared bidirectional — no direction to read.`;
  } else {
    const ratio =
      flow.drawnEdges === flow.connections
        ? isKo
          ? `연결 ${n(flow.connections)}개 전부에 방향이 명시됨`
          : `all ${n(flow.connections)} connections state a direction`
        : isKo
          ? `연결 ${n(flow.connections)}개 중 ${n(flow.drawnEdges)}개만 방향이 명시됨 (나머지 ${n(flow.bidirectionalEdges)}개는 양방향 선언)`
          : `${n(flow.drawnEdges)} of ${n(flow.connections)} connections state a direction (the other ${n(flow.bidirectionalEdges)} are declared bidirectional)`;
    const split = isKo
      ? ` · 기기 하류 ${n(flow.supplySegments)} · 상류 ${n(flow.returnSegments)}`
      : ` · ${n(flow.supplySegments)} downstream of plant, ${n(flow.returnSegments)} upstream`;
    body = ratio + split;
  }

  return (
    <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
      <span className="text-foreground/70">{label}</span> — {body}
    </p>
  );
}

/**
 * One envelope assembly: its U-value, its layers, and what was assumed.
 *
 * The layers are shown because the U alone is unfalsifiable. A reader who can
 * see 152 mm of bare stud cavity can argue with it; a reader given only
 * "0.400 W/m²K" cannot.
 */
function Construction({
  construction,
  isKo,
}: {
  construction: SolvedConstruction;
  isKo: boolean;
}) {
  const u = construction.uValueWPerM2K;
  // Short name: the type prefix ("Basic Wall:", "Basic Roof:") is noise here.
  const name = construction.name.replace(/^[^:]*:/, "");
  return (
    <div className="border-t border-border py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[11px] text-foreground">{name}</span>
        <span className="shrink-0 font-mono text-[12px] text-foreground">
          {u === null ? "—" : `U ${u.toFixed(3)}`}
        </span>
      </div>
      {u === null ? (
        <p className="mt-1 font-mono text-[9px] leading-relaxed text-muted-foreground">
          {isKo ? "해결 불가: " : "unresolved: "}
          {construction.unresolved.join(" · ")}
        </p>
      ) : (
        <div className="mt-1 font-mono text-[9px] leading-relaxed text-muted-foreground">
          {construction.layers.map((l, i) => (
            <div key={`${l.ifcName}-${i}`} className="flex gap-2">
              <span className="w-12 shrink-0 text-right">
                {(l.thicknessM * 1000).toFixed(0)}mm
              </span>
              <span className="w-14 shrink-0">
                R {(l.resistanceM2KPerW ?? 0).toFixed(3)}
              </span>
              <span className="min-w-0 truncate">{l.ifcName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
      className="flex w-full items-start gap-2 rounded-[6px] px-1.5 py-1.5 text-left transition-colors hover:bg-muted/60"
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
          className={`block truncate text-[11px] ${on ? "text-foreground" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <span className="block truncate font-mono text-[9px] text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}
