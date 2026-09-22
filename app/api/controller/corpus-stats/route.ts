import { NextRequest, NextResponse } from "next/server";
import { controllerConfiguration } from "@/lib/controller-compat";
import { qdrantStats } from "@/lib/qdrant";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = controllerConfiguration(request);
  if (!config.authorized) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!config.configured) return NextResponse.json({ error: "Index Campus PAÏA non configuré" }, { status: 503 });
  try {
    const current = await qdrantStats();
    return NextResponse.json({ total: current.points, indexed: current.indexed });
  } catch {
    return NextResponse.json({ error: "Statistiques du corpus indisponibles" }, { status: 502 });
  }
}
