import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  EnergyDiagnosticProduct,
  type DiagnosticEntryMethod,
} from "@/components/energy-diagnostics/energy-diagnostic-product";
import { RegisterSearchSheet } from "@/components/energy-diagnostics/register-search-sheet";

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
  // `/` is a gallery of the models the project has taken in, not an entry
  // screen, so a method-less arrival can no longer be sent there — it would
  // land on a page with nothing to start. Step 1 of the workflow is the
  // register lookup, so that is where a bare visit goes.
  if (!method) redirect("/diagnostics/new?method=ledger");
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
  // The register lookup used to live on `/` and nowhere else, so this route
  // bounced a building-less `method=ledger` back to the landing page. With the
  // landing page now a gallery that bounce is a dead end — the lookup lives
  // HERE instead, and this is the door the header points at.
  if (method === "ledger" && !initialBuildingId) return <RegisterSearchSheet />;
  return (
    <EnergyDiagnosticProduct
      key={`${method ?? "start"}:${initialBuildingId ?? ""}`}
      initialMethod={method}
      initialProjectId={initialProjectId}
      initialBuildingId={initialBuildingId}
    />
  );
}
