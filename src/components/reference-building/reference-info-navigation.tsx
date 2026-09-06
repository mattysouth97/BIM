"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const REFERENCE_INFO_SECTIONS = ["overview", "materials", "layers", "data"] as const;
export type ReferenceInfoSection = (typeof REFERENCE_INFO_SECTIONS)[number];

const labels: Record<ReferenceInfoSection, { ko: string; en: string }> = {
  overview: { ko: "개요", en: "Overview" },
  materials: { ko: "재료", en: "Materials" },
  layers: { ko: "레이어", en: "Layers" },
  data: { ko: "데이터", en: "Data" },
};

function readSection(): ReferenceInfoSection {
  const value = window.location.hash.slice(1);
  return REFERENCE_INFO_SECTIONS.find((section) => section === value) ?? "overview";
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function setSection(section: ReferenceInfoSection) {
  if (readSection() === section) return;
  // Preserve Next's history state and the page's query. No route navigation,
  // energy reseed or document scroll is needed to inspect another category.
  window.history.pushState(window.history.state, "", `${window.location.pathname}${window.location.search}#${section}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useReferenceInfoSection() {
  const section = useSyncExternalStore(subscribe, readSection, () => "overview" as const);
  return [section, setSection] as const;
}

export function ReferenceInfoNavigation({ activeSection, onSectionChange, isKo, children }: {
  activeSection: ReferenceInfoSection;
  onSectionChange: (section: ReferenceInfoSection) => void;
  isKo: boolean;
  children: Record<ReferenceInfoSection, ReactNode>;
}) {
  return (
    <Tabs value={activeSection} onValueChange={(value) => onSectionChange(value as ReferenceInfoSection)} className="min-h-0 flex-1 gap-0" data-testid="reference-info-navigation">
      <TabsList className="mb-3 w-full shrink-0" aria-label={isKo ? "건물 정보" : "Building information"}>
        {REFERENCE_INFO_SECTIONS.map((section) => (
          <TabsTrigger key={section} value={section} data-testid={`reference-info-tab-${section}`} className="min-h-8 text-xs motion-reduce:transition-none">
            {isKo ? labels[section].ko : labels[section].en}
          </TabsTrigger>
        ))}
      </TabsList>
      {REFERENCE_INFO_SECTIONS.map((section) => (
        <TabsContent key={section} value={section} forceMount hidden={section !== activeSection}
          data-testid={`reference-info-panel-${section}`}
          className="min-h-0 overflow-y-auto overscroll-contain pr-2 pb-5 [scrollbar-gutter:stable] [&[hidden]]:hidden focus-visible:outline-2 focus-visible:outline-ring">
          {children[section]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
