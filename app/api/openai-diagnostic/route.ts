import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID || "";
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  if (!apiKey || !vectorStoreId) {
    return NextResponse.json({
      ok: false,
      stage: "configuration",
      apiKeyConfigured: Boolean(apiKey),
      vectorStoreConfigured: Boolean(vectorStoreId),
      modelConfigured: Boolean(model),
    });
  }

  const headers = { Authorization: `Bearer ${apiKey}` };

  let vectorStatus = 0;
  let vectorBody = "";
  try {
    const r = await fetch(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}`, {
      headers,
      cache: "no-store",
    });
    vectorStatus = r.status;
    vectorBody = await r.text();
  } catch {
    return NextResponse.json({ ok: false, stage: "network", vectorStatus: 0 });
  }

  let modelStatus = 0;
  try {
    const r = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers,
      cache: "no-store",
    });
    modelStatus = r.status;
  } catch {
    modelStatus = 0;
  }

  let vectorErrorType: string | null = null;
  try {
    const parsed = JSON.parse(vectorBody) as { error?: { type?: string; code?: string } };
    vectorErrorType = parsed.error?.code || parsed.error?.type || null;
  } catch {}

  return NextResponse.json({
    ok: vectorStatus >= 200 && vectorStatus < 300 && modelStatus >= 200 && modelStatus < 300,
    stage: "openai",
    apiKeyConfigured: true,
    vectorStoreConfigured: true,
    vectorStatus,
    vectorErrorType,
    modelStatus,
    model,
  });
}
