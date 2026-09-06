import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "BIMFIT | 모델 갤러리",
  description:
    "공개 BIM의 재료·설비와 에너지 성능의 근거를 살펴보세요. 출처와 가정을 구분하고, 간이 계산으로 건물 개선안을 검토합니다.",
};

export default function Home() {
  return <LandingPage />;
}
