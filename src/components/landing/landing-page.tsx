"use client";

import { GALLERY_ITEMS } from "@/lib/landing/gallery";
import { landingCopy } from "@/lib/landing/copy";
import { useAppStore } from "@/store/app-store";
import { GalleryCard } from "./gallery-card";

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
              ? "각 카드는 그 건물의 BIM 파일이 스스로 말하는 값만 싣고, 값마다 그것을 어디에서 읽었는지 함께 적습니다. 열관류율·기밀·설비·기후처럼 조정용 모델이 말하지 않는 값은 여기에 없습니다. 그런 값은 건물을 열고 들어간 뒤 연식 기반 가정으로 채우며, 그때도 가정이라고 표시된 채로 남습니다."
              : "Each card carries only what that building's BIM file states, and names what states it, figure by figure. What a coordination model does not state — U-values, airtightness, HVAC, climate — is not here. Those get filled in from era-indexed assumptions once you open the building, and stay marked as assumptions when they are."}
          </p>
        </div>

        <ul id="gallery" className="gallery-grid mt-14 sm:mt-16" data-testid="landing-gallery">
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
