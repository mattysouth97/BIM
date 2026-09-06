"use client";

import { GALLERY_ITEMS } from "@/lib/landing/gallery";
import { landingCopy } from "@/lib/landing/copy";
import { useAppStore } from "@/store/app-store";
import { GalleryCard } from "./gallery-card";
import { ReferenceDatasetDownloads } from "@/components/reference-building/reference-dataset-downloads";

/**
 * The landing page is a gallery of the models this project has taken in —
 * nothing else. No hero plate, no workflow strip, no form.
 *
 * The register lookup that used to live here now has its own address,
 * `/diagnostics/new?method=ledger`. It was moved rather than deleted: it is
 * still the way into the diagnostic workflow, and deleting it along with the
 * page would have closed the product's primary door.
 */
export function LandingPage() {
  const language = useAppStore((s) => s.language);
  const isKo = language === "ko";
  const copy = landingCopy[isKo ? "ko" : "en"];
  const count = GALLERY_ITEMS.length;

  return (
    <div className="landing-stage">
      <a
        className="fixed left-3 top-0 z-[60] -translate-y-full rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground focus:translate-y-2"
        href="#gallery"
      >
        {copy.skip}
      </a>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <h1 className="landing-stamp text-[10px] font-semibold text-muted-foreground">
            {isKo ? "모델" : "Models"}
          </h1>
          <span className="landing-stamp text-[10px] text-muted-foreground">
            {String(count).padStart(2, "0")}
          </span>
        </div>

        {/* Lead with the professional task, then distinguish sourced inputs,
            assumptions and calculated results. No new entry flow. */}
        <div className="mt-6 max-w-[44rem]" data-testid="landing-gallery-lede">
          <p className="gallery-lede text-balance break-keep text-foreground">
            {isKo
              ? "건물의 에너지 성능, 근거부터 살펴보세요"
              : "Inspect the evidence behind a building's energy performance"}
          </p>
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
            {isKo
              ? "공개 BIM에서 재료·설비와 그 근거를 확인하고, 개선안을 검토하세요. 실제 건물의 조정 모델과 연구·예제 모델을 함께 제공합니다. 파일에서 읽은 값과 가정을 구분하며, 에너지 수치는 실측 사용량이 아닌 간이 계산 결과입니다."
              : "Inspect materials, systems and their sources in public BIM, then explore retrofit options. The collection includes real-building coordination models and research examples. Source values and assumptions stay distinct; energy figures are screening calculations, not metered consumption."}
          </p>
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <ReferenceDatasetDownloads locale={isKo ? "ko" : "en"} />
        </div>

        <ul id="gallery" className="gallery-grid mt-10 sm:mt-12" data-testid="landing-gallery">
          {GALLERY_ITEMS.map((item) => (
            <li key={item.id} className="flex">
              <GalleryCard item={item} isKo={isKo} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
