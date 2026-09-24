import { NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/file-text";
import { answerWithGroq } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const sourceUrl = "https://ressources.studi.fr/contenus/pdf/3ca81b5fa03f425a57966ec440a2c1279066eddd.pdf";
  try {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "Corpus-Campus-PAIA/1.0" },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, stage: "source_fetch", status: response.status }, { status: 502 });
    }
    const bytes = await response.arrayBuffer();
    const file = new File([bytes], "heures-supplementaires.pdf", { type: "application/pdf" });
    const extracted = await extractTextFromFile(file);
    if (!extracted.trim()) {
      return NextResponse.json({ ok: false, stage: "extract", bytes: bytes.byteLength }, { status: 502 });
    }
    const answer = await answerWithGroq("Explique-moi les heures supplémentaires.", [extracted], "fr");
    return NextResponse.json({
      ok: Boolean(answer.trim()),
      sourceFetched: true,
      sourceBytes: bytes.byteLength,
      extractedChars: extracted.length,
      aiAnswerChars: answer.length,
      stage: answer.trim() ? "complete" : "ai_empty",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: "exception",
      error: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    }, { status: 502 });
  }
}
