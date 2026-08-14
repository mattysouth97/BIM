"use client";

import { useState } from "react";
import Link from "next/link";
import { DEMO_BUILDING_ID } from "@/lib/constants";
import type { LandingCopy } from "@/lib/landing/copy";
import { doorStage } from "@/lib/workflow/doors";
import { useWorkflowStore } from "@/store/workflow-store";
import { JournalSection } from "./journal-section";

export function ProofPipeline({ copy }: { copy: LandingCopy }) {
  const [active, setActive] = useState(2);
  const stages = copy.stages;
  const current = stages[active] ?? stages[0];

  return (
    <JournalSection
      id="method"
      kicker={copy.kickerMethod}
      title={copy.proofTitle}
      titleAlt={copy.proofTitleEn}
    >
      <p className="lj-chapter-lead">{copy.proofLead}</p>

      <div className="lj-pipeline">
        <svg
          className="lj-pipeline-line"
          viewBox="0 0 640 24"
          aria-hidden="true"
        >
          <line x1="20" y1="12" x2="620" y2="12" className="lj-ink-soft" />
          {stages.map((_, i) => {
            const x = 20 + (i * 600) / 3;
            return (
              <circle
                key={i}
                cx={x}
                cy="12"
                r={i === active ? 5 : 3.5}
                className={i === active ? "lj-ink-fill" : "lj-ink"}
              />
            );
          })}
        </svg>

        <div className="lj-stage-grid" role="tablist" aria-label={copy.proofTitle}>
          {stages.map((stage, i) => (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`lj-stage${i === active ? " is-active" : ""}`}
              onClick={() => setActive(i)}
            >
              <span className="lj-stage-no">{stage.no}</span>
              <span className="lj-stage-title">{stage.title}</span>
            </button>
          ))}
        </div>

        {current && (
          <div className="lj-stage-body" role="tabpanel">
            <p>{current.body}</p>
            {current.href === "#lookup" ? (
              <a className="lj-text-link" href="#lookup">
                {current.action}
              </a>
            ) : (
              <Link
                className="lj-text-link"
                href={`/building/${DEMO_BUILDING_ID}`}
                onClick={() => {
                  const door = current.href === "cad" ? "cad" : "demo";
                  useWorkflowStore.getState().setStage(doorStage(door));
                }}
              >
                {current.action}
              </Link>
            )}
          </div>
        )}
      </div>
    </JournalSection>
  );
}
