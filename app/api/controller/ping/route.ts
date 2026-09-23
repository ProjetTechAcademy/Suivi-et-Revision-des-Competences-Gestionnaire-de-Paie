import { NextRequest, NextResponse } from "next/server";
import { controllerConfiguration } from "@/lib/controller-compat";
import { qdrantStats } from "@/lib/qdrant";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = controllerConfiguration(request);
  if (!config.authorized) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!config.configured) {
    return NextResponse.json({
      state: { qdrant: Boolean(config.qdrantUrl && config.qdrantApiKey), groq: Boolean(config.groqApiKey) },
      corpusItems: 0,
    }, { status: 503 });
  }
  try {
    const stats = await qdrantStats();
    return NextResponse.json({
      state: { qdrant: true, groq: true },
      corpusItems: stats.points,
    });
  } catch {
    return NextResponse.json({ state: { qdrant: false, groq: true }, corpusItems: 0 }, { status: 502 });
  }
}
