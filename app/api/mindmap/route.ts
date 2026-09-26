import { NextRequest, NextResponse } from "next/server";
import { fetchResourceByCode, fetchResourceTextCache, upsertResourceTextCache } from "@/lib/db";
import { reconstructQdrantResourceText } from "@/lib/qdrant";
import { mindMapWithGroq } from "@/lib/groq";

type Locale = "fr" | "en";

export async function POST(request: NextRequest) {
  let body: { resourceCode?: string; locale?: Locale };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }

  const resourceCode = String(body.resourceCode || "").trim().slice(0, 256);
  const locale: Locale = body.locale === "en" ? "en" : "fr";
  if (!resourceCode) return NextResponse.json({ error: "Code ressource obligatoire" }, { status: 400 });

  try {
    const resource = await fetchResourceByCode(resourceCode);
    if (!resource) return NextResponse.json({ error: "Ressource introuvable." }, { status: 404 });

    const cached = await fetchResourceTextCache(resourceCode);
    let fullText = cached?.text_status === "text_extracted" ? cached.full_text : "";

    if (!fullText) {
      const rebuilt = await reconstructQdrantResourceText(resourceCode);
      fullText = rebuilt.text;
      if (fullText) {
        await upsertResourceTextCache({
          resourceCode,
          fullText,
          textStatus: "text_extracted",
          sourceKind: "qdrant_rebuild",
          chunkCount: rebuilt.chunkCount,
        });
      }
    }

    if (!fullText) {
      return NextResponse.json({
        error: locale === "en" ? "This resource has no readable text yet." : "Cette ressource ne dispose pas encore d’un texte exploitable.",
        code: "SOURCE_TEXT_MISSING",
      }, { status: 422 });
    }

    const map = await mindMapWithGroq(String(resource.title || resourceCode), fullText, locale);
    return NextResponse.json({ resourceCode, ...map });
  } catch (error) {
    console.error("Mind map generation error", error);
    return NextResponse.json({ error: locale === "en" ? "Mind map generation failed." : "La carte mentale n’a pas pu être générée." }, { status: 502 });
  }
}
