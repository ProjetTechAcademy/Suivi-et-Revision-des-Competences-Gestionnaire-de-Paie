import { NextRequest, NextResponse } from "next/server";
import { controllerConfiguration } from "@/lib/controller-compat";
import { listVectorStoreFiles } from "@/lib/openai";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const config = controllerConfiguration(request);
  if (!config.authorized) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!config.configured) return NextResponse.json({ error: "Configuration Campus PAÏA incomplète", ready: false }, { status: 503 });
  try {
    const total = (await listVectorStoreFiles(config.apiKey, config.vectorStoreId)).length;
    return NextResponse.json({ ready: true, state: { openai: true }, corpusItems: total });
  } catch {
    return NextResponse.json({ error: "Vector Store OpenAI inaccessible", ready: false }, { status: 502 });
  }
}
