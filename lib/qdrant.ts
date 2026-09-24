import { createHash } from "node:crypto";

const COLLECTION = process.env.QDRANT_COLLECTION || "campus-paia";
const BM25_VECTOR = "text";

type Payload = Record<string, string | number | boolean>;

function config() {
  const url = (process.env.QDRANT_URL || "").replace(/\/$/, "");
  const apiKey = process.env.QDRANT_API_KEY || "";
  if (!url || !apiKey) throw new Error("QDRANT_NOT_CONFIGURED");
  return { url, apiKey };
}

function headers(apiKey: string) {
  return { "api-key": apiKey, "Content-Type": "application/json" };
}

function uuidFrom(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function chunks(text: string, size = 3200, overlap = 300) {
  const cleaned = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];
  const result: string[] = [];
  let start = 0;
  while (start < cleaned.length && result.length < 250) {
    let end = Math.min(cleaned.length, start + size);
    if (end < cleaned.length) {
      const boundary = Math.max(cleaned.lastIndexOf("\n\n", end), cleaned.lastIndexOf(". ", end));
      if (boundary > start + Math.floor(size * 0.6)) end = boundary + 1;
    }
    result.push(cleaned.slice(start, end).trim());
    if (end >= cleaned.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return result.filter(Boolean);
}

async function request(path: string, init?: RequestInit) {
  const { url, apiKey } = config();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers(apiKey), ...(init?.headers || {}) },
    cache: "no-store",
  });
  return response;
}

async function createKeywordIndex(field: string) {
  const response = await request(`/collections/${encodeURIComponent(COLLECTION)}/index?wait=true`, {
    method: "PUT",
    body: JSON.stringify({ field_name: field, field_schema: "keyword" }),
  });
  if (!response.ok && response.status !== 409) {
    const body = await response.text();
    if (!/already exists/i.test(body)) throw new Error(`QDRANT_INDEX_FAILED:${response.status}`);
  }
}

export async function ensureQdrantCollection() {
  const existing = await request(`/collections/${encodeURIComponent(COLLECTION)}`);
  if (existing.ok) return;
  if (existing.status !== 404) throw new Error(`QDRANT_COLLECTION_CHECK_FAILED:${existing.status}`);

  const created = await request(`/collections/${encodeURIComponent(COLLECTION)}`, {
    method: "PUT",
    body: JSON.stringify({
      sparse_vectors: {
        [BM25_VECTOR]: { modifier: "idf" },
      },
      on_disk_payload: true,
    }),
  });
  if (!created.ok && created.status !== 409) throw new Error(`QDRANT_COLLECTION_CREATE_FAILED:${created.status}`);

  await Promise.all(["document_key", "resource_code", "pulse"].map(createKeywordIndex));
}

export async function upsertQdrantDocument(documentKey: string, text: string, payload: Payload) {
  await ensureQdrantCollection();
  const pieces = chunks(text);
  if (!pieces.length) throw new Error("QDRANT_EMPTY_DOCUMENT");

  const remove = await request(`/collections/${encodeURIComponent(COLLECTION)}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({
      filter: { must: [{ key: "document_key", match: { value: documentKey } }] },
    }),
  });
  if (!remove.ok) throw new Error(`QDRANT_DELETE_FAILED:${remove.status}`);

  let indexed = 0;
  for (let offset = 0; offset < pieces.length; offset += 48) {
    const batch = pieces.slice(offset, offset + 48);
    const points = batch.map((content, localIndex) => {
      const chunkIndex = offset + localIndex;
      return {
        id: uuidFrom(`${documentKey}:${chunkIndex}`),
        vector: {
          [BM25_VECTOR]: { text: content, model: "qdrant/bm25" },
        },
        payload: {
          ...payload,
          document_key: documentKey,
          chunk_index: chunkIndex,
          content,
        },
      };
    });

    const response = await request(`/collections/${encodeURIComponent(COLLECTION)}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ points }),
    });
    if (!response.ok) throw new Error(`QDRANT_UPSERT_FAILED:${response.status}`);
    indexed += batch.length;
  }
  return indexed;
}

export type QdrantSearchHit = {
  id: string | number;
  score?: number;
  payload?: Payload;
};

export async function searchQdrant(query: string, filters: { pulse?: string; resourceCode?: string }, limit = 8) {
  await ensureQdrantCollection();
  const must = [
    ...(filters.pulse ? [{ key: "pulse", match: { value: filters.pulse } }] : []),
    ...(filters.resourceCode ? [{ key: "resource_code", match: { value: filters.resourceCode } }] : []),
  ];
  const response = await request(`/collections/${encodeURIComponent(COLLECTION)}/points/query`, {
    method: "POST",
    body: JSON.stringify({
      query: { text: query, model: "qdrant/bm25" },
      using: BM25_VECTOR,
      with_payload: true,
      limit,
      ...(must.length ? { filter: { must } } : {}),
    }),
  });
  if (!response.ok) throw new Error(`QDRANT_QUERY_FAILED:${response.status}`);
  const data = await response.json() as { result?: { points?: QdrantSearchHit[] } | QdrantSearchHit[] };
  return Array.isArray(data.result) ? data.result : (data.result?.points ?? []);
}

export async function qdrantStats() {
  await ensureQdrantCollection();
  const response = await request(`/collections/${encodeURIComponent(COLLECTION)}`);
  if (!response.ok) throw new Error(`QDRANT_STATS_FAILED:${response.status}`);
  const data = await response.json() as { result?: { points_count?: number; indexed_vectors_count?: number } };
  return {
    points: data.result?.points_count ?? 0,
    indexed: data.result?.indexed_vectors_count ?? 0,
  };
}


export async function getQdrantResource(resourceCode: string) {
  await ensureQdrantCollection();
  const response = await request(`/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
    method: "POST",
    body: JSON.stringify({
      limit: 1,
      with_payload: true,
      with_vector: false,
      filter: { must: [{ key: "resource_code", match: { value: resourceCode } }] },
    }),
  });
  if (!response.ok) throw new Error(`QDRANT_RESOURCE_FAILED:${response.status}`);
  const data = await response.json() as { result?: { points?: QdrantSearchHit[] } };
  return data.result?.points?.[0] ?? null;
}

export async function getQdrantResourceChunks(resourceCode: string, limit = 120) {
  await ensureQdrantCollection();
  const response = await request(`/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
    method: "POST",
    body: JSON.stringify({
      limit,
      with_payload: true,
      with_vector: false,
      filter: { must: [{ key: "resource_code", match: { value: resourceCode } }] },
    }),
  });
  if (!response.ok) throw new Error(`QDRANT_RESOURCE_CHUNKS_FAILED:${response.status}`);
  const data = await response.json() as { result?: { points?: QdrantSearchHit[] } };
  return (data.result?.points ?? [])
    .sort((a, b) => Number(a.payload?.chunk_index ?? 0) - Number(b.payload?.chunk_index ?? 0));
}
