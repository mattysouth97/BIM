import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "BIMFIT | 모델 갤러리",
  description:
    "BIMFIT으로 보는 빌딩의 내부 모습과 에너지 프로필. 각 카드는 그 건물의 BIM 파일이 스스로 말하는 값만 싣습니다.",
};

export default function Home() {
  return <LandingPage />;
}
