import { NextRequest, NextResponse } from "next/server";
import { isCampusSyncAuthorized } from "@/lib/campus-auth";
import { buildIndexDocument, normalizeCorpusResource, publicAttributes } from "@/lib/corpus";
import { extractTextFromFile } from "@/lib/file-text";
import { upsertQdrantDocument } from "@/lib/qdrant";

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
  if (!syncSecret || !isCampusSyncAuthorized(request, syncSecret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    return NextResponse.json({ error: "Index Campus PAÏA non configuré" }, { status: 503 });
  }

  try {
    const { metadata, file } = await readPayload(request);
    const { resource, warnings } = normalizeCorpusResource(metadata);
    const incomplete = warnings.some((warning) => warning.endsWith("_MISSING"));
    const journal = {
      resourceCode: resource.resourceCode || null,
      status: incomplete ? "metadata_incomplete" : "accepted",
      warnings,
    };
    if (incomplete) return NextResponse.json(journal, { status: 422 });

    let extractedText = resource.extractedText;
    if (!extractedText && file) extractedText = await extractTextFromFile(file);
    const indexable = buildIndexDocument({ ...resource, extractedText });

    const attributes = publicAttributes(resource);
    const indexedChunks = await upsertQdrantDocument(resource.resourceCode, indexable, {
      ...attributes,
      source: "campus_catalogue",
    });

    return NextResponse.json({
      ...journal,
      status: "indexed",
      indexedChunks,
      sourceText: Boolean(extractedText),
    });
  } catch (error) {
    if (error instanceof InvalidPayloadError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Campus PAÏA indexing error", error);
    return NextResponse.json({ error: "Échec de l’indexation" }, { status: 502 });
  }
}
