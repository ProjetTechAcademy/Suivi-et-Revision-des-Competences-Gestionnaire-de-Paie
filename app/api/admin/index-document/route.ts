import { NextRequest, NextResponse } from "next/server";
import { isCampusSyncAuthorized } from "@/lib/campus-auth";
import { buildIndexDocument, normalizeCorpusResource, publicAttributes } from "@/lib/corpus";
import { attachVectorStoreFile, detachVectorStoreFile, findVectorStoreFilesByAttribute, uploadOpenAIFile } from "@/lib/openai";

export const runtime = "nodejs";
class InvalidPayloadError extends Error {}
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

async function readPayload(request: NextRequest) {
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const raw = form.get("metadata");
      if (typeof raw !== "string") throw new InvalidPayloadError("metadata est obligatoire");
      const parsed = JSON.parse(raw) as unknown;
      if (!isObject(parsed)) throw new InvalidPayloadError("metadata doit être un objet JSON");
      const fileValue = form.get("file");
      return { metadata: parsed, file: fileValue instanceof File ? fileValue : null };
    }
    const parsed = await request.json() as unknown;
    if (!isObject(parsed)) throw new InvalidPayloadError("Le corps JSON doit être un objet");
    return { metadata: parsed, file: null };
  } catch (error) {
    if (error instanceof InvalidPayloadError) throw error;
    throw new InvalidPayloadError("JSON ou formulaire invalide");
  }
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
    if (incomplete) return NextResponse.json(journal, { status: 422 });

    const previous = await findVectorStoreFilesByAttribute(apiKey, vectorStoreId, "resource_code", resource.resourceCode);
    const attributes = publicAttributes(resource);

    const manifest = new File([buildIndexDocument(resource)], `${resource.resourceCode || "position"}-catalogue.txt`, { type: "text/plain" });
    const uploadedManifest = await uploadOpenAIFile(apiKey, manifest);
    const attachedManifest = await attachVectorStoreFile(apiKey, vectorStoreId, uploadedManifest.id, attributes);

    let sourceStatus: string | undefined;
    if (file && /^(application\/pdf|text\/|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))/.test(file.type)) {
      const uploadedSource = await uploadOpenAIFile(apiKey, file);
      sourceStatus = (await attachVectorStoreFile(apiKey, vectorStoreId, uploadedSource.id, attributes)).status;
    }

    await Promise.all(previous.map((fileId) => detachVectorStoreFile(apiKey, vectorStoreId, fileId)));

    const processing = [attachedManifest.status, sourceStatus].filter(Boolean).some((status) => status !== "completed");
    return NextResponse.json({ ...journal, status: processing ? "processing" : "indexed", vectorFileId: attachedManifest.id, manifestStatus: attachedManifest.status, sourceStatus: sourceStatus ?? null, replaced: previous.length });
  } catch (error) {
    if (error instanceof InvalidPayloadError) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: "Échec de l’indexation" }, { status: message.startsWith("OPENAI_") ? 502 : 500 });
  }
}
