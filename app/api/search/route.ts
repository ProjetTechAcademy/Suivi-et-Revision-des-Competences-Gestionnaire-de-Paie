import { NextRequest, NextResponse } from "next/server";
import type { ResourceRecommendation } from "@/lib/corpus";
import { answerWithGroq } from "@/lib/groq";
import { searchQdrant } from "@/lib/qdrant";

type SearchBody = { query: string; pulse?: string; resourceCode?: string };

async function readBody(request: NextRequest): Promise<SearchBody | null> {
  try {
    const value = await request.json() as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const body = value as Record<string, unknown>;
    if (typeof body.query !== "string" || !body.query.trim()) return null;
    if (body.pulse !== undefined && typeof body.pulse !== "string") return null;
    if (body.resourceCode !== undefined && typeof body.resourceCode !== "string") return null;
    return {
      query: body.query.trim().slice(0, 800),
      pulse: typeof body.pulse === "string" ? body.pulse.trim().slice(0, 256) : undefined,
      resourceCode: typeof body.resourceCode === "string" ? body.resourceCode.trim().slice(0, 256) : undefined,
    };
  } catch {
    return null;
  }
}

function recommendations(hits: Awaited<ReturnType<typeof searchQdrant>>) {
  const seen = new Set<string>();
  return hits.flatMap((hit): ResourceRecommendation[] => {
    const payload = hit.payload ?? {};
    const resourceCode = String(payload.resource_code ?? "");
    if (!resourceCode || seen.has(resourceCode)) return [];
    seen.add(resourceCode);
    return [{
      resourceCode,
      formation: String(payload.formation ?? ""),
      blockCode: String(payload.block_code ?? ""),
      blockTitle: String(payload.block_title ?? ""),
      moduleCode: String(payload.module_code ?? ""),
      moduleTitle: String(payload.module_title ?? ""),
      resourceType: String(payload.resource_type ?? ""),
      title: String(payload.title ?? ""),
      reason: "Cette ressource contient des éléments liés à votre question.",
    }];
  }).slice(0, 6);
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Requête de recherche invalide." }, { status: 400 });

  if (!process.env.GROQ_API_KEY || !process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    return NextResponse.json({ error: "Corpus Campus PAÏA non connecté", code: "CORPUS_NOT_CONNECTED" }, { status: 503 });
  }

  try {
    const hits = await searchQdrant(body.query, { pulse: body.pulse, resourceCode: body.resourceCode }, 10);
    const contexts = hits
      .map((hit) => String(hit.payload?.content ?? ""))
      .filter(Boolean);

    if (!contexts.length) {
      return NextResponse.json({
        title: body.query,
        summary: "Aucune ressource pertinente n’a encore été trouvée dans le corpus indexé.",
        resources: [],
      });
    }

    const answer = await answerWithGroq(body.query, contexts);
    return NextResponse.json({
      title: body.query,
      summary: answer,
      resources: recommendations(hits),
    });
  } catch (error) {
    console.error("Campus PAÏA search error", error);
    return NextResponse.json({ error: "La recherche Campus PAÏA est momentanément indisponible." }, { status: 502 });
  }
}
