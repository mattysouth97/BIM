import type { Metadata } from "next";

import { GenerativeStudio } from "@/components/generative/generative-studio";

export const metadata: Metadata = {
  title: "Building studio",
  description:
    "Describe, draw, or diagnose a source-traceable building energy model.",
};

type Props = {
  searchParams: Promise<{ start?: string | string[] }>;
};

export default async function StudioPage({ searchParams }: Props) {
  const params = await searchParams;
  const start = Array.isArray(params.start) ? params.start[0] : params.start;
  const initialStart =
    start === "draw" || start === "diagnose" ? start : "describe";
  return (
    <div className="h-[calc(100vh-var(--header-height,3.5rem))] w-full">
      <GenerativeStudio initialStart={initialStart} />
    </div>
  );
}
