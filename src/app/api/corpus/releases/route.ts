import { corpusHttp } from "@/lib/corpus/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return corpusHttp().releases(); }
