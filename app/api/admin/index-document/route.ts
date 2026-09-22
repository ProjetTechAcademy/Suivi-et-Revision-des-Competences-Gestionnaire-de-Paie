import { NextRequest, NextResponse } from "next/server";
import { isCampusSyncAuthorized } from "@/lib/campus-auth";
import { buildIndexDocument, normalizeCorpusResource, publicAttributes } from "@/lib/corpus";
import { attachVectorStoreFile, replaceVectorStoreFiles, uploadOpenAIFile } from "@/lib/openai";

export const runtime = "nodejs";

async function readPayload(request: NextRequest) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const metadataValue = form.get("metadata");
    if (typeof metadataValue !== "string") throw new Error("INVALID_METADATA");
    const metadata: unknown = JSON.parse(metadataValue);
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("INVALID_METADATA");
    const fileValue = form.get("file");
    return { metadata: metadata as Record<string, unknown>, file: fileValue instanceof File ? fileValue : null };
  }
  const metadata: unknown = await request.json();
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("INVALID_METADATA");
  return { metadata: metadata as Record<string, unknown>, file: null };
}

export async function POST(request: NextRequest) {
  const syncSecret = process.env.CAMPUS_SYNC_SECRET;
  if (!syncSecret || !isCampusSyncAuthorized(request, syncSecret)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
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

    const resourceCode = resource.resourceCode;
    const replaced = await replaceVectorStoreFiles(apiKey, vectorStoreId, (item) => item.attributes?.resource_code === resourceCode);

    // Every catalogue position gets a searchable manifest. This preserves videos,
    // .webloc entries and reserved positions even when no full text exists.
    const manifest = new File([buildIndexDocument(resource)], `${resource.resourceCode || "position"}-catalogue.txt`, { type: "text/plain" });
    const uploadedManifest = await uploadOpenAIFile(apiKey, manifest);
    const attachedManifest = await attachVectorStoreFile(apiKey, vectorStoreId, uploadedManifest.id, { ...publicAttributes(resource), source_kind: "catalogue_manifest" });

    let sourceFileId: string | undefined;
    if (file && /^(application\/pdf|text\/|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))/.test(file.type)) {
      const uploadedSource = await uploadOpenAIFile(apiKey, file);
      await attachVectorStoreFile(apiKey, vectorStoreId, uploadedSource.id, { ...publicAttributes(resource), source_kind: "source_document" });
      sourceFileId = uploadedSource.id;
    }

    return NextResponse.json({ ...journal, status: attachedManifest.status, vectorFileId: attachedManifest.id, sourceFileIndexed: Boolean(sourceFileId), replaced });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Error && error.message === "INVALID_METADATA") {
      return NextResponse.json({ error: "Métadonnées JSON invalides." }, { status: 400 });
    }
    console.error(JSON.stringify({ event: "campus_corpus_sync_error", message: error instanceof Error ? error.message : "UNKNOWN" }));
    return NextResponse.json({ error: "Échec de l’indexation" }, { status: 500 });
  }
}
