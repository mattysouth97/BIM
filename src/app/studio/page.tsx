import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ start?: string | string[] }>;
};

export default async function StudioPage({ searchParams }: Props) {
  const params = await searchParams;
  const start = Array.isArray(params.start) ? params.start[0] : params.start;
  if (start === "draw") redirect("/diagnostics/new?method=create");
  if (start === "diagnose") redirect("/diagnostics/new?method=upload");
  redirect("/diagnostics/new");
}
