import type { Metadata } from "next";

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
  }>;
}>;

function entryMethod(value: string | string[] | undefined) {
  const method = Array.isArray(value) ? value[0] : value;
  return method === "upload" || method === "create" || method === "sample" || method === "resume"
    ? (method satisfies DiagnosticEntryMethod)
    : undefined;
}

export default async function NewEnergyDiagnosticPage({ searchParams }: Props) {
  const params = await searchParams;
  const method = entryMethod(params.method);
  const rawProject = Array.isArray(params.project)
    ? params.project[0]
    : params.project;
  const initialProjectId =
    rawProject && rawProject.length <= 200 ? rawProject : undefined;
  return (
    <EnergyDiagnosticProduct
      key={method ?? "start"}
      initialMethod={method}
      initialProjectId={initialProjectId}
    />
  );
}
