import { NextResponse } from "next/server";
import { ensureQdrantCollection, qdrantStats } from "@/lib/qdrant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const qdrantConfigured = Boolean(process.env.QDRANT_URL && process.env.QDRANT_API_KEY);
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const result: Record<string, unknown> = {
    qdrantConfigured,
    groqConfigured,
    qdrant: "not_tested",
    groq: "not_tested",
  };

  if (!qdrantConfigured || !groqConfigured) {
    return NextResponse.json({ ok: false, ...result }, { status: 503 });
  }

  try {
    await ensureQdrantCollection();
    const stats = await qdrantStats();
    result.qdrant = "ok";
    result.qdrantPoints = stats.points;
  } catch (error) {
    result.qdrant = "error";
    result.qdrantError = error instanceof Error ? error.message.slice(0, 160) : "unknown";
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        temperature: 0,
        max_completion_tokens: 8,
        messages: [{ role: "user", content: "Réponds uniquement: OK" }],
      }),
    });
    result.groqStatus = response.status;
    result.groq = response.ok ? "ok" : "error";
  } catch {
    result.groq = "error";
  }

  return NextResponse.json({
    ok: result.qdrant === "ok" && result.groq === "ok",
    ...result,
  });
}
