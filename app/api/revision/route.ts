import { NextRequest, NextResponse } from "next/server";
import { revisionWithGroq } from "@/lib/groq";
import { getQdrantResourceChunks } from "@/lib/qdrant";
import { getResourceLinks } from "@/lib/resource-links";
import { extractTextFromFile } from "@/lib/file-text";

type Locale = "fr" | "en";

const publicText = (value: unknown) => String(value ?? "")
  .replace(/\b(?:studi|mba|bachelor|graduate)\b/gi, "")
  .replace(/\s{2,}/g, " ")
  .trim();

async function fetchSourceText(sourceUrl: string, resourceCode: string) {
  if (!sourceUrl) return "";
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "Corpus-Campus-PAIA/1.0" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`SOURCE_FETCH_FAILED:${response.status}`);
  const contentType = response.headers.get("content-type") || "application/pdf";
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) return "";
  const file = new File([bytes], `${resourceCode}.pdf`, { type: contentType.includes("pdf") ? "application/pdf" : contentType });
  return extractTextFromFile(file);
}

export async function POST(request: NextRequest) {
  let body: { resourceCode?: string; locale?: Locale };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }

  const resourceCode = String(body.resourceCode || "").trim().slice(0, 256);
  const locale: Locale = body.locale === "en" ? "en" : "fr";
  if (!resourceCode) return NextResponse.json({ error: "Code ressource obligatoire" }, { status: 400 });

  try {
    const hits = await getQdrantResourceChunks(resourceCode, 120);
    if (!hits.length) return NextResponse.json({ error: locale === "en" ? "Resource not found." : "Ressource introuvable." }, { status: 404 });

    const first = hits[0].payload ?? {};
    const title = publicText(first.title ?? resourceCode);
    let contexts = hits.map((hit) => String(hit.payload?.content ?? "")).filter(Boolean);
    let hasSourceText = first.has_source_text === true || contexts.some((item) => /Contenu indexable\s*:/i.test(item));

    if (!hasSourceText) {
      const links = getResourceLinks(resourceCode);
      if (links.source) {
        const extracted = await fetchSourceText(links.source, resourceCode);
        if (extracted.trim()) {
          contexts = [extracted];
          hasSourceText = true;
        }
      }
    }

    if (!hasSourceText) {
      return NextResponse.json({
        error: locale === "en"
          ? "The resource is catalogued, but its source text is not yet readable by the application."
          : "La ressource est bien cataloguée, mais son contenu source n’est pas encore lisible par l’application.",
        code: "SOURCE_TEXT_MISSING",
      }, { status: 422 });
    }

    const content = await revisionWithGroq(resourceCode, title, contexts, locale);
    const links = getResourceLinks(resourceCode);
    return NextResponse.json({
      title,
      resourceCode,
      content,
      resource: {
        resourceCode,
        title,
        hasPrivateDocument: Boolean(links.drive),
      },
    });
  } catch (error) {
    console.error("PAÏA sheet generation error", error);
    return NextResponse.json({
      error: locale === "en" ? "PAÏA Sheet generation failed." : "La génération de la Fiche PAÏA a échoué.",
    }, { status: 502 });
  }
}
