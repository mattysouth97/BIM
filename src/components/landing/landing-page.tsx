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

        {/* What the gallery contains, and — just as important — what it does
            not. The cards carry figures that look like building performance
            data, so the page says up front that they are only what the model
            file itself states. */}
        <div className="mt-6 max-w-[44rem]" data-testid="landing-gallery-lede">
          <p className="gallery-lede text-balance break-keep text-foreground">
            {isKo
              ? "BIMFIT으로 보는 빌딩의 내부 모습과 에너지 프로필"
              : "A building's interior and energy profile, seen through BIMFIT"}
          </p>
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
            {isKo
              ? "실제 건물의 조정 모델과 검증용 예제 모델을 함께 살펴봅니다. 면적·부재 수와 파일이 명시한 열성능은 어디에서 읽었는지 함께 적습니다. 빠진 열성능·운영 조건·기후는 가정으로 구분합니다. 에너지 프로필은 이 입력으로 계산한 결과이며, 계량기로 측정한 실제 사용량이 아닙니다."
              : "Explore coordination models of real buildings alongside validation examples. Areas, element counts and thermal properties stated by a file carry their sources. Missing thermal properties, operating conditions and climate remain explicit assumptions. Energy profiles are calculated from these inputs; they are not metered consumption."}
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
