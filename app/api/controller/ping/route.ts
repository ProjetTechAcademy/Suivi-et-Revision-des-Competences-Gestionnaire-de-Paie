import { NextRequest, NextResponse } from "next/server";
import { controllerConfiguration } from "@/lib/controller-compat";
import { listVectorStoreFiles } from "@/lib/openai";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const config = controllerConfiguration(request);
  if (!config.authorized) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  let corpusItems = 0;
  if (config.apiKey && config.vectorStoreId) {
    try { corpusItems = (await listVectorStoreFiles(config.apiKey, config.vectorStoreId)).length; }
    catch { return NextResponse.json({ state: { openai: false }, corpusItems: 0 }, { status: 502 }); }
  }
  return NextResponse.json({ state: { openai: Boolean(config.apiKey && config.vectorStoreId) }, corpusItems });
}
