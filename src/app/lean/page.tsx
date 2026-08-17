import type { Metadata } from "next";

import { LeanStudio } from "@/components/lean/lean-studio";

export const metadata: Metadata = {
  title: "BIMFIT Lean | 건물 하나, 한 화면",
  description:
    "설명하거나 그리거나 도면을 가져오면 BIM이 생성되고, 3D·평면과 에너지 판정이 같은 화면에서 나옵니다.",
};

export default function LeanPage() {
  return (
    <div className="h-[calc(100vh-var(--header-height,3.5rem))] w-full">
      <LeanStudio />
    </div>
  );
}
