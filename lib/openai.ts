const OPENAI_BASE_URL = "https://api.openai.com/v1";

export function openAIHeaders(apiKey: string, json = true) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export async function uploadOpenAIFile(apiKey: string, file: File) {
  const form = new FormData();
  form.set("purpose", "assistants");
  form.set("file", file);
  const response = await fetch(`${OPENAI_BASE_URL}/files`, { method: "POST", headers: openAIHeaders(apiKey, false), body: form });
  if (!response.ok) throw new Error(`OPENAI_FILE_UPLOAD_FAILED:${response.status}`);
  return response.json() as Promise<{ id: string }>;
}

export async function attachVectorStoreFile(apiKey: string, vectorStoreId: string, fileId: string, attributes: Record<string, string | boolean>) {
  const response = await fetch(`${OPENAI_BASE_URL}/vector_stores/${encodeURIComponent(vectorStoreId)}/files`, {
    method: "POST",
    headers: openAIHeaders(apiKey),
    body: JSON.stringify({ file_id: fileId, attributes }),
  });
  if (!response.ok) throw new Error(`OPENAI_VECTOR_ATTACH_FAILED:${response.status}`);
  return response.json() as Promise<{ id: string; status: string }>;
}

export { OPENAI_BASE_URL };
