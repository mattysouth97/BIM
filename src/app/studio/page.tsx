import type { Metadata } from "next";

import { GenerativeStudio } from "@/components/generative/generative-studio";

export const metadata: Metadata = {
  title: "Generate a building",
  description:
    "Describe a building and generate a complete, editable semantic BIM model.",
};

export default function StudioPage() {
  return (
    <div className="h-[calc(100vh-var(--header-height,3.5rem))] w-full">
      <GenerativeStudio />
    </div>
  );
}
