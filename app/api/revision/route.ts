import { NextRequest, NextResponse } from "next/server";
import { revisionWithGroq } from "@/lib/groq";
import { completedRevisionParts, prepareRevisionParts, revisionPartStatus } from "@/lib/revision-parts";
import { getQdrantResourceChunks } from "@/lib/qdrant";
import { getResourceLinks } from "@/lib/resource-links";
import { extractTextFromFile } from "@/lib/file-text";
import { fetchResourceTextCache, upsertResourceTextCache } from "@/lib/db";
import { completedRevisionGroups, prepareRevisionGroups, revisionGroupStatus } from "@/lib/revision-groups";

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
    const hits = await getQdrantResourceChunks(resourceCode, 250);
    if (!hits.length) return NextResponse.json({ error: locale === "en" ? "Resource not found." : "Ressource introuvable." }, { status: 404 });

    const first = hits[0].payload ?? {};
    const title = publicText(first.title ?? resourceCode);

    const cached = await fetchResourceTextCache(resourceCode);
    let fullText = cached?.text_status === "text_extracted" ? cached.full_text : "";

    if (!fullText) {
      const contexts = hits.map((hit) => String(hit.payload?.content ?? "")).filter(Boolean);
      const marker = "Contenu indexable:";
      const rebuilt = contexts.join("\n\n");
      const markerIndex = rebuilt.indexOf(marker);
      if (markerIndex >= 0) fullText = rebuilt.slice(markerIndex + marker.length).trim();
    }

    if (!fullText) {
      const links = getResourceLinks(resourceCode);
      if (links.source) {
        fullText = await fetchSourceText(links.source, resourceCode);
        if (fullText.trim()) {
          await upsertResourceTextCache({
            resourceCode,
            fullText,
            textStatus: "text_extracted",
            sourceKind: "source_fallback",
          });
        }
      }
    }

    if (!fullText.trim()) {
      return NextResponse.json({
        error: locale === "en"
          ? "The resource is catalogued, but its source text is not readable yet."
          : "La ressource est bien cataloguée, mais son contenu source n’est pas encore lisible par l’application.",
        code: "SOURCE_TEXT_MISSING",
      }, { status: 422 });
    }

    let content = "";
    try {
      const partsPrepared = await prepareRevisionParts(resourceCode, 3);
      if (partsPrepared.ready) {
        const partStatus = await revisionPartStatus(resourceCode);
        if (partStatus.total > 0 && partStatus.done === partStatus.total) {
          const parts = await completedRevisionParts(resourceCode);
          content = [
            `# FICHE PAÏA — ${title}`,
            "",
            "## 🧠 Le pur jus",
            "",
            ...parts.flatMap((part, index) => [
              `### Partie ${index + 1}`,
              part.content,
              "",
            ]),
            "## ✅ À retenir",
            "Cette fiche est construite à partir des connaissances validées dans les différentes parties ci-dessus et de leurs actualisations officielles intégrées au fil de la lecture.",
          ].join("\n\n");
        }
      }
    } catch {
      content = "";
    }

    if (!content) {
      let preparedContext = "";
      try {
        const prepared = await prepareRevisionGroups(resourceCode, 5);
        if (prepared.ready) {
          const groupStatus = await revisionGroupStatus(resourceCode);
          if (groupStatus.total > 0 && groupStatus.done === groupStatus.total) {
            const groups = await completedRevisionGroups(resourceCode);
            preparedContext = groups
              .map((group) => `### Groupe ${group.group_index}\n${group.analysis_text}`)
              .join("\n\n");
          }
        }
      } catch {
        preparedContext = "";
      }

      content = await revisionWithGroq(
        resourceCode,
        title,
        [preparedContext || fullText],
        locale,
        Boolean(preparedContext),
      );
    }
    const links = getResourceLinks(resourceCode);

    return NextResponse.json({
      title,
      resourceCode,
      content,
      sourceCache: cached?.text_status === "text_extracted" ? "neon" : "fallback",
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
