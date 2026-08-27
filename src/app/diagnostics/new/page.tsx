import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  EnergyDiagnosticProduct,
  type DiagnosticEntryMethod,
} from "@/components/energy-diagnostics/energy-diagnostic-product";

export const metadata: Metadata = {
  title: "New Energy Diagnostic | BIMFIT",
  description:
    "Create, validate, and diagnose a source-traceable building energy model.",
};

type Props = Readonly<{
  searchParams: Promise<{
    method?: string | string[];
    project?: string | string[];
    building?: string | string[];
  }>;
}>;

const ENTRY_METHODS = [
  "ledger",
  "upload",
  "create",
  "sample",
  "resume",
] as const satisfies readonly DiagnosticEntryMethod[];

function entryMethod(value: string | string[] | undefined) {
  const method = Array.isArray(value) ? value[0] : value;
  return ENTRY_METHODS.find((candidate) => candidate === method);
}

export default async function NewEnergyDiagnosticPage({ searchParams }: Props) {
  const params = await searchParams;
  const method = entryMethod(params.method);
  // There is ONE landing page. Without a chosen method this route used to
  // render a second full-screen hero with its own set of entry doors, which
  // meant the product had two front pages saying similar things. The entry
  // choices now live on `/` beneath the register lookup.
  if (!method) redirect("/");
  const rawProject = Array.isArray(params.project)
    ? params.project[0]
    : params.project;
  const initialProjectId =
    rawProject && rawProject.length <= 200 ? rawProject : undefined;
  const rawBuilding = Array.isArray(params.building)
    ? params.building[0]
    : params.building;
  const initialBuildingId =
    rawBuilding && rawBuilding.length <= 200 ? rawBuilding : undefined;
  // The register lookup IS the landing page, so it lives at `/` and nowhere
  // else. This route only serves a building that has actually been chosen.
  if (method === "ledger" && !initialBuildingId) redirect("/");
  return (
    <EnergyDiagnosticProduct
      key={`${method ?? "start"}:${initialBuildingId ?? ""}`}
      initialMethod={method}
      initialProjectId={initialProjectId}
      initialBuildingId={initialBuildingId}
    />
  );
}
