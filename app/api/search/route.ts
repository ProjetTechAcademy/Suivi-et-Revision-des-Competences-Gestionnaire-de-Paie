import { NextRequest, NextResponse } from "next/server";
import type { ResourceRecommendation } from "@/lib/corpus";
import { answerWithGroq } from "@/lib/groq";
import { searchQdrant } from "@/lib/qdrant";
import { getResourceLinks } from "@/lib/resource-links";

type Locale = "fr" | "en";
type SearchBody = { query: string; pulse?: string; resourceCode?: string; locale: Locale };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const publicText = (value: unknown) => text(value)
  .replace(/\b(?:studi|mba|bachelor|graduate)\b/gi, "")
  .replace(/\s{2,}/g, " ")
  .replace(/\s+([:;,])/g, "$1")
  .trim();

function corpusName(project: unknown, fallback: unknown) {
  const names: Record<string, string> = {
    "14": "Digital",
    "15": "Formateur",
    "16": "Python",
    "17": "RH",
    "18": "Paie",
    "19": "Divers",
  };
  return names[text(project)] || publicText(fallback);
}

function neutralBlock(code: string, title: unknown) {
  if (/^B0{1,2}$/i.test(code)) return "Introduction";
  return publicText(title);
}

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
      locale: body.locale === "en" ? "en" : "fr",
    };
  } catch {
    return null;
  }
}

function recommendations(hits: Awaited<ReturnType<typeof searchQdrant>>, locale: Locale) {
  const seen = new Set<string>();
  return hits.flatMap((hit): ResourceRecommendation[] => {
    const payload = hit.payload ?? {};
    const resourceCode = String(payload.resource_code ?? "");
    if (!resourceCode || seen.has(resourceCode)) return [];
    seen.add(resourceCode);
    const links = getResourceLinks(resourceCode);
    const blockCode = String(payload.block_code ?? "");
    return [{
      resourceCode,
      formation: corpusName(payload.project, payload.formation),
      blockCode,
      blockTitle: neutralBlock(blockCode, payload.block_title),
      moduleCode: String(payload.module_code ?? ""),
      moduleTitle: publicText(payload.module_title),
      resourceType: publicText(payload.resource_type),
      title: publicText(payload.title),
      reason: locale === "en" ? "Related resource found in the corpus." : "Ressource associée trouvée dans le corpus.",
      hasPrivateDocument: Boolean(text(payload.private_document_url) || links.drive),
    }];
  }).slice(0, 8);
}

function hasRealSourceText(value: string) {
  return value.trim() && !/ne dispose pas encore de contenu plein texte indexé/i.test(value);
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Requête de recherche invalide." }, { status: 400 });

  if (!process.env.GROQ_API_KEY || !process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    return NextResponse.json({ error: body.locale === "en" ? "Corpus Campus PAÏA is not connected" : "Corpus Campus PAÏA non connecté", code: "CORPUS_NOT_CONNECTED" }, { status: 503 });
  }

  try {
    const hits = await searchQdrant(body.query, { pulse: body.pulse, resourceCode: body.resourceCode }, 12);
    const allContexts = hits.map((hit) => String(hit.payload?.content ?? "")).filter(Boolean);
    const contexts = allContexts.filter(hasRealSourceText);
    const resources = recommendations(hits, body.locale);

    if (!contexts.length) {
      return NextResponse.json({
        title: body.query,
        summary: body.locale === "en"
          ? "🎯 Related resources were found, but their full text is not yet indexed for free-form search. I will not invent an answer from metadata alone.\n\n🔎 Current verification\nOpen a private source or create a PAÏA Sheet from a specific resource while the full search index is being enriched."
          : "🎯 Des ressources proches ont été trouvées, mais leur texte intégral n’est pas encore indexé pour la recherche libre. Je ne vais pas inventer une réponse à partir de simples métadonnées.\n\n🔎 Vérification actuelle\nVous pouvez déjà ouvrir une source privée ou créer une Fiche PAÏA à partir d’une ressource précise pendant l’enrichissement de l’index de recherche.",
        resources,
        sourceTextAvailable: false,
      });
    }

    const answer = await answerWithGroq(body.query, contexts, body.locale);
    return NextResponse.json({ title: body.query, summary: answer, resources, sourceTextAvailable: true });
  } catch (error) {
    console.error("Corpus Campus PAÏA search error", error);
    return NextResponse.json({ error: body.locale === "en" ? "Search is temporarily unavailable." : "La recherche est momentanément indisponible." }, { status: 502 });
  }
}
