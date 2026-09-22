import { NextRequest, NextResponse } from "next/server";
import { controllerConfiguration } from "@/lib/controller-compat";
import { listVectorStoreFiles } from "@/lib/openai";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const config = controllerConfiguration(request);
  if (!config.authorized) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!config.apiKey || !config.vectorStoreId) return NextResponse.json({ error: "Index Campus PAÏA non configuré" }, { status: 503 });
  try { return NextResponse.json({ total: (await listVectorStoreFiles(config.apiKey, config.vectorStoreId)).length }); }
  catch { return NextResponse.json({ error: "Statistiques du corpus indisponibles" }, { status: 502 }); }
}
