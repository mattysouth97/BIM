import { corpusHttp } from "@/lib/corpus/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return corpusHttp().records(request); }
