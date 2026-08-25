import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "BIMFIT | 건물 에너지 진단",
  description:
    "건물 모델을 확인하고 에너지 손실의 위치와 원인을 진단한 뒤 개선 대안을 비교합니다.",
};

export default function Home() {
  return <LandingPage />;
}
