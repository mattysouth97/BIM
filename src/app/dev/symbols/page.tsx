"use client";

// src/app/dev/symbols/page.tsx
//
// The in-app realization of the Figma family catalog cover (file
// RmCCr8pOFvqq4dzGZTJkFl): all 102 AUTHORING_FAMILIES, grouped under the same
// eight sections the cover defines, each card rendering its live evaluated
// plan symbol. No snapshots — every card calls symbolFor() → evaluateSymbol()
// through the same registry the plan overlay uses, so a broken family shows
// up broken here first.

import { useMemo, useState } from "react";

import {
  familyTypeLabel,
  type AuthoringFamily,
  type AuthoringFamilyKind,
} from "@/lib/bim/family-catalog";
import { evaluateSymbol, SymbolGraphError, type SymbolGeometry } from "@/lib/plan-symbols/evaluate";
import "@/lib/plan-symbols/library/index";
import { symbolFor } from "@/lib/plan-symbols/registry";
import { familiesForSection, sectionCounts, SECTIONS } from "@/lib/plan-symbols/sections";

import { renderStroke } from "@/components/generative/schematic/plan-symbols-layer";
import { fitTransform, toScreen } from "@/components/generative/schematic/view-transform";

const CARD_PX = 168;
const CARD_PADDING_PX = 18;

/** familyKind is binary (system|loadable) in this codebase; the Figma cover's four-way
 *  taxonomy collapses to Revit's own split — a system family draws procedurally (Type A),
 *  a loadable family is a parametric component (Type B). Manufacturer/visualization
 *  (C/D) aren't a distinction this catalog makes. */
const KIND_LABEL: Record<AuthoringFamilyKind, string> = {
  system: "Type A · System",
  loadable: "Type B · Loadable",
};

interface SymbolCardProps {
  family: AuthoringFamily;
  widthOverrideMm: number | undefined;
  onWidthChange: (widthMm: number) => void;
}

function SymbolCard({ family, widthOverrideMm, onWidthChange }: SymbolCardProps) {
  const graph = symbolFor(family.id);
  const defaultWidthMm = typeof graph.params?.widthMm === "number" ? graph.params.widthMm : null;

  const { geometry, error } = useMemo((): { geometry: SymbolGeometry | null; error: string | null } => {
    const overrides = defaultWidthMm !== null && widthOverrideMm !== undefined ? { widthMm: widthOverrideMm } : undefined;
    try {
      return { geometry: evaluateSymbol(graph, overrides), error: null };
    } catch (err) {
      return { geometry: null, error: err instanceof SymbolGraphError ? err.message : String(err) };
    }
  }, [graph, defaultWidthMm, widthOverrideMm]);

  const view = fitTransform(geometry?.boundsMm ?? null, CARD_PX, CARD_PX, CARD_PADDING_PX);

  return (
    <div className={`flex flex-col gap-1.5 rounded border p-2 ${error ? "border-destructive bg-destructive/5" : "bg-card"}`}>
      <svg width={CARD_PX} height={CARD_PX} className="self-center" role="img" aria-label={`${family.family} — ${family.type}`}>
        {error ? (
          <text x={CARD_PX / 2} y={CARD_PX / 2} textAnchor="middle" className="fill-destructive" style={{ fontSize: 10 }}>
            evaluateSymbol failed
          </text>
        ) : (
          geometry?.strokes.map((stroke, i) =>
            renderStroke(stroke, `${family.id}-${i}`, (p) => toScreen(view, p), view.scale),
          )
        )}
      </svg>

      <div className="flex flex-col gap-0.5">
        <span className="truncate font-mono text-[10px] text-muted-foreground" title={family.id}>
          {family.id}
        </span>
        <span className="truncate text-[11px]" title={familyTypeLabel(family, "en")}>
          {familyTypeLabel(family, "en")}
        </span>
        <span className="text-[10px] text-muted-foreground">{KIND_LABEL[family.familyKind]}</span>
      </div>

      {defaultWidthMm !== null && !error && (
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          w
          <input
            type="range"
            min={Math.max(50, Math.round(defaultWidthMm * 0.5))}
            max={Math.round(defaultWidthMm * 1.8)}
            step={10}
            value={widthOverrideMm ?? defaultWidthMm}
            onChange={(event) => onWidthChange(Number(event.target.value))}
            className="h-1 flex-1"
          />
          <span className="w-10 text-right font-mono">{Math.round(widthOverrideMm ?? defaultWidthMm)}</span>
        </label>
      )}

      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

export default function DevSymbolsPage() {
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>({});
  const counts = sectionCounts();
  const symbolSections = SECTIONS.filter((s) => !s.metadataOnly);
  const totalFamilies = symbolSections.reduce((sum, s) => sum + (counts[s.id] ?? 0), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-1 border-b pb-4">
        <h1 className="text-lg font-semibold">Family Symbol Catalog</h1>
        <p className="text-sm text-muted-foreground">
          {totalFamilies} authored families across {symbolSections.length} sections, every card evaluated live from{" "}
          <code className="font-mono text-xs">src/lib/plan-symbols/registry.ts</code>. Section 08 “System Kit” is
          metadata-only in the Figma cover — no symbol library to show.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        {symbolSections.map((section) => {
          const families = familiesForSection(section.id);
          return (
            <section key={section.id} className="flex flex-col gap-3">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                <span className="font-mono text-muted-foreground">{section.numberLabel}</span>
                {section.nameEn}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  ({families.length} {families.length === 1 ? "family" : "families"})
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {families.map((family) => (
                  <SymbolCard
                    key={family.id}
                    family={family}
                    widthOverrideMm={widthOverrides[family.id]}
                    onWidthChange={(widthMm) =>
                      setWidthOverrides((prev) => ({ ...prev, [family.id]: widthMm }))
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
