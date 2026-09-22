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

export type VectorStoreFile = {
  id: string;
  attributes?: Record<string, string | boolean>;
};

export async function listVectorStoreFiles(apiKey: string, vectorStoreId: string) {
  const files: VectorStoreFile[] = [];
  let after = "";
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const response = await fetch(`${OPENAI_BASE_URL}/vector_stores/${encodeURIComponent(vectorStoreId)}/files?${query}`, {
      headers: openAIHeaders(apiKey, false),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`OPENAI_VECTOR_LIST_FAILED:${response.status}`);
    const page = await response.json() as { data?: VectorStoreFile[]; has_more?: boolean; last_id?: string };
    files.push(...(page.data ?? []));
    after = page.has_more && page.last_id ? page.last_id : "";
  } while (after);
  return files;
}

export async function detachVectorStoreFile(apiKey: string, vectorStoreId: string, fileId: string) {
  const response = await fetch(`${OPENAI_BASE_URL}/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: openAIHeaders(apiKey, false),
  });
  if (!response.ok && response.status !== 404) throw new Error(`OPENAI_VECTOR_DELETE_FAILED:${response.status}`);
}

export { OPENAI_BASE_URL };
