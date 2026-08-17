import type { Metadata } from "next";

import { GenerativeStudio } from "@/components/generative/generative-studio";

export const metadata: Metadata = {
  title: "Generate a building",
  description:
    "Draw a floor plan or describe a building and generate an editable BIM model.",
};

type Props = {
  searchParams: Promise<{ start?: string | string[] }>;
};

export default async function StudioPage({ searchParams }: Props) {
  const params = await searchParams;
  const start = Array.isArray(params.start) ? params.start[0] : params.start;
  return (
    <div className="h-[calc(100vh-var(--header-height,3.5rem))] w-full">
      <GenerativeStudio initialStart={start === "draw" ? "draw" : "describe"} />
    </div>
  );
}
