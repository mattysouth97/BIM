import { corpusHttp } from "@/lib/corpus/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ releaseId: string; id: string }> }) { const { releaseId,id } = await context.params; return corpusHttp().record(releaseId,id); }
