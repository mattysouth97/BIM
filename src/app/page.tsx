import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "BIMFIT | 모델 갤러리",
  description:
    "BIMFIT이 받아들인 건물 모델. 각 카드는 모델이 스스로 말하는 값만 싣습니다.",
};

export default function Home() {
  return <LandingPage />;
}
