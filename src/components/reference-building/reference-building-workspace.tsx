"use client";

import { useState } from "react";
import Link from "next/link";

import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import { ReferenceModelViewer } from "./reference-model-viewer";

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
  locale,
}: {
  manifest: ReferenceBuildingManifest;
  modelUrl: string;
  baseUrl: string;
  locale: "ko" | "en";
}) {
  const isKo = locale === "ko";
  const [active, setActive] = useState<ReadonlySet<string>>(
    () => new Set([FABRIC_LAYER]),
  );

  const toggle = (id: string) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const services = manifest.serviceLayers ?? [];
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 1 });

  return (
    <main className="mx-auto flex h-dvh max-w-[92rem] flex-col gap-4 px-4 py-4 lg:flex-row">
      <section className="min-h-[24rem] flex-1 overflow-hidden rounded-[8px] border border-border bg-card shadow-xs">
        <ReferenceModelViewer
          modelUrl={modelUrl}
          baseUrl={baseUrl}
          services={services}
          active={active}
          fabricLayerId={FABRIC_LAYER}
        />
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
              label={isKo ? "외피·구조" : "Fabric"}
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
                    ? `배관 ${layer.detailedRuns.toLocaleString()} · 부속 ${layer.proxiedComponents.toLocaleString()} · ${(layer.byteLength / 1048576).toFixed(1)} MB`
                    : `${layer.detailedRuns.toLocaleString()} runs · ${layer.proxiedComponents.toLocaleString()} components · ${(layer.byteLength / 1048576).toFixed(1)} MB`
                }
                colour={LAYER_COLOUR[layer.id] ?? "#9aa0a6"}
                on={active.has(layer.id)}
                onToggle={toggle}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {isKo
              ? "배관·덕트는 실제 형상, 밸브·기구·장비는 외곽 상자로 단순화했습니다. 레이어는 켤 때 내려받습니다."
              : "Runs are real geometry; valves, terminals and plant are simplified. Layers download when switched on."}
          </p>
        </section>

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
          {manifest.licence} · {manifest.attribution}
        </p>
      </aside>
    </main>
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
