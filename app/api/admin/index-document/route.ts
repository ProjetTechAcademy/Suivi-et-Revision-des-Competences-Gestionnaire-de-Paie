import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildIndexDocument, normalizeCorpusResource, publicAttributes } from "@/lib/corpus";
import { attachVectorStoreFile, uploadOpenAIFile } from "@/lib/openai";

export const runtime = "nodejs";

function authorized(request: NextRequest, expected: string) {
  const supplied = request.headers.get("x-campus-sync-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || "";
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return Boolean(supplied) && timingSafeEqual(left, right);
}

async function readPayload(request: NextRequest) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const metadataValue = form.get("metadata");
    const metadata = typeof metadataValue === "string" ? JSON.parse(metadataValue) : {};
    const fileValue = form.get("file");
    return { metadata, file: fileValue instanceof File ? fileValue : null };
  }
  return { metadata: await request.json() as Record<string, unknown>, file: null };
}

export async function POST(request: NextRequest) {
  const syncSecret = process.env.CAMPUS_SYNC_SECRET;
  if (!syncSecret || !authorized(request, syncSecret)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
  if (!apiKey || !vectorStoreId) return NextResponse.json({ error: "Index Campus PAÏA non configuré" }, { status: 503 });

  try {
    const { metadata, file } = await readPayload(request);
    const { resource, warnings } = normalizeCorpusResource(metadata);
    const incomplete = warnings.some((warning) => warning.endsWith("_MISSING"));
    const journal = { resourceCode: resource.resourceCode || null, status: incomplete ? "metadata_incomplete" : "accepted", warnings };
    console.info(JSON.stringify({ event: "campus_corpus_sync", ...journal }));
    if (incomplete) return NextResponse.json(journal, { status: 422 });

    // Every catalogue position gets a searchable manifest. This preserves videos,
    // .webloc entries and reserved positions even when no full text exists.
    const manifest = new File([buildIndexDocument(resource)], `${resource.resourceCode || "position"}-catalogue.txt`, { type: "text/plain" });
    const uploadedManifest = await uploadOpenAIFile(apiKey, manifest);
    const attachedManifest = await attachVectorStoreFile(apiKey, vectorStoreId, uploadedManifest.id, publicAttributes(resource));

    let sourceFileId: string | undefined;
    if (file && /^(application\/pdf|text\/|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))/.test(file.type)) {
      const uploadedSource = await uploadOpenAIFile(apiKey, file);
      await attachVectorStoreFile(apiKey, vectorStoreId, uploadedSource.id, publicAttributes(resource));
      sourceFileId = uploadedSource.id;
    }

    return NextResponse.json({ ...journal, status: "indexed", vectorFileId: attachedManifest.id, sourceFileIndexed: Boolean(sourceFileId) });
  } catch (error) {
    console.error(JSON.stringify({ event: "campus_corpus_sync_error", message: error instanceof Error ? error.message : "UNKNOWN" }));
    return NextResponse.json({ error: "Échec de l’indexation" }, { status: 500 });
  }
}
