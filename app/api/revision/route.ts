import { NextRequest, NextResponse } from "next/server";
import { revisionWithGroq } from "@/lib/groq";
import { getQdrantResourceChunks } from "@/lib/qdrant";

type Locale = "fr" | "en";

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
    const title = String(first.title ?? resourceCode);
    const contexts = hits.map((hit) => String(hit.payload?.content ?? "")).filter(Boolean);
    const hasSourceText = first.has_source_text === true || contexts.some((item) => /Contenu indexable\s*:/i.test(item));

    if (!hasSourceText) {
      return NextResponse.json({
        error: locale === "en"
          ? "The source document is catalogued, but its full text is not indexed yet."
          : "Le document est bien catalogué, mais son contenu intégral n’est pas encore indexé. La fiche ne sera pas générée à partir de simples métadonnées.",
        code: "SOURCE_TEXT_MISSING",
      }, { status: 422 });
    }

    const content = await revisionWithGroq(resourceCode, title, contexts, locale);
    return NextResponse.json({
      title,
      resourceCode,
      content,
      resource: {
        resourceCode,
        title,
        platformUrl: String(first.platform_url ?? ""),
        hasPrivateDocument: Boolean(String(first.private_document_url ?? "") || String(first.source_url ?? "")),
      },
    });
  } catch (error) {
    console.error("Revision sheet generation error", error);
    return NextResponse.json({ error: locale === "en" ? "Study sheet generation failed." : "La génération de la fiche a échoué." }, { status: 502 });
  }
}
