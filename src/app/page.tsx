import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "BIMFIT | 대장에서 트윈까지",
  description:
    "건축물대장 또는 도면을 넣으면 그 건물의 3D 트윈이 열립니다. 에너지 숫자와 그린리모델링 투자 답이 같은 건물에서 나옵니다.",
};

export default function Home() {
  return <LandingPage />;
}
