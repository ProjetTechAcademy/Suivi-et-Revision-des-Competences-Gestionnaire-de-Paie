import { NextRequest, NextResponse } from "next/server";
import type { ResourceRecommendation } from "@/lib/corpus";
import { OPENAI_BASE_URL, openAIHeaders } from "@/lib/openai";
import { isCampusSearchAuthorized } from "@/lib/campus-auth";

type SearchResult = {
  score?: number;
  attributes?: Record<string, string | boolean>;
};

function textFromResponse(data: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return data.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text ?? "";
}

function recommendationsFromResponse(data: { output?: Array<{ type?: string; results?: SearchResult[] }> }) {
  const results = data.output?.filter((item) => item.type === "file_search_call").flatMap((item) => item.results ?? []) ?? [];
  const seen = new Set<string>();
  return results.flatMap((result): ResourceRecommendation[] => {
    const attributes = result.attributes ?? {};
    const resourceCode = String(attributes.resource_code ?? "");
    if (!resourceCode || attributes.reserved === true || seen.has(resourceCode)) return [];
    seen.add(resourceCode);
    return [{
      resourceCode,
      formation: String(attributes.formation ?? ""),
      blockCode: String(attributes.block_code ?? ""),
      blockTitle: String(attributes.block_title ?? ""),
      moduleCode: String(attributes.module_code ?? ""),
      moduleTitle: String(attributes.module_title ?? ""),
      resourceType: String(attributes.resource_type ?? ""),
      title: String(attributes.title ?? ""),
      reason: "Cette ressource contient des éléments directement liés à votre question.",
    }];
  }).slice(0, 6);
}

export async function POST(request: NextRequest) {
  const accessSecret = process.env.CAMPUS_SEARCH_SECRET;
  if (!accessSecret || !isCampusSearchAuthorized(request, accessSecret)) {
    return NextResponse.json({ error: "Accès au Campus privé requis.", code: "CAMPUS_ACCESS_REQUIRED" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_BODY");
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 800) : "";
  if (!query) return NextResponse.json({ error: "Une question est nécessaire." }, { status: 400 });
  const pulse = typeof body.pulse === "string" ? body.pulse.trim().slice(0, 256) : "";
  const resourceCode = typeof body.resourceCode === "string" ? body.resourceCode.trim().slice(0, 256) : "";

  const apiKey = process.env.OPENAI_API_KEY;
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
  if (!apiKey || !vectorStoreId) {
    return NextResponse.json({ error: "Corpus Campus PAÏA non connecté", code: "CORPUS_NOT_CONNECTED" }, { status: 503 });
  }

  const conditions = [
    ...(pulse ? [{ type: "eq", key: "pulse", value: pulse }] : []),
    ...(resourceCode ? [{ type: "eq", key: "resource_code", value: resourceCode }] : []),
  ];
  const filters = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : { type: "and", filters: conditions };
  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: openAIHeaders(apiKey),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions: [
        "Tu es Campus PAÏA, une base de connaissances personnelle, pas une plateforme de formation.",
        "Réponds en français de façon pédagogique, structurée et concrète à partir du corpus fourni.",
        "Distingue le contenu pédagogique historique des règles réglementaires actuelles.",
        "N'invente pas de source et ne révèle jamais URL Drive, ID Drive, chemin local, secret ou nom de fichier technique.",
      ].join(" "),
      input: query,
      tools: [{ type: "file_search", vector_store_ids: [vectorStoreId], max_num_results: 12, ...(filters ? { filters } : {}) }],
      include: ["file_search_call.results"],
    }),
    });
  } catch {
    console.error(JSON.stringify({ event: "campus_search_transport_error" }));
    return NextResponse.json({ error: "La recherche Campus PAÏA est momentanément indisponible." }, { status: 502 });
  }

  if (!response.ok) {
    const upstreamRequestId = response.headers.get("x-request-id") || undefined;
    const upstreamMessage = (await response.text()).slice(0, 1200);
    console.error(JSON.stringify({ event: "campus_search_error", status: response.status, upstreamRequestId, upstreamMessage }));
    return NextResponse.json({
      error: `La recherche Campus PAÏA est momentanément indisponible (OpenAI ${response.status}).`,
      code: "OPENAI_SEARCH_FAILED",
      upstreamStatus: response.status,
      requestId: upstreamRequestId,
    }, { status: 502 });
  }
  const data = await response.json();
  const answer = textFromResponse(data);
  return NextResponse.json({ title: query, summary: answer || "Aucun contenu pertinent n’a été trouvé dans le corpus.", resources: recommendationsFromResponse(data) });
}
