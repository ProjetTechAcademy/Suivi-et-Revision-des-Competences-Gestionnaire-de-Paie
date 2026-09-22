import { NextRequest, NextResponse } from "next/server";
import type { ResourceRecommendation } from "@/lib/corpus";
import { OPENAI_BASE_URL, openAIHeaders } from "@/lib/openai";

type SearchResult = { score?: number; attributes?: Record<string, string | boolean> };
type SearchBody = { query: string; pulse?: string; resourceCode?: string };

function textFromResponse(data: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}
function recommendationsFromResponse(data: { output?: Array<{ type?: string; results?: SearchResult[] }> }) {
  const results = data.output?.filter((item) => item.type === "file_search_call").flatMap((item) => item.results ?? []) ?? [];
  const seen = new Set<string>();
  return results.flatMap((result): ResourceRecommendation[] => {
    const a = result.attributes ?? {};
    const resourceCode = String(a.resource_code ?? "");
    if (!resourceCode || a.reserved === true || seen.has(resourceCode)) return [];
    seen.add(resourceCode);
    return [{ resourceCode, formation:String(a.formation ?? ""), blockCode:String(a.block_code ?? ""), blockTitle:String(a.block_title ?? ""), moduleCode:String(a.module_code ?? ""), moduleTitle:String(a.module_title ?? ""), resourceType:String(a.resource_type ?? ""), title:String(a.title ?? ""), reason:"Cette ressource contient des éléments directement liés à votre question." }];
  }).slice(0, 6);
}
async function readBody(request: NextRequest): Promise<SearchBody | null> {
  try {
    const value = await request.json() as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const body = value as Record<string, unknown>;
    if (typeof body.query !== "string" || !body.query.trim()) return null;
    if (body.pulse !== undefined && typeof body.pulse !== "string") return null;
    if (body.resourceCode !== undefined && typeof body.resourceCode !== "string") return null;
    return { query: body.query.trim().slice(0,800), pulse: typeof body.pulse === "string" ? body.pulse.trim().slice(0,256) : undefined, resourceCode: typeof body.resourceCode === "string" ? body.resourceCode.trim().slice(0,256) : undefined };
  } catch { return null; }
}
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Requête de recherche invalide." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
  if (!apiKey || !vectorStoreId) return NextResponse.json({ error: "Corpus Campus PAÏA non connecté", code:"CORPUS_NOT_CONNECTED" }, { status:503 });

  const conditions = [...(body.pulse ? [{type:"eq",key:"pulse",value:body.pulse}] : []), ...(body.resourceCode ? [{type:"eq",key:"resource_code",value:body.resourceCode}] : [])];
  const filters = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : { type:"and", filters:conditions };

  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method:"POST", headers:openAIHeaders(apiKey),
      body:JSON.stringify({ model:process.env.OPENAI_MODEL || "gpt-5-mini", instructions:["Tu es Campus PAÏA, une base de connaissances personnelle, pas une plateforme de formation.","Réponds en français de façon pédagogique, structurée et concrète à partir du corpus fourni.","Distingue le contenu pédagogique historique des règles réglementaires actuelles.","N'invente pas de source et ne révèle jamais URL Drive, ID Drive, chemin local, secret ou nom de fichier technique."].join(" "), input:body.query, tools:[{type:"file_search",vector_store_ids:[vectorStoreId],max_num_results:12,...(filters ? {filters} : {})}], include:["file_search_call.results"] })
    });
  } catch { return NextResponse.json({ error:"La recherche Campus PAÏA est momentanément indisponible." }, {status:502}); }
  if (!response.ok) return NextResponse.json({ error:"La recherche Campus PAÏA est momentanément indisponible." }, {status:502});
  try {
    const data = await response.json();
    const answer = textFromResponse(data);
    return NextResponse.json({ title:body.query, summary:answer || "Aucun contenu pertinent n’a été trouvé dans le corpus.", resources:recommendationsFromResponse(data) });
  } catch { return NextResponse.json({ error:"Réponse OpenAI invalide." }, {status:502}); }
}
