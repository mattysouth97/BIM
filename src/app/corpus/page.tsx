import type { Metadata } from "next";
import { CorpusBrowser } from "@/components/corpus/corpus-browser";

export const metadata: Metadata = {
  title: "BIMFIT | 건물 에너지 데이터",
  description: "공개 건축물대장 기반 에너지 계산 데이터의 출처, 가정, 버전과 제공 범위를 확인합니다.",
};

export default function CorpusPage() {
  return <CorpusBrowser />;
}
