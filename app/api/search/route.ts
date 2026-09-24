import { NextRequest, NextResponse } from "next/server";
import type { ResourceRecommendation } from "@/lib/corpus";
import { answerWithGroq } from "@/lib/groq";
import { searchQdrant } from "@/lib/qdrant";
import { getResourceLinks } from "@/lib/resource-links";
import snapshotJson from "@/data/catalogue-snapshot.json";
import { extractTextFromFile } from "@/lib/file-text";

export const runtime = "nodejs";
export const maxDuration = 300;

type Locale = "fr" | "en";
type SearchBody = { query: string; pulse?: string; resourceCode?: string; locale: Locale };
type SnapshotResource = {
  resourceCode: string; project: string; formation: string; blockCode: string; blockTitle: string;
  moduleCode: string; moduleTitle: string; resourceType: string; title: string; pulse: string;
  keywords: string[]; privateDocumentUrl: string; sourceUrl: string; reserved: boolean;
};

const snapshot = snapshotJson as SnapshotResource[];
const snapshotByCode = new Map(snapshot.map((item) => [item.resourceCode, item]));

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

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function snapshotSearch(body: SearchBody) {
  if (body.resourceCode) {
    const exact = snapshotByCode.get(body.resourceCode);
    return exact && !exact.reserved ? [exact] : [];
  }
  const tokens = normalize(body.query).split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
  return snapshot
    .filter((item) => !item.reserved && item.title && (!body.pulse || item.pulse === body.pulse))
    .map((item) => {
      const title = normalize(item.title);
      const module = normalize(item.moduleTitle);
      const block = normalize(item.blockTitle);
      const keywords = normalize(item.keywords.join(" "));
      let score = 0;
      for (const token of tokens) {
        if (title.includes(token)) score += 8;
        if (module.includes(token)) score += 4;
        if (block.includes(token)) score += 3;
        if (keywords.includes(token)) score += 2;
      }
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "fr"))
    .slice(0, 8)
    .map((entry) => entry.item);
}

function snapshotRecommendation(item: SnapshotResource, locale: Locale): ResourceRecommendation {
  return {
    resourceCode: item.resourceCode,
    formation: corpusName(item.project, item.formation),
    blockCode: item.blockCode,
    blockTitle: neutralBlock(item.blockCode, item.blockTitle),
    moduleCode: item.moduleCode,
    moduleTitle: publicText(item.moduleTitle),
    resourceType: publicText(item.resourceType),
    title: publicText(item.title),
    reason: locale === "en" ? "Related resource found in the corpus." : "Ressource associée trouvée dans le corpus.",
    hasPrivateDocument: Boolean(item.privateDocumentUrl || getResourceLinks(item.resourceCode).drive),
  };
}

async function fetchSourceText(sourceUrl: string, resourceCode: string) {
  if (!/^https?:\/\//i.test(sourceUrl)) return "";
  try {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "Corpus-Campus-PAIA/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 30 * 1024 * 1024) return "";
    const file = new File([bytes], `${resourceCode}.pdf`, {
      type: contentType.includes("pdf") ? "application/pdf" : (contentType || "application/octet-stream"),
    });
    return await extractTextFromFile(file);
  } catch {
    return "";
  }
}

function hasRealSourceText(value: string) {
  return value.trim() && !/ne dispose pas encore de contenu plein texte indexé/i.test(value);
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Requête de recherche invalide." }, { status: 400 });

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: body.locale === "en" ? "AI response service is not connected." : "Le service de réponse IA n’est pas connecté." }, { status: 503 });
  }

  try {
    const qdrantReady = Boolean(process.env.QDRANT_URL && process.env.QDRANT_API_KEY);
    const hits = qdrantReady
      ? await searchQdrant(body.query, { pulse: body.pulse, resourceCode: body.resourceCode }, 12).catch(() => [])
      : [];
    const allContexts = hits.map((hit) => String(hit.payload?.content ?? "")).filter(Boolean);
    const contexts = allContexts.filter(hasRealSourceText);
    const qdrantResources = recommendations(hits, body.locale);
    const snapshotItems = snapshotSearch(body);
    const resourceMap = new Map<string, ResourceRecommendation>();
    for (const resource of qdrantResources) resourceMap.set(resource.resourceCode, resource);
    for (const item of snapshotItems) {
      if (!resourceMap.has(item.resourceCode)) resourceMap.set(item.resourceCode, snapshotRecommendation(item, body.locale));
    }
    const resources = [...resourceMap.values()].slice(0, 8);

    if (contexts.length < 2) {
      const sourceCandidates = new Map<string, string>();
      for (const hit of hits) {
        const code = text(hit.payload?.resource_code);
        const url = text(hit.payload?.source_url) || snapshotByCode.get(code)?.sourceUrl || getResourceLinks(code).source || "";
        if (code && url) sourceCandidates.set(code, url);
      }
      for (const item of snapshotItems) {
        const url = item.sourceUrl || getResourceLinks(item.resourceCode).source || "";
        if (url) sourceCandidates.set(item.resourceCode, url);
      }
      const fetched = await Promise.allSettled(
        [...sourceCandidates.entries()].slice(0, 3).map(([code, url]) => fetchSourceText(url, code))
      );
      for (const result of fetched) {
        if (result.status === "fulfilled" && result.value.trim()) contexts.push(result.value);
      }
    }

    if (!contexts.length) {
      return NextResponse.json({
        title: body.query,
        summary: body.locale === "en"
          ? "🎯 Related resources were found, but their full text is not yet indexed for free-form search. I will not invent an answer from metadata alone.\n\n🔎 Current verification\nOpen a private source or create a PAÏA Sheet from a specific resource while the full search index is being enriched."
          : "🎯 Des ressources pertinentes ont été trouvées, mais aucun texte source exploitable n’est encore disponible pour cette réponse. Le catalogue et l’ouverture des documents restent accessibles pendant l’enrichissement.",
        resources,
        sourceTextAvailable: false,
      });
    }

    const answer = await answerWithGroq(body.query, contexts, body.locale);
    return NextResponse.json({
      title: body.query,
      summary: answer,
      resources,
      sourceTextAvailable: true,
      sourceMode: allContexts.some(hasRealSourceText) ? "qdrant" : "on_demand_source",
    });
  } catch (error) {
    console.error("Corpus Campus PAÏA search error", error);
    return NextResponse.json({ error: body.locale === "en" ? "Search is temporarily unavailable." : "La recherche est momentanément indisponible." }, { status: 502 });
  }
}
