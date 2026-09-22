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

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const vectorResponse = await fetch(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const vectorBody = await vectorResponse.text();
  let vectorErrorType: string | null = null;
  try {
    const parsed = JSON.parse(vectorBody) as { error?: { type?: string; code?: string } };
    vectorErrorType = parsed.error?.code || parsed.error?.type || null;
  } catch {}

  const modelResponse = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  const responseTest = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      input: "Test de connexion Campus PAÏA",
      tools: [{ type: "file_search", vector_store_ids: [vectorStoreId], max_num_results: 2 }],
      include: ["file_search_call.results"],
    }),
  });
  const responseBody = await responseTest.text();
  let responseErrorType: string | null = null;
  let responseErrorMessage: string | null = null;
  try {
    const parsed = JSON.parse(responseBody) as { error?: { type?: string; code?: string; message?: string } };
    responseErrorType = parsed.error?.code || parsed.error?.type || null;
    responseErrorMessage = parsed.error?.message ? parsed.error.message.slice(0, 300) : null;
  } catch {}

  return NextResponse.json({
    ok: vectorResponse.ok && modelResponse.ok && responseTest.ok,
    stage: "openai",
    apiKeyConfigured: true,
    vectorStoreConfigured: true,
    vectorStatus: vectorResponse.status,
    vectorErrorType,
    modelStatus: modelResponse.status,
    model,
    responseStatus: responseTest.status,
    responseErrorType,
    responseErrorMessage,
  });
}
