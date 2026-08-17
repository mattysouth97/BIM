import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "BIMFIT | 구상에서 트윈까지",
  description:
    "문장으로 설명하거나 도면을 그리면 그 건물의 3D 트윈이 열립니다. 에너지 숫자와 그린리모델링 투자 답이 같은 건물에서 나옵니다.",
};

export default function Home() {
  return <LandingPage />;
}
