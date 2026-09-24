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
          ? "The resource is catalogued, but its private source text is not yet indexed."
          : "La ressource est bien cataloguée, mais le texte de sa source privée n’est pas encore indexé.",
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
        hasPrivateDocument: Boolean(String(first.private_document_url ?? "").trim()),
      },
    });
  } catch (error) {
    console.error("PIA sheet generation error", error);
    return NextResponse.json({
      error: locale === "en" ? "PIA Sheet generation failed." : "La génération de la Fiche PIA a échoué.",
    }, { status: 502 });
  }
}
