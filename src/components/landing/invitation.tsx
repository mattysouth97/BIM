"use client";

import type { LandingCopy } from "@/lib/landing/copy";
import { JournalSection } from "./journal-section";
import { CadDoor, DemoDoor } from "./landing-doors";

export function Invitation({ copy }: { copy: LandingCopy }) {
  return (
    <JournalSection
      id="begin"
      kicker={copy.kickerBegin}
      title={copy.inviteTitle}
      titleAlt={copy.inviteTitleEn}
    >
      <p className="lj-chapter-lead">{copy.inviteLead}</p>
      <div className="lj-cta-row">
        <DemoDoor>{copy.demo}</DemoDoor>
        <CadDoor>{copy.cad}</CadDoor>
        <a className="lj-text-link" href="#lookup">
          {copy.lookupJump}
        </a>
      </div>
    </JournalSection>
  );
}

export function StickyCta({
  copy,
  visible,
}: {
  copy: LandingCopy;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="lj-sticky" role="region" aria-label={copy.demo}>
      <DemoDoor className="lj-cta-sm">{copy.demo}</DemoDoor>
    </div>
  );
}
