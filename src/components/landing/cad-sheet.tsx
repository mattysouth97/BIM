"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_BUILDING_ID } from "@/lib/constants";
import type { LandingCopy } from "@/lib/landing/copy";
import { doorStage } from "@/lib/workflow/doors";
import { useWorkflowStore } from "@/store/workflow-store";
import { CadDrawing } from "./cad-drawing";
import { CadDoor, DemoDoor } from "./landing-doors";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

const RevealScene = lazy(() =>
  import("./reveal-scene").then((m) => ({ default: m.RevealScene })),
);

type Mode = "drawing" | "void" | "orbit";

export function CadSheet({
  copy,
  onOpenLookup,
}: {
  copy: LandingCopy;
  onOpenLookup: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [mode, setMode] = useState<Mode>("drawing");
  const [stage, setStage] = useState(2);
  const [exploded, setExploded] = useState(false);
  const [hoveredFloor, setHoveredFloor] = useState<number | null>(null);
  const current = copy.stages[stage] ?? copy.stages[0];

  const raise = useCallback(() => {
    setMode("orbit");
    setStage(2);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key >= "1" && e.key <= "4") {
        setStage(Number(e.key) - 1);
      }
      if (e.key === "ArrowLeft") setMode("void");
      if (e.key === "ArrowRight") setMode("drawing");
      if (e.key === " " && mode === "orbit") {
        e.preventDefault();
        setExploded((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  return (
    <div className="cad-sheet">
      <header className="cad-titleblock">
        <div className="cad-titleblock-brand">
          <h1 id="bimfit-title">{copy.h1}</h1>
          <p className="cad-subtitle">
            <span>{copy.titleKo}</span>
            <span className="cad-slash">/</span>
            <span>{copy.titleEn}</span>
          </p>
        </div>
        <div className="cad-titleblock-meta">
          <span>{copy.sheet}</span>
          <span>{copy.scale}</span>
        </div>
      </header>

      <p className="cad-lead">{copy.lead}</p>
      <p className="cad-lead-sub">{copy.leadSecondary}</p>

      <h2 className="cad-h2">{copy.revealTitle}</h2>

      <div className="cad-revs" role="tablist" aria-label={copy.revealTitle}>
        {copy.stages.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === stage}
            className={`cad-rev${i === stage ? " is-on" : ""}`}
            onClick={() => {
              setStage(i);
              if (item.id === "twin") setMode("orbit");
              if (item.id === "search") onOpenLookup();
            }}
          >
            <span>{item.no}</span>
            {item.title}
          </button>
        ))}
      </div>

      {current && (
        <div className="cad-note" role="tabpanel">
          <p>{current.body}</p>
          {current.href === "lookup" ? (
            <button type="button" className="cad-text" onClick={onOpenLookup}>
              {current.action}
            </button>
          ) : (
            <Link
              className="cad-text"
              href={`/building/${DEMO_BUILDING_ID}`}
              onClick={() => {
                useWorkflowStore.getState().setStage(
                  doorStage(current.href === "cad" ? "cad" : "demo"),
                );
              }}
            >
              {current.action}
            </Link>
          )}
        </div>
      )}

      <div className="cad-stage">
        {mode === "orbit" && !reduced ? (
          <div
            className="cad-orbit"
            tabIndex={0}
            role="application"
            aria-label={copy.revealDrag}
            onKeyDown={(e) => {
              if (e.key === "Enter") setExploded((v) => !v);
            }}
          >
            <Suspense
              fallback={<p className="cad-hover-hint">{copy.revealDrag}</p>}
            >
              <RevealScene exploded={exploded} reduced={reduced} active />
            </Suspense>
          </div>
        ) : (
          <CadDrawing
            mode={mode === "void" ? "void" : "drawing"}
            hoveredFloor={hoveredFloor}
            onFloorHover={setHoveredFloor}
            onRaise={raise}
            label={copy.drawingLabel}
            voidLabel={copy.tensionVoid}
          />
        )}
      </div>

      <footer className="cad-bar">
        <p className="cad-hint">
          {mode === "orbit" ? copy.revealDrag : copy.hoverHint}
        </p>

        <div className="cad-toggle" role="group" aria-label={copy.tensionHint}>
          <button
            type="button"
            className={mode === "void" ? "is-on" : ""}
            aria-pressed={mode === "void"}
            onClick={() => setMode("void")}
          >
            {copy.tensionLeft}
          </button>
          <button
            type="button"
            className={mode !== "void" ? "is-on" : ""}
            aria-pressed={mode !== "void"}
            onClick={() => setMode(mode === "orbit" ? "orbit" : "drawing")}
          >
            {copy.tensionRight}
          </button>
        </div>

        {mode === "orbit" && (
          <button
            type="button"
            className="cad-text"
            onClick={() => setExploded((v) => !v)}
            aria-pressed={exploded}
          >
            {exploded ? copy.revealFold : copy.revealExplode}
          </button>
        )}

        <div className="cad-doors">
          <DemoDoor testId="landing-demo-start">{copy.demo}</DemoDoor>
          <CadDoor testId="landing-cad-start">{copy.cad}</CadDoor>
          <button type="button" className="lj-cta lj-cta-ghost" onClick={onOpenLookup}>
            {copy.lookupJump}
          </button>
        </div>
      </footer>
    </div>
  );
}
