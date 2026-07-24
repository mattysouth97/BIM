import type { Config, Driver } from "driver.js";
import { pick } from "@/lib/i18n";

export const GUIDE_REQUEST_EVENT = "greenretrofit:guide-request" as const;

export interface GuideRequestDetail {
  source: "header";
}

declare global {
  interface WindowEventMap {
    "greenretrofit:guide-request": CustomEvent<GuideRequestDetail>;
  }
}

export type GuideDriverFactory = (config: Config) => Driver;
export type GuideDriverLoader = () => Promise<GuideDriverFactory>;

export function guideControlLabels(
  language: "ko" | "en",
): Pick<
  Config,
  | "nextBtnText"
  | "prevBtnText"
  | "doneBtnText"
  | "progressText"
  | "onPopoverRender"
> {
  return {
    nextBtnText: pick(language, "다음", "Next"),
    prevBtnText: pick(language, "이전", "Previous"),
    doneBtnText: pick(language, "완료", "Done"),
    progressText: pick(
      language,
      "{{current}} / {{total}}",
      "{{current}} of {{total}}",
    ),
    onPopoverRender: (popover) => {
      popover.closeButton.setAttribute(
        "aria-label",
        pick(language, "가이드 닫기", "Close guide"),
      );
    },
  };
}

export async function loadGuideDriver(): Promise<GuideDriverFactory> {
  const [{ driver }] = await Promise.all([
    import("driver.js"),
    import("driver.js/dist/driver.css"),
  ]);
  return driver;
}

export function requestGuide() {
  window.dispatchEvent(
    new CustomEvent<GuideRequestDetail>(GUIDE_REQUEST_EVENT, {
      detail: { source: "header" },
    }),
  );
}
