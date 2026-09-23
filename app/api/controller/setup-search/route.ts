import { NextRequest, NextResponse } from "next/server";
import { controllerConfiguration } from "@/lib/controller-compat";
import { ensureQdrantCollection, qdrantStats } from "@/lib/qdrant";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const config = controllerConfiguration(request);
  if (!config.authorized) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!config.configured) return NextResponse.json({ error: "Configuration Campus PAÏA incomplète", ready: false }, { status: 503 });
  try {
    await ensureQdrantCollection();
    const stats = await qdrantStats();
    return NextResponse.json({
      ready: true,
      state: { qdrant: true, groq: true },
      corpusItems: stats.points,
    });
  } catch {
    return NextResponse.json({ error: "Qdrant inaccessible", ready: false }, { status: 502 });
  }
}
